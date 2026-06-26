/**
 * Live Teaching — vocabulary for Vocabulary Bingo & Matching Race from lesson HTML.
 */
(function (global) {
  function t(key) {
    if (typeof global.t === "function") return global.t(key);
    return key;
  }

  const VOCAB_HEADING = /vocabulary|key\s+terms?|word\s+list|词汇|重点词|keyword|lexis|terminology|new\s+words?/i;
  const TARGET = 24;
  const MIN = 8;

  function getLessonHtmlCached() {
    try {
      return global.sessionStorage?.getItem("eap_last_lesson_html") || "";
    } catch (_) {
      return "";
    }
  }

  function lessonHtmlFingerprint(html) {
    const text = String(html || "");
    return `${text.length}:${text.slice(0, 280)}`;
  }

  function stripTags(text) {
    return String(text || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeTerms(items) {
    const out = [];
    const seen = new Set();
    (items || []).forEach((raw) => {
      if (!raw || typeof raw !== "object") return;
      const term = String(raw.term || raw.word || "").trim();
      const defEn = String(raw.defEn || raw.definition || raw.def || "").trim();
      const defZh = String(raw.defZh || defEn).trim();
      if (!term || !defEn) return;
      const key = term.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ term, defEn, defZh });
    });
    return out;
  }

  function addPair(pairs, seen, term, defEn, defZh) {
    const t0 = String(term || "").replace(/\s+/g, " ").trim();
    const d0 = String(defEn || "").replace(/\s+/g, " ").trim();
    const z0 = String(defZh || d0).trim();
    if (!t0 || !d0 || t0.length > 80 || d0.length > 200) return;
    const key = t0.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ term: t0, defEn: d0, defZh: z0 });
  }

  function parseVocabFromHtml(html) {
    const pairs = [];
    const seen = new Set();
    if (!html) return pairs;

    let doc;
    try {
      doc = new DOMParser().parseFromString(html, "text/html");
    } catch (_) {
      return pairs;
    }

    doc.querySelectorAll("dt").forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === "DD") {
        addPair(pairs, seen, stripTags(dt.innerHTML), stripTags(dd.innerHTML));
      }
    });

    doc.querySelectorAll("tr").forEach((tr) => {
      const cells = tr.querySelectorAll("th, td");
      if (cells.length >= 2) {
        addPair(pairs, seen, stripTags(cells[0].innerHTML), stripTags(cells[1].innerHTML));
      }
    });

    doc.querySelectorAll("li").forEach((li) => {
      const strong = li.querySelector("strong, b");
      if (!strong) return;
      const term = stripTags(strong.innerHTML);
      const clone = li.cloneNode(true);
      clone.querySelectorAll("strong, b").forEach((el) => el.remove());
      let rest = stripTags(clone.innerHTML).replace(/^[:\-–—]\s*/, "");
      if (term && rest) addPair(pairs, seen, term, rest);
    });

    doc.querySelectorAll("h2, h3").forEach((heading) => {
      if (!VOCAB_HEADING.test(stripTags(heading.textContent || ""))) return;
      let el = heading.nextElementSibling;
      let steps = 0;
      while (el && steps < 12) {
        if (/^H[23]$/i.test(el.tagName)) break;
        const plain = stripTags(el.innerHTML || el.textContent || "");
        plain.split(/\n+/).forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          for (const sep of [" — ", " – ", " - ", ": "]) {
            if (trimmed.includes(sep)) {
              const parts = trimmed.split(sep);
              addPair(pairs, seen, parts[0], parts.slice(1).join(sep));
              break;
            }
          }
        });
        el = el.nextElementSibling;
        steps += 1;
      }
    });

    return pairs;
  }

  function getCached() {
    const fp = lessonHtmlFingerprint(getLessonHtmlCached());
    const cache = global.__tliveAiQuestionCache;
    if (!cache || cache.fingerprint !== fp || !Array.isArray(cache.vocabTerms)) return null;
    return cache.vocabTerms;
  }

  function setCached(terms) {
    const prev = global.__tliveAiQuestionCache || {};
    global.__tliveAiQuestionCache = {
      ...prev,
      fingerprint: lessonHtmlFingerprint(getLessonHtmlCached()),
      vocabTerms: terms,
    };
  }

  let inflight = null;

  async function ensure() {
    const cached = getCached();
    if (cached && cached.length >= MIN) return cached;

    const html = getLessonHtmlCached();
    if (!html || html.length < 80) return null;

    const parsed = parseVocabFromHtml(html);
    if (parsed.length >= TARGET) {
      const terms = parsed.slice(0, TARGET);
      setCached(terms);
      return terms;
    }

    if (inflight) return inflight;

    const api = global.EAP_LIVE_TEACHING_API;
    if (!api || typeof api.generateVocab !== "function") {
      return parsed.length >= MIN ? parsed : null;
    }

    inflight = (async () => {
      try {
        const data = await api.generateVocab({ html, hint_terms: parsed });
        const terms = normalizeTerms((data && data.terms) || []);
        if (terms.length < MIN) {
          throw new Error(t("tlive_vocab_ai_failed"));
        }
        setCached(terms);
        return terms;
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }

  global.EAP_LIVE_GAME_VOCAB = {
    getLessonHtmlCached,
    parseVocabFromHtml,
    getCached,
    ensure,
    MIN,
    TARGET,
  };
})(typeof window !== "undefined" ? window : globalThis);
