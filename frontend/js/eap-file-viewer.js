/**
 * Classroom display file viewer — inline PDF/TXT, LibreOffice PDF preview, DOCX (mammoth), download.
 */
(function (global) {
  const OFFICE_EMBED = "https://view.officeapps.live.com/op/embed.aspx?src=";

  function fileDisplayMode(ext) {
    const e = String(ext || "").toLowerCase();
    if (e === "pdf") return "pdf";
    if (e === "txt") return "text";
    if (e === "ppt" || e === "pptx") return "presentation";
    if (e === "doc" || e === "docx") return "office";
    return "download";
  }

  function isLocalDevHost(url) {
    try {
      const h = new URL(url, global.location.origin).hostname;
      return h === "127.0.0.1" || h === "localhost";
    } catch (_) {
      return false;
    }
  }

  function officeEmbedUrl(fileUrl) {
    return OFFICE_EMBED + encodeURIComponent(fileUrl);
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

  function loadingMarkup(title, dlHref, dlLabel) {
    return `<div class="eap-file-viewer eap-file-viewer--loading">
      ${headMarkup(title, dlHref, dlLabel)}
      <p class="eap-file-viewer__hint">Loading preview…</p>
    </div>`;
  }

  /**
   * @param {{ url?: string, downloadUrl?: string, previewPdfUrl?: string, ext?: string, title?: string, downloadLabel?: string, openLabel?: string, officeHint?: string, previewHint?: string }} opts
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
    if (
      (fileDisplayMode(ext) === "presentation" || fileDisplayMode(ext) === "office") &&
      downloadSrc &&
      !isLocalDevHost(downloadSrc)
    ) {
      return embedMarkup(title, dlHref, dlLabel, officeEmbedUrl(downloadSrc));
    }
    return fallbackMarkup(
      title,
      dlHref,
      dlLabel,
      downloadSrc,
      o.openLabel || "Open file",
      o.previewHint || o.officeHint || o.lead || ""
    );
  }

  /**
   * Mount viewer into a container (async for DOCX mammoth).
   * @param {HTMLElement} container
   * @param {object} opts
   */
  async function mountFileViewer(container, opts) {
    if (!container) return;
    const o = opts && typeof opts === "object" ? opts : {};
    const ext = String(o.ext || "").toLowerCase();
    const downloadSrc = String(o.downloadUrl || o.url || "");
    const previewPdf = String(o.previewPdfUrl || "");
    const title = o.title || "";
    const dlLabel = o.downloadLabel || "Download file";
    const openLabel = o.openLabel || "Open file";
    const dlHref = downloadUrl(downloadSrc);
    const mode = fileDisplayMode(ext);

    if (!downloadSrc && !previewPdf) {
      container.innerHTML = `<p class="eap-file-viewer__hint">${escapeHtml(o.lead || "No file URL.")}</p>`;
      return;
    }

    if (ext === "pdf" || ext === "txt") {
      container.innerHTML = embedMarkup(title, dlHref, dlLabel, downloadSrc);
      return;
    }

    if (previewPdf) {
      container.innerHTML = embedMarkup(title, dlHref, dlLabel, previewPdf);
      return;
    }

    if ((ext === "doc" || ext === "docx") && global.mammoth && downloadSrc) {
      container.innerHTML = loadingMarkup(title, dlHref, dlLabel);
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

    if (
      (mode === "presentation" || mode === "office") &&
      downloadSrc &&
      !isLocalDevHost(downloadSrc)
    ) {
      container.innerHTML = embedMarkup(title, dlHref, dlLabel, officeEmbedUrl(downloadSrc));
      return;
    }

    const hint =
      o.previewHint ||
      (mode === "presentation" || mode === "office"
        ? o.officeHint || ""
        : o.lead || "");
    container.innerHTML = fallbackMarkup(title, dlHref, dlLabel, downloadSrc, openLabel, hint);
  }

  global.EAP_fileDisplayMode = fileDisplayMode;
  global.EAP_buildFileViewerMarkup = buildFileViewerMarkup;
  global.EAP_mountFileViewer = mountFileViewer;
  global.EAP_officeEmbedUrl = officeEmbedUrl;
  global.EAP_fileDownloadUrl = downloadUrl;
})(typeof window !== "undefined" ? window : globalThis);
