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

  function savedAtHtml(page) {
    if (typeof global.EAP_savedAtLabel !== "function") return "";
    const when = page.updated_at || page.created_at;
    const label = global.EAP_savedAtLabel(when);
    return label ? `<span class="tla-saved-list__when">${escapeHtml(label)}</span>` : "";
  }

  function runAi(btn, fn) {
    if (typeof global.EAP_runAiButton === "function") {
      return global.EAP_runAiButton(btn, fn);
    }
    return fn();
  }

  let draftHtml = "";
  let draftTopic = "";
  let draftSource = "";
  let draftTemplateKey = "standard";
  let aiAvailable = false;
  let templateOptions = [];
  let sourceFiles = [];
  let lastSavedPageId = null;

  async function pushDraftToClass(statusEl) {
    const api = API();
    const liveApi = global.EAP_LIVE_TEACHING_API;
    if (!draftHtml) {
      setStatus(statusEl, t("tla_save_no_preview"), true);
      return;
    }
    if (!liveApi || typeof liveApi.pushDisplay !== "function") {
      setStatus(statusEl, t("tla_push_fail_no_live"), true);
      return;
    }
    setStatus(statusEl, t("tla_pushing"), false);
    try {
      let pageId = lastSavedPageId;
      const title = (document.getElementById("tla-title")?.value || draftTopic || "").trim();
      const classEl = document.getElementById("tla-class");
      const className = (classEl?.value || readPageContext().className || "EAP047").trim();
      if (!pageId && api) {
        const saved = await api.savePage({
          title: title || draftTopic || t("tla_preview_title"),
          topic: draftTopic || title,
          source_text: draftSource,
          html_content: draftHtml,
          class_name: className,
          template_key: currentTemplateKey(false),
          source_file_ids: confirmedSourceFileIds(),
        });
        pageId = saved.id;
        lastSavedPageId = pageId;
      }
      if (typeof global.fetchCurrentSessionUser === "function") {
        const teacher = await global.fetchCurrentSessionUser();
        if (!teacher || teacher.role !== "teacher") {
          setStatus(statusEl, t("tla_push_fail_login"), true);
          return;
        }
      }
      let sessCode = global.__tliveLiveSession?.code;
      if (!sessCode) {
        const created = await liveApi.createSession(className, "", {});
        sessCode = created.session_code;
      }
      await liveApi.pushDisplay(
        sessCode,
        { mode: "html", title: title || draftTopic, page_id: pageId },
        {},
      );
      const libApi = global.EAP_CLASSROOM_DISPLAY;
      if (libApi && pageId) {
        const item = await libApi.addHtmlPage(className, pageId, title || draftTopic);
        if (item && item.id) await libApi.activateItem(item.id);
      }
      const live = global.EAP_TEACHER_LIVE;
      if (live && typeof live.renderHtmlLessonOnCanvas === "function") {
        live.renderHtmlLessonOnCanvas(draftHtml, title, pageId);
      }
      setStatus(statusEl, t("tla_pushed_ok"), false);
    } catch (err) {
      setStatus(statusEl, (err && err.message) || t("tla_push_failed"), true);
    }
  }

  function confirmedSourceFileIds() {
    return sourceFiles.filter((f) => f.status === "confirmed").map((f) => f.id);
  }

  function stagedSourceFileIds() {
    return sourceFiles.filter((f) => f.status === "staged").map((f) => f.id);
  }

  function setSourceFilesStatus(text, isError) {
    setStatus(document.getElementById("tla-source-files-status"), text, isError);
  }

  function renderSourceFileList() {
    const listEl = document.getElementById("tla-source-file-list");
    const confirmBtn = document.getElementById("tla-source-confirm-btn");
    if (!listEl) return;

    if (!sourceFiles.length) {
      listEl.innerHTML = "";
      if (confirmBtn) confirmBtn.classList.add("hidden");
      return;
    }

    listEl.innerHTML = sourceFiles
      .map((f) => {
        const statusKey = f.status === "confirmed" ? "tla_source_status_confirmed" : "tla_source_status_staged";
        const statusClass =
          f.status === "confirmed" ? "tla-source-file-list__status--ok" : "tla-source-file-list__status--pending";
        return `
        <li class="tla-source-file-list__item" data-id="${f.id}">
          <span class="tla-source-file-list__name">${escapeHtml(f.original_name)}</span>
          <span class="tla-source-file-list__status ${statusClass}">${escapeHtml(t(statusKey))}</span>
          <button type="button" class="btn-secondary btn-small" data-preview="${f.id}">${escapeHtml(t("tla_source_preview"))}</button>
          <button type="button" class="btn-secondary btn-small" data-delete-file="${f.id}">${escapeHtml(t("tla_delete"))}</button>
        </li>`;
      })
      .join("");

    if (confirmBtn) {
      confirmBtn.classList.toggle("hidden", stagedSourceFileIds().length === 0);
    }

    listEl.querySelectorAll("[data-preview]").forEach((btn) => {
      btn.addEventListener("click", () => {
        void previewSourceFile(btn.getAttribute("data-preview"));
      });
    });
    listEl.querySelectorAll("[data-delete-file]").forEach((btn) => {
      btn.addEventListener("click", () => {
        void removeSourceFile(btn.getAttribute("data-delete-file"));
      });
    });
  }

  async function refreshSourceFiles() {
    const api = API();
    if (!api) return;
    try {
      sourceFiles = await api.listSourceFiles();
      renderSourceFileList();
    } catch (_) {
      setSourceFilesStatus(t("tla_source_load_failed"), true);
    }
  }

  async function previewSourceFile(id) {
    const api = API();
    const dialog = document.getElementById("tla-source-preview-dialog");
    const titleEl = document.getElementById("tla-source-preview-title");
    const bodyEl = document.getElementById("tla-source-preview-body");
    if (!api || !dialog || !bodyEl) return;
    try {
      const file = await api.getSourceFile(id);
      if (titleEl) titleEl.textContent = file.original_name || "";
      bodyEl.textContent = file.extracted_text || file.preview || "";
      if (typeof dialog.showModal === "function") dialog.showModal();
    } catch (err) {
      setSourceFilesStatus((err && err.message) || t("tla_source_preview_failed"), true);
    }
  }

  async function removeSourceFile(id) {
    const api = API();
    if (!api) return;
    try {
      await api.deleteSourceFile(id);
      sourceFiles = sourceFiles.filter((f) => String(f.id) !== String(id));
      renderSourceFileList();
      setSourceFilesStatus(t("tla_source_deleted"), false);
    } catch (err) {
      setSourceFilesStatus((err && err.message) || t("tla_source_delete_failed"), true);
    }
  }

  async function handleSourceFilePick(fileList) {
    const api = API();
    if (!api || !fileList || !fileList.length) return;
    setSourceFilesStatus(t("tla_source_uploading"), false);
    try {
      const uploaded = await api.uploadSourceFiles(fileList);
      await refreshSourceFiles();
      setSourceFilesStatus(t("tla_source_uploaded_staged", { count: uploaded.length }), false);
    } catch (err) {
      setSourceFilesStatus((err && err.message) || t("tla_source_upload_failed"), true);
    }
  }

  async function confirmSourceFilesForAi() {
    const api = API();
    const ids = stagedSourceFileIds();
    if (!api || !ids.length) return;
    setSourceFilesStatus(t("tla_source_confirming"), false);
    try {
      sourceFiles = await api.confirmSourceFiles(ids);
      renderSourceFileList();
      setSourceFilesStatus(t("tla_source_confirmed"), false);
    } catch (err) {
      setSourceFilesStatus((err && err.message) || t("tla_source_confirm_failed"), true);
    }
  }

  function bindSourceFileUpload() {
    const pickBtn = document.getElementById("tla-source-upload-btn");
    const input = document.getElementById("tla-source-file-input");
    const confirmBtn = document.getElementById("tla-source-confirm-btn");
    const closeBtn = document.getElementById("tla-source-preview-close");
    const dialog = document.getElementById("tla-source-preview-dialog");

    pickBtn?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", () => {
      if (input.files && input.files.length) {
        void handleSourceFilePick(input.files);
        input.value = "";
      }
    });
    confirmBtn?.addEventListener("click", () => {
      void confirmSourceFilesForAi();
    });
    closeBtn?.addEventListener("click", () => dialog?.close());
  }

  function templateLabel(tpl) {
    if (!tpl) return "";
    return isZh() ? tpl.label_zh || tpl.template_key : tpl.label_en || tpl.template_key;
  }

  async function populateTemplateSelect(selectEl, selectedKey) {
    const api = API();
    if (!selectEl || !api) return;
    try {
      templateOptions = await api.listTemplates();
      selectEl.innerHTML = templateOptions
        .map(
          (tpl) =>
            `<option value="${escapeHtml(tpl.template_key)}"${tpl.template_key === selectedKey ? " selected" : ""}>${escapeHtml(templateLabel(tpl))}</option>`,
        )
        .join("");
    } catch (_) {
      selectEl.innerHTML = `<option value="standard">${escapeHtml(t("tla_template_standard"))}</option>`;
    }
  }

  function currentTemplateKey(compact) {
    const el = document.getElementById(compact ? "tla-live-template" : "tla-template");
    return (el?.value || draftTemplateKey || "standard").trim();
  }

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
    let cleaned = html;
    if (typeof global.EAP_polishLessonHtml === "function") {
      cleaned = global.EAP_polishLessonHtml(cleaned);
    }
    const bridged =
      typeof global.EAP_injectLiveBridge === "function" ? global.EAP_injectLiveBridge(cleaned, null) : cleaned;
    frame.srcdoc = bridged;
  }

  function presentHtmlInCanvas(html, title) {
    const live = global.EAP_TEACHER_LIVE;
    if (live && typeof live.renderHtmlLessonOnCanvas === "function") {
      live.renderHtmlLessonOnCanvas(html, title, null);
      return;
    }
    const canvas = document.getElementById("tlive-canvas-inner");
    if (!canvas || !html) return;
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--stage";
    canvas.innerHTML = `
      <div class="tla-live-present">
        <p class="tla-live-present__title">${escapeHtml(title || t("tla_preview_title"))}</p>
        <iframe class="tla-live-present__frame" sandbox="allow-scripts allow-same-origin" title="${escapeHtml(title || "Lesson")}"></iframe>
      </div>
    `;
    const frame = canvas.querySelector("iframe");
    if (frame) {
      const bridged =
        typeof global.EAP_injectLiveBridge === "function" ? global.EAP_injectLiveBridge(html, null) : html;
      frame.srcdoc = bridged;
    }
  }

  async function refreshSavedList(container, onSelect) {
    const api = API();
    if (!container || !api) return;
    try {
      const pages = (await api.listPages()).slice().sort((a, b) => {
        const ta = String(a.updated_at || a.created_at || "");
        const tb = String(b.updated_at || b.created_at || "");
        return tb.localeCompare(ta);
      });
      if (!pages.length) {
        container.innerHTML = `<p class="tla-status">${escapeHtml(t("tla_saved_empty"))}</p>`;
        return;
      }
      container.innerHTML = `<ul class="tla-saved-list">${pages
        .map(
          (p) => {
            const pub = p.published
              ? `<span class="tla-saved-list__badge">${escapeHtml(t("tla_published"))}</span>`
              : "";
            const pubBtn = p.published
              ? `<button type="button" class="btn-secondary btn-small" data-unpublish="${p.id}">${escapeHtml(t("tla_unpublish"))}</button>`
              : `<button type="button" class="btn-secondary btn-small" data-publish="${p.id}">${escapeHtml(t("tla_publish"))}</button>`;
            return `
        <li>
          <span class="tla-saved-list__title">${escapeHtml(p.title)}</span>
          ${savedAtHtml(p)}${pub}
          <button type="button" class="btn-secondary btn-small" data-load="${p.id}">${escapeHtml(t("tla_load"))}</button>
          <button type="button" class="btn-secondary btn-small" data-present="${p.id}">${escapeHtml(t("tla_present"))}</button>
          <button type="button" class="btn-secondary btn-small" data-push="${p.id}">${escapeHtml(t("tla_push_class"))}</button>
          <a class="btn-secondary btn-small" href="${escapeHtml(api.viewUrl(p.id))}" target="_blank" rel="noopener">${escapeHtml(t("tla_open_tab"))}</a>
          ${pubBtn}
          <button type="button" class="btn-secondary btn-small" data-delete="${p.id}">${escapeHtml(t("tla_delete"))}</button>
        </li>`;
          },
        )
        .join("")}</ul>`;

      container.querySelectorAll("[data-load]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const page = await api.getPage(btn.getAttribute("data-load"));
          draftHtml = page.html_content;
          if (typeof global.EAP_polishLessonHtml === "function") {
            draftHtml = global.EAP_polishLessonHtml(draftHtml);
          }
          draftTopic = page.topic || page.title;
          draftSource = page.source_text || "";
          draftTemplateKey = page.template_key || "standard";
          setPreviewHtml(draftHtml);
          const topicEl = document.getElementById("tla-topic");
          const sourceEl = document.getElementById("tla-source");
          const titleEl = document.getElementById("tla-title");
          const classEl = document.getElementById("tla-class");
          const templateEl = document.getElementById("tla-template");
          if (topicEl) topicEl.value = draftTopic;
          if (sourceEl) sourceEl.value = draftSource;
          if (titleEl) titleEl.value = page.title;
          if (classEl && page.class_name) classEl.value = page.class_name;
          if (templateEl) templateEl.value = draftTemplateKey;
          if (typeof onSelect === "function") onSelect(page);
        });
      });
      container.querySelectorAll("[data-present]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const page = await api.getPage(btn.getAttribute("data-present"));
          presentHtmlInCanvas(page.html_content, page.title);
        });
      });
      container.querySelectorAll("[data-push]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const page = await api.getPage(btn.getAttribute("data-push"));
          draftHtml = page.html_content;
          if (typeof global.EAP_polishLessonHtml === "function") {
            draftHtml = global.EAP_polishLessonHtml(draftHtml);
          }
          lastSavedPageId = page.id;
          const live = global.EAP_TEACHER_LIVE;
          if (live && typeof live.pushHtmlLessonToClass === "function") {
            await live.pushHtmlLessonToClass({ html: page.html_content, title: page.title, pageId: page.id });
          } else {
            const statusEl = document.getElementById("tla-status") || document.getElementById("tla-live-status");
            await pushDraftToClass(statusEl);
          }
        });
      });
      container.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!global.confirm(t("tla_delete_confirm"))) return;
          await api.deletePage(btn.getAttribute("data-delete"));
          await refreshSavedList(container, onSelect);
        });
      });
      async function togglePublish(id, published) {
        try {
          await api.publishPage(id, published);
          await refreshSavedList(container, onSelect);
        } catch (err) {
          global.alert((err && err.message) || t("tla_publish_failed"));
        }
      }
      container.querySelectorAll("[data-publish]").forEach((btn) => {
        btn.addEventListener("click", () => {
          void togglePublish(btn.getAttribute("data-publish"), true);
        });
      });
      container.querySelectorAll("[data-unpublish]").forEach((btn) => {
        btn.addEventListener("click", () => {
          void togglePublish(btn.getAttribute("data-unpublish"), false);
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
    const generateBtn = compact
      ? document.getElementById("tla-live-generate")
      : document.getElementById("tla-generate-btn");
    const work = async () => {
      const page = await api.generatePage({
        topic,
        source_text: (sourceEl?.value || "").trim(),
        level: levelEl?.value || "intermediate",
        lang: isZh() ? "zh" : "en",
        instructions: (instrEl?.value || "").trim(),
        template_key: currentTemplateKey(compact),
        source_file_ids: compact ? [] : confirmedSourceFileIds(),
      });
      draftHtml = page.html || "";
      if (typeof global.EAP_polishLessonHtml === "function") {
        draftHtml = global.EAP_polishLessonHtml(draftHtml);
      }
      draftTopic = topic;
      draftSource = page.source_text_used || (sourceEl?.value || "").trim();
      draftTemplateKey = page.template_key || currentTemplateKey(compact);
      setPreviewHtml(draftHtml);
      const titleEl = document.getElementById("tla-title");
      if (titleEl && !titleEl.value.trim()) titleEl.value = page.title || topic;
      const activityCount =
        typeof global.EAP_countLessonActivities === "function"
          ? global.EAP_countLessonActivities(draftHtml)
          : 0;
      setStatus(
        statusEl,
        activityCount ? t("tla_generated_ok") : `${t("tla_generated_ok")} ${t("tla_no_interactive_warn")}`,
        !activityCount,
      );
      if (compact) presentHtmlInCanvas(draftHtml, page.title || topic);
    };
    try {
      if (generateBtn) await runAi(generateBtn, work);
      else await work();
    } catch (err) {
      setStatus(statusEl, (err && err.message) || t("tla_generate_failed"), true);
    }
  }

  function mountLivePanel(canvas, ctx) {
    if (!canvas) return;
    const className = (ctx && ctx.className) || readPageContext().className || "EAP047";
    canvas.className = "tlive-canvas__inner tlive-canvas__inner--left";
    canvas.innerHTML = `
      <div class="tla-live-panel tla-panel">
        <h2 class="tla-panel__title">${escapeHtml(t("tla_live_title"))}</h2>
        <p class="tla-status">${escapeHtml(t("tla_live_lead"))}</p>
        <section class="tla-live-upload" aria-labelledby="tla-live-upload-heading">
          <h3 id="tla-live-upload-heading" class="tla-live-upload__title">${escapeHtml(t("tla_live_upload_heading"))}</h3>
          <p class="tla-live-upload__hint">${escapeHtml(t("tla_live_upload_hint"))}</p>
          <input id="tla-live-file-input" type="file" class="hidden" multiple accept=".pdf,.ppt,.pptx,.doc,.docx,.txt" />
          <button type="button" class="btn-secondary" id="tla-live-upload-btn">${escapeHtml(t("tla_live_upload_btn"))}</button>
          <p id="tla-live-upload-status" class="tla-status hidden" role="status"></p>
        </section>
        <hr class="tla-live-divider" />
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
          <button type="button" class="btn-primary" id="tla-live-generate" data-eap-ai-busy-key="eap_ai_busy_html">${escapeHtml(t("tla_generate_btn"))}</button>
          <a class="btn-secondary" href="teacher-lesson-ai.html">${escapeHtml(t("tla_open_full"))}</a>
        </div>
        <p id="tla-live-status" class="tla-status hidden" role="status"></p>
        <div id="tla-live-saved" class="tla-saved-wrap"></div>
      </div>
    `;
    if (global.EAP_I18N) global.EAP_I18N.applyStatic();
    document.getElementById("tla-live-upload-btn")?.addEventListener("click", () => {
      document.getElementById("tla-live-file-input")?.click();
    });
    document.getElementById("tla-live-file-input")?.addEventListener("change", (ev) => {
      const files = ev.target.files;
      if (!files || !files.length) return;
      void uploadLivePanelFiles(files, className, document.getElementById("tla-live-upload-status"));
      ev.target.value = "";
    });
    document.getElementById("tla-live-generate")?.addEventListener("click", () => {
      void runGenerate(document.getElementById("tla-live-status"), true);
    });
    void refreshSavedList(document.getElementById("tla-live-saved"), (page) => {
      presentHtmlInCanvas(page.html_content, page.title);
    });
  }

  async function uploadLivePanelFiles(files, className, statusEl) {
    const lib = global.EAP_CLASSROOM_DISPLAY;
    const live = global.EAP_TEACHER_LIVE;
    if (!lib || typeof lib.uploadFile !== "function") {
      setStatus(statusEl, t("tla_live_upload_no_api"), true);
      return;
    }
    setStatus(statusEl, t("tla_live_uploading"), false);
    let ok = 0;
    for (const file of files) {
      try {
        const item = await lib.uploadFile(className, file);
        ok += 1;
        if (live && typeof live.loadDisplayLibrary === "function") {
          await live.loadDisplayLibrary({ className });
        }
        if (live && typeof live.showDisplayLibraryItem === "function") {
          await live.showDisplayLibraryItem(item, true);
        }
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("tlive_display_upload_failed"), true);
        return;
      }
    }
    setStatus(statusEl, t("tla_live_upload_ok", { count: ok }), false);
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
        const saved = await api.savePage({
          title,
          topic: draftTopic || title,
          source_text: draftSource,
          html_content: draftHtml,
          class_name: (classEl?.value || ctx?.className || "").trim(),
          task_id: ctx?.taskId || null,
          template_key: currentTemplateKey(false),
        });
        lastSavedPageId = saved?.id || lastSavedPageId;
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

    document.getElementById("tla-push-class-btn")?.addEventListener("click", () => {
      void pushDraftToClass(statusEl);
    });

    void refreshSavedList(savedEl);
    bindSourceFileUpload();
    void refreshSourceFiles();
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
    await populateTemplateSelect(document.getElementById("tla-template"), draftTemplateKey);
    bindFullPage(ctx);

    const back = document.getElementById("tla-back-live");
    if (back && ctx.className) {
      const backHref = `teacher-live.html?class=${encodeURIComponent(ctx.className)}`;
      back.href = backHref;
      back.addEventListener("click", (ev) => {
        if (typeof global.EAP_warmNavigate === "function" && /onrender\.com$/i.test(location.hostname || "")) {
          ev.preventDefault();
          global.EAP_warmNavigate(backHref);
        }
      });
    }
    document.querySelector(".site-logo[href='teacher.html']")?.addEventListener("click", (ev) => {
      if (typeof global.EAP_warmNavigate === "function" && /onrender\.com$/i.test(location.hostname || "")) {
        ev.preventDefault();
        global.EAP_warmNavigate("teacher.html");
      }
    });

    if (global.EAP_I18N) global.EAP_I18N.applyStatic();
  }

  function applyPackGeneratedHtml(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const html = o.html || "";
    if (!html) return;
    draftHtml = html;
    if (typeof global.EAP_polishLessonHtml === "function") {
      draftHtml = global.EAP_polishLessonHtml(draftHtml);
    }
    draftTopic = (o.title || draftTopic || "").trim();
    if (o.pageId) lastSavedPageId = o.pageId;
    const titleEl = document.getElementById("tla-title");
    const topicEl = document.getElementById("tla-topic");
    const classEl = document.getElementById("tla-class");
    if (titleEl && o.title) titleEl.value = o.title;
    if (topicEl && o.title) topicEl.value = o.title;
    if (classEl && o.className) classEl.value = o.className;
    setPreviewHtml(draftHtml);
    if (typeof global.EAP_syncLessonSlotsFromHtml === "function") {
      global.EAP_syncLessonSlotsFromHtml(draftHtml);
    }
    const listEl = document.getElementById("tla-saved-list");
    if (listEl) void refreshSavedList(listEl);
  }

  global.EAP_TEACHER_LESSON_AI = {
    mountLivePanel,
    presentHtmlInCanvas,
    pushDraftToClass,
    applyPackGeneratedHtml,
    setPreviewHtml,
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
