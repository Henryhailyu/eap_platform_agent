/**
 * Manager self-study materials — Phase S7 mock (localStorage, no AI APIs).
 */
(function (global) {
  const STORAGE_KEY = "eap_manager_self_study_materials";
  const MAX_TEXT_SNIPPET = 4000;

  const MODULES = [
    { id: "vocabulary", labelEn: "Vocabulary", labelZh: "词汇" },
    { id: "reading", labelEn: "Reading", labelZh: "阅读" },
    { id: "listening", labelEn: "Listening", labelZh: "听力" },
    { id: "speaking", labelEn: "Speaking", labelZh: "口语" },
    { id: "writing", labelEn: "Writing", labelZh: "写作" },
  ];

  const LEVELS = [
    { id: "all", labelEn: "All levels", labelZh: "全部等级" },
    { id: "beginner", labelEn: "Beginner", labelZh: "初级" },
    { id: "intermediate", labelEn: "Intermediate", labelZh: "中级" },
    { id: "advanced", labelEn: "Advanced", labelZh: "高级" },
  ];

  const FORMATS = [
    { id: "pdf", labelEn: "PDF", labelZh: "PDF" },
    { id: "doc", labelEn: "Word", labelZh: "Word" },
    { id: "ppt", labelEn: "PowerPoint", labelZh: "PPT" },
    { id: "txt", labelEn: "Text", labelZh: "文本" },
    { id: "url", labelEn: "Web link", labelZh: "网页链接" },
  ];

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const serverCache = {};

  function readLocalAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function readAll() {
    const keys = Object.keys(serverCache);
    if (keys.length) {
      return keys.reduce((acc, k) => acc.concat(serverCache[k] || []), []);
    }
    return readLocalAll();
  }

  function resolveFileUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    const base =
      (global.EAP_API_BASE && String(global.EAP_API_BASE).trim()) ||
      (global.location && global.location.origin) ||
      "";
    const root = String(base).replace(/\/$/, "");
    const rel = path.startsWith("/") ? path : `/${path}`;
    return `${root}${rel}`;
  }

  async function refreshForModule(moduleId, studentLevelId) {
    const api = global.EAP_SELF_STUDY_MATERIALS_API;
    if (!api || typeof api.listStudentMaterials !== "function") {
      delete serverCache[moduleId];
      return readLocalAll().filter(
        (item) => item.module === moduleId && matchesStudentLevel(item.level, studentLevelId),
      );
    }
    try {
      const items = await api.listStudentMaterials(moduleId, studentLevelId);
      serverCache[moduleId] = items;
      return items;
    } catch (_) {
      delete serverCache[moduleId];
      return listForStudent(moduleId, studentLevelId);
    }
  }

  function writeAll(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function moduleLabel(id) {
    const m = MODULES.find((x) => x.id === id);
    if (!m) return id;
    return isZh() ? m.labelZh : m.labelEn;
  }

  function levelLabel(id) {
    const l = LEVELS.find((x) => x.id === id);
    if (!l) return id;
    return isZh() ? l.labelZh : l.labelEn;
  }

  function formatLabel(id) {
    const f = FORMATS.find((x) => x.id === id);
    if (!f) return id;
    return isZh() ? f.labelZh : f.labelEn;
  }

  function inferFromText(text) {
    const s = String(text || "").toLowerCase();
    const out = { module: "vocabulary", level: "all", format: "pdf" };
    if (/listen|lecture|audio|script/.test(s)) out.module = "listening";
    else if (/read|passage|comprehension/.test(s)) out.module = "reading";
    else if (/speak|presentation|discussion/.test(s)) out.module = "speaking";
    else if (/writ|essay|paragraph|summary/.test(s)) out.module = "writing";
    else if (/vocab|word|awl|collocation/.test(s)) out.module = "vocabulary";

    if (/advanced|7\.5|7\.0\+|band.?7/.test(s)) out.level = "advanced";
    else if (/intermediate|6\.0|band.?6/.test(s)) out.level = "intermediate";
    else if (/beginner|5\.0|band.?5/.test(s)) out.level = "beginner";

    if (/\.docx?$|word/.test(s)) out.format = "doc";
    else if (/\.pptx?$|powerpoint/.test(s)) out.format = "ppt";
    else if (/\.txt|text/.test(s)) out.format = "txt";
    else if (/^https?:\/\//.test(s) || /url|link|http/.test(s)) out.format = "url";
    else if (/\.pdf/.test(s)) out.format = "pdf";
    return out;
  }

  function suggestTags(fileName, notes) {
    return inferFromText(`${fileName || ""} ${notes || ""}`);
  }

  function matchesStudentLevel(itemLevel, studentLevelId) {
    if (!itemLevel || itemLevel === "all") return true;
    return itemLevel === studentLevelId;
  }

  function listForStudent(moduleId, studentLevelId) {
    if (serverCache[moduleId]) {
      return serverCache[moduleId]
        .slice()
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    }
    return readAll()
      .filter((item) => item.module === moduleId && matchesStudentLevel(item.level, studentLevelId))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  function addMaterial(payload) {
    const items = readLocalAll();
    const item = {
      id: `mat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: String(payload.title || "").trim(),
      titleZh: String(payload.titleZh || "").trim(),
      module: payload.module || "vocabulary",
      level: payload.level || "all",
      format: payload.format || "pdf",
      fileName: String(payload.fileName || "").trim(),
      notes: String(payload.notes || "").trim(),
      textSnippet: payload.textSnippet ? String(payload.textSnippet).slice(0, MAX_TEXT_SNIPPET) : "",
      url: String(payload.url || "").trim(),
      createdAt: Date.now(),
    };
    if (!item.title) throw new Error("title_required");
    items.unshift(item);
    writeAll(items);
    return item;
  }

  function removeMaterial(id) {
    const before = readLocalAll();
    const next = before.filter((x) => x.id !== id);
    writeAll(next);
    return next.length < before.length;
  }

  function displayTitle(item) {
    if (isZh() && item.titleZh) return item.titleZh;
    return item.title;
  }

  function renderLearnBlock(moduleId, studentLevelId) {
    const items = listForStudent(moduleId, studentLevelId);
    if (!items.length) return "";

    const cards = items
      .map((item) => {
        const tags = [
          moduleLabel(item.module),
          levelLabel(item.level),
          formatLabel(item.format),
        ]
          .map((label) => `<span class="ssc-mat-tag">${escapeHtml(label)}</span>`)
          .join("");

        const unit =
          item.unitLabel || item.unit_label
            ? `<p class="ssc-mat-card__unit">${escapeHtml(item.unitLabel || item.unit_label)}</p>`
            : "";

        const meta = item.fileUrl
          ? `<p class="ssc-mat-card__file"><a class="ssc-mat-card__download" href="${escapeHtml(resolveFileUrl(item.fileUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.fileName || t("self_study_mat_download"))}</a></p>`
          : item.fileName
            ? `<p class="ssc-mat-card__file">${escapeHtml(item.fileName)}</p>`
            : item.url
              ? `<p class="ssc-mat-card__file"><a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a></p>`
              : "";

        const notes = item.notes
          ? `<p class="ssc-mat-card__notes">${escapeHtml(item.notes)}</p>`
          : "";

        const snippet = item.textSnippet
          ? `<pre class="ssc-mat-card__snippet">${escapeHtml(item.textSnippet)}</pre>`
          : "";

        return `
          <article class="ssc-mat-card">
            <h3 class="ssc-mat-card__title">${escapeHtml(displayTitle(item))}</h3>
            <div class="ssc-mat-card__tags">${tags}</div>
            ${unit}
            ${meta}
            ${notes}
            ${snippet}
          </article>
        `;
      })
      .join("");

    return `
      <section class="ssc-mat-section" aria-labelledby="ssc-mat-heading">
        <h2 id="ssc-mat-heading" class="ssc-mat-section__title" data-i18n="self_study_mgr_materials_heading">School resources</h2>
        <p class="ssc-mat-section__lead" data-i18n="self_study_mgr_materials_lead">Uploaded by your programme manager for this module and level.</p>
        <div class="ssc-mat-list">${cards}</div>
      </section>
    `;
  }

  global.EAP_MANAGER_SSC_MATERIALS = {
    STORAGE_KEY,
    MODULES,
    LEVELS,
    FORMATS,
    readAll,
    listForStudent,
    refreshForModule,
    suggestTags,
    addMaterial,
    removeMaterial,
    moduleLabel,
    levelLabel,
    formatLabel,
    displayTitle,
    renderLearnBlock,
    resolveFileUrl,
    escapeHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
