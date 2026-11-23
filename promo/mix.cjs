// Mixes the rendered video with the voice-over, music and SFX from incoming/.
// Missing files are skipped, so it works with whatever has arrived.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process"), vm = require("vm");
const dir = __dirname, inc = (f) => path.join(dir, "incoming", f);
const win = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, "compose/timeline.js"), "utf8"), { window: win });
const find = (base) => ["mp3", "wav", "m4a"].map((e) => inc(`${base}.${e}`)).find(fs.existsSync);

const SFX = [
  ["sfx_whoosh", [2.68, 3.15, 3.62, 4.09, 5.98, 14.25, 17.98, 27.4]],
  ["sfx_riser", [8.0]], ["sfx_reveal", [12.55]], ["sfx_pin", [15.05]], ["sfx_typing", [18.15]],
  ["sfx_pop", [16.3, 17.0, 19.45, 25.45, 25.52]], ["sfx_glitch", [23.6, 24.4, 25.0]], ["sfx_impact", [28.95]],
];
const tracks = [];
for (const v of win.VO) { const f = find(v.file); if (f) tracks.push({ f, at: v.at, vol: 1.0, kind: "vo" }); }
for (const [name, times] of SFX) { const f = find(name); if (f) for (const at of times) tracks.push({ f, at, vol: name === "sfx_impact" ? 0.9 : 0.55, kind: "sfx" }); }
const music = find("music");

const video = path.join(dir, "out/reel-silent.mp4"), out = path.join(dir, "out/reel.mp4");
const args = ["-y", "-loglevel", "error", "-i", video];
tracks.forEach((t) => args.push("-i", t.f));
if (music) args.push("-i", music);
const D = win.DURATION, parts = [], vo = [], fx = [];
tracks.forEach((t, i) => {
  const lbl = `a${i}`; parts.push(`[${i + 1}:a]aresample=48000,volume=${t.vol},adelay=${Math.round(t.at * 1000)}:all=1,apad=whole_dur=${D}[${lbl}]`);
  (t.kind === "vo" ? vo : fx).push(`[${lbl}]`);
});
let mixIn = [];
if (vo.length) { parts.push(`${vo.join("")}amix=inputs=${vo.length}:normalize=0,asplit=2[vo][vokey]`); mixIn.push("[vo]"); }
if (fx.length) { parts.push(`${fx.join("")}amix=inputs=${fx.length}:normalize=0[fx]`); mixIn.push("[fx]"); }
if (music) {
  const mi = tracks.length + 1;
  parts.push(`[${mi}:a]aresample=48000,atrim=0:${D},volume=0.6,afade=t=out:st=${D - 1.2}:d=1.2[mu]`);
  // Duck the music under the voice.
  if (vo.length) { parts.push(`[mu][vokey]sidechaincompress=threshold=0.04:ratio=6:attack=20:release=300[mud]`); mixIn.push("[mud]"); } else mixIn.push("[mu]");
} else if (vo.length) parts.push(`[vokey]anullsink`);
if (!mixIn.length) { console.log("No audio in incoming/ yet."); process.exit(0); }
parts.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:${D}[out]`);
args.push("-filter_complex", parts.join(";"), "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", out);
execFileSync("ffmpeg", args, { stdio: "inherit" });
console.log(`Mixed ${tracks.length} clips${music ? " + music" : ""} → ${out}`);
