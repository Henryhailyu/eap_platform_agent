/**
 * Live Teaching — vocabulary for Vocabulary Bingo & Matching Race from lesson HTML.
 */
(function (global) {
  function t(key) {
    if (typeof global.t === "function") return global.t(key);
    return key;
  }

  const VOCAB_HEADING =
    /vocabulary|key\s+terms?|word\s+list|word\s+bank|language\s+focus|lexical|academic\s+word|terms\s+from|词汇|重点词|keyword|lexis|terminology|new\s+words?/i;
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

  const PLAIN_STOPWORDS = new Set([
    "about", "above", "after", "again", "against", "also", "although", "among", "another",
    "because", "before", "being", "below", "between", "could", "does", "doing", "during",
    "each", "either", "enough", "every", "first", "further", "having", "however", "into",
    "itself", "later", "might", "never", "nothing", "often", "other", "perhaps", "rather",
    "second", "several", "shall", "should", "since", "something", "sometimes", "still",
    "such", "than", "that", "their", "them", "then", "there", "these", "they", "this",
    "those", "though", "through", "under", "until", "very", "were", "what", "when",
    "where", "whether", "which", "while", "would", "your", "lesson", "students", "student",
    "teacher", "class", "classroom", "question", "activity", "section", "segment", "reading",
    "chapter", "title", "english", "language", "university", "academic", "writing", "learning",
    "discussion", "example", "group", "groups", "launch", "option", "options", "button",
    "reveal", "correct", "incorrect", "score", "slide", "slides", "content", "focus", "notes",
    "summary", "objective", "objectives", "material", "materials",
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

  function cleanTermForGame(raw) {
    return stripChinese(String(raw || ""))
      .replace(/\s*\((?:n|v|adj|adv|noun|verb|adjective|adverb)\.?\)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanDefForGame(raw) {
    let d0 = stripChinese(String(raw || "").replace(/\s+/g, " ").trim());
    d0 = d0.replace(/^[:\-–—]\s*/, "");
    if (d0.length >= 6 && d0.length < 10) {
      d0 = `${d0.charAt(0).toUpperCase()}${d0.slice(1)} — from lesson`;
    }
    return d0;
  }

  function addPair(pairs, seen, term, defEn, defZh) {
    const t0 = cleanTermForGame(term);
    const d0 = cleanDefForGame(defEn);
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

  function parseTableRows(doc, pairs, seen) {
    doc.querySelectorAll("table.eap-excel-table tr, table tr").forEach((tr) => {
      const cells = tr.querySelectorAll("th, td");
      if (cells.length < 2) return;
      const left = stripTags(cells[0].innerHTML);
      const right = stripTags(cells[1].innerHTML);
      const head = left.toLowerCase();
      if (/^(term|word|vocabulary|definition|meaning|words|terms)\b/.test(head)) return;
      if (/^(term|word|vocabulary|definition|meaning|words|terms)\b/.test(right.toLowerCase())) return;
      addPair(pairs, seen, left, right);
    });
  }

  function addCommaTermLists(doc, pairs, seen) {
    doc.querySelectorAll("h2, h3").forEach((heading) => {
      if (!VOCAB_HEADING.test(stripTags(heading.textContent || ""))) return;
      let el = heading.nextElementSibling;
      let steps = 0;
      while (el && steps < 10) {
        if (/^H[23]$/i.test(el.tagName)) break;
        const plain = stripTags(el.textContent || "");
        if (/[,;·]/.test(plain)) {
          plain.split(/[,;·]+/).forEach((chunk) => {
            const term = cleanTermForGame(chunk);
            if (!term || term.split(/\s+/).length > 4) return;
            addPair(
              pairs,
              seen,
              term,
              `${term.charAt(0).toUpperCase()}${term.slice(1)} — key vocabulary from this lesson`,
            );
          });
        }
        el = el.nextElementSibling;
        steps += 1;
      }
    });
  }

  function parseVocabSegments(doc, pairs, seen) {
    doc.querySelectorAll("section.eap-segment, section[data-eap-live-segment]").forEach((section) => {
      const heading = section.querySelector(":scope > h2, :scope > h3");
      if (!heading) return;
      const title = stripTags(heading.textContent || "");
      if (!VOCAB_HEADING.test(title) && !/\b(language|lexis|word|terminology|reading)\b/i.test(title)) {
        return;
      }
      section.querySelectorAll("p, li, td").forEach((node) => {
        const emphasis = node.querySelector("strong, b, em");
        if (emphasis) {
          const term = stripTags(emphasis.innerHTML);
          const clone = node.cloneNode(true);
          clone.querySelectorAll("strong, b, em").forEach((el) => el.remove());
          const rest = stripTags(clone.innerHTML).replace(/^[:\-–—]\s*/, "");
          if (term && rest) addPair(pairs, seen, term, rest);
        } else {
          addLinePair(pairs, seen, stripTags(node.textContent || ""));
        }
      });
    });
  }

  function parseInlineKeywordMarks(doc, pairs, seen) {
    doc.querySelectorAll("mark, .key-term, .vocab-term, [data-vocab-term]").forEach((node) => {
      const term = cleanTermForGame(stripTags(node.textContent || ""));
      if (!term) return;
      const parent = node.closest("p, li, td");
      let context = parent ? stripTags(parent.textContent || "") : "";
      context = context.replace(new RegExp(term, "i"), "").replace(/^[:\-–—]\s*/, "").trim();
      const def =
        context.length >= 10
          ? context.slice(0, 140)
          : `${term.charAt(0).toUpperCase()}${term.slice(1)} — key vocabulary from this lesson`;
      addPair(pairs, seen, term, def);
    });
  }

  function parseVocabFromLessonSlots(pairs, seen) {
    const slots = global.__tliveLessonSlots || [];
    slots.forEach((slot) => {
      if (!slot) return;
      const q = String(slot.textEn || slot.label || "");
      const wordMatch =
        q.match(/\bword\s+[''""]([^''""\n]+)[''""]/i) ||
        q.match(/\bterm\s+[''""]([^''""\n]+)[''""]/i);
      if (!wordMatch) return;
      const term = cleanTermForGame(wordMatch[1]);
      const opts = Array.isArray(slot.optionsEn) ? slot.optionsEn : [];
      if (!opts.length) return;
      let idx = Number.isInteger(slot.correctIndex) ? slot.correctIndex : 0;
      if (idx < 0 || idx >= opts.length) idx = 0;
      const def = String(opts[idx] || "")
        .replace(/^[A-Da-d][.)]\s*/, "")
        .trim();
      if (term && def) addPair(pairs, seen, term, def);
    });
  }

  function parseMetaInteractionSlots(doc, pairs, seen) {
    const node = doc.getElementById("eap-lesson-meta");
    if (!node || !node.textContent) return;
    try {
      const data = JSON.parse(node.textContent);
      (data.interaction_slots || []).forEach((slot) => {
        if (!slot || typeof slot !== "object") return;
        const q = String(
          slot.text || slot.textEn || slot.label || slot.question || "",
        );
        const wordMatch =
          q.match(/\bword\s+[''""]([^''""\n]+)[''""]/i) ||
          q.match(/\bterm\s+[''""]([^''""\n]+)[''""]/i);
        if (!wordMatch) return;
        const term = cleanTermForGame(wordMatch[1]);
        const opts = Array.isArray(slot.options)
          ? slot.options
          : Array.isArray(slot.optionsEn)
            ? slot.optionsEn
            : [];
        if (!opts.length) return;
        let idx = Number.isInteger(slot.correctIndex) ? slot.correctIndex : 0;
        if (idx < 0 || idx >= opts.length) idx = 0;
        const def = String(opts[idx] || "")
          .replace(/^[A-Da-d][.)]\s*/, "")
          .trim();
        if (term && def) addPair(pairs, seen, term, def);
      });
    } catch (_) {
      /* ignore malformed meta */
    }
  }

  function mergeTerms(primary, extra) {
    const out = normalizeTerms(primary);
    const seen = new Set(out.map((item) => item.term.toLowerCase()));
    normalizeTerms(extra).forEach((item) => {
      const key = item.term.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  }

  function padTerms(terms, target) {
    const base = normalizeTerms(terms);
    if (!base.length) return [];
    const count = Number.isFinite(target) && target > 0 ? target : TARGET;
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(base[i % base.length]);
    return out;
  }

  function lessonPlainText(html) {
    return String(html || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parsePlainTextLessonVocab(html) {
    const plain = lessonPlainText(html).toLowerCase();
    const freq = new Map();
    plain.match(/\b[a-z]{5,}\b/g)?.forEach((word) => {
      freq.set(word, (freq.get(word) || 0) + 1);
    });
    const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    const pairs = [];
    const seen = new Set();
    ranked.forEach(([word]) => {
      if (seen.has(word) || BLOCKED_TERMS.has(word) || PLAIN_STOPWORDS.has(word)) return;
      const defEn = "Important vocabulary from this lesson";
      if (!isValidGameVocab(word, defEn)) return;
      seen.add(word);
      pairs.push({ term: word, defEn, defZh: defEn });
    });
    return filterValidTerms(pairs);
  }

  function collectTermsFromHtml(html, minRequired) {
    const min = Number.isFinite(minRequired) && minRequired > 0 ? minRequired : MIN;
    let merged = parseVocabFromHtml(html);
    if (merged.length < min) {
      merged = mergeTerms(merged, parsePlainTextLessonVocab(html));
    }
    if (merged.length < min) return null;
    return padTerms(merged, TARGET);
  }

  function termsFromHtml(html, minRequired) {
    return collectTermsFromHtml(html, minRequired);
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
    parseMetaInteractionSlots(doc, pairs, seen);
    parseTableRows(doc, pairs, seen);

    doc.querySelectorAll("dt").forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === "DD") {
        addPair(pairs, seen, stripTags(dt.innerHTML), stripTags(dd.innerHTML));
      }
    });

    doc.querySelectorAll("tr").forEach((tr) => {
      if (tr.closest("table")) return;
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

    parseVocabSegments(doc, pairs, seen);
    addCommaTermLists(doc, pairs, seen);
    parseInlineKeywordMarks(doc, pairs, seen);
    parseVocabFromLessonSlots(pairs, seen);

    return filterValidTerms(pairs);
  }

  function resolveSync(minRequired) {
    const min = Number.isFinite(minRequired) && minRequired > 0 ? minRequired : MIN;
    const cached = getCached();
    if (cached && cached.length >= min) return cached;
    const html = getLessonHtmlCached();
    if (!html || html.length < 80) return null;
    const terms = termsFromHtml(html, min);
    if (terms && terms.length >= min) {
      setCached(terms);
      return terms;
    }
    return null;
  }

  function warmFromHtml(html) {
    const text = String(html || "");
    if (text.length < 80) return null;
    const terms = termsFromHtml(text, MIN);
    if (terms && terms.length >= MIN) {
      setCached(terms);
      return terms;
    }
    return null;
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
    const sync = resolveSync();
    if (sync && sync.length >= MIN) return sync;

    if (typeof global.EAP_refreshActiveLessonHtmlFromServer === "function") {
      const pageId = getLessonPageId();
      const fresh = await global.EAP_refreshActiveLessonHtmlFromServer(pageId, 8000);
      if (fresh) {
        const retry = resolveSync();
        if (retry && retry.length >= MIN) return retry;
      }
    } else if (typeof global.EAP_ensureActiveLessonSynced === "function") {
      await global.EAP_ensureActiveLessonSynced(undefined, { timeoutMs: 8000 });
    }

    const html = getLessonHtmlCached();
    if (!html || html.length < 80) return null;

    const local = collectTermsFromHtml(html, MIN);
    if (local && local.length >= MIN) {
      setCached(local);
      return local;
    }

    const parsed = parseVocabFromHtml(html);
    const api = global.EAP_LIVE_TEACHING_API;
    if (!api || typeof api.generateVocab !== "function") {
      return local;
    }

    if (inflight) return inflight;

    inflight = (async () => {
      try {
        const data = await Promise.race([
          api.generateVocab({
            html,
            hint_terms: parsed,
            lesson_page_id: getLessonPageId(),
          }),
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error("vocab timeout")), 8000);
          }),
        ]);
        const terms = normalizeTerms((data && data.terms) || []);
        if (terms.length < MIN) {
          throw new Error(t("tlive_vocab_ai_failed"));
        }
        const padded = padTerms(terms, TARGET);
        setCached(padded);
        return padded;
      } catch (_) {
        const fallback = collectTermsFromHtml(html, MIN);
        if (fallback && fallback.length >= MIN) {
          setCached(fallback);
          return fallback;
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
    resolveSync,
    warmFromHtml,
    ensure,
    MIN,
    TARGET,
  };
})(typeof window !== "undefined" ? window : globalThis);
