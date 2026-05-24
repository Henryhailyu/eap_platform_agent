/**
 * Phase K3 — Teacher AI HTML lesson generator.
 */
(function (global) {
  const PAGE = "teacher-lesson-ai";
  const API = () => global.EAP_TEACHER_TEACHING_PAGES;

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  let draftHtml = "";
  let draftTopic = "";
  let draftSource = "";
  let aiAvailable = false;

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    el.classList.toggle("tla-status--error", !!isError);
  }

  function setPreviewHtml(html) {
    const empty = document.getElementById("tla-preview-empty");
    const frame = document.getElementById("tla-preview-frame");
    if (!frame) return;
    if (!html) {
      if (empty) empty.classList.remove("hidden");
      frame.classList.add("hidden");
      frame.removeAttribute("srcdoc");
      return;
    }
    if (empty) empty.classList.add("hidden");
    frame.classList.remove("hidden");
    frame.srcdoc = html;
  }

  function presentHtmlInCanvas(html, title) {
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas || !html) return;
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tla-live-present">
        <p class="tla-live-present__title">${escapeHtml(title || t("tla_preview_title"))}</p>
        <iframe class="tla-live-present__frame" sandbox="allow-scripts" title="${escapeHtml(title || "Lesson")}"></iframe>
      </div>
    `;
    const frame = canvas.querySelector("iframe");
    if (frame) frame.srcdoc = html;
  }

  async function refreshSavedList(container, onSelect) {
    const api = API();
    if (!container || !api) return;
    try {
      const pages = await api.listPages();
      if (!pages.length) {
        container.innerHTML = `<p class="tla-status">${escapeHtml(t("tla_saved_empty"))}</p>`;
        return;
      }
      container.innerHTML = `<ul class="tla-saved-list">${pages
        .map(
          (p) => `
        <li>
          <span class="tla-saved-list__title">${escapeHtml(p.title)}</span>
          <button type="button" class="btn-secondary btn-small" data-load="${p.id}">${escapeHtml(t("tla_load"))}</button>
          <button type="button" class="btn-secondary btn-small" data-present="${p.id}">${escapeHtml(t("tla_present"))}</button>
          <a class="btn-secondary btn-small" href="${escapeHtml(api.viewUrl(p.id))}" target="_blank" rel="noopener">${escapeHtml(t("tla_open_tab"))}</a>
          <button type="button" class="btn-secondary btn-small" data-delete="${p.id}">${escapeHtml(t("tla_delete"))}</button>
        </li>`,
        )
        .join("")}</ul>`;

      container.querySelectorAll("[data-load]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const page = await api.getPage(btn.getAttribute("data-load"));
          draftHtml = page.html_content;
          draftTopic = page.topic || page.title;
          draftSource = page.source_text || "";
          setPreviewHtml(draftHtml);
          const topicEl = document.getElementById("tla-topic");
          const sourceEl = document.getElementById("tla-source");
          const titleEl = document.getElementById("tla-title");
          if (topicEl) topicEl.value = draftTopic;
          if (sourceEl) sourceEl.value = draftSource;
          if (titleEl) titleEl.value = page.title;
          if (typeof onSelect === "function") onSelect(page);
        });
      });
      container.querySelectorAll("[data-present]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const page = await api.getPage(btn.getAttribute("data-present"));
          presentHtmlInCanvas(page.html_content, page.title);
        });
      });
      container.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!global.confirm(t("tla_delete_confirm"))) return;
          await api.deletePage(btn.getAttribute("data-delete"));
          await refreshSavedList(container, onSelect);
        });
      });
    } catch (_) {
      container.innerHTML = `<p class="tla-status tla-status--error">${escapeHtml(t("tla_saved_load_failed"))}</p>`;
    }
  }

  async function runGenerate(statusEl, compact) {
    const api = API();
    if (!api) return;
    const topicEl = document.getElementById(compact ? "tla-live-topic" : "tla-topic");
    const sourceEl = document.getElementById(compact ? "tla-live-source" : "tla-source");
    const levelEl = document.getElementById(compact ? "tla-live-level" : "tla-level");
    const instrEl = document.getElementById("tla-instructions");
    const topic = (topicEl?.value || "").trim();
    if (!topic) {
      setStatus(statusEl, t("tla_topic_required"), true);
      return;
    }
    if (!aiAvailable) {
      setStatus(statusEl, t("tla_ai_unavailable"), true);
      return;
    }
    setStatus(statusEl, t("tla_generating"), false);
    try {
      const page = await api.generatePage({
        topic,
        source_text: (sourceEl?.value || "").trim(),
        level: levelEl?.value || "intermediate",
        lang: isZh() ? "zh" : "en",
        instructions: (instrEl?.value || "").trim(),
      });
      draftHtml = page.html || "";
      draftTopic = topic;
      draftSource = (sourceEl?.value || "").trim();
      setPreviewHtml(draftHtml);
      const titleEl = document.getElementById("tla-title");
      if (titleEl && !titleEl.value.trim()) titleEl.value = page.title || topic;
      setStatus(statusEl, t("tla_generated_ok"), false);
      if (compact) presentHtmlInCanvas(draftHtml, page.title || topic);
    } catch (err) {
      setStatus(statusEl, (err && err.message) || t("tla_generate_failed"), true);
    }
  }

  function mountLivePanel(canvas, ctx) {
    if (!canvas) return;
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
    canvas.innerHTML = `
      <div class="tla-live-panel tla-panel">
        <h2 class="tla-panel__title">${escapeHtml(t("tla_live_title"))}</h2>
        <p class="tla-status">${escapeHtml(t("tla_live_lead"))}</p>
        <div class="tla-field">
          <label for="tla-live-topic">${escapeHtml(t("tla_topic_label"))}</label>
          <input id="tla-live-topic" type="text" maxlength="200" />
        </div>
        <div class="tla-field">
          <label for="tla-live-source">${escapeHtml(t("tla_source_label"))}</label>
          <textarea id="tla-live-source" rows="4"></textarea>
        </div>
        <div class="tla-field">
          <label for="tla-live-level">${escapeHtml(t("tla_level_label"))}</label>
          <select id="tla-live-level">
            <option value="beginner">${escapeHtml(t("tla_level_beginner"))}</option>
            <option value="intermediate" selected>${escapeHtml(t("tla_level_intermediate"))}</option>
            <option value="advanced">${escapeHtml(t("tla_level_advanced"))}</option>
          </select>
        </div>
        <div class="tla-actions">
          <button type="button" class="btn-primary" id="tla-live-generate">${escapeHtml(t("tla_generate_btn"))}</button>
          <a class="btn-secondary" href="teacher-lesson-ai.html">${escapeHtml(t("tla_open_full"))}</a>
        </div>
        <p id="tla-live-status" class="tla-status hidden" role="status"></p>
        <div id="tla-live-saved" class="tla-saved-wrap"></div>
      </div>
    `;
    if (global.EAP_I18N) global.EAP_I18N.applyStatic();
    document.getElementById("tla-live-generate")?.addEventListener("click", () => {
      void runGenerate(document.getElementById("tla-live-status"), true);
    });
    void refreshSavedList(document.getElementById("tla-live-saved"), (page) => {
      presentHtmlInCanvas(page.html_content, page.title);
    });
  }

  function bindFullPage(ctx) {
    const statusEl = document.getElementById("tla-status");
    const savedEl = document.getElementById("tla-saved-list");
    const classEl = document.getElementById("tla-class");
    if (classEl && ctx?.className) classEl.value = ctx.className;

    document.getElementById("tla-generate-btn")?.addEventListener("click", () => {
      void runGenerate(statusEl, false);
    });

    document.getElementById("tla-save-btn")?.addEventListener("click", async () => {
      const api = API();
      if (!api || !draftHtml) {
        setStatus(statusEl, t("tla_save_no_preview"), true);
        return;
      }
      const title = (document.getElementById("tla-title")?.value || draftTopic || "").trim();
      if (!title) {
        setStatus(statusEl, t("tla_title_required"), true);
        return;
      }
      setStatus(statusEl, t("tla_saving"), false);
      try {
        await api.savePage({
          title,
          topic: draftTopic || title,
          source_text: draftSource,
          html_content: draftHtml,
          class_name: (classEl?.value || ctx?.className || "").trim(),
          task_id: ctx?.taskId || null,
        });
        setStatus(statusEl, t("tla_saved_ok"), false);
        await refreshSavedList(savedEl);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("tla_save_failed"), true);
      }
    });

    document.getElementById("tla-present-btn")?.addEventListener("click", () => {
      if (!draftHtml) {
        setStatus(statusEl, t("tla_save_no_preview"), true);
        return;
      }
      const w = global.open("", "_blank");
      if (w) {
        w.document.open();
        w.document.write(draftHtml);
        w.document.close();
      }
    });

    void refreshSavedList(savedEl);
  }

  function readPageContext() {
    const params = new URLSearchParams(global.location.search);
    return {
      className: params.get("class") || "",
      taskId: params.get("task") || "",
    };
  }

  async function bootFullPage() {
    if (document.body.getAttribute("data-page") !== PAGE) return;
    if (typeof redirectFilePageToHostedUi === "function" && redirectFilePageToHostedUi()) return;
    if (typeof validateSatelliteSessionOrGate !== "function") return;
    const sessionUser = await validateSatelliteSessionOrGate("teacher");
    if (!sessionUser) return;
    if (typeof initAppPageHeader === "function") initAppPageHeader();

    const api = API();
    if (api) {
      try {
        const st = await api.getAiStatus();
        aiAvailable = !!st.available;
      } catch (_) {
        aiAvailable = false;
      }
    }
    const banner = document.getElementById("tla-ai-banner");
    if (banner) {
      banner.textContent = aiAvailable ? t("tla_ai_ready") : t("tla_ai_unavailable");
      banner.classList.toggle("tla-status--error", !aiAvailable);
    }

    const ctx = readPageContext();
    bindFullPage(ctx);

    const back = document.getElementById("tla-back-live");
    if (back && ctx.className) back.href = `teacher-live.html?class=${encodeURIComponent(ctx.className)}`;

    if (global.EAP_I18N) global.EAP_I18N.applyStatic();
  }

  global.EAP_TEACHER_LESSON_AI = {
    mountLivePanel,
    presentHtmlInCanvas,
    setAiAvailable(flag) {
      aiAvailable = !!flag;
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void bootFullPage();
    });
  } else {
    void bootFullPage();
  }
})(typeof window !== "undefined" ? window : globalThis);
