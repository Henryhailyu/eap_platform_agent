/**
 * Teacher Live — Name Wheel (inspired by wheelofnames.com, no external deps).
 */
(function (global) {
  const WHEEL_COLORS = [
    "#0071E3",
    "#0A7EA4",
    "#FF9500",
    "#AF52DE",
    "#34C759",
    "#FF3B30",
    "#5856D6",
    "#FF2D55",
    "#5AC8FA",
    "#A2845E",
  ];

  const DEMO_NAMES = ["student1", "student2", "student3", "student4", "student5"];

  /** Total spin animation duration (seconds). */
  const SPIN_DURATION_S = 8;
  /** Easing: rapid acceleration, long dramatic slowdown at the end. */
  const SPIN_EASING = "cubic-bezier(0.06, 0.92, 0.12, 1)";
  const MIN_EXTRA_TURNS = 10;
  const MAX_EXTRA_TURNS_RANDOM = 8;

  function spinTransitionCss() {
    const reduced =
      typeof global.matchMedia === "function" &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return "transform 1.2s ease-out";
    return `transform ${SPIN_DURATION_S}s ${SPIN_EASING}`;
  }

  function spinDurationMs() {
    const reduced =
      typeof global.matchMedia === "function" &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return reduced ? 1300 : SPIN_DURATION_S * 1000;
  }

  function secureRandomInt(max) {
    if (max <= 0) return 0;
    const buf = new Uint32Array(1);
    global.crypto.getRandomValues(buf);
    return buf[0] % max;
  }

  function parseNames(text) {
    return String(text || "")
      .split(/[\n,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function storageKey(className) {
    return `eap_tlive_wheel_names_${className || "default"}`;
  }

  function loadNames(className) {
    try {
      const raw = localStorage.getItem(storageKey(className));
      if (raw) return parseNames(raw);
    } catch (_) {
      /* ignore */
    }
    return [...DEMO_NAMES];
  }

  function saveNames(className, text) {
    try {
      localStorage.setItem(storageKey(className), text);
    } catch (_) {
      /* ignore */
    }
  }

  function shuffleNames(names) {
    const arr = [...names];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = secureRandomInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function truncateLabel(name, maxLen) {
    if (name.length <= maxLen) return name;
    return `${name.slice(0, maxLen - 1)}…`;
  }

  function buildWheelSvg(names) {
    const n = names.length;
    const size = 500;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;
    if (n === 0) {
      return `<svg class="tlive-wheel-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f5f5f7" stroke="#ccc"/>
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="#6e6e73" font-size="14">—</text>
      </svg>`;
    }

    const slice = (2 * Math.PI) / n;
    let segments = "";
    let labels = "";

    names.forEach((name, i) => {
      const start = i * slice - Math.PI / 2;
      const end = (i + 1) * slice - Math.PI / 2;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const large = slice > Math.PI ? 1 : 0;
      const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
      segments += `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" fill="${color}" stroke="#fff" stroke-width="2"/>`;

      const mid = start + slice / 2;
      const lx = cx + r * 0.62 * Math.cos(mid);
      const ly = cy + r * 0.62 * Math.sin(mid);
      const deg = (mid * 180) / Math.PI + 90;
      const label = truncateLabel(name, n > 12 ? 8 : n > 8 ? 10 : 14);
      labels += `<text x="${lx}" y="${ly}" fill="#fff" font-size="${n > 16 ? 9 : 11}" font-weight="600" text-anchor="middle" dominant-baseline="middle" transform="rotate(${deg}, ${lx}, ${ly})">${escapeAttr(label)}</text>`;
    });

    return `<svg class="tlive-wheel-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Name wheel">
      <g>${segments}${labels}</g>
      <circle cx="${cx}" cy="${cy}" r="28" fill="#fff" stroke="rgba(10,77,104,0.25)" stroke-width="3"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" fill="#0A4D68" font-size="11" font-weight="600">EAP</text>
    </svg>`;
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function rotationForWinner(index, count, currentDeg) {
    const slice = 360 / count;
    const mid = (index + 0.5) * slice;
    const extra =
      typeof global.matchMedia === "function" &&
      global.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 2
        : MIN_EXTRA_TURNS + secureRandomInt(MAX_EXTRA_TURNS_RANDOM);
    const currentNorm = ((currentDeg % 360) + 360) % 360;
    const targetMod = (360 - mid + 360) % 360;
    let add = (targetMod - currentNorm + 360) % 360;
    if (add < 90) add += 360;
    return currentDeg + extra * 360 + add;
  }

  function winnerIndexFromRotation(names, rotationDeg) {
    const n = names.length;
    if (!n) return -1;
    const slice = 360 / n;
    const norm = ((rotationDeg % 360) + 360) % 360;
    let idx = Math.floor(-norm / slice - 0.5);
    idx = ((idx % n) + n) % n;
    return idx;
  }

  function mount(container, options) {
    const { className, t, escapeHtml, onSpinningChange } = options;
    let names = loadNames(className);
    let rotation = 0;
    let spinning = false;
    let removeWinner = false;
    let lastWinner = null;

    function namesText() {
      return names.join("\n");
    }

    function persist() {
      saveNames(className, namesText());
    }

    function draw() {
      const rotor = container.querySelector(".tlive-wheel-rotor");
      if (rotor) {
        rotor.style.transition = spinning ? spinTransitionCss() : "none";
        rotor.style.transform = `rotate(${rotation}deg)`;
      }
      const svgWrap = container.querySelector(".tlive-wheel-svg-inner");
      if (svgWrap) {
        svgWrap.innerHTML = buildWheelSvg(names);
      }
      const countEl = container.querySelector("#tlive-wheel-count");
      if (countEl) countEl.textContent = t("tlive_wheel_count", { n: String(names.length) });
      const spinBtn = container.querySelector("#tlive-wheel-spin");
      if (spinBtn) {
        spinBtn.disabled = spinning || names.length < 2;
        spinBtn.title = names.length < 2 ? t("tlive_wheel_need_two") : "";
      }
      const ta = container.querySelector("#tlive-wheel-names-input");
      if (ta && document.activeElement !== ta) ta.value = namesText();
    }

    function setWinner(name) {
      lastWinner = name;
      const el = container.querySelector("#tlive-wheel-winner");
      if (el) {
        el.textContent = name ? t("tlive_wheel_winner", { name }) : "";
        el.classList.toggle("tlive-wheel-winner--show", !!name);
      }
    }

    function renderShell() {
      container.className = "tlive-canvas__inner tlive-canvas__inner--left";
      container.innerHTML = `
        <div class="tlive-wheel-layout">
          <aside class="tlive-wheel-sidebar">
            <h2 class="tlive-wheel-sidebar__title">${escapeHtml(t("tlive_wheel_names_title"))}</h2>
            <p class="tlive-wheel-sidebar__hint">${escapeHtml(t("tlive_wheel_names_hint"))}</p>
            <label for="tlive-wheel-names-input" class="tlive-wheel-label">${escapeHtml(t("tlive_wheel_paste_label"))}</label>
            <textarea id="tlive-wheel-names-input" class="tlive-wheel-textarea" rows="12" spellcheck="false"></textarea>
            <div class="tlive-wheel-file-row">
              <label class="btn-secondary tlive-wheel-file-btn">
                ${escapeHtml(t("tlive_wheel_upload"))}
                <input type="file" id="tlive-wheel-file" accept=".txt,.csv,text/plain,text/csv" hidden />
              </label>
            </div>
            <p id="tlive-wheel-count" class="tlive-wheel-count"></p>
            <div class="tlive-wheel-sidebar__actions">
              <button type="button" class="btn-secondary" id="tlive-wheel-shuffle">${escapeHtml(t("tlive_wheel_shuffle"))}</button>
              <button type="button" class="btn-secondary" id="tlive-wheel-demo">${escapeHtml(t("tlive_wheel_load_demo"))}</button>
              <button type="button" class="btn-secondary" id="tlive-wheel-clear">${escapeHtml(t("tlive_wheel_clear"))}</button>
            </div>
            <label class="tlive-wheel-check">
              <input type="checkbox" id="tlive-wheel-remove" />
              ${escapeHtml(t("tlive_wheel_remove_winner"))}
            </label>
          </aside>
          <div class="tlive-wheel-stage">
            <h2 class="tlive-wheel-stage__title">${escapeHtml(t("tlive_wheel_title"))}</h2>
            <p class="tlive-wheel-stage__lead">${escapeHtml(t("tlive_wheel_lead"))}</p>
            <div class="tlive-wheel-pointer-wrap">
              <div class="tlive-wheel-pointer" aria-hidden="true"></div>
              <div class="tlive-wheel-rotor">
                <div class="tlive-wheel-svg-inner"></div>
              </div>
            </div>
            <button type="button" class="btn-primary tlive-wheel-spin-btn" id="tlive-wheel-spin">${escapeHtml(t("tlive_wheel_spin"))}</button>
            <p id="tlive-wheel-winner" class="tlive-wheel-winner" role="status" aria-live="polite"></p>
            <p class="tlive-disclaimer">${escapeHtml(t("tlive_wheel_disclaimer"))}</p>
          </div>
        </div>
      `;

      const ta = container.querySelector("#tlive-wheel-names-input");
      ta.value = namesText();

      ta.addEventListener("input", () => {
        names = parseNames(ta.value);
        rotation = 0;
        setWinner(null);
        persist();
        draw();
      });

      ta.addEventListener("blur", persist);

      container.querySelector("#tlive-wheel-file")?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          ta.value = String(reader.result || "");
          names = parseNames(ta.value);
          rotation = 0;
          setWinner(null);
          persist();
          draw();
        };
        reader.readAsText(file);
        e.target.value = "";
      });

      container.querySelector("#tlive-wheel-shuffle")?.addEventListener("click", () => {
        names = shuffleNames(names);
        ta.value = namesText();
        persist();
        draw();
      });

      container.querySelector("#tlive-wheel-demo")?.addEventListener("click", () => {
        names = [...DEMO_NAMES];
        ta.value = namesText();
        persist();
        draw();
      });

      container.querySelector("#tlive-wheel-clear")?.addEventListener("click", () => {
        if (!window.confirm(t("tlive_wheel_clear_confirm"))) return;
        names = [];
        ta.value = "";
        rotation = 0;
        setWinner(null);
        persist();
        draw();
      });

      container.querySelector("#tlive-wheel-remove")?.addEventListener("change", (e) => {
        removeWinner = !!e.target.checked;
      });

      container.querySelector("#tlive-wheel-spin")?.addEventListener("click", () => {
        if (spinning || names.length < 2) return;
        const winIdx = secureRandomInt(names.length);
        const targetRot = rotationForWinner(winIdx, names.length, rotation);
        spinning = true;
        if (onSpinningChange) onSpinningChange(true);
        container.querySelector("#tlive-wheel-spin").disabled = true;
        setWinner(null);
        const rotor = container.querySelector(".tlive-wheel-rotor");
        const svgInner = container.querySelector(".tlive-wheel-svg-inner");
        if (svgInner) svgInner.innerHTML = buildWheelSvg(names);
        let finished = false;
        const onEnd = () => {
          if (finished) return;
          finished = true;
          if (rotor) rotor.removeEventListener("transitionend", onEnd);
          if (spinTimer) global.clearTimeout(spinTimer);
          spinning = false;
          if (onSpinningChange) onSpinningChange(false);
          container.querySelector("#tlive-wheel-spin").disabled = names.length < 2;
          const idx = winnerIndexFromRotation(names, rotation);
          const winner = names[idx >= 0 ? idx : winIdx];
          setWinner(winner);
          if (removeWinner && winner && names.length > 1) {
            names = names.filter((n) => n !== winner);
            ta.value = namesText();
            rotation = rotation % 360;
            persist();
            draw();
          }
        };
        let spinTimer = global.setTimeout(onEnd, spinDurationMs() + 150);
        if (rotor) {
          rotor.style.transition = "none";
          rotor.style.transform = `rotate(${rotation}deg)`;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              rotor.style.transition = spinTransitionCss();
              rotation = targetRot;
              rotor.style.transform = `rotate(${rotation}deg)`;
              rotor.addEventListener("transitionend", (ev) => {
                if (ev.propertyName !== "transform") return;
                onEnd();
              });
            });
          });
        } else {
          rotation = targetRot;
          onEnd();
        }
      });

      draw();
    }

    renderShell();
    return { refresh: draw, getNames: () => [...names] };
  }

  global.EAP_NAME_WHEEL = {
    parseNames,
    loadNames,
    saveNames,
    mount,
    DEMO_NAMES,
  };
})(typeof window !== "undefined" ? window : globalThis);
