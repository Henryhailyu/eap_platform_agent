/**
 * Classroom display file viewer — inline PDF/TXT, LibreOffice PDF preview, DOCX (mammoth), download.
 * Does not use Microsoft Office Online (files on Render require login; Office cannot fetch them).
 */
(function (global) {
  function fileDisplayMode(ext) {
    const e = String(ext || "").toLowerCase();
    if (e === "pdf") return "pdf";
    if (e === "txt") return "text";
    if (e === "ppt" || e === "pptx") return "presentation";
    if (e === "doc" || e === "docx") return "office";
    return "download";
  }

  function downloadUrl(fileUrl) {
    if (!fileUrl) return "#";
    const sep = fileUrl.includes("?") ? "&" : "?";
    return `${fileUrl}${sep}download=1`;
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function headMarkup(title, dlHref, dlLabel) {
    return `<div class="eap-file-viewer__head">
      <p class="eap-file-viewer__title">${escapeHtml(title)}</p>
      <div class="eap-file-viewer__actions">
        <a class="btn-secondary btn-small eap-file-viewer__download" href="${escapeHtml(dlHref)}" target="_blank" rel="noopener">${escapeHtml(dlLabel)}</a>
      </div>
    </div>`;
  }

  function embedMarkup(title, dlHref, dlLabel, viewUrl) {
    return `<div class="eap-file-viewer eap-file-viewer--embed">
      ${headMarkup(title, dlHref, dlLabel)}
      <div class="eap-file-viewer__stage">
        <iframe class="eap-file-viewer__frame" src="${escapeHtml(viewUrl)}" title="${escapeHtml(title)}"></iframe>
      </div>
    </div>`;
  }

  function docxMarkup(title, dlHref, dlLabel, innerHtml) {
    return `<div class="eap-file-viewer eap-file-viewer--docx">
      ${headMarkup(title, dlHref, dlLabel)}
      <div class="eap-file-viewer__stage eap-file-viewer__stage--docx">${innerHtml}</div>
    </div>`;
  }

  function fallbackMarkup(title, dlHref, dlLabel, openUrl, openLabel, hint) {
    const hintHtml = hint ? `<p class="eap-file-viewer__hint">${escapeHtml(hint)}</p>` : "";
    return `<div class="eap-file-viewer eap-file-viewer--fallback">
      ${headMarkup(title, dlHref, dlLabel)}
      ${hintHtml}
      <a class="btn-primary" href="${escapeHtml(openUrl)}" target="_blank" rel="noopener">${escapeHtml(openLabel)}</a>
    </div>`;
  }

  function loadingMarkup(title, dlHref, dlLabel, statusText) {
    return `<div class="eap-file-viewer eap-file-viewer--loading">
      ${headMarkup(title, dlHref, dlLabel)}
      <p class="eap-file-viewer__hint">${escapeHtml(statusText || "Loading preview…")}</p>
    </div>`;
  }

  function needsServerPdfPreview(ext) {
    const e = String(ext || "").toLowerCase();
    return e === "ppt" || e === "pptx" || e === "doc" || e === "doc";
  }

  /** Fetch protected preview with session cookie; iframe src cannot always send cookies on HTTP. */
  async function resolveAuthedPreviewSrc(url) {
    const raw = String(url || "").trim();
    if (!raw || raw.startsWith("blob:")) return raw;
    try {
      const resp = await fetch(raw, { credentials: "same-origin" });
      if (!resp.ok) return "";
      const ct = (resp.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) return "";
      return URL.createObjectURL(await resp.blob());
    } catch (_) {
      return "";
    }
  }

  async function iframeViewSrc(url, o) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (o && o.fetchPreviewWithCredentials) {
      const blob = await resolveAuthedPreviewSrc(raw);
      if (blob) return blob;
    }
    return raw;
  }

  /**
   * @param {{ url?: string, downloadUrl?: string, previewPdfUrl?: string, ext?: string, title?: string, downloadLabel?: string, openLabel?: string, previewHint?: string, loadingHint?: string }} opts
   */
  function buildFileViewerMarkup(opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    const ext = String(o.ext || "").toLowerCase();
    const downloadSrc = String(o.downloadUrl || o.url || "");
    const previewPdf = String(o.previewPdfUrl || "");
    const title = o.title || "";
    const dlLabel = o.downloadLabel || "Download file";
    const dlHref = escapeHtml(downloadUrl(downloadSrc));

    if (ext === "pdf" || ext === "txt") {
      return embedMarkup(title, dlHref, dlLabel, downloadSrc);
    }
    if (previewPdf) {
      return embedMarkup(title, dlHref, dlLabel, previewPdf);
    }
    return fallbackMarkup(
      title,
      dlHref,
      dlLabel,
      downloadSrc,
      o.openLabel || "Open file",
      o.previewHint || o.lead || ""
    );
  }

  /**
   * Mount viewer into a container (async for DOCX mammoth + optional preview build).
   * @param {HTMLElement} container
   * @param {object} opts
   */
  async function mountFileViewer(container, opts) {
    if (!container) return;
    const o = opts && typeof opts === "object" ? opts : {};
    const ext = String(o.ext || "").toLowerCase();
    let downloadSrc = String(o.downloadUrl || o.url || "");
    let previewPdf = String(o.inlineViewUrl || o.previewPdfUrl || "");
    const hideHead = !!o.hideHead;
    const title = o.title || "";
    const dlLabel = o.downloadLabel || "Download file";
    const openLabel = o.openLabel || "Open file";
    let dlHref = downloadUrl(downloadSrc);

    if (!downloadSrc && !previewPdf) {
      container.innerHTML = `<p class="eap-file-viewer__hint">${escapeHtml(o.lead || "No file URL.")}</p>`;
      return;
    }

    if (ext === "pdf" || ext === "txt") {
      const viewSrc = await iframeViewSrc(previewPdf || downloadSrc, o);
      if (!viewSrc) {
        container.innerHTML = fallbackMarkup(
          title,
          dlHref,
          dlLabel,
          downloadSrc,
          openLabel,
          o.previewHint || o.lead || ""
        );
        return;
      }
      container.innerHTML = hideHead
        ? `<div class="eap-file-viewer eap-file-viewer--embed eap-file-viewer--stage-only"><div class="eap-file-viewer__stage"><iframe class="eap-file-viewer__frame" src="${escapeHtml(viewSrc)}" title="${escapeHtml(title)}"></iframe></div></div>`
        : embedMarkup(title, dlHref, dlLabel, viewSrc);
      return;
    }

    if (needsServerPdfPreview(ext) && !previewPdf && typeof o.ensurePreview === "function") {
      container.innerHTML = loadingMarkup(
        title,
        dlHref,
        dlLabel,
        o.loadingHint || "Converting to PDF preview…"
      );
      try {
        const built = await o.ensurePreview();
        if (built && built.previewPdfUrl) previewPdf = built.previewPdfUrl;
        if (built && built.downloadUrl) downloadSrc = built.downloadUrl;
        dlHref = downloadUrl(downloadSrc);
      } catch (_) {
        /* fall through to fallback */
      }
    }

    if (previewPdf) {
      const viewSrc = await iframeViewSrc(previewPdf, o);
      if (!viewSrc) {
        container.innerHTML = fallbackMarkup(
          title,
          dlHref,
          dlLabel,
          downloadSrc,
          openLabel,
          o.previewHint || o.lead || ""
        );
        return;
      }
      container.innerHTML = hideHead
        ? `<div class="eap-file-viewer eap-file-viewer--embed eap-file-viewer--stage-only"><div class="eap-file-viewer__stage"><iframe class="eap-file-viewer__frame" src="${escapeHtml(viewSrc)}" title="${escapeHtml(title)}"></iframe></div></div>`
        : embedMarkup(title, dlHref, dlLabel, viewSrc);
      return;
    }

    if ((ext === "doc" || ext === "docx") && global.mammoth && downloadSrc) {
      container.innerHTML = loadingMarkup(title, dlHref, dlLabel, o.loadingHint || "Loading document…");
      try {
        const resp = await fetch(downloadSrc, { credentials: "same-origin" });
        if (!resp.ok) throw new Error("fetch failed");
        const buf = await resp.arrayBuffer();
        const result = await global.mammoth.convertToHtml({ arrayBuffer: buf });
        container.innerHTML = docxMarkup(title, dlHref, dlLabel, result.value || "<p>(Empty document)</p>");
      } catch (_) {
        container.innerHTML = fallbackMarkup(
          title,
          dlHref,
          dlLabel,
          downloadSrc,
          openLabel,
          o.previewHint || ""
        );
      }
      return;
    }

    container.innerHTML = fallbackMarkup(
      title,
      dlHref,
      dlLabel,
      downloadSrc,
      openLabel,
      o.previewHint || ""
    );
  }

  global.EAP_fileDisplayMode = fileDisplayMode;
  global.EAP_buildFileViewerMarkup = buildFileViewerMarkup;
  global.EAP_mountFileViewer = mountFileViewer;
  global.EAP_fileDownloadUrl = downloadUrl;
})(typeof window !== "undefined" ? window : globalThis);
