/**
 * LP-M1 — Writing lesson prep wizard (EAP047 pilot) on AI Lesson Builder page.
 */
(function (global) {
  const STYLE_LABELS = {
    interactive: { en: "Interactive", zh: "互动式" },
    lecture_led: { en: "Lecture-led", zh: "讲授为主" },
    exam_drill: { en: "Exam drill", zh: "考试训练" },
    flipped: { en: "Flipped", zh: "翻转课堂" },
    support_bilingual: { en: "Support-heavy (bilingual hints)", zh: "支持型（双语提示）" },
    student_centered: { en: "Student-centered", zh: "以学生为中心" },
  };

  function t(key, params) {
    if (typeof global.t === "function") return global.t(key, params);
    return key;
  }

  function isZh() {
    return !!(global.EAP_I18N && global.EAP_I18N.getLang() === "zh");
  }

  function api() {
    return global.EAP_TEACHER_LESSON_PREP;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    el.classList.toggle("tla-status--error", !!isError);
  }

  function styleLabel(key) {
    const row = STYLE_LABELS[key] || { en: key, zh: key };
    return isZh() ? row.zh : row.en;
  }

  let meta = null;
  let packId = null;
  let currentPlan = null;
  let teachingPageId = null;

  function readForm() {
    return {
      title: (document.getElementById("tlp-title")?.value || "").trim(),
      lesson_date: (document.getElementById("tlp-date")?.value || "").trim(),
      duration_minutes: parseInt(document.getElementById("tlp-duration")?.value || "100", 10),
      teaching_style: document.getElementById("tlp-style")?.value || "interactive",
      objectives: (document.getElementById("tlp-objectives")?.value || "").trim(),
      ielts_band_target: (document.getElementById("tlp-ielts")?.value || "").trim(),
      class_name: meta?.pilot_class || "EAP047",
    };
  }

  function fillForm(pack) {
    if (!pack) return;
    const title = document.getElementById("tlp-title");
    const date = document.getElementById("tlp-date");
    const dur = document.getElementById("tlp-duration");
    const style = document.getElementById("tlp-style");
    const obj = document.getElementById("tlp-objectives");
    const ielts = document.getElementById("tlp-ielts");
    if (title) title.value = pack.title || "";
    if (date) date.value = pack.lesson_date || "";
    if (dur) dur.value = String(pack.duration_minutes || 100);
    if (style) style.value = pack.teaching_style || "interactive";
    if (obj) obj.value = pack.objectives || "";
    if (ielts) ielts.value = pack.ielts_band_target || "";
    const topic = document.getElementById("tla-topic");
    if (topic && pack.title && !topic.value.trim()) topic.value = pack.title;
    teachingPageId = pack.teaching_page_id || null;
    if (pack.has_html && teachingPageId) void loadPackHtmlIntoMainPreview(teachingPageId, pack);
    updateLiveLink(pack);
  }

  async function loadPackHtmlIntoMainPreview(pageId, pack) {
    const prepApi = api();
    if (!prepApi || !pageId) return;
    try {
      const res = await fetch(prepApi.pageViewUrl(pageId), {
        credentials: "include",
        headers: typeof global.EAP_getAuthHeaders === "function" ? global.EAP_getAuthHeaders() : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      applyHtmlToMainPreview(html, {
        pageId,
        title: pack?.title || "",
        className: pack?.class_name || meta?.pilot_class || "EAP047",
      });
    } catch (_) {
      /* preview optional on load */
    }
  }

  function applyHtmlToMainPreview(html, opts) {
    if (!html) return;
    if (global.EAP_TEACHER_LESSON_AI && typeof global.EAP_TEACHER_LESSON_AI.applyPackGeneratedHtml === "function") {
      global.EAP_TEACHER_LESSON_AI.applyPackGeneratedHtml({
        html,
        pageId: opts?.pageId || teachingPageId,
        title: opts?.title || (document.getElementById("tlp-title")?.value || "").trim(),
        className: opts?.className || meta?.pilot_class || "EAP047",
      });
      return;
    }
    if (typeof global.EAP_syncLessonSlotsFromHtml === "function") {
      global.EAP_syncLessonSlotsFromHtml(html);
    }
  }

  function updateLiveLink(pack) {
    const link = document.getElementById("tlp-open-live");
    if (!link || !meta) return;
    const cls = pack?.class_name || meta.pilot_class || "EAP047";
    link.href = `teacher-live.html?class=${encodeURIComponent(cls)}`;
    link.classList.toggle("hidden", !pack?.has_html);
  }

  function renderPlan(plan) {
    currentPlan = plan;
    const wrap = document.getElementById("tlp-plan-view");
    const jsonEl = document.getElementById("tlp-plan-json");
    if (!wrap) return;
    if (!plan) {
      wrap.innerHTML = `<p class="tlp-plan-empty">${escapeHtml(t("tlp_plan_empty"))}</p>`;
      if (jsonEl) jsonEl.value = "";
      return;
    }
    if (jsonEl) jsonEl.value = JSON.stringify(plan, null, 2);

    const segments = Array.isArray(plan.segments) ? plan.segments : [];
    const objectives = Array.isArray(plan.objectives) ? plan.objectives : [];
    let html = "";
    if (plan.title) {
      html += `<h3 class="tlp-plan-heading">${escapeHtml(plan.title)}</h3>`;
    }
    if (objectives.length) {
      html += `<h4 class="tlp-plan-sub">${escapeHtml(t("tlp_objectives_heading"))}</h4><ul>`;
      objectives.forEach((o) => {
        html += `<li>${escapeHtml(o)}</li>`;
      });
      html += "</ul>";
    }
    if (segments.length) {
      html += `<h4 class="tlp-plan-sub">${escapeHtml(t("tlp_segments_heading"))}</h4><ol class="tlp-segments">`;
      segments.forEach((seg) => {
        const mins = seg.minutes != null ? ` (${seg.minutes} min)` : "";
        html += `<li><strong>${escapeHtml(seg.title || "")}${escapeHtml(mins)}</strong>`;
        if (seg.teacher_action) html += `<p><em>${escapeHtml(t("tlp_teacher"))}</em> ${escapeHtml(seg.teacher_action)}</p>`;
        if (seg.student_action) html += `<p><em>${escapeHtml(t("tlp_student"))}</em> ${escapeHtml(seg.student_action)}</p>`;
        html += "</li>";
      });
      html += "</ol>";
    }
    if (plan.homework_sketch) {
      html += `<h4 class="tlp-plan-sub">${escapeHtml(t("tlp_homework_heading"))}</h4><p>${escapeHtml(plan.homework_sketch)}</p>`;
    }
    if (plan.notes_for_teacher) {
      html += `<h4 class="tlp-plan-sub">${escapeHtml(t("tlp_notes_heading"))}</h4><p>${escapeHtml(plan.notes_for_teacher)}</p>`;
    }
    wrap.innerHTML = html || `<p class="tlp-plan-empty">${escapeHtml(t("tlp_plan_empty"))}</p>`;
  }

  function renderPackFiles(files) {
    const list = document.getElementById("tlp-file-list");
    if (!list) return;
    if (!files || !files.length) {
      list.innerHTML = `<li class="tlp-file-empty">${escapeHtml(t("tlp_files_empty"))}</li>`;
      return;
    }
    list.innerHTML = files
      .map((f, idx) => {
        const status = f.extract_status === "ok" ? t("tlp_file_ok") : t("tlp_file_failed");
        const err = f.extract_error ? ` — ${escapeHtml(f.extract_error)}` : "";
        return `<li class="tla-source-file-list__item tlp-file-row" data-file-id="${f.id}">
          <span class="tlp-file-row__index" aria-hidden="true">${idx + 1}.</span>
          <span class="tla-source-file-list__name">${escapeHtml(f.original_name)}</span>
          <span class="tlp-file-meta">${escapeHtml(status)} (${f.char_count || 0} chars)${err}</span>
          <button type="button" class="btn-secondary btn-small tlp-file-delete-btn" data-tlp-delete-file="${f.id}" aria-label="${escapeHtml(t("tlp_file_delete_btn"))}">${escapeHtml(t("tlp_file_delete_btn"))}</button>
        </li>`;
      })
      .join("");
    list.querySelectorAll("[data-tlp-delete-file]").forEach((btn) => {
      btn.addEventListener("click", () => {
        void deletePackFile(parseInt(btn.getAttribute("data-tlp-delete-file"), 10));
      });
    });
  }

  async function deletePackFile(fileId) {
    const prepApi = api();
    const statusEl = document.getElementById("tlp-status");
    if (!prepApi || !packId || !fileId) {
      setStatus(statusEl, t("tlp_save_pack_first"), true);
      return;
    }
    if (!global.confirm(t("tlp_file_delete_confirm"))) return;
    setStatus(statusEl, t("tlp_file_deleting"), false);
    try {
      await prepApi.deletePackFile(packId, fileId);
      const pack = await prepApi.getPack(packId);
      renderPackFiles(pack.files || []);
      setStatus(statusEl, t("tlp_file_deleted"), false);
    } catch (err) {
      setStatus(statusEl, (err && err.message) || t("tlp_file_delete_failed"), true);
    }
  }

  async function refreshPackSelect(selectedId) {
    const sel = document.getElementById("tlp-pack-select");
    const prepApi = api();
    if (!sel || !prepApi) return;
    try {
      const packs = await prepApi.listPacks();
      sel.innerHTML = `<option value="">${escapeHtml(t("tlp_pack_new"))}</option>`;
      packs.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = String(p.id);
        opt.textContent = `#${p.id} — ${p.title} (${p.plan_status})`;
        if (selectedId && p.id === selectedId) opt.selected = true;
        sel.appendChild(opt);
      });
    } catch (_) {
      sel.innerHTML = `<option value="">${escapeHtml(t("tlp_pack_load_failed"))}</option>`;
    }
  }

  async function loadPack(id) {
    const prepApi = api();
    if (!prepApi || !id) return;
    const statusEl = document.getElementById("tlp-status");
    setStatus(statusEl, t("tlp_loading"), false);
    try {
      const pack = await prepApi.getPack(id);
      packId = pack.id;
      fillForm(pack);
      renderPackFiles(pack.files || []);
      renderPlan(pack.plan);
      document.getElementById("tlp-pack-id-label").textContent = `#${pack.id}`;
      await refreshPackSelect(pack.id);
      setStatus(statusEl, "", false);
    } catch (err) {
      setStatus(statusEl, (err && err.message) || t("tlp_load_failed"), true);
    }
  }

  async function ensurePack(statusEl) {
    const prepApi = api();
    if (!prepApi) throw new Error(t("tlp_api_missing"));
    const form = readForm();
    if (!form.title) throw new Error(t("tlp_title_required"));
    if (packId) {
      const pack = await prepApi.updatePack(packId, form);
      fillForm(pack);
      return packId;
    }
    const pack = await prepApi.createPack(form);
    packId = pack.id;
    document.getElementById("tlp-pack-id-label").textContent = `#${pack.id}`;
    await refreshPackSelect(pack.id);
    return packId;
  }

  function bind() {
    const statusEl = document.getElementById("tlp-status");
    const prepApi = api();
    if (!prepApi) return;

    document.getElementById("tlp-pack-select")?.addEventListener("change", (ev) => {
      const val = ev.target.value;
      if (!val) {
        packId = null;
        currentPlan = null;
        teachingPageId = null;
        document.getElementById("tlp-pack-id-label").textContent = "—";
        renderPlan(null);
        renderPackFiles([]);
        return;
      }
      void loadPack(parseInt(val, 10));
    });

    document.getElementById("tlp-save-pack-btn")?.addEventListener("click", async () => {
      setStatus(statusEl, t("tlp_saving"), false);
      try {
        await ensurePack(statusEl);
        setStatus(statusEl, t("tlp_saved_pack"), false);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("tlp_save_failed"), true);
      }
    });

    document.getElementById("tlp-upload-btn")?.addEventListener("click", () => {
      document.getElementById("tlp-file-input")?.click();
    });

    document.getElementById("tlp-file-input")?.addEventListener("change", async (ev) => {
      const files = Array.from(ev.target.files || []);
      ev.target.value = "";
      if (!files.length) return;
      setStatus(statusEl, t("tlp_uploading"), false);
      try {
        const id = await ensurePack(statusEl);
        await prepApi.uploadPackFiles(id, files, true);
        const pack = await prepApi.getPack(id);
        renderPackFiles(pack.files || []);
        setStatus(statusEl, t("tlp_uploaded", { count: files.length }), false);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("tlp_upload_failed"), true);
      }
    });

    document.getElementById("tlp-generate-plan-btn")?.addEventListener("click", async () => {
      setStatus(statusEl, t("tlp_generating"), false);
      try {
        const id = await ensurePack(statusEl);
        const result = await prepApi.generatePlan(id);
        renderPlan(result.pack?.plan || result.plan);
        setStatus(statusEl, t("tlp_generated_ok"), false);
        await refreshPackSelect(id);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("tlp_generate_failed"), true);
      }
    });

    document.getElementById("tlp-save-plan-btn")?.addEventListener("click", async () => {
      if (!packId) {
        setStatus(statusEl, t("tlp_save_pack_first"), true);
        return;
      }
      const jsonEl = document.getElementById("tlp-plan-json");
      let plan;
      try {
        plan = JSON.parse(jsonEl?.value || "{}");
      } catch (_) {
        setStatus(statusEl, t("tlp_json_invalid"), true);
        return;
      }
      setStatus(statusEl, t("tlp_saving"), false);
      try {
        const pack = await prepApi.updatePack(packId, { plan, plan_status: "approved" });
        renderPlan(pack.plan);
        setStatus(statusEl, t("tlp_plan_saved"), false);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("tlp_save_failed"), true);
      }
    });

    document.getElementById("tlp-generate-html-btn")?.addEventListener("click", async () => {
      setStatus(statusEl, t("tlp_generating_html"), false);
      try {
        const id = await ensurePack(statusEl);
        let planToSave = currentPlan;
        if (!planToSave) {
          try {
            planToSave = JSON.parse(document.getElementById("tlp-plan-json")?.value || "{}");
          } catch (_) {
            setStatus(statusEl, t("tlp_json_invalid"), true);
            return;
          }
        }
        await prepApi.updatePack(id, {
          plan: planToSave,
          plan_status: "approved",
        });
        currentPlan = planToSave;
        const result = await prepApi.generateHtml(id);
        teachingPageId = result.page?.id || result.pack?.teaching_page_id || teachingPageId;
        const html = result.html || "";
        if (html) {
          applyHtmlToMainPreview(html, {
            pageId: teachingPageId,
            title: result.page?.title || result.pack?.title,
            className: result.pack?.class_name || meta?.pilot_class,
          });
          document.getElementById("tla-preview-frame")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else if (teachingPageId) {
          await loadPackHtmlIntoMainPreview(teachingPageId, result.pack);
        }
        if (result.pack) updateLiveLink(result.pack);
        setStatus(statusEl, t("tlp_html_generated_ok"), false);
        await refreshPackSelect(id);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("tlp_html_failed"), true);
      }
    });

    document.getElementById("tlp-publish-btn")?.addEventListener("click", async () => {
      if (!packId) {
        setStatus(statusEl, t("tlp_save_pack_first"), true);
        return;
      }
      const lessonDate = (document.getElementById("tlp-date")?.value || "").trim();
      if (!lessonDate) {
        setStatus(statusEl, t("tlp_date_required_publish"), true);
        return;
      }
      setStatus(statusEl, t("tlp_publishing"), false);
      try {
        const result = await prepApi.publishPack(packId, { lesson_date: lessonDate });
        setStatus(
          statusEl,
          t("tlp_published_ok", {
            date: result.task?.date || lessonDate,
            taskId: result.task?.id || "",
          }),
          false,
        );
        if (result.pack) updateLiveLink(result.pack);
      } catch (err) {
        setStatus(statusEl, (err && err.message) || t("tlp_publish_failed"), true);
      }
    });
  }

  async function boot() {
    const section = document.getElementById("tlp-section");
    if (!section) return;
    const prepApi = api();
    if (!prepApi) return;

    try {
      meta = await prepApi.getMeta();
    } catch (err) {
      setStatus(document.getElementById("tlp-status"), (err && err.message) || "API error", true);
      return;
    }

    const pilotEl = document.getElementById("tlp-pilot-badge");
    if (pilotEl && meta.pilot_class) {
      pilotEl.textContent = `${meta.pilot_class} · ${meta.category || "writing"}`;
    }

    const durSel = document.getElementById("tlp-duration");
    if (durSel && meta.duration_presets) {
      durSel.innerHTML = "";
      meta.duration_presets.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = String(m);
        opt.textContent = `${m} min`;
        if (m === meta.default_duration_minutes) opt.selected = true;
        durSel.appendChild(opt);
      });
    }

    const styleSel = document.getElementById("tlp-style");
    if (styleSel && meta.teaching_styles) {
      styleSel.innerHTML = "";
      meta.teaching_styles.forEach((key) => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = styleLabel(key);
        styleSel.appendChild(opt);
      });
    }

    const classEl = document.getElementById("tla-class");
    if (classEl && meta.pilot_class && !classEl.value.trim()) {
      classEl.value = meta.pilot_class;
    }

    await refreshPackSelect(null);
    bind();

    const params = new URLSearchParams(global.location.search);
    const loadId = params.get("pack");
    if (loadId) {
      section.open = true;
      void loadPack(parseInt(loadId, 10));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void boot();
    });
  } else {
    void boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
