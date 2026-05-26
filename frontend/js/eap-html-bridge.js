/**
 * Inject live activity bridge into HTML lesson iframes (teacher preview + helpers).
 */
(function (global) {
  function injectLiveBridge(html, ctx) {
    const text = String(html || "");
    if (!text) return text;
    if (/eap-live-bridge\.js/i.test(text)) return text;

    let cfg = "";
    if (ctx && typeof ctx === "object") {
      cfg = `<script>window.EAP_LIVE_CTX=${JSON.stringify(ctx)};</script>`;
    }

    const snippet = `${cfg}<script src="/ui/js/eap-live-bridge.js"></script>`;
    const lower = text.toLowerCase();
    if (lower.includes("</body>")) {
      const idx = lower.lastIndexOf("</body>");
      return text.slice(0, idx) + snippet + text.slice(idx);
    }
    return text + snippet;
  }

  function countActivities(html) {
    if (!html) return 0;
    const matches = String(html).match(/data-eap-id\s*=/gi);
    return matches ? matches.length : 0;
  }

  function polishLessonHtml(html) {
    let text = String(html || "");
    const rootM = text.match(/<!DOCTYPE\s+html|<html\b/i);
    if (rootM && rootM.index > 0) {
      text = text.slice(rootM.index);
    }
    const patterns = [
      /<(?:p|div|section|article|aside)[^>]*>[\s\S]*?This is a (?:complete,\s*)?self-contained HTML document[\s\S]*?<\/(?:p|div|section|article|aside)>\s*/gi,
      /<(?:p|div|section|article|aside)[^>]*>[\s\S]*?This HTML (?:lesson|document|page)[\s\S]*?<\/(?:p|div|section|article|aside)>\s*/gi,
      /<(?:p|div|section|article|aside)[^>]*>[\s\S]*?Here is the (?:complete\s+)?HTML document[\s\S]*?<\/(?:p|div|section|article|aside)>\s*/gi,
      /<(?:p|div|section|article|aside)[^>]*>[\s\S]*?Here is a (?:complete\s+)?(?:self-contained\s+)?HTML[\s\S]*?<\/(?:p|div|section|article|aside)>\s*/gi,
      /<(?:p|div)[^>]*>[^<]*(?:includes a clear title|interactive multiple-choice activities|structured teaching content with vocabulary|it includes a title banner|all styled for clear projection)[^<]*<\/(?:p|div)>\s*/gi,
      /<(?:p|div|section)[^>]*(?:class|id)=["'][^"']*(?:meta|intro|preamble|preface|description|ai-note|doc-note)[^"']*["'][^>]*>[\s\S]*?<\/(?:p|div|section)>\s*/gi,
    ];
    for (const re of patterns) {
      text = text.replace(re, "");
    }
    const bodyM = text.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    if (bodyM) {
      let inner = bodyM[1];
      const blockRe =
        /^\s*(<(p|div|section|article|aside|header)(\s[^>]*)?>[\s\S]*?<\/\2>)/i;
      for (let i = 0; i < 8; i++) {
        const m = blockRe.exec(inner);
        if (!m) break;
        const block = m[1];
        const plain = block
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase();
        const isMeta =
          (plain.startsWith("this is a ") && plain.includes("document")) ||
          (plain.startsWith("here is the ") && (plain.includes("html") || plain.includes("document"))) ||
          (plain.startsWith("here is a ") && (plain.includes("html") || plain.includes("document"))) ||
          plain.includes("self-contained html") ||
          plain.includes("complete html document") ||
          plain.includes("includes a clear title") ||
          plain.includes("it includes a title banner") ||
          plain.includes("for classroom use");
        if (!isMeta) break;
        inner = inner.slice(m[0].length);
      }
      text = text.slice(0, bodyM.index) + bodyM[0].replace(bodyM[1], inner) + text.slice(bodyM.index + bodyM[0].length);
    }
    return text;
  }

  global.EAP_injectLiveBridge = injectLiveBridge;
  global.EAP_countLessonActivities = countActivities;
  global.EAP_polishLessonHtml = polishLessonHtml;
})(typeof window !== "undefined" ? window : globalThis);
