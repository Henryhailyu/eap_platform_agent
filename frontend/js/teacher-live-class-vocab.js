/**
 * Live Teaching — confirmed class vocabulary for vocab games (bingo, matching, memory).
 */
(function (global) {
  const MIN_BINGO = 8;
  const MIN_MEMORY = 6;
  const TARGET = 24;

  function t(key, vars) {
    if (typeof global.t === "function") return global.t(key, vars);
    return key;
  }

  function authFetch(url, options) {
    const opts = { ...(options || {}), credentials: "include" };
    if (typeof global.EAP_getAuthHeaders === "function") {
      opts.headers = global.EAP_getAuthHeaders(opts.headers);
    }
    if (typeof global.EAP_fetch === "function") return global.EAP_fetch(url, opts);
    return fetch(url, opts);
  }

  function apiBase() {
    const custom = global.EAP_API_BASE;
    if (custom && String(custom).trim()) return String(custom).replace(/\/$/, "");
    if (global.location && global.location.origin && global.location.protocol !== "file:") {
      return global.location.origin;
    }
    return "http://127.0.0.1:5051";
  }

  function normalizeTerms(items) {
    const out = [];
    const seen = new Set();
    (items || []).forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const term = String(raw.term || raw.word || "")
        .replace(/\s+/g, " ")
        .trim();
      const defEn = String(raw.defEn || raw.definition || raw.def || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!term || !defEn || term.length < 3 || defEn.length < 6) return;
      if (!/^[a-zA-Z][a-zA-Z\s'\-]*$/.test(term)) return;
      const key = term.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ term, defEn, defZh: defEn });
    });
    return out;
  }

  function parsePasted(text) {
    const pairs = [];
    const seen = new Set();
    String(text || "")
      .split(/\r?\n/)
      .forEach((rawLine) => {
        let line = String(rawLine || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!line) return;
        line = line.replace(/^\d+[.)]\s*/, "");
        let term = "";
        let defEn = "";
        if (line.includes("\t")) {
          const parts = line.split("\t");
          term = parts[0];
          defEn = parts.slice(1).join(" ").trim();
        } else {
          let matched = false;
          for (const sep of [" — ", " – ", " - ", ": ", "："]) {
            if (!line.includes(sep)) continue;
            const parts = line.split(sep);
            term = parts[0];
            defEn = parts.slice(1).join(sep).trim();
            matched = true;
            break;
          }
          if (!matched) {
            term = line;
            defEn = `${line.charAt(0).toUpperCase()}${line.slice(1)} — key vocabulary for this class`;
          }
        }
        term = term.trim();
        defEn = defEn.trim();
        if (!term || !defEn || term.length < 3 || defEn.length < 6) return;
        if (!/^[a-zA-Z][a-zA-Z\s'\-]*$/.test(term)) return;
        const key = term.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        pairs.push({ term, defEn, defZh: defEn });
      });
    return pairs;
  }

  function padTerms(terms, count) {
    const base = normalizeTerms(terms);
    if (!base.length) return [];
    const n = Number.isFinite(count) && count > 0 ? count : TARGET;
    const out = [];
    for (let i = 0; i < n; i += 1) out.push(base[i % base.length]);
    return out;
  }

  function minForGameKind(kind) {
    if (kind === "memory") return MIN_MEMORY;
    return MIN_BINGO;
  }

  const state = {
    confirmed: [],
    draft: [],
    source: "",
    pageId: "",
    className: "",
    loading: false,
  };

  function setConfirmed(terms, meta) {
    state.confirmed = normalizeTerms(terms);
    if (meta && typeof meta === "object") {
      if (meta.source != null) state.source = String(meta.source);
      if (meta.pageId != null) state.pageId = String(meta.pageId);
      if (meta.className != null) state.className = String(meta.className);
    }
    global.__tliveConfirmedVocab = state.confirmed.slice();
    global.__tliveLessonVocab = state.confirmed.length ? padTerms(state.confirmed, TARGET) : null;
    if (typeof global.EAP_onLiveClassVocabChanged === "function") {
      global.EAP_onLiveClassVocabChanged(state.confirmed.slice());
    }
  }

  function getConfirmed() {
    return state.confirmed.slice();
  }

  function getTermsForGame(kind) {
    const min = minForGameKind(kind);
    if (state.confirmed.length < min) return null;
    return padTerms(state.confirmed, TARGET);
  }

  function isReadyForGame(kind) {
    return state.confirmed.length >= minForGameKind(kind);
  }

  async function readJson(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }
    return data;
  }

  async function loadForPage(pageId) {
    if (!pageId) return null;
    state.loading = true;
    try {
      const data = await readJson(
        await authFetch(`${apiBase()}/api/teacher/teaching-pages/${encodeURIComponent(pageId)}/vocabulary`),
      );
      state.pageId = String(pageId);
      state.draft = normalizeTerms(data.draft_terms || []);
      if ((data.terms || []).length >= MIN_MEMORY) {
        setConfirmed(data.terms, { source: "page", pageId });
        return data;
      }
      return data;
    } finally {
      state.loading = false;
    }
  }

  async function loadForClass(className) {
    if (!className) return null;
    state.loading = true;
    try {
      const data = await readJson(
        await authFetch(
          `${apiBase()}/api/teacher/live/class-vocabulary?class_name=${encodeURIComponent(className)}`,
        ),
      );
      state.className = className;
      if ((data.terms || []).length >= MIN_MEMORY) {
        setConfirmed(data.terms, { source: "class", className });
      }
      return data;
    } finally {
      state.loading = false;
    }
  }

  async function syncActive() {
    const pageId =
      typeof global.EAP_resolveActiveLessonPageId === "function"
        ? global.EAP_resolveActiveLessonPageId()
        : global.__tliveLessonPageId || "";
    const className =
      (global.__tliveDisplayClassName != null && global.__tliveDisplayClassName) ||
      (global.__tliveClassName != null && global.__tliveClassName) ||
      "";
    if (pageId) {
      const pageData = await loadForPage(pageId);
      if (pageData && (pageData.terms || []).length >= MIN_MEMORY) return pageData;
    }
    if (className) return loadForClass(className);
    return null;
  }

  async function fetchSuggestions(pageId) {
    if (!pageId) return [];
    const data = await readJson(
      await authFetch(
        `${apiBase()}/api/teacher/teaching-pages/${encodeURIComponent(pageId)}/vocabulary/suggest`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      ),
    );
    state.draft = normalizeTerms(data.draft_terms || []);
    return state.draft.slice();
  }

  async function saveConfirmed(terms, opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const normalized = normalizeTerms(terms);
    if (normalized.length < MIN_MEMORY) {
      throw new Error(t("tlive_vocab_min_required", { n: String(MIN_MEMORY) }));
    }
    const pageId = options.pageId != null ? String(options.pageId) : state.pageId;
    const className = options.className != null ? String(options.className) : state.className;
    const saveToPage = options.saveToPage !== false && !!pageId;

    if (saveToPage && pageId) {
      await readJson(
        await authFetch(
          `${apiBase()}/api/teacher/teaching-pages/${encodeURIComponent(pageId)}/vocabulary`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ terms: normalized }),
          },
        ),
      );
    }
    if (className) {
      await readJson(
        await authFetch(`${apiBase()}/api/teacher/live/class-vocabulary`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            class_name: className,
            terms: normalized,
            source_page_id: pageId || null,
          }),
        }),
      );
    }
    setConfirmed(normalized, {
      source: saveToPage ? "page" : "class",
      pageId,
      className,
    });
    return normalized;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function previewTableHtml(terms) {
    const rows = normalizeTerms(terms)
      .slice(0, 48)
      .map(
        (item, i) =>
          `<tr><td>${i + 1}</td><td>${escapeHtml(item.term)}</td><td>${escapeHtml(item.defEn)}</td></tr>`,
      )
      .join("");
    if (!rows) {
      return `<p class="tlive-vocab-editor__empty">${escapeHtml(t("tlive_vocab_preview_empty"))}</p>`;
    }
    return `<div class="tlive-vocab-editor__table-wrap"><table class="tlive-vocab-editor__table"><thead><tr><th>#</th><th>${escapeHtml(t("tlive_vocab_col_term"))}</th><th>${escapeHtml(t("tlive_vocab_col_def"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function statusSummaryHtml() {
    const n = state.confirmed.length;
    if (n >= MIN_BINGO) {
      return `<p class="tlive-vocab-status tlive-vocab-status--ok">${escapeHtml(t("tlive_vocab_status_ready", { n: String(n) }))}</p>`;
    }
    if (n > 0) {
      return `<p class="tlive-vocab-status tlive-vocab-status--warn">${escapeHtml(t("tlive_vocab_status_partial", { n: String(n), min: String(MIN_BINGO) }))}</p>`;
    }
    return `<p class="tlive-vocab-status tlive-vocab-status--missing">${escapeHtml(t("tlive_vocab_status_missing"))}</p>`;
  }

  function gamesPanelBlockHtml() {
    return `<section class="tlive-vocab-panel" aria-labelledby="tlive-vocab-panel-title">
      <h3 id="tlive-vocab-panel-title" class="tlive-vocab-panel__title">${escapeHtml(t("tlive_vocab_panel_title"))}</h3>
      <p class="tlive-vocab-panel__hint">${escapeHtml(t("tlive_vocab_panel_hint"))}</p>
      <div id="tlive-vocab-status">${statusSummaryHtml()}</div>
      <div class="tlive-vocab-panel__actions">
        <button type="button" class="btn-secondary btn-small" id="tlive-vocab-import-btn">${escapeHtml(t("tlive_vocab_import_btn"))}</button>
        <button type="button" class="btn-secondary btn-small" id="tlive-vocab-load-lesson-btn">${escapeHtml(t("tlive_vocab_load_lesson_btn"))}</button>
        <button type="button" class="btn-secondary btn-small" id="tlive-vocab-clear-btn">${escapeHtml(t("tlive_vocab_clear_btn"))}</button>
      </div>
    </section>`;
  }

  async function clearConfirmed() {
    const pageId =
      typeof global.EAP_resolveActiveLessonPageId === "function"
        ? global.EAP_resolveActiveLessonPageId()
        : state.pageId;
    const className = state.className || global.__tliveDisplayClassName || "";
    if (pageId) {
      await readJson(
        await authFetch(
          `${apiBase()}/api/teacher/teaching-pages/${encodeURIComponent(pageId)}/vocabulary`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clear: true }),
          },
        ),
      );
    }
    if (className) {
      await readJson(
        await authFetch(`${apiBase()}/api/teacher/live/class-vocabulary`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ class_name: className, clear: true }),
        }),
      );
    }
    setConfirmed([]);
    refreshGamesPanelStatus();
  }

  function bindGamesPanelActions(root) {
    const scope = root || document;
    scope.getElementById("tlive-vocab-import-btn")?.addEventListener("click", () => openEditorModal());
    scope.getElementById("tlive-vocab-load-lesson-btn")?.addEventListener("click", () => {
      void loadFromLessonSuggestions();
    });
    scope.getElementById("tlive-vocab-clear-btn")?.addEventListener("click", () => {
      if (!global.confirm(t("tlive_vocab_clear_confirm"))) return;
      void clearConfirmed().catch(() => {
        setConfirmed([]);
        refreshGamesPanelStatus();
      });
    });
  }

  function refreshGamesPanelStatus() {
    const el = document.getElementById("tlive-vocab-status");
    if (el) el.innerHTML = statusSummaryHtml();
  }

  async function loadFromLessonSuggestions() {
    const pageId =
      typeof global.EAP_resolveActiveLessonPageId === "function"
        ? global.EAP_resolveActiveLessonPageId()
        : state.pageId;
    if (!pageId) {
      global.alert(t("tlive_vocab_no_lesson_page"));
      return;
    }
    try {
      const draft = await fetchSuggestions(pageId);
      if (!draft.length) {
        global.alert(t("tlive_vocab_suggest_empty"));
        return;
      }
      openEditorModal({ initialTerms: draft, initialPaste: draft.map((x) => `${x.term} — ${x.defEn}`).join("\n") });
    } catch (err) {
      global.alert((err && err.message) || t("tlive_vocab_suggest_failed"));
    }
  }

  function openEditorModal(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    let modal = document.getElementById("tlive-vocab-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "tlive-vocab-modal";
      modal.className = "tlive-vocab-modal hidden";
      modal.hidden = true;
      modal.innerHTML = `<div class="tlive-vocab-modal__backdrop" data-vocab-close aria-hidden="true"></div>
        <div class="tlive-vocab-modal__card" role="dialog" aria-modal="true" aria-labelledby="tlive-vocab-modal-title">
          <header class="tlive-vocab-modal__head">
            <h2 id="tlive-vocab-modal-title">${escapeHtml(t("tlive_vocab_modal_title"))}</h2>
            <button type="button" class="tlive-float__close" data-vocab-close aria-label="Close">×</button>
          </header>
          <p class="tlive-vocab-modal__hint">${escapeHtml(t("tlive_vocab_modal_hint"))}</p>
          <textarea id="tlive-vocab-paste" class="tlive-vocab-modal__textarea" rows="8" placeholder="${escapeHtml(t("tlive_vocab_modal_placeholder"))}"></textarea>
          <div id="tlive-vocab-preview">${previewTableHtml([])}</div>
          <footer class="tlive-vocab-modal__foot">
            <button type="button" class="btn-secondary" data-vocab-close>${escapeHtml(t("tlive_vocab_cancel"))}</button>
            <button type="button" class="btn-primary" id="tlive-vocab-confirm-btn">${escapeHtml(t("tlive_vocab_confirm_btn"))}</button>
          </footer>
        </div>`;
      document.body.appendChild(modal);
      modal.querySelectorAll("[data-vocab-close]").forEach((btn) => {
        btn.addEventListener("click", () => closeEditorModal());
      });
      modal.querySelector("#tlive-vocab-paste")?.addEventListener("input", (ev) => {
        const preview = modal.querySelector("#tlive-vocab-preview");
        if (preview) preview.innerHTML = previewTableHtml(parsePasted(ev.target.value));
      });
      modal.querySelector("#tlive-vocab-confirm-btn")?.addEventListener("click", () => {
        void confirmEditorModal();
      });
    }
    const pasteEl = modal.querySelector("#tlive-vocab-paste");
    const initialPaste =
      options.initialPaste ||
      (options.initialTerms || state.draft || state.confirmed)
        .map((x) => `${x.term} — ${x.defEn}`)
        .join("\n");
    if (pasteEl) pasteEl.value = initialPaste;
    const preview = modal.querySelector("#tlive-vocab-preview");
    if (preview) preview.innerHTML = previewTableHtml(parsePasted(initialPaste));
    modal.classList.remove("hidden");
    modal.hidden = false;
  }

  function closeEditorModal() {
    const modal = document.getElementById("tlive-vocab-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.hidden = true;
  }

  async function confirmEditorModal() {
    const modal = document.getElementById("tlive-vocab-modal");
    const pasteEl = modal && modal.querySelector("#tlive-vocab-paste");
    const terms = parsePasted(pasteEl ? pasteEl.value : "");
    if (terms.length < MIN_MEMORY) {
      global.alert(t("tlive_vocab_min_required", { n: String(MIN_MEMORY) }));
      return;
    }
    const pageId =
      typeof global.EAP_resolveActiveLessonPageId === "function"
        ? global.EAP_resolveActiveLessonPageId()
        : state.pageId;
    const className = state.className || global.__tliveDisplayClassName || "";
    try {
      await saveConfirmed(terms, { pageId, className, saveToPage: !!pageId });
      closeEditorModal();
      refreshGamesPanelStatus();
      if (typeof global.EAP_onLiveClassVocabSaved === "function") {
        global.EAP_onLiveClassVocabSaved(getConfirmed());
      }
    } catch (err) {
      global.alert((err && err.message) || t("tlive_vocab_save_failed"));
    }
  }

  function renderVocabRequiredBlock(kind) {
    return `<div class="tlive-vocab-required tlive-stage-fill">
      <h2 class="tlive-vocab-required__title">${escapeHtml(t("tlive_vocab_required_title"))}</h2>
      <p class="tlive-vocab-required__lead">${escapeHtml(t("tlive_vocab_required_lead"))}</p>
      ${statusSummaryHtml()}
      <div class="tlive-vocab-panel__actions">
        <button type="button" class="btn-primary" id="tlive-vocab-import-btn">${escapeHtml(t("tlive_vocab_import_btn"))}</button>
        <button type="button" class="btn-secondary" id="tlive-vocab-load-lesson-btn">${escapeHtml(t("tlive_vocab_load_lesson_btn"))}</button>
        <button type="button" class="btn-secondary" id="tlive-vocab-back-games-btn">${escapeHtml(t("tlive_vocab_back_games"))}</button>
      </div>
    </div>`;
  }

  function showVocabRequiredScreen(kind, onBack) {
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas) return;
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    canvas.innerHTML = renderVocabRequiredBlock(kind);
    bindGamesPanelActions(canvas);
    canvas.querySelector("#tlive-vocab-back-games-btn")?.addEventListener("click", () => {
      if (typeof onBack === "function") onBack();
    });
  }

  global.EAP_LIVE_CLASS_VOCAB = {
    MIN_BINGO,
    MIN_MEMORY,
    TARGET,
    parsePasted,
    normalizeTerms,
    padTerms,
    getConfirmed,
    getTermsForGame,
    isReadyForGame,
    minForGameKind,
    loadForPage,
    loadForClass,
    syncActive,
    fetchSuggestions,
    saveConfirmed,
    setConfirmed,
    gamesPanelBlockHtml,
    bindGamesPanelActions,
    refreshGamesPanelStatus,
    openEditorModal,
    showVocabRequiredScreen,
  };
})(typeof window !== "undefined" ? window : globalThis);
