/* Promo reel renderer: everything on one 1080×1920 canvas, computed from the time t (seconds).
 * renderFrame(t) is deterministic, so frames can be rendered in any order. */
const W = 1080, H = 1920;
const cv = document.getElementById("c");
const g = cv.getContext("2d");
const ASSETS = "../assets/";
const CY = "#22d3ee", GR = "#3ee58e";

/* ───────── math ───────── */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const lerp = (a, b, k) => a + (b - a) * k;
const eOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const eOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const eInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const eIn = (x) => x * x * x;
const eOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const inside = (t, a, b) => t >= a && t < b;

/* ───────── assets ───────── */
const IMG = {}, SEQ = {};
const loadImg = (k, src) => new Promise((r) => { const im = new Image(); im.onload = () => { IMG[k] = im; r(); }; im.onerror = () => r(); im.src = src; });
async function loadSeq(name, dir, n, ext = "png") {
  SEQ[name] = [];
  await Promise.all([...Array(n)].map((_, i) => new Promise((r) => { const im = new Image(); im.onload = () => { SEQ[name][i] = im; r(); }; im.onerror = () => r(); im.src = `${dir}/${String(i).padStart(3, "0")}.${ext}`; })));
  SEQ[name] = SEQ[name].filter(Boolean);
}
let LOGO_PTS = [];
window.ready = (async () => {
  const shots = ["home", "featured", "featured2", "listing", "listing2", "home-launcher", "hella-greet", "hella-results", "hella-manglish", "nri-account", "nri-clocks", "nri-aed", "portal", "vault", "admin", "admin2", "map-flat", "badge-hi"];
  await Promise.all([
    ...shots.map((s) => loadImg(s, `${ASSETS}${s}.png`)),
    loadImg("logo", "img/logo.png"), loadImg("backwater", "img/hero-backwater.jpg"),
    loadSeq("homescroll", `${ASSETS}homescroll`, 24), loadSeq("type", `${ASSETS}hella-type`, 31), loadSeq("map3d", `${ASSETS}map3d`, 60),
    loadSeq("flowA", `${ASSETS}flowA`, 240, "jpg"), loadSeq("flowB", `${ASSETS}flowB`, 240, "jpg"), loadSeq("flowC", `${ASSETS}flowC`, 240, "jpg"),
    fetch("img/logo-points.json").then((r) => r.json()).then((p) => (LOGO_PTS = p)),
    document.fonts.load("700 80px Sora"), document.fonts.load("600 80px Sora"), document.fonts.load("500 40px Inter"),
  ]);
  makeGrain();
  return true;
})();

/* ───────── drawing helpers ───────── */
function rr(x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

/** Draw an image to cover the frame. (fx, fy) is the point of the image placed at (x, y). */
function cover(im, { x = W / 2, y = H / 2, s = 1, r = 0, a = 1, blur = 0, fx = 0.5, fy = 0.5, comp } = {}) {
  if (!im || a <= 0) return;
  const k = Math.max(W / im.width, H / im.height) * s;
  g.save(); g.globalAlpha = a; if (blur) g.filter = `blur(${blur}px)`; if (comp) g.globalCompositeOperation = comp;
  g.translate(x, y); g.rotate(r);
  g.drawImage(im, -im.width * k * fx, -im.height * k * fy, im.width * k, im.height * k);
  g.restore();
}

/** A phone: rim-lit bezel, screen (an image or a draw callback in 1080×1920 screen space), glass glare. */
function phone(screen, { x = W / 2, y = H / 2, s = 0.62, r = 0, a = 1, glow = 1 } = {}) {
  if (a <= 0) return;
  const w = 1080 * s, h = 1920 * s, rad = 120 * s, b = 20 * s;
  g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(r);
  g.shadowColor = `rgba(34,211,238,${0.45 * glow})`; g.shadowBlur = 140 * s;
  rr(-w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, rad + b); g.fillStyle = "#04070d"; g.fill();
  g.shadowBlur = 0;
  const lg = g.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  lg.addColorStop(0, "rgba(140,245,255,0.95)"); lg.addColorStop(0.45, "rgba(40,70,110,0.5)"); lg.addColorStop(1, "rgba(62,229,142,0.85)");
  g.lineWidth = 2 + 3 * s; g.strokeStyle = lg; rr(-w / 2 - b, -h / 2 - b, w + 2 * b, h + 2 * b, rad + b); g.stroke();
  g.save(); rr(-w / 2, -h / 2, w, h, rad); g.clip();
  g.translate(-w / 2, -h / 2); g.scale(s, s);
  if (typeof screen === "function") screen(); else if (screen) g.drawImage(screen, 0, 0, 1080, 1920);
  g.restore();
  const gl = g.createLinearGradient(-w / 2, -h / 2, w / 4, h / 3);
  gl.addColorStop(0, "rgba(255,255,255,0.13)"); gl.addColorStop(0.4, "rgba(255,255,255,0)");
  g.save(); rr(-w / 2, -h / 2, w, h, rad); g.clip(); g.fillStyle = gl; g.fillRect(-w / 2, -h / 2, w, h); g.restore();
  g.fillStyle = "#000"; rr(-80 * s, -h / 2 + 26 * s, 160 * s, 44 * s, 22 * s); g.fill();
  g.restore();
}

/** Screen-space image draw (inside phone callbacks or full frame). */
function shot(im, { a = 1, dy = 0, clipTop = 0 } = {}) {
  if (!im || a <= 0) return;
  g.save(); g.globalAlpha *= a;
  if (clipTop) { g.beginPath(); g.rect(0, clipTop + dy, 1080, 1920); g.clip(); }
  g.drawImage(im, 0, dy, 1080, 1920); g.restore();
}

const DUST = (() => { const r = rng(7); return [...Array(160)].map(() => ({ x: r() * W, y: r() * H, z: 0.3 + r() * 0.7, v: 10 + r() * 40, p: r() * 6.28 })); })();
function space(t, { a = 1, grid = 1, glowY = 0.45, hue = "20,80,140" } = {}) {
  g.fillStyle = "#02040a"; g.fillRect(0, 0, W, H);
  const rg = g.createRadialGradient(W / 2, H * glowY, 0, W / 2, H * glowY, H * 0.75);
  rg.addColorStop(0, `rgba(${hue},${0.55 * a})`); rg.addColorStop(0.5, `rgba(${hue},${0.12 * a})`); rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  if (grid) gridFloor(t, grid * a);
  dust(t, a);
}
function gridFloor(t, a = 1) {
  const hy = H * 0.66;
  g.save(); g.strokeStyle = "rgba(34,211,238,0.5)"; g.lineWidth = 1.6;
  for (let i = -14; i <= 14; i++) { g.globalAlpha = 0.35 * a; g.beginPath(); g.moveTo(W / 2 + i * 34, hy); g.lineTo(W / 2 + i * 380, H + 300); g.stroke(); }
  const off = (t * 0.5) % 1;
  for (let j = 0; j < 16; j++) { const z = (j + off) / 16; const y = hy + Math.pow(z, 2.3) * (H - hy + 300); g.globalAlpha = 0.45 * a * z; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const fg = g.createLinearGradient(0, hy - 10, 0, hy + 240); fg.addColorStop(0, "rgba(2,4,10,1)"); fg.addColorStop(1, "rgba(2,4,10,0)");
  g.globalAlpha = 1; g.fillStyle = fg; g.fillRect(0, hy - 10, W, 250);
  g.restore();
}
function dust(t, a = 1) {
  g.save(); g.globalCompositeOperation = "lighter";
  for (const d of DUST) {
    const y = (((d.y - t * d.v * d.z) % H) + H) % H; const x = d.x + Math.sin(t * 0.6 + d.p) * 12;
    g.globalAlpha = a * 0.55 * d.z * (0.6 + 0.4 * Math.sin(t * 2 + d.p));
    g.fillStyle = d.z > 0.8 ? CY : "#9fdcff"; g.beginPath(); g.arc(x, y, 1.2 + d.z * 1.6, 0, 6.28); g.fill();
  }
  g.restore();
}

function flash(t, at, dur = 0.25, peak = 0.9, color = "200,250,255") {
  const k = t < at ? prog(t, at - dur * 0.35, at) : 1 - prog(t, at, at + dur);
  if (k <= 0) return;
  g.save(); g.globalCompositeOperation = "lighter"; g.fillStyle = `rgba(${color},${peak * k})`; g.fillRect(0, 0, W, H); g.restore();
}
function fade(a, color = "0,0,0") { if (a <= 0) return; g.fillStyle = `rgba(${color},${a})`; g.fillRect(0, 0, W, H); }

/** A diagonal band of light sweeping across a rectangle. */
function sweep(k, x, y, w, h, alpha = 0.6) {
  if (k <= 0 || k >= 1) return;
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.globalCompositeOperation = "lighter";
  const cx = x - w * 0.6 + k * w * 2.2;
  const lg = g.createLinearGradient(cx - 160, y, cx + 160, y + h * 0.2);
  lg.addColorStop(0, "rgba(255,255,255,0)"); lg.addColorStop(0.5, `rgba(210,250,255,${alpha})`); lg.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = lg; g.fillRect(x, y, w, h); g.restore();
}

/** Horizontal whip: smeared copies of what was just drawn. */
function whip(k, dir = 1) {
  if (k <= 0) return;
  const tmp = whip.c || (whip.c = Object.assign(document.createElement("canvas"), { width: W, height: H }));
  const tg = tmp.getContext("2d"); tg.clearRect(0, 0, W, H); tg.drawImage(cv, 0, 0);
  g.save(); for (let i = 1; i <= 6; i++) { g.globalAlpha = 0.22 * k; g.drawImage(tmp, dir * i * 26 * k, 0); } g.restore();
}

/** Digital glitch: shifted slices and colour bars. */
function glitch(t, k, seed) {
  if (k <= 0) return;
  const r = rng(seed + Math.floor(t * 30));
  const tmp = glitch.c || (glitch.c = Object.assign(document.createElement("canvas"), { width: W, height: H }));
  const tg = tmp.getContext("2d"); tg.clearRect(0, 0, W, H); tg.drawImage(cv, 0, 0);
  for (let i = 0; i < 9; i++) {
    const y = r() * H, h = 20 + r() * 140, dx = (r() - 0.5) * 160 * k;
    g.drawImage(tmp, 0, y, W, h, dx, y, W, h);
  }
  g.save(); g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) { g.fillStyle = r() > 0.5 ? `rgba(34,211,238,${0.35 * k})` : `rgba(255,60,160,${0.25 * k})`; g.fillRect(0, r() * H, W, 4 + r() * 18); }
  g.restore();
}

let GRAIN;
function makeGrain() {
  GRAIN = Object.assign(document.createElement("canvas"), { width: 256, height: 256 });
  const gx = GRAIN.getContext("2d"), d = gx.createImageData(256, 256), r = rng(3);
  for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (r() - 0.5) * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  gx.putImageData(d, 0, 0);
}
function finish(t) {
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
  vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  const r = rng(Math.floor(t * 30) + 11);
  g.save(); g.globalAlpha = 0.05; g.globalCompositeOperation = "overlay";
  g.fillStyle = g.createPattern(GRAIN, "repeat"); g.translate(-r() * 256, -r() * 256); g.fillRect(0, 0, W + 256, H + 256); g.restore();
}

/* ───────── captions ───────── */
function captions(t) {
  for (const c of CAPTIONS) {
    if (t < c.t0 - 0.02 || t > c.t1 + 0.2) continue;
    const soft = !!c.soft, fs = soft ? 52 : 76, lh = fs * 1.16, maxW = 920, words = c.text.split(" ");
    g.save(); g.font = `${soft ? 500 : 700} ${fs}px Sora`; g.textBaseline = "alphabetic";
    const lines = [[]]; let lw = 0; const sp = g.measureText(" ").width;
    for (const w of words) { const ww = g.measureText(w).width; if (lw + ww > maxW && lines.at(-1).length) { lines.push([]); lw = 0; } lines.at(-1).push(w); lw += ww + sp; }
    const baseY = c.y ?? (soft ? 1430 : 1270 - (lines.length - 1) * lh * 0.5);
    const stagger = Math.min(0.085, ((c.t1 - c.t0) * 0.55) / words.length);
    const out = 1 - prog(t, c.t1, c.t1 + 0.18);
    if (!soft) {
      // Frosted-glass pill: blur what's behind the words, then tint it.
      const widest = Math.max(...lines.map((ln) => ln.reduce((s, w) => s + g.measureText(w).width, 0) + sp * (ln.length - 1)));
      const pa = eOutCubic(prog(t, c.t0 - 0.02, c.t0 + 0.18)) * out, pw = (widest + 84) * (0.92 + 0.08 * pa), ph = lines.length * lh + 44;
      const px = W / 2 - pw / 2, py = baseY - fs * 0.95 - 10;
      if (pa > 0) {
        g.save(); g.globalAlpha = pa; rr(px, py, pw, ph, 36); g.clip();
        g.filter = "blur(22px)"; g.drawImage(cv, 0, 0); g.filter = "none";
        g.fillStyle = "rgba(3,10,20,0.62)"; g.fillRect(px, py, pw, ph);
        g.restore();
        g.save(); g.globalAlpha = pa; rr(px, py, pw, ph, 36); g.strokeStyle = "rgba(124,243,255,0.35)"; g.lineWidth = 2; g.stroke(); g.restore();
      }
    }
    let wi = 0;
    lines.forEach((ln, li) => {
      const total = ln.reduce((s, w) => s + g.measureText(w).width, 0) + sp * (ln.length - 1);
      let x = W / 2 - total / 2; const y = baseY + li * lh;
      for (const w of ln) {
        const ww = g.measureText(w).width, k = eOutBack(prog(t, c.t0 + wi * stagger, c.t0 + wi * stagger + 0.24)), hi = c.hi?.includes(w);
        const a = clamp(prog(t, c.t0 + wi * stagger, c.t0 + wi * stagger + 0.12)) * out;
        if (a > 0) {
          g.save(); g.globalAlpha = a * (soft ? 0.92 : 1);
          g.translate(x + ww / 2, y - fs * 0.35 + (1 - k) * 34); g.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
          if (hi) {
            const lg = g.createLinearGradient(-ww / 2, 0, ww / 2, 0); lg.addColorStop(0, "#7cf3ff"); lg.addColorStop(1, GR);
            g.shadowColor = "rgba(34,211,238,0.9)"; g.shadowBlur = 30; g.fillStyle = lg;
          } else { g.shadowColor = "rgba(0,0,0,0.85)"; g.shadowBlur = 22; g.fillStyle = soft ? "rgba(225,245,255,0.95)" : "#fff"; }
          g.fillText(w, -ww / 2, fs * 0.35);
          g.restore();
        }
        x += ww + sp; wi++;
      }
    });
    g.restore();
  }
}

/* ───────── scenes ───────── */
const flowFrame = (name, t, start, offset = 0) => { const s = SEQ[name]; if (!s?.length) return null; return s[Math.min(s.length - 1, Math.max(0, Math.floor((t - start + offset) * 30)))]; };

// S1 0.0–2.7: hook. Flow clip A, or the backwaters photo with a light grid sweeping the water.
function s1(t) {
  const fa = flowFrame("flowA", t, 0, 0.5);
  if (fa) cover(fa, { s: lerp(1.04, 1.12, t / 2.7) });
  else {
    cover(IMG.backwater, { s: lerp(1.22, 1.38, eOutCubic(t / 2.7)), fx: 0.6, fy: 0.55 });
    g.save(); g.globalCompositeOperation = "multiply"; g.fillStyle = "rgba(20,60,110,0.75)"; g.fillRect(0, 0, W, H); g.restore();
    const k = prog(t, 0.7, 2.4), hy = H * 0.5;
    g.save(); g.globalCompositeOperation = "lighter"; g.lineWidth = 2.2; g.shadowColor = CY; g.shadowBlur = 18;
    for (let i = -10; i <= 10; i++) { const p = clamp(k * 1.6 - Math.abs(i) * 0.05); if (p <= 0) continue; g.strokeStyle = `rgba(34,211,238,${0.55 * p * (1 - prog(t, 2.2, 2.7))})`; g.beginPath(); g.moveTo(W / 2 + i * 30, hy); g.lineTo(W / 2 + i * 30 + (i * 360) * p, hy + (H - hy + 200) * p); g.stroke(); }
    for (let j = 0; j < 10; j++) { const z = (j + (t * 0.7) % 1) / 10, y = hy + Math.pow(z, 2.2) * (H - hy); const p = clamp(k * 1.4 - (1 - z) * 0.4); if (p <= 0) continue; g.strokeStyle = `rgba(34,211,238,${0.5 * p * z})`; g.beginPath(); g.moveTo(W / 2 - W * p, y); g.lineTo(W / 2 + W * p, y); g.stroke(); }
    g.restore();
  }
  const lg = g.createLinearGradient(0, H * 0.45, 0, H); lg.addColorStop(0, "rgba(2,4,10,0)"); lg.addColorStop(1, "rgba(2,4,10,0.85)");
  g.fillStyle = lg; g.fillRect(0, 0, W, H);
  fade(1 - prog(t, 0, 0.5));
}

// S2 2.7–6.0: fast cuts through the app, slow-mo on the verified badge.
function s2(t) {
  const beat = 0.47, c0 = 2.7;
  if (t < c0 + beat) { const k = prog(t, c0, c0 + beat); cover(IMG.home, { s: lerp(1.12, 1.02, eOutExpo(k)) }); whip(1 - prog(t, c0, c0 + 0.12), -1); }
  else if (t < c0 + 2 * beat) {
    const k = prog(t, c0 + beat, c0 + 2 * beat);
    space(t, { a: 0.9 });
    const f = SEQ.homescroll[Math.min(23, Math.floor(eInOut(k) * 24))];
    phone(f, { s: 0.66, y: H / 2 - 30, r: lerp(-0.12, -0.05, eOutExpo(k)), x: lerp(620, 540, eOutExpo(k)) });
  } else if (t < c0 + 3 * beat) { const k = prog(t, c0 + 2 * beat, c0 + 3 * beat); cover(IMG.featured, { s: lerp(1.0, 1.07, k), r: lerp(0.02, 0, eOutExpo(k)) }); whip(1 - prog(t, c0 + 2 * beat, c0 + 2 * beat + 0.12), 1); }
  else if (t < c0 + 4 * beat) { const k = prog(t, c0 + 3 * beat, c0 + 4 * beat); cover(IMG.listing, { s: lerp(1.0, 1.12, eOutCubic(k)), fx: 0.5, fy: 0.25, y: H * 0.25 }); }
  else {
    // Slow-mo: the K-RERA verified badge, sharp and glowing.
    const k = prog(t, c0 + 4 * beat, 6.0);
    cover(IMG.listing, { s: lerp(1.25, 1.35, k), fx: 0.25, fy: 0.18, x: W * 0.3, y: H * 0.3, blur: 14, a: 0.9 });
    fade(0.45, "2,4,10");
    const b = IMG["badge-hi"]; if (b) {
      const bw = lerp(860, 940, eOutCubic(k)), bh = (bw * b.height) / b.width, bx = W / 2 - bw / 2, by = 520 - bh / 2;
      g.save(); g.globalAlpha = eOutExpo(prog(t, c0 + 4 * beat, c0 + 4 * beat + 0.25));
      g.shadowColor = "rgba(62,229,142,0.6)"; g.shadowBlur = 90; rr(bx, by, bw, bh, 60); g.fillStyle = "rgba(0,0,0,0.01)"; g.fill(); g.shadowBlur = 0;
      g.save(); rr(bx, by, bw, bh, 60); g.clip(); g.drawImage(b, bx, by, bw, bh); g.restore();
      sweep(prog(t, 4.9, 5.7), bx, by, bw, bh, 0.55);
      g.restore();
      sparkles(t, W / 2, 520, bw * 0.55, 4.6);
    }
  }
}
function sparkles(t, cx, cy, rad, t0) {
  const r = rng(21); g.save(); g.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const a0 = r() * 6.28, d = rad * (0.6 + r() * 0.7), life = 0.6 + r() * 0.6, st = t0 + r() * 1.0, k = prog(t, st, st + life);
    if (k <= 0 || k >= 1) continue;
    const x = cx + Math.cos(a0) * d * (0.8 + 0.3 * k), y = cy + Math.sin(a0) * d * 0.35 * (0.8 + 0.3 * k), s = 3 + 8 * Math.sin(k * Math.PI);
    g.globalAlpha = Math.sin(k * Math.PI); g.fillStyle = i % 3 ? CY : GR;
    g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * 0.4, y); g.lineTo(x, y + s * 2); g.lineTo(x - s * 0.4, y); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - s * 2, y); g.lineTo(x, y + s * 0.4); g.lineTo(x + s * 2, y); g.lineTo(x, y - s * 0.4); g.closePath(); g.fill();
  }
  g.restore();
}

// S3 6.0–10.0: the 3D map. Fast orbit, then slow-mo as the flood layer turns on; dims for the gift.
function s3(t) {
  const fast = prog(t, 6.0, 7.0), slow = prog(t, 7.0, 9.7);
  const idx = t < 7.0 ? eInOut(fast) * 29 : 29 + eOutCubic(slow) * 30;
  const f = SEQ.map3d[Math.min(59, Math.round(idx))];
  const intro = eOutExpo(prog(t, 6.0, 6.6));
  if (intro < 1) {
    space(t);
    phone(f, { s: lerp(0.55, 1.0, intro), r: lerp(0.08, 0, intro), y: lerp(H / 2 + 120, H / 2, intro), glow: 1 - intro });
  } else cover(f, { s: lerp(1.0, 1.1, prog(t, 6.6, 10)) });
  // HUD: corner brackets and a live chip.
  const ha = prog(t, 6.6, 7.0) * (1 - prog(t, 9.4, 9.8));
  if (ha > 0) {
    g.save(); g.globalAlpha = ha; g.strokeStyle = CY; g.lineWidth = 4; g.shadowColor = CY; g.shadowBlur = 16;
    for (const [x, y, dx, dy] of [[60, 260, 1, 1], [W - 60, 260, -1, 1], [60, H - 420, 1, -1], [W - 60, H - 420, -1, -1]]) { g.beginPath(); g.moveTo(x, y + dy * 70); g.lineTo(x, y); g.lineTo(x + dx * 70, y); g.stroke(); }
    g.shadowBlur = 0; g.fillStyle = "rgba(2,10,20,0.6)"; rr(W / 2 - 120, 280, 240, 60, 30); g.fill(); g.strokeStyle = "rgba(34,211,238,0.6)"; g.lineWidth = 2; g.stroke();
    g.fillStyle = GR; g.beginPath(); g.arc(W / 2 - 80, 310, 9 * (0.7 + 0.3 * Math.sin(t * 8)), 0, 6.28); g.fill();
    g.fillStyle = "#e6fbff"; g.font = "600 28px Sora"; g.fillText("LIVE 3D MAP", W / 2 - 60, 320);
    const sy = 300 + ((t - 6.6) * 520) % (H - 700); g.globalCompositeOperation = "lighter";
    const sg = g.createLinearGradient(0, sy - 40, 0, sy + 4); sg.addColorStop(0, "rgba(34,211,238,0)"); sg.addColorStop(1, "rgba(34,211,238,0.25)"); g.fillStyle = sg; g.fillRect(0, sy - 40, W, 44);
    g.restore();
  }
  flash(t, 7.0, 0.2, 0.35);
  fade(eInOut(prog(t, 9.3, 10.0)) * 0.96, "2,4,10");
}

/* The gift: an isometric box of light opens, particles become Hella's orb. */
const ORB = { x: W / 2, y: 760 };
function iso(p, th, a, cx, cy) { const [x0, y, z0] = p, x = x0 * Math.cos(th) - z0 * Math.sin(th), z = x0 * Math.sin(th) + z0 * Math.cos(th); return [cx + (x - z) * 0.866 * a, cy + (x + z) * 0.5 * a - y * a]; }
function box(t) {
  const a = 165, cx = W / 2, cy = 980 + Math.sin(t * 2.2) * 8, th = Math.sin(t * 0.9) * 0.18;
  const appear = prog(t, 10.1, 11.0), open = eOutCubic(prog(t, 11.3, 12.1)), out = 1 - prog(t, 12.35, 12.7);
  if (appear <= 0 || out <= 0) return;
  const P = (x, y, z, lift = 0, tilt = 0) => { const yy = y + lift, zz = z + (y > 0.5 ? tilt : 0); return iso([x, yy, zz], th, a, cx, cy); };
  const edges = (pts, ids) => { g.beginPath(); for (const [i, j] of ids) { g.moveTo(...pts[i]); g.lineTo(...pts[j]); } };
  const cube = (y0, y1, w, lift, tilt) => [[-w, y0, -w], [w, y0, -w], [w, y0, w], [-w, y0, w], [-w, y1, -w], [w, y1, -w], [w, y1, w], [-w, y1, w]].map(([x, y, z]) => P(x, y, z, lift, tilt));
  const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  g.save(); g.globalAlpha = out; g.lineCap = "round";
  // glow pool on the floor
  const pool = g.createRadialGradient(cx, cy + 120, 0, cx, cy + 120, 420); pool.addColorStop(0, `rgba(34,211,238,${0.35 * appear + 0.4 * open})`); pool.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = pool; g.fillRect(0, cy - 300, W, 900);
  const body = cube(-1, 0.55, 1, 0, 0), lid = cube(0.55, 0.85, 1.08, open * 2.2, -open * 0.9);
  // translucent faces
  g.fillStyle = `rgba(34,211,238,${0.08 * appear})`;
  for (const f of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]) { g.beginPath(); f.forEach((i, n) => (n ? g.lineTo(...body[i]) : g.moveTo(...body[i]))); g.closePath(); g.fill(); }
  // light from inside once the lid lifts
  if (open > 0) {
    g.save(); g.globalCompositeOperation = "lighter";
    const top = iso([0, 0.55, 0], th, a, cx, cy);
    for (let i = 0; i < 16; i++) {
      const ang = -Math.PI / 2 + (i - 7.5) * 0.085 + Math.sin(t * 3 + i) * 0.02, len = 900 * open * (0.6 + 0.4 * ((i * 37) % 10) / 10);
      const lg = g.createLinearGradient(top[0], top[1], top[0] + Math.cos(ang) * len, top[1] + Math.sin(ang) * len);
      lg.addColorStop(0, `rgba(220,255,255,${0.5 * open})`); lg.addColorStop(1, "rgba(34,211,238,0)");
      g.fillStyle = lg; g.beginPath(); g.moveTo(top[0] - 30, top[1]); g.lineTo(top[0] + Math.cos(ang - 0.03) * len, top[1] + Math.sin(ang - 0.03) * len); g.lineTo(top[0] + Math.cos(ang + 0.03) * len, top[1] + Math.sin(ang + 0.03) * len); g.lineTo(top[0] + 30, top[1]); g.fill();
    }
    g.restore();
  }
  const dash = (k) => g.setLineDash([2400 * k, 2400]);
  g.shadowColor = CY; g.shadowBlur = 26; g.strokeStyle = "rgba(150,245,255,0.95)"; g.lineWidth = 5;
  dash(appear); edges(body, E); g.stroke();
  g.strokeStyle = "rgba(120,255,190,0.95)"; dash(prog(t, 10.4, 11.1)); edges(lid, E); g.stroke();
  // ribbon and bow
  g.setLineDash([1600 * prog(t, 10.7, 11.2), 1600]); g.strokeStyle = GR; g.shadowColor = GR; g.lineWidth = 7;
  const rib = [[0, -1, -1], [0, 0.55, -1], [0, 0.55, 1], [0, -1, 1]].map(([x, y, z]) => P(x, y, z)); g.beginPath(); rib.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.stroke();
  const rib2 = [[-1, -1, 0], [-1, 0.55, 0], [1, 0.55, 0], [1, -1, 0]].map(([x, y, z]) => P(x, y, z)); g.beginPath(); rib2.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.stroke();
  const bc = P(0, 0.85, 0, open * 2.2, -open * 0.9);
  g.setLineDash([]); g.globalAlpha = out * prog(t, 10.9, 11.2);
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(...bc); g.bezierCurveTo(bc[0] + s * 120, bc[1] - 120, bc[0] + s * 150, bc[1] + 20, bc[0], bc[1]); g.stroke(); }
  g.restore();
}
const MOTES = (() => { const r = rng(42); return [...Array(240)].map((_, i) => ({ st: 11.35 + (i / 240) * 0.85, ang: r() * 6.28, sp: 1.5 + r() * 2.5, rad: 40 + r() * 160, up: 380 + r() * 420, sz: 1.5 + r() * 3.5, c: r() > 0.5 ? CY : GR })); })();
function motes(t) {
  g.save(); g.globalCompositeOperation = "lighter";
  for (const m of MOTES) {
    if (t < m.st) continue;
    const u = t - m.st, conv = eIn(prog(t, 12.2, 12.6));
    if (conv >= 1) continue;
    const x0 = W / 2 + Math.cos(m.ang + u * m.sp) * m.rad * Math.min(1, u * 2), y0 = 900 - u * m.up;
    const x = lerp(x0, ORB.x, conv), y = lerp(y0, ORB.y, conv);
    g.globalAlpha = Math.min(1, u * 4) * (1 - conv * 0.3); g.fillStyle = m.c; g.shadowColor = m.c; g.shadowBlur = 12;
    g.beginPath(); g.arc(x, y, m.sz, 0, 6.28); g.fill();
  }
  g.restore();
}
function orb(t, x, y, R, a = 1) {
  if (R <= 0 || a <= 0) return;
  g.save(); g.globalAlpha = a; g.globalCompositeOperation = "lighter";
  const halo = g.createRadialGradient(x, y, R * 0.3, x, y, R * 3.2); halo.addColorStop(0, "rgba(34,211,238,0.55)"); halo.addColorStop(1, "rgba(34,211,238,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(x, y, R * 3.2, 0, 6.28); g.fill();
  g.globalCompositeOperation = "source-over";
  const body = g.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.1, x, y, R);
  body.addColorStop(0, "#eafffb"); body.addColorStop(0.35, "#5eead4"); body.addColorStop(0.75, "#0891b2"); body.addColorStop(1, "#0b2a4a");
  g.fillStyle = body; g.beginPath(); g.arc(x, y, R, 0, 6.28); g.fill();
  g.save(); g.beginPath(); g.arc(x, y, R, 0, 6.28); g.clip(); g.globalCompositeOperation = "lighter"; g.lineWidth = R * 0.08;
  for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(160,255,220,${0.35 - i * 0.08})`; g.beginPath(); g.ellipse(x, y, R * (0.9 - i * 0.2), R * 0.35, t * (1.4 + i * 0.5) + i, 0, 6.28); g.stroke(); }
  g.restore();
  // sparkle mark in the middle (the assistant's icon)
  g.fillStyle = "rgba(255,255,255,0.95)"; const s = R * 0.34;
  g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x + s * 0.12, y - s * 0.12, x + s, y); g.quadraticCurveTo(x + s * 0.12, y + s * 0.12, x, y + s); g.quadraticCurveTo(x - s * 0.12, y + s * 0.12, x - s, y); g.quadraticCurveTo(x - s * 0.12, y - s * 0.12, x, y - s); g.fill();
  g.restore();
}
function s4a(t) {
  space(t, { a: 0.6 + 0.4 * prog(t, 10.0, 11.0), grid: 0.6, glowY: 0.5 });
  box(t);
  motes(t);
  const R = 120 * eOutBack(prog(t, 12.45, 12.95)) * (1 + 0.04 * Math.sin(t * 5));
  orb(t, ORB.x, ORB.y, R);
  // shockwave
  const sk = prog(t, 12.6, 13.3);
  if (sk > 0 && sk < 1) { g.save(); g.globalCompositeOperation = "lighter"; g.strokeStyle = `rgba(150,245,255,${0.8 * (1 - sk)})`; g.lineWidth = 10 * (1 - sk) + 1; g.beginPath(); g.arc(ORB.x, ORB.y, 60 + eOutCubic(sk) * 900, 0, 6.28); g.stroke(); g.restore(); }
  flash(t, 12.6, 0.35, 0.85);
  // "Hella", written in light
  const wk = prog(t, 12.75, 13.5), fk = prog(t, 13.15, 13.7);
  if (wk > 0) {
    g.save(); g.font = "700 190px Sora"; g.textAlign = "center"; g.lineJoin = "round";
    g.setLineDash([2600 * eInOut(wk), 2600]); g.lineWidth = 4; g.strokeStyle = "#bff8ff"; g.shadowColor = CY; g.shadowBlur = 30;
    g.strokeText("Hella", W / 2, 1110);
    if (fk > 0) { const lg = g.createLinearGradient(W / 2 - 280, 0, W / 2 + 280, 0); lg.addColorStop(0, "#7cf3ff"); lg.addColorStop(1, GR); g.globalAlpha = fk; g.setLineDash([]); g.fillStyle = lg; g.fillText("Hella", W / 2, 1110); }
    g.restore();
    sparkles(t, W / 2, 1050, 380, 13.0);
  }
  const tk = prog(t, 13.45, 13.9);
  if (tk > 0) { g.save(); g.globalAlpha = tk * (1 - prog(t, 14.05, 14.2)); g.font = "500 34px Sora"; g.textAlign = "center"; g.fillStyle = "#cfefff"; g.letterSpacing = "10px"; g.fillText("YOUR PERSONAL HOME FINDER", W / 2, 1200 + (1 - eOutCubic(tk)) * 20); g.restore(); }
}

// S4b 14.2–18.0: the orb lands on the (new) assistant button, pin on Kochi, Hella answers.
const PH = { s: 0.74 };
function phonePt(px, py, s = PH.s) { return [W / 2 + (px - 540) * s, H / 2 + (py - 960) * s]; }
function s4b(t) {
  if (t < 14.95) {
    const k = eInOut(prog(t, 14.2, 14.85));
    space(t, { a: 0.8 });
    phone(IMG["home-launcher"], { s: PH.s, a: eOutCubic(prog(t, 14.2, 14.6)), glow: 0.8 });
    const [lx, ly] = phonePt(970, 1660);
    const x = lerp(ORB.x, lx, k), y = lerp(ORB.y, ly, k) - Math.sin(k * Math.PI) * 220;
    orb(t, x, y, lerp(120, 30, k), 1 - prog(t, 14.85, 14.95));
    const rk = prog(t, 14.8, 14.95);
    if (rk > 0) { g.save(); g.strokeStyle = `rgba(62,229,142,${1 - rk})`; g.lineWidth = 5; g.beginPath(); g.arc(lx, ly, 30 + rk * 90, 0, 6.28); g.stroke(); g.restore(); }
    return;
  }
  if (t < 16.3) {
    // Location: a pin drops on Kochi.
    const k = prog(t, 14.95, 16.3);
    cover(IMG["map-flat"], { s: lerp(1.08, 1.16, k) });
    fade(0.35, "2,6,14");
    const px = W / 2, py = 930, drop = eOutBack(prog(t, 15.05, 15.45));
    for (let i = 0; i < 3; i++) { const rk = ((t - 15.4 - i * 0.28) % 0.9) / 0.9; if (t < 15.4 + i * 0.28) continue; g.save(); g.strokeStyle = `rgba(34,211,238,${0.8 * (1 - rk)})`; g.lineWidth = 4; g.beginPath(); g.ellipse(px, py, 30 + rk * 230, (30 + rk * 230) * 0.45, 0, 0, 6.28); g.stroke(); g.restore(); }
    const y = lerp(py - 420, py, drop);
    g.save(); g.globalAlpha = prog(t, 15.05, 15.15); g.shadowColor = CY; g.shadowBlur = 40;
    const pg = g.createLinearGradient(px, y - 130, px, y); pg.addColorStop(0, "#7cf3ff"); pg.addColorStop(1, GR); g.fillStyle = pg;
    g.beginPath(); g.moveTo(px, y); g.bezierCurveTo(px - 30, y - 50, px - 64, y - 80, px - 64, y - 125); g.arc(px, y - 125, 64, Math.PI, 0); g.bezierCurveTo(px + 64, y - 80, px + 30, y - 50, px, y); g.fill();
    g.shadowBlur = 0; g.fillStyle = "#02101a"; g.beginPath(); g.arc(px, y - 125, 24, 0, 6.28); g.fill(); g.restore();
    const ck = eOutBack(prog(t, 15.45, 15.8));
    if (ck > 0) {
      g.save(); g.globalAlpha = clamp(ck); g.translate(px, py - 250); g.scale(ck, ck);
      g.fillStyle = "rgba(4,14,24,0.85)"; rr(-170, -46, 340, 92, 46); g.fill(); g.strokeStyle = "rgba(34,211,238,0.7)"; g.lineWidth = 2; g.stroke();
      g.font = "600 40px Sora"; g.textAlign = "center"; g.fillStyle = "#eafcff"; g.fillText("Kochi", 0, 14); g.restore();
    }
    return;
  }
  // Hella's panel opens and answers.
  space(t, { a: 0.8 });
  const open = eOutExpo(prog(t, 16.3, 16.75)), res = prog(t, 17.0, 17.45);
  phone(() => {
    shot(IMG["home-launcher"]);
    fade(0.4 * open);
    shot(IMG["hella-greet"], { clipTop: 240, dy: (1 - open) * 1500, a: 1 - res });
    if (res > 0) { shot(IMG["hella-results"], { clipTop: 240, a: res }); const k = eOutCubic(res); g.save(); g.globalAlpha = 1 - k; g.fillStyle = "#0b1014"; g.fillRect(0, 330, 1080, 1300 * (1 - k)); g.restore(); }
  }, { s: lerp(0.7, 0.8, eOutCubic(prog(t, 16.3, 18.0))), r: lerp(-0.05, 0, eOutCubic(prog(t, 16.3, 17))), y: H / 2 - 40, glow: 1 });
}

// S5 18.0–20.6: typing in Manglish (a glass lens enlarges the input), then the answer in slow-mo.
function s5(t) {
  const n = SEQ.type.length, tk = prog(t, 18.15, 19.35);
  if (t < 19.45) {
    const f = SEQ.type[Math.min(n - 1, Math.floor(tk * n))];
    space(t, { a: 0.8 });
    const pin = eOutExpo(prog(t, 18.0, 18.4));
    phone(f, { s: lerp(0.9, 0.8, pin), y: H / 2 + 60, glow: 0.8 });
    // Lens: the input row (screen x 30–790, y 1660–1795) enlarged in a floating glass card.
    const lk = eOutBack(prog(t, 18.1, 18.45)), lw = 980, lh = (lw * 135) / 760, lx = W / 2 - lw / 2, ly = 640;
    if (lk > 0) {
      g.save(); g.globalAlpha = clamp(lk); g.translate(W / 2, ly + lh / 2); g.scale(0.85 + 0.15 * lk, 0.85 + 0.15 * lk); g.translate(-W / 2, -(ly + lh / 2));
      g.shadowColor = "rgba(34,211,238,0.6)"; g.shadowBlur = 60; rr(lx - 14, ly - 14, lw + 28, lh + 28, 44); g.fillStyle = "#061018"; g.fill(); g.shadowBlur = 0;
      g.save(); rr(lx, ly, lw, lh, 34); g.clip(); g.drawImage(f, 30, 1660, 760, 135, lx, ly, lw, lh); g.restore();
      rr(lx - 14, ly - 14, lw + 28, lh + 28, 44); g.strokeStyle = "rgba(124,243,255,0.7)"; g.lineWidth = 3; g.stroke();
      g.restore();
    }
    whip(1 - prog(t, 18.0, 18.1), 1);
  } else {
    const k = eOutCubic(prog(t, 19.45, 20.6));
    space(t, { a: 0.8 });
    phone(IMG["hella-manglish"], { s: lerp(0.8, 0.86, k), y: H / 2 + 60 - 40 * k, glow: 1 });
    sparkles(t, W / 2, 700, 420, 19.5);
  }
  flash(t, 19.42, 0.2, 0.5);
}

// S6 20.6–23.6: abroad. Three hard cuts with punch-ins.
function s6(t) {
  const punch = (t0) => lerp(1.12, 1.0, eOutExpo(prog(t, t0, t0 + 0.35)));
  if (t < 21.6) cover(IMG["nri-account"], { s: 1.18 * punch(20.6), fx: 0.5, fy: 0.3, y: H * 0.38 });
  else if (t < 22.6) { cover(IMG["nri-aed"], { s: 1.55 * punch(21.6), fx: 0.75, fy: 0.62, y: H * 0.55 }); }
  else cover(IMG["nri-clocks"], { s: 1.5 * punch(22.6), fx: 0.5, fy: 0.62, y: H * 0.45 });
  for (const at of [20.6, 21.6, 22.6]) flash(t, at, 0.12, 0.45);
}

// S7 23.6–26.2: one platform. Glitch cuts, then three phones fan out.
function s7(t) {
  if (t < 25.45) {
    const which = t < 24.4 ? "portal" : t < 25.0 ? "vault" : "admin";
    const t0 = t < 24.4 ? 23.6 : t < 25.0 ? 24.4 : 25.0;
    cover(IMG[which], { s: lerp(1.1, 1.0, eOutExpo(prog(t, t0, t0 + 0.4))), fx: 0.5, fy: which === "vault" ? 0.7 : 0.4, y: which === "vault" ? H * 0.6 : H * 0.42 });
    glitch(t, 1 - prog(t, t0, t0 + 0.16), t0 * 10);
    return;
  }
  space(t);
  const k = (d) => eOutBack(prog(t, 25.45 + d, 25.95 + d));
  phone(IMG.portal, { s: 0.42, x: 250, y: lerp(1500, 930, k(0)), r: -0.14, a: clamp(k(0)) });
  phone(IMG.vault, { s: 0.42, x: 830, y: lerp(1500, 930, k(0.08)), r: 0.14, a: clamp(k(0.08)) });
  phone(IMG.admin, { s: 0.48, x: 540, y: lerp(1500, 880, k(0.04)), a: clamp(k(0.04)) });
  glitch(t, 1 - prog(t, 25.45, 25.6), 99);
}

// S8 26.2–28.1: the portal. Flow clip B, or a doorway of light that opens and pulls the camera through.
function s8(t) {
  const fb = flowFrame("flowB", t, 26.2, 2.5);
  if (fb) { cover(fb, { s: lerp(1.0, 1.15, prog(t, 26.2, 28.0)) }); flash(t, 27.95, 0.3, 1); return; }
  g.fillStyle = "#010207"; g.fillRect(0, 0, W, H);
  dust(t, 0.5);
  const push = eIn(prog(t, 27.2, 28.0)), sc = 1 + push * 9, cx = W / 2, cy = 900;
  const ow = 400 * eOutExpo(prog(t, 26.35, 27.0)), oh = 860;
  g.save(); g.translate(cx, cy); g.scale(sc, sc); g.translate(-cx, -cy);
  // floor reflection and light spill
  const spill = g.createLinearGradient(0, cy + oh / 2, 0, cy + oh / 2 + 700); spill.addColorStop(0, `rgba(80,180,255,${0.5 * ow / 400})`); spill.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = spill; g.beginPath(); g.moveTo(cx - ow / 2, cy + oh / 2); g.lineTo(cx + ow / 2, cy + oh / 2); g.lineTo(cx + ow * 1.6, cy + oh / 2 + 700); g.lineTo(cx - ow * 1.6, cy + oh / 2 + 700); g.fill();
  g.shadowColor = "#3b82f6"; g.shadowBlur = 120;
  const door = g.createLinearGradient(cx - ow / 2, 0, cx + ow / 2, 0); door.addColorStop(0, "#60a5fa"); door.addColorStop(0.5, "#e0f7ff"); door.addColorStop(1, "#22d3ee");
  g.fillStyle = door; g.fillRect(cx - ow / 2, cy - oh / 2, ow, oh);
  g.shadowBlur = 0; g.strokeStyle = "rgba(180,240,255,0.9)"; g.lineWidth = 6; g.strokeRect(cx - ow / 2 - 14, cy - oh / 2 - 14, ow + 28, oh + 28);
  g.restore();
  flash(t, 27.95, 0.3, 1);
}

// End 28.0–31.0: NovaTech logo assembles from light; "Build with us".
const LOGO = { x: W / 2, y: 800, size: 860 };
function sEnd(t) {
  space(t, { a: 0.7, grid: 0.5, glowY: 0.42, hue: "20,90,170" });
  const r = rng(5), half = LOGO.size / 2;
  const assemble = prog(t, 28.0, 29.1), logoIn = eOutCubic(prog(t, 28.85, 29.35));
  if (logoIn < 1) {
    g.save(); g.globalCompositeOperation = "lighter";
    for (let i = 0; i < LOGO_PTS.length; i++) {
      const [u, v, c] = LOGO_PTS[i];
      const sx = r() * W, sy = r() * H, d = r() * 0.35;
      const k = eOutExpo(clamp((assemble - d) / (1 - d)));
      const tx = LOGO.x - half + u * LOGO.size, ty = LOGO.y - half + v * LOGO.size;
      g.globalAlpha = (0.25 + 0.75 * k) * (1 - logoIn);
      g.fillStyle = c; g.fillRect(lerp(sx, tx, k), lerp(sy, ty, k), 4, 4);
    }
    g.restore();
  }
  if (logoIn > 0) {
    g.save(); g.globalAlpha = logoIn; g.globalCompositeOperation = "lighter";
    g.drawImage(IMG.logo, LOGO.x - half, LOGO.y - half, LOGO.size, LOGO.size); g.restore();
    sweep(prog(t, 29.5, 30.3), LOGO.x - half, LOGO.y - half, LOGO.size, LOGO.size, 0.35);
  }
  const bk = eOutCubic(prog(t, 29.35, 29.8));
  g.save(); g.textAlign = "center";
  if (bk > 0) { g.globalAlpha = bk; g.font = "600 54px Sora"; g.letterSpacing = "14px"; g.fillStyle = "#ffffff"; g.shadowColor = CY; g.shadowBlur = 24; g.fillText("BUILD WITH US", W / 2 + 7, 1330 + (1 - bk) * 26); }
  const ek = eOutCubic(prog(t, 29.7, 30.1));
  if (ek > 0) { g.globalAlpha = ek; g.shadowBlur = 0; g.letterSpacing = "1px"; g.font = "500 38px Inter"; g.fillStyle = "#7cf3ff"; g.fillText("novamatic119@gmail.com", W / 2, 1420); }
  const dk = prog(t, 29.9, 30.3);
  if (dk > 0) { g.globalAlpha = dk * 0.55; g.font = "400 24px Inter"; g.fillStyle = "#cfe3ee"; g.fillText("Product demo · sample listings", W / 2, 1530); }
  g.restore();
  flash(t, 28.02, 0.5, 0.7);
}

/* ───────── frame ───────── */
window.renderFrame = function (t) {
  g.setLineDash([]); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none"; g.letterSpacing = "0px";
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  if (t < 2.7) s1(t);
  else if (t < 6.0) s2(t);
  else if (t < 10.0) s3(t);
  else if (t < 14.2) s4a(t);
  else if (t < 18.0) s4b(t);
  else if (t < 20.6) s5(t);
  else if (t < 23.6) s6(t);
  else if (t < 26.2) s7(t);
  else if (t < 28.0) s8(t);
  else sEnd(t);
  // cut flashes
  flash(t, 2.7, 0.18, 0.55); flash(t, 6.0, 0.18, 0.4); flash(t, 18.0, 0.15, 0.35); flash(t, 23.6, 0.12, 0.3);
  captions(t);
  finish(t);
};
