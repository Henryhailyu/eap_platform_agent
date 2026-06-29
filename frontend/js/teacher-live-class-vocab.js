/**
 * Live Teaching — confirmed class vocabulary for vocab games (bingo, matching, memory).
 */
(function (global) {
  const MIN_BINGO = 8;
  const MIN_MEMORY = 6;
  const TARGET = 24;
  const RECOMMENDED_WORDS = 20;

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

  function isValidWordTerm(term) {
    const t0 = String(term || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!t0 || t0.length < 3 || t0.length > 64) return false;
    return /^[a-zA-Z][a-zA-Z\s'\-]*$/.test(t0);
  }

  function parseWordsOnly(text) {
    const words = [];
    const seen = new Set();
    String(text || "")
      .split(/\r?\n/)
      .forEach((rawLine) => {
        let line = String(rawLine || "")
          .replace(/\s+/g, " ")
          .trim();
        if (!line) return;
        line = line.replace(/^\d+[.)]\s*/, "");
        if (!isValidWordTerm(line)) return;
        const key = line.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        words.push(line);
      });
    return words;
  }

  function rowsFromWords(words, defsByTerm) {
    const map = defsByTerm && typeof defsByTerm === "object" ? defsByTerm : {};
    return (words || []).map((term) => ({
      term,
      defEn: map[term.toLowerCase()] || "",
      defZh: map[term.toLowerCase()] || "",
    }));
  }

  /** @deprecated use parseWordsOnly + editable table */
  function parsePasted(text) {
    return normalizeTerms(
      parseWordsOnly(text).map((term) => ({
        term,
        defEn: `${term.charAt(0).toUpperCase()}${term.slice(1)} — key vocabulary for this class`,
        defZh: `${term.charAt(0).toUpperCase()}${term.slice(1)} — key vocabulary for this class`,
      })),
    );
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

  function editableTableHtml(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      return `<p class="tlive-vocab-editor__empty">${escapeHtml(t("tlive_vocab_table_empty"))}</p>`;
    }
    const body = list
      .map(
        (item, i) =>
          `<tr data-vocab-row="${i}">
            <td>${i + 1}</td>
            <td><input type="text" class="tlive-vocab-edit-term" value="${escapeHtml(item.term || "")}" aria-label="${escapeHtml(t("tlive_vocab_col_term"))}" /></td>
            <td><input type="text" class="tlive-vocab-edit-def" value="${escapeHtml(item.defEn || "")}" placeholder="${escapeHtml(t("tlive_vocab_def_placeholder"))}" aria-label="${escapeHtml(t("tlive_vocab_col_def"))}" /></td>
          </tr>`,
      )
      .join("");
    return `<div class="tlive-vocab-editor__table-wrap"><table class="tlive-vocab-editor__table tlive-vocab-editor__table--edit"><thead><tr><th>#</th><th>${escapeHtml(t("tlive_vocab_col_term"))}</th><th>${escapeHtml(t("tlive_vocab_col_def"))}</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function readEditableTable(modal) {
    if (!modal) return [];
    const rows = [];
    modal.querySelectorAll("tr[data-vocab-row]").forEach((tr) => {
      const term = tr.querySelector(".tlive-vocab-edit-term")?.value || "";
      const defEn = tr.querySelector(".tlive-vocab-edit-def")?.value || "";
      rows.push({ term, defEn, defZh: defEn });
    });
    return normalizeTerms(rows);
  }

  function updateWordCountHint(modal) {
    const hintEl = modal?.querySelector("#tlive-vocab-word-count");
    const wordsEl = modal?.querySelector("#tlive-vocab-words");
    if (!hintEl || !wordsEl) return;
    const n = parseWordsOnly(wordsEl.value).length;
    if (!n) {
      hintEl.textContent = "";
      hintEl.className = "tlive-vocab-word-count";
      return;
    }
    if (n < RECOMMENDED_WORDS) {
      hintEl.textContent = t("tlive_vocab_word_count_low", { n: String(n), rec: String(RECOMMENDED_WORDS) });
      hintEl.className = "tlive-vocab-word-count tlive-vocab-word-count--warn";
    } else {
      hintEl.textContent = t("tlive_vocab_word_count_ok", { n: String(n) });
      hintEl.className = "tlive-vocab-word-count tlive-vocab-word-count--ok";
    }
  }

  function setGenerateStatus(modal, message, kind) {
    const el = modal?.querySelector("#tlive-vocab-generate-status");
    if (!el) return;
    if (!message) {
      el.textContent = "";
      el.className = "tlive-vocab-generate-status hidden";
      el.hidden = true;
      return;
    }
    el.textContent = message;
    el.className = `tlive-vocab-generate-status tlive-vocab-generate-status--${kind || "info"}`;
    el.hidden = false;
  }

  async function generateDefinitionsInModal(modal) {
    const wordsEl = modal?.querySelector("#tlive-vocab-words");
    const tableHost = modal?.querySelector("#tlive-vocab-edit-table");
    const genBtn = modal?.querySelector("#tlive-vocab-generate-defs");
    const words = parseWordsOnly(wordsEl ? wordsEl.value : "");
    if (!words.length) {
      global.alert(t("tlive_vocab_words_required"));
      return;
    }
    updateWordCountHint(modal);
    if (genBtn) {
      genBtn.disabled = true;
      genBtn.textContent = t("tlive_vocab_generating_defs");
    }
    setGenerateStatus(modal, t("tlive_vocab_generating_defs"), "loading");
    try {
      const data = await readJson(
        await authFetch(`${apiBase()}/api/teacher/live/generate-vocab-definitions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ terms: words }),
        }),
      );
      const terms = normalizeTerms((data && data.terms) || []);
      const byKey = {};
      terms.forEach((item) => {
        byKey[item.term.toLowerCase()] = item.defEn;
      });
      const rows = rowsFromWords(words, byKey);
      if (tableHost) tableHost.innerHTML = editableTableHtml(rows);
      setGenerateStatus(modal, t("tlive_vocab_defs_generated", { n: String(rows.length) }), "ok");
    } catch (err) {
      const rows = rowsFromWords(words, {});
      if (tableHost) tableHost.innerHTML = editableTableHtml(rows);
      const msg = (err && err.message) || t("tlive_vocab_defs_ai_failed");
      setGenerateStatus(modal, t("tlive_vocab_defs_manual_hint", { detail: msg }), "warn");
    } finally {
      if (genBtn) {
        genBtn.disabled = false;
        genBtn.textContent = t("tlive_vocab_generate_defs_btn");
      }
    }
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
      <p class="tlive-vocab-panel__recommend">${escapeHtml(t("tlive_vocab_panel_recommend"))}</p>
      <div id="tlive-vocab-status">${statusSummaryHtml()}</div>
      <div class="tlive-vocab-panel__actions">
        <button type="button" class="btn-secondary btn-small" data-tlive-vocab="import" id="tlive-vocab-import-btn">${escapeHtml(t("tlive_vocab_import_btn"))}</button>
        <button type="button" class="btn-secondary btn-small" data-tlive-vocab="load-lesson" id="tlive-vocab-load-lesson-btn">${escapeHtml(t("tlive_vocab_load_lesson_btn"))}</button>
        <button type="button" class="btn-secondary btn-small" data-tlive-vocab="clear" id="tlive-vocab-clear-btn">${escapeHtml(t("tlive_vocab_clear_btn"))}</button>
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

  function findVocabControl(id, root) {
    if (root && root !== document && typeof root.querySelector === "function") {
      const inRoot = root.querySelector(`#${id}`);
      if (inRoot) return inRoot;
    }
    return document.getElementById(id);
  }

  function resolveLessonPageId() {
    if (typeof global.EAP_resolveActiveLessonPageId === "function") {
      const resolved = global.EAP_resolveActiveLessonPageId();
      if (resolved) return String(resolved);
    }
    if (state.pageId) return String(state.pageId);
    if (global.__tliveLessonPageId != null && global.__tliveLessonPageId !== "") {
      return String(global.__tliveLessonPageId);
    }
    const cache = global.__tliveLessonCache;
    if (cache && cache.pageId != null && cache.pageId !== "") {
      return String(cache.pageId);
    }
    return "";
  }

  function resolveClassName() {
    return (
      state.className ||
      global.__tliveDisplayClassName ||
      global.__tliveClassName ||
      ""
    );
  }

  function handleVocabPanelAction(action) {
    if (action === "import") {
      openEditorModal();
      return;
    }
    if (action === "load-lesson") {
      void loadFromLessonSuggestions();
      return;
    }
    if (action === "clear") {
      if (!global.confirm(t("tlive_vocab_clear_confirm"))) return;
      void clearConfirmed().catch(() => {
        setConfirmed([]);
        refreshGamesPanelStatus();
      });
    }
  }

  function bindGamesPanelActions(root) {
    const scope = root && root.nodeType === 1 ? root : document;
    ["tlive-vocab-import-btn", "tlive-vocab-load-lesson-btn", "tlive-vocab-clear-btn"].forEach((id) => {
      const btn = findVocabControl(id, scope);
      if (!btn || btn.dataset.tliveVocabBound === "1") return;
      btn.dataset.tliveVocabBound = "1";
      const action = btn.getAttribute("data-tlive-vocab");
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        handleVocabPanelAction(action);
      });
    });
  }

  function bindVocabPanelDelegation() {
    if (global.__tliveVocabPanelDelegationBound) return;
    global.__tliveVocabPanelDelegationBound = true;
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-tlive-vocab]");
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      handleVocabPanelAction(btn.getAttribute("data-tlive-vocab"));
    });
  }

  function refreshGamesPanelStatus() {
    const el = document.getElementById("tlive-vocab-status");
    if (el) el.innerHTML = statusSummaryHtml();
  }

  async function loadFromLessonSuggestions() {
    const pageId = resolveLessonPageId();
    if (!pageId) {
      global.alert(t("tlive_vocab_no_lesson_page"));
      return;
    }
    state.pageId = pageId;
    try {
      let draft = state.draft && state.draft.length ? state.draft.slice() : [];
      if (!draft.length) {
        draft = await fetchSuggestions(pageId);
      }
      if (!draft.length) {
        global.alert(t("tlive_vocab_suggest_empty"));
        return;
      }
      openEditorModal({
        initialWords: draft.map((x) => x.term),
        initialRows: draft,
      });
    } catch (err) {
      global.alert((err && err.message) || t("tlive_vocab_suggest_failed"));
    }
  }

  function ensureEditorModal() {
    let modal = document.getElementById("tlive-vocab-modal");
    if (modal && modal.querySelector("#tlive-vocab-words")) return modal;
    if (modal) modal.remove();
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
        <p class="tlive-vocab-modal__recommend">${escapeHtml(t("tlive_vocab_modal_recommend"))}</p>
        <label class="tlive-vocab-modal__label" for="tlive-vocab-words">${escapeHtml(t("tlive_vocab_words_label"))}</label>
        <textarea id="tlive-vocab-words" class="tlive-vocab-modal__textarea" rows="8" placeholder="${escapeHtml(t("tlive_vocab_modal_placeholder"))}"></textarea>
        <p id="tlive-vocab-word-count" class="tlive-vocab-word-count" aria-live="polite"></p>
        <div class="tlive-vocab-modal__toolbar">
          <button type="button" class="btn-secondary" id="tlive-vocab-generate-defs">${escapeHtml(t("tlive_vocab_generate_defs_btn"))}</button>
        </div>
        <p id="tlive-vocab-generate-status" class="tlive-vocab-generate-status hidden" hidden aria-live="polite"></p>
        <div id="tlive-vocab-edit-table">${editableTableHtml([])}</div>
        <footer class="tlive-vocab-modal__foot">
          <button type="button" class="btn-secondary" data-vocab-close>${escapeHtml(t("tlive_vocab_cancel"))}</button>
          <button type="button" class="btn-primary" id="tlive-vocab-confirm-btn">${escapeHtml(t("tlive_vocab_confirm_btn"))}</button>
        </footer>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll("[data-vocab-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeEditorModal());
    });
    modal.querySelector("#tlive-vocab-words")?.addEventListener("input", () => {
      updateWordCountHint(modal);
    });
    modal.querySelector("#tlive-vocab-generate-defs")?.addEventListener("click", () => {
      void generateDefinitionsInModal(modal);
    });
    modal.querySelector("#tlive-vocab-confirm-btn")?.addEventListener("click", () => {
      void confirmEditorModal();
    });
    return modal;
  }

  function openEditorModal(opts) {
    const options = opts && typeof opts === "object" ? opts : {};
    const modal = ensureEditorModal();
    const wordsEl = modal.querySelector("#tlive-vocab-words");
    const tableHost = modal.querySelector("#tlive-vocab-edit-table");
    let initialWords = [];
    if (Array.isArray(options.initialWords) && options.initialWords.length) {
      initialWords = options.initialWords;
    } else if (Array.isArray(options.initialRows) && options.initialRows.length) {
      initialWords = options.initialRows.map((x) => x.term);
    } else if (options.initialPaste) {
      initialWords = parseWordsOnly(options.initialPaste);
    } else if (state.confirmed.length) {
      initialWords = state.confirmed.map((x) => x.term);
    }
    if (wordsEl) wordsEl.value = initialWords.join("\n");
    updateWordCountHint(modal);
    setGenerateStatus(modal, "", "");
    if (Array.isArray(options.initialRows) && options.initialRows.length) {
      if (tableHost) tableHost.innerHTML = editableTableHtml(options.initialRows);
    } else if (state.confirmed.length && !options.initialWords && !options.initialPaste) {
      if (tableHost) tableHost.innerHTML = editableTableHtml(state.confirmed);
    } else if (tableHost) {
      tableHost.innerHTML = editableTableHtml([]);
    }
    modal.classList.remove("hidden");
    modal.hidden = false;
    modal.removeAttribute("aria-hidden");
    document.body.classList.add("tlive-vocab-modal-open");
    wordsEl?.focus();
  }

  function closeEditorModal() {
    const modal = document.getElementById("tlive-vocab-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("tlive-vocab-modal-open");
  }

  async function confirmEditorModal() {
    const modal = document.getElementById("tlive-vocab-modal");
    let terms = readEditableTable(modal);
    if (!terms.length) {
      const words = parseWordsOnly(modal?.querySelector("#tlive-vocab-words")?.value || "");
      if (words.length) {
        global.alert(t("tlive_vocab_generate_before_save"));
        return;
      }
      global.alert(t("tlive_vocab_words_required"));
      return;
    }
    if (terms.length < MIN_MEMORY) {
      global.alert(t("tlive_vocab_min_required", { n: String(MIN_MEMORY) }));
      return;
    }
    const pageId = resolveLessonPageId();
    const className = resolveClassName();
    if (!className && pageId) {
      state.className = global.__tliveDisplayClassName || global.__tliveClassName || "";
    }
    try {
      await saveConfirmed(terms, {
        pageId,
        className: className || resolveClassName(),
        saveToPage: !!pageId,
      });
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
        <button type="button" class="btn-primary" data-tlive-vocab="import" id="tlive-vocab-import-btn">${escapeHtml(t("tlive_vocab_import_btn"))}</button>
        <button type="button" class="btn-secondary" data-tlive-vocab="load-lesson" id="tlive-vocab-load-lesson-btn">${escapeHtml(t("tlive_vocab_load_lesson_btn"))}</button>
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
    parseWordsOnly,
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
    bindVocabPanelDelegation,
    refreshGamesPanelStatus,
    openEditorModal,
    showVocabRequiredScreen,
  };

  bindVocabPanelDelegation();
})(typeof window !== "undefined" ? window : globalThis);
