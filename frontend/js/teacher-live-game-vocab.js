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

  const BLOCKED_TERMS = new Set([
    "word",
    "words",
    "term",
    "terms",
    "definition",
    "definitions",
    "example",
    "examples",
    "meaning",
    "meanings",
    "vocabulary",
    "title",
    "question",
    "answer",
    "free",
    "释义",
    "词汇",
    "单词",
    "词",
  ]);

  const PLACEHOLDER_DEFS = new Set([
    "definition",
    "definition (释义)",
    "meaning",
    "word",
    "释义",
    "词汇",
    "单词",
  ]);

  function isValidGameVocab(term, defEn) {
    const t0 = String(term || "").replace(/\s+/g, " ").trim();
    const d0 = String(defEn || "").replace(/\s+/g, " ").trim();
    if (!t0 || !d0 || t0.length > 64 || d0.length > 200) return false;
    const tKey = t0.toLowerCase();
    const dKey = d0.toLowerCase();
    if (BLOCKED_TERMS.has(tKey) || PLACEHOLDER_DEFS.has(dKey)) return false;
    if (/definition\s*[\(（].*释义/i.test(d0)) return false;
    if (tKey.length && dKey.includes(tKey) && d0.length < 24) return false;
    if (/\d/.test(t0)) return false;
    if (/[°±×÷/\\@#$%^&*+=<>{}[\]|~`]/.test(t0)) return false;
    if (!/^[a-zA-Z][a-zA-Z\s'\-]*$/.test(t0)) return false;
    if (t0.replace(/[-\s]/g, "").length < 3) return false;
    if (d0.length < 10) return false;
    return true;
  }

  function stripChinese(text) {
    return String(text || "")
      .replace(/\s*[\(（][^)\）]*[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff][^)\）]*[\)）]/gu, "")
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]+/gu, "")
      .replace(/\(\s*\)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function filterValidTerms(items) {
    return normalizeTerms(items).filter((item) => isValidGameVocab(item.term, item.defEn));
  }

  function getLessonHtmlCached() {
    if (typeof global.EAP_getActiveLessonHtml === "function") {
      return global.EAP_getActiveLessonHtml();
    }
    try {
      return global.sessionStorage?.getItem("eap_last_lesson_html") || "";
    } catch (_) {
      return "";
    }
  }

  function lessonHtmlFingerprint(html) {
    if (typeof global.EAP_lessonHtmlFingerprint === "function") {
      return global.EAP_lessonHtmlFingerprint(html);
    }
    const text = String(html || "");
    return `${text.length}:${text.slice(0, 280)}`;
  }

  function getLessonPageId() {
    if (typeof global.EAP_resolveActiveLessonPageId === "function") {
      const resolved = global.EAP_resolveActiveLessonPageId();
      if (resolved) return resolved;
    }
    if (typeof global.EAP_getActiveLessonPageId === "function") {
      return global.EAP_getActiveLessonPageId();
    }
    return global.__tliveLessonPageId || "";
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
      const term = stripChinese(String(raw.term || raw.word || "").trim());
      const defEn = stripChinese(String(raw.defEn || raw.definition || raw.def || "").trim());
      const defZh = defEn;
      if (!isValidGameVocab(term, defEn)) return;
      const key = term.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ term, defEn, defZh });
    });
    return out;
  }

  function addPair(pairs, seen, term, defEn, defZh) {
    const t0 = stripChinese(String(term || "").replace(/\s+/g, " ").trim());
    const d0 = stripChinese(String(defEn || "").replace(/\s+/g, " ").trim());
    const z0 = d0;
    if (!isValidGameVocab(t0, d0)) return;
    const key = t0.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ term: t0, defEn: d0, defZh: z0 });
  }

  function addLinePair(pairs, seen, line) {
    const trimmed = String(line || "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    if (!trimmed || trimmed.length < 4) return;
    for (const sep of [" — ", " – ", " - ", ": "]) {
      if (!trimmed.includes(sep)) continue;
      const parts = trimmed.split(sep);
      addPair(pairs, seen, parts[0], parts.slice(1).join(sep));
      return;
    }
  }

  function parseVocabMeta(doc, pairs, seen) {
    const node = doc.getElementById("eap-lesson-meta");
    if (!node || !node.textContent) return;
    try {
      const data = JSON.parse(node.textContent);
      const lists = [data.vocabulary, data.vocab_terms, data.key_terms, data.terms];
      lists.forEach((list) => {
        if (!Array.isArray(list)) return;
        list.forEach((raw) => {
          if (!raw || typeof raw !== "object") return;
          addPair(
            pairs,
            seen,
            raw.term || raw.word,
            raw.defEn || raw.definition || raw.def,
            raw.defZh,
          );
        });
      });
    } catch (_) {
      /* ignore malformed meta */
    }
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

    parseVocabMeta(doc, pairs, seen);

    doc.querySelectorAll("dt").forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === "DD") {
        addPair(pairs, seen, stripTags(dt.innerHTML), stripTags(dd.innerHTML));
      }
    });

    doc.querySelectorAll("tr").forEach((tr) => {
      const cells = tr.querySelectorAll("th, td");
      if (cells.length >= 2) {
        const head = stripTags(cells[0].innerHTML).toLowerCase();
        if (/^(term|word|vocabulary|definition|meaning)\b/.test(head)) return;
        addPair(pairs, seen, stripTags(cells[0].innerHTML), stripTags(cells[1].innerHTML));
      }
    });

    doc.querySelectorAll("p").forEach((p) => {
      const emphasis = p.querySelector("strong, b, em");
      if (!emphasis) return;
      const term = stripTags(emphasis.innerHTML);
      const clone = p.cloneNode(true);
      clone.querySelectorAll("strong, b, em").forEach((el) => el.remove());
      const rest = stripTags(clone.innerHTML).replace(/^[:\-–—]\s*/, "");
      if (term && rest) addPair(pairs, seen, term, rest);
    });

    doc.querySelectorAll("li").forEach((li) => {
      const strong = li.querySelector("strong, b");
      if (strong) {
        const term = stripTags(strong.innerHTML);
        const clone = li.cloneNode(true);
        clone.querySelectorAll("strong, b").forEach((el) => el.remove());
        let rest = stripTags(clone.innerHTML).replace(/^[:\-–—]\s*/, "");
        if (term && rest) addPair(pairs, seen, term, rest);
        return;
      }
      addLinePair(pairs, seen, stripTags(li.innerHTML));
    });

    doc.querySelectorAll("h2, h3").forEach((heading) => {
      if (!VOCAB_HEADING.test(stripTags(heading.textContent || ""))) return;
      let el = heading.nextElementSibling;
      let steps = 0;
      while (el && steps < 12) {
        if (/^H[23]$/i.test(el.tagName)) break;
        if (/^UL|OL|DL|P|TABLE$/i.test(el.tagName)) {
          if (/^P$/i.test(el.tagName)) {
            const emphasis = el.querySelector("strong, b, em");
            if (emphasis) {
              const term = stripTags(emphasis.innerHTML);
              const clone = el.cloneNode(true);
              clone.querySelectorAll("strong, b, em").forEach((node) => node.remove());
              const rest = stripTags(clone.innerHTML).replace(/^[:\-–—]\s*/, "");
              if (term && rest) addPair(pairs, seen, term, rest);
            } else {
              addLinePair(pairs, seen, stripTags(el.innerHTML || el.textContent || ""));
            }
          } else {
            el.querySelectorAll("li, dt, dd, p").forEach((node) => {
              if (/^DD$/i.test(node.tagName)) return;
              if (node.matches("dt")) {
                const dd = node.nextElementSibling;
                if (dd && dd.tagName === "DD") {
                  addPair(pairs, seen, stripTags(node.innerHTML), stripTags(dd.innerHTML));
                }
                return;
              }
              const emphasis = node.querySelector("strong, b, em");
              if (emphasis) {
                const term = stripTags(emphasis.innerHTML);
                const clone = node.cloneNode(true);
                clone.querySelectorAll("strong, b, em").forEach((item) => item.remove());
                const rest = stripTags(clone.innerHTML).replace(/^[:\-–—]\s*/, "");
                if (term && rest) addPair(pairs, seen, term, rest);
              } else {
                addLinePair(pairs, seen, stripTags(node.innerHTML || node.textContent || ""));
              }
            });
          }
        } else {
          const plain = stripTags(el.innerHTML || el.textContent || "");
          plain.split(/\n+/).forEach((line) => addLinePair(pairs, seen, line));
        }
        el = el.nextElementSibling;
        steps += 1;
      }
    });

    return filterValidTerms(pairs);
  }

  function getCached() {
    const fp = lessonHtmlFingerprint(getLessonHtmlCached());
    const cache = global.__tliveAiQuestionCache;
    if (!cache || cache.fingerprint !== fp || !Array.isArray(cache.vocabTerms)) return null;
    const terms = filterValidTerms(cache.vocabTerms);
    return terms.length >= MIN ? terms : null;
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
    if (typeof global.EAP_ensureActiveLessonSynced === "function") {
      await global.EAP_ensureActiveLessonSynced(undefined, { skipServer: true });
    }
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

    const api = global.EAP_LIVE_TEACHING_API;
    if (!api || typeof api.generateVocab !== "function") {
      return parsed.length >= MIN ? parsed : null;
    }

    if (inflight) return inflight;

    inflight = (async () => {
      try {
        const data = await api.generateVocab({
          html,
          hint_terms: parsed,
          lesson_page_id: getLessonPageId(),
        });
        const terms = normalizeTerms((data && data.terms) || []);
        if (terms.length < MIN) {
          throw new Error(t("tlive_vocab_ai_failed"));
        }
        setCached(terms);
        return terms;
      } catch (_) {
        if (parsed.length >= MIN) {
          setCached(parsed);
          return parsed;
        }
        return null;
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
