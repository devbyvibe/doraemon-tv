// Address of your Cloudflare Worker (worker/drive-relay.js), without a trailing slash.
// Browsers can't stream Drive files directly from another site, so videos go through it.
const RELAY = "https://doraemon-tv.samit-sada.workers.dev";

(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $("stage"), screen = $("screen"), video = $("video"), frame = $("frame");
  const noise = $("noise"), list = $("list"), menu = $("menu");

  const VERSIONS = ["Auto", "HQ", "SUB", "UNCUT", "Normal"];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("dtv." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("dtv." + k, JSON.stringify(v)); } catch {} },
  };

  let episodes = [];
  let idx = store.get("idx", 0);
  let volume = store.get("vol", 7);
  let pref = store.get("pref", "Auto");
  let autoNext = store.get("auto", true);
  let positions = store.get("pos", {});
  let powered = false, sel = 0, usingFrame = false, digits = "", digitTimer;

  if (new URLSearchParams(location.search).has("debug")) document.body.classList.add("debug");

  // ---------- helpers ----------
  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const wrap = (i) => (i + episodes.length) % episodes.length;
  const version = (ep) => ep.versions.find((v) => v.tag === pref) || ep.versions[0];
  const relay = new URLSearchParams(location.search).get("relay") || RELAY;
  const streamUrl = (id) => `${relay}/?id=${encodeURIComponent(id)}`;

  const osdTimers = {};
  function osd(id, html, ms = 2500) {
    const el = $(id);
    if (html !== undefined) el.innerHTML = html;
    el.classList.add("show");
    clearTimeout(osdTimers[id]);
    if (ms) osdTimers[id] = setTimeout(() => el.classList.remove("show"), ms);
  }
  const hide = (id) => { clearTimeout(osdTimers[id]); $(id).classList.remove("show"); };

  // ---------- static (picture + sound) ----------
  const nctx = noise.getContext("2d");
  const img = nctx.createImageData(noise.width, noise.height);
  let noiseRaf = 0;
  function drawNoise() {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    nctx.putImageData(img, 0, 0);
    noiseRaf = requestAnimationFrame(drawNoise);
  }
  let audio;
  function hiss(ms) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const len = Math.floor(audio.sampleRate * ms / 1000);
      const buf = audio.createBuffer(1, len, audio.sampleRate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audio.createBufferSource(), gain = audio.createGain();
      gain.gain.value = 0.05 * (volume / 10);
      src.buffer = buf; src.connect(gain).connect(audio.destination); src.start();
    } catch {}
  }
  function staticOn() {
    screen.classList.add("static");
    if (!noiseRaf) drawNoise();
  }
  function staticOff() {
    screen.classList.remove("static");
    cancelAnimationFrame(noiseRaf); noiseRaf = 0;
  }

  // ---------- playback ----------
  function savePos() {
    const ep = episodes[idx];
    if (!ep || usingFrame || !video.duration) return;
    const id = version(ep).id;
    positions[id] = video.currentTime > video.duration - 30 ? -1 : Math.floor(video.currentTime);
    store.set("pos", positions);
  }

  function showInfo() {
    const ep = episodes[idx];
    osd("osdCh", `CH ${String(idx + 1).padStart(3, "0")}`, 3500);
    osd("osdTitle", `<small>${ep.code}${ep.versions.length > 1 ? " · " + version(ep).tag : ""}</small>${ep.title}`, 3500);
  }

  function tune(i) {
    if (!episodes.length) return;
    savePos();
    idx = wrap(i);
    store.set("idx", idx);
    const ep = episodes[idx], v = version(ep);

    usingFrame = false;
    frame.hidden = true; frame.removeAttribute("src");
    video.hidden = false;
    staticOn(); hiss(450);
    hide("osdMsg");

    video.src = streamUrl(v.id);
    const saved = positions[v.id];
    video.addEventListener("loadedmetadata", function seekOnce() {
      if (saved > 10) video.currentTime = saved;
    }, { once: true });
    video.volume = volume / 10;
    const started = performance.now();
    video.play().catch((e) => {
      // The browser blocked autoplay with sound; a tap on the screen will start it.
      if (e.name === "NotAllowedError") { staticOff(); osd("osdMsg", "▶ टैप करें", 0); }
    });
    video.addEventListener("playing", function off() {
      // keep the static on screen a moment even when the video starts instantly
      setTimeout(staticOff, Math.max(0, 450 - (performance.now() - started)));
    }, { once: true });
    showInfo();
    renderList();
  }

  // Drive sometimes refuses direct streaming (e.g. too many views); fall back to its own player.
  video.addEventListener("error", () => {
    if (!powered || !video.getAttribute("src")) return;
    const ep = episodes[idx];
    usingFrame = true;
    video.hidden = true; video.removeAttribute("src"); video.load();
    frame.src = `https://drive.google.com/file/d/${version(ep).id}/preview`;
    frame.hidden = false;
    staticOff();
    osd("osdMsg", "DRIVE PLAYER", 2500);
  });
  video.addEventListener("waiting", () => powered && osd("osdMsg", "ट्यूनिंग…", 0));
  video.addEventListener("playing", () => hide("osdMsg"));
  video.addEventListener("ended", () => {
    positions[version(episodes[idx]).id] = -1; store.set("pos", positions);
    if (autoNext) tune(idx + 1);
  });
  video.addEventListener("timeupdate", () => {
    if (!video.duration) return;
    $("seekFill").style.width = (video.currentTime / video.duration * 100) + "%";
    $("seekTime").textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
  });
  setInterval(() => powered && !video.paused && savePos(), 5000);
  window.addEventListener("pagehide", savePos);

  // ---------- power ----------
  function power() {
    if (!episodes.length) return;
    powered = !powered;
    $("led").classList.toggle("on", powered);
    $("hint").hidden = true;
    screen.classList.remove("powering-on", "powering-off");
    void screen.offsetWidth;
    if (powered) {
      screen.classList.remove("off");
      screen.classList.add("powering-on");
      tune(idx);
    } else {
      savePos();
      video.pause(); frame.removeAttribute("src");
      closeMenu(); staticOff();
      ["osdCh", "osdTitle", "osdMsg", "osdVol", "osdSeek"].forEach(hide);
      screen.classList.add("powering-off");
      setTimeout(() => !powered && screen.classList.add("off"), 550);
    }
  }

  function setVolume(v) {
    volume = Math.min(10, Math.max(0, v));
    video.volume = volume / 10;
    store.set("vol", volume);
    osd("osdVol", `VOL <i style="flex:none;width:${volume * 6}%"></i><span style="margin-left:auto">${volume}</span>`);
  }

  function togglePause() {
    if (usingFrame) return;
    if (video.paused) { video.play().catch(() => {}); osd("osdMsg", "▶ PLAY", 1200); }
    else { video.pause(); osd("osdMsg", "❚❚ PAUSE", 0); }
  }

  function seekBy(s) {
    if (usingFrame || !video.duration) return;
    video.currentTime = Math.min(video.duration - 1, Math.max(0, video.currentTime + s));
    osd("osdSeek", undefined, 2500);
  }

  function fullscreen() {
    const doc = document;
    if (doc.fullscreenElement || doc.webkitFullscreenElement) {
      (doc.exitFullscreen || doc.webkitExitFullscreen).call(doc);
      return;
    }
    if (!powered) power();
    if (screen.requestFullscreen) {
      screen.requestFullscreen().catch(() => {});
    } else if (screen.webkitRequestFullscreen) {
      screen.webkitRequestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen(); // iPhone only allows the video itself to go full screen
    }
  }

  // ---------- lights ----------
  let lightsOff = store.get("lightsOff", false);
  function setLights(off) {
    lightsOff = off;
    document.body.classList.toggle("lights-off", off);
    $("btnLights").setAttribute("aria-pressed", off);
    $("lightsLabel").textContent = off ? "लाइट चालू" : "लाइट बंद";
    store.set("lightsOff", off);
  }
  setLights(lightsOff);

  // Tint the light spilling into the dark room with the picture's average colour.
  const amb = document.createElement("canvas");
  amb.width = amb.height = 4;
  const actx = amb.getContext("2d", { willReadFrequently: true });
  setInterval(() => {
    if (!lightsOff || !powered || usingFrame || video.paused || video.readyState < 2) return;
    try {
      actx.drawImage(video, 0, 0, 4, 4);
      const d = actx.getImageData(0, 0, 4, 4).data;
      let r = 0, g = 0, b = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
      const n = d.length / 4, lift = (c) => Math.min(255, Math.round(c / n * 1.1 + 15));
      stage.style.setProperty("--amb", `rgb(${lift(r)}, ${lift(g)}, ${lift(b)})`);
    } catch { /* picture not readable (no CORS); keep the default blue */ }
  }, 400);

  // ---------- menu ----------
  function renderList() {
    if (menu.hidden) return;
    list.innerHTML = episodes.map((ep, i) => {
      const p = positions[version(ep).id];
      const w = p === -1 ? "✓" : p > 10 ? fmt(p) : "";
      return `<li data-i="${i}" class="${i === sel ? "sel" : ""} ${i === idx && powered ? "now" : ""}">` +
        `<span class="c">${ep.code}</span><span class="t">${ep.title}</span><span class="w">${w}</span></li>`;
    }).join("");
    list.children[sel]?.scrollIntoView({ block: "nearest" });
  }
  function labelButtons() {
    $("verBtn").textContent = `VER: ${pref}`;
    $("autoBtn").textContent = `AUTO-NEXT: ${autoNext ? "ON" : "OFF"}`;
  }
  function openMenu() {
    if (!powered) { power(); }
    menu.hidden = false;
    sel = idx;
    labelButtons();
    renderList();
    list.children[sel]?.scrollIntoView({ block: "center" });
  }
  function closeMenu() { menu.hidden = true; }
  const toggleMenu = () => (menu.hidden ? openMenu() : closeMenu());

  list.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    closeMenu(); tune(+li.dataset.i);
  });
  menu.addEventListener("click", (e) => e.stopPropagation());
  $("closeMenu").onclick = closeMenu;
  $("verBtn").onclick = () => {
    pref = VERSIONS[(VERSIONS.indexOf(pref) + 1) % VERSIONS.length];
    store.set("pref", pref); labelButtons(); renderList();
  };
  $("autoBtn").onclick = () => { autoNext = !autoNext; store.set("auto", autoNext); labelButtons(); };

  // Typing an episode number like a remote: 4, 1, 5 -> E415.
  function digit(d) {
    digits = (digits + d).slice(-3);
    osd("osdCh", `CH ${digits.padEnd(3, "-")}`, 1800);
    clearTimeout(digitTimer);
    digitTimer = setTimeout(() => {
      const n = +digits; digits = "";
      let i = episodes.findIndex((ep) => ep.code === `E${n}·1` || ep.code === `E${n}`);
      if (i < 0 && n >= 1 && n <= episodes.length) i = n - 1;
      if (i >= 0) { closeMenu(); tune(i); } else osd("osdMsg", "NO SIGNAL", 1500);
    }, digits.length === 3 ? 400 : 1500);
  }

  // ---------- inputs ----------
  const guard = (fn) => () => { if (!powered) return power(); fn(); };
  $("btnPower").onclick = power;
  $("btnChUp").onclick = guard(() => tune(idx + 1));
  $("btnChDown").onclick = guard(() => tune(idx - 1));
  $("btnVolUp").onclick = guard(() => setVolume(volume + 1));
  $("btnVolDown").onclick = guard(() => setVolume(volume - 1));
  $("btnMenu").onclick = toggleMenu;
  $("btnCabinet").onclick = openMenu;
  $("btnPoster").onclick = guard(() => tune(Math.floor(Math.random() * episodes.length)));
  $("btnLamp").onclick = $("btnLights").onclick = () => setLights(!lightsOff);
  $("btnFull").onclick = fullscreen;

  let clickTimer;
  screen.addEventListener("click", (e) => {
    if (!powered) return power();
    if (e.target.closest(".seek")) return;
    clearTimeout(clickTimer);
    clickTimer = setTimeout(togglePause, 250); // wait to see if it is a double click
  });
  screen.addEventListener("dblclick", () => { clearTimeout(clickTimer); if (powered) fullscreen(); });
  screen.addEventListener("pointermove", () => powered && !usingFrame && menu.hidden && osd("osdSeek", undefined, 2500));
  $("osdSeek").addEventListener("click", (e) => {
    const r = e.currentTarget.querySelector(".bar").getBoundingClientRect();
    if (video.duration) video.currentTime = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * video.duration;
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === "p" || k === "P") return power();
    if (k === "d" || k === "D") return setLights(!lightsOff);
    if (!powered) { if (k === " " || k === "Enter") { e.preventDefault(); power(); } return; }
    if (!menu.hidden) {
      if (k === "ArrowDown" || k === "ArrowUp") {
        e.preventDefault();
        sel = Math.min(episodes.length - 1, Math.max(0, sel + (k === "ArrowDown" ? 1 : -1)));
        [...list.children].forEach((li, i) => li.classList.toggle("sel", i === sel));
        list.children[sel].scrollIntoView({ block: "nearest" });
        return;
      }
      if (k === "Enter") { e.preventDefault(); closeMenu(); return tune(sel); }
      if (k === "Escape" || k === "m" || k === "M") return closeMenu();
    }
    if (/^[0-9]$/.test(k)) return digit(k);
    const map = {
      ArrowRight: () => tune(idx + 1), ArrowLeft: () => tune(idx - 1),
      ArrowUp: () => setVolume(volume + 1), ArrowDown: () => setVolume(volume - 1),
      " ": togglePause, k: togglePause, j: () => seekBy(-10), l: () => seekBy(10),
      m: toggleMenu, M: toggleMenu, f: fullscreen, F: fullscreen,
      d: () => setLights(!lightsOff), D: () => setLights(!lightsOff),
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  });

  // ---------- start ----------
  fetch("episodes.json")
    .then((r) => r.json())
    .then((data) => { episodes = data; idx = Math.min(idx, episodes.length - 1); })
    .catch(() => { $("hint").textContent = "episodes.json नहीं मिला"; });
})();
