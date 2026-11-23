// Mixes out/reel-silent.mp4 with the voice-over, music and SFX in incoming/ → out/reel.mp4.
// Times are in seconds of the final video. Missing files are skipped.
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process"), vm = require("vm");
const dir = __dirname, inc = (f) => path.join(dir, "incoming", f);
const win = {}; vm.runInNewContext(fs.readFileSync(path.join(dir, "compose/timeline.js"), "utf8"), { window: win });
const find = (base) => ["mp3", "wav", "m4a"].map((e) => inc(`${base}.${e}`)).find(fs.existsSync);
const D = win.DURATION;

// [file, times, volume, trim start, max length]
const SFX = [
  ["sfx_whoosh", [4.4, 5.02, 5.64, 6.26, 9.6, 20.7, 24.6, 37.0], 0.5, 0.5, 1.0],
  ["sfx_riser", [12.36], 0.45, 0, 2.04],
  ["sfx_reveal", [18.1], 0.7, 0, 2.0],
  ["sfx_pin", [21.39], 0.6, 0, 1.0],
  ["sfx_typing", [24.8], 0.45, 0, 1.5],
  ["sfx_pop", [22.45, 23.33, 26.45, 34.65, 34.75], 0.5, 0, 0.5],
  ["sfx_glitch", [31.9, 32.9, 33.75], 0.4, 0, 0.5],
  ["sfx_impact", [38.85], 0.85, 0, 3.5],
];
// Music: the calm intro for the first part (sinking for the gift), then the energetic section from 0:46.
const MUSIC = [
  { from: 0.5, at: 0, len: 18.2, vol: 0.55, duck: [14.0, 14.7, 0.12] },
  { from: 46.0, at: 18.2, len: D - 18.2, vol: 0.5, fadeIn: 0.25, fadeOutAt: 39.6 },
];

const inputs = [], parts = [], vo = [], fx = [], mu = [];
const add = (f) => (inputs.push(f), inputs.length); // index of the input (0 is the video)
for (const v of win.VO) {
  const f = find(v.file); if (!f) continue;
  const i = add(f); parts.push(`[${i}:a]aresample=48000,adelay=${Math.round(v.at * 1000)}:all=1,apad=whole_dur=${D}[v${i}]`); vo.push(`[v${i}]`);
}
for (const [name, times, vol, ss, len] of SFX) {
  const f = find(name); if (!f) continue;
  for (const at of times) {
    const i = add(f);
    parts.push(`[${i}:a]aresample=48000,atrim=${ss}:${ss + len},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0, len - 0.25)}:d=0.25,volume=${vol},adelay=${Math.round(at * 1000)}:all=1,apad=whole_dur=${D}[s${i}]`);
    fx.push(`[s${i}]`);
  }
}
const music = find("music");
if (music) for (const m of MUSIC) {
  const i = add(music);
  let chain = `[${i}:a]aresample=48000,atrim=${m.from}:${m.from + m.len},asetpts=PTS-STARTPTS,volume=${m.vol}`;
  if (m.duck) { const [a, b, low] = m.duck; chain += `,volume='if(lt(t,${a}),1,if(lt(t,${b}),1-(1-${low})*(t-${a})/${b - a},${low}))':eval=frame`; }
  if (m.fadeIn) chain += `,afade=t=in:d=${m.fadeIn}`;
  if (m.fadeOutAt) chain += `,afade=t=out:st=${m.fadeOutAt - m.at}:d=${D - m.fadeOutAt}`;
  parts.push(`${chain},adelay=${Math.round(m.at * 1000)}:all=1,apad=whole_dur=${D}[m${i}]`); mu.push(`[m${i}]`);
}
const mix = [];
if (vo.length) { parts.push(`${vo.join("")}amix=inputs=${vo.length}:normalize=0,asplit=2[vo][vokey]`); mix.push("[vo]"); }
if (fx.length) { parts.push(`${fx.join("")}amix=inputs=${fx.length}:normalize=0[fx]`); mix.push("[fx]"); }
if (mu.length) {
  parts.push(`${mu.join("")}amix=inputs=${mu.length}:normalize=0[mu]`);
  // Duck the music under the voice.
  if (vo.length) { parts.push(`[mu][vokey]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=350[mud]`); mix.push("[mud]"); } else mix.push("[mu]");
} else if (vo.length) parts.push(`[vokey]anullsink`);
if (!mix.length) { console.log("No audio in incoming/ yet."); process.exit(0); }
parts.push(`${mix.join("")}amix=inputs=${mix.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,atrim=0:${D}[out]`);

const args = ["-y", "-loglevel", "error", "-i", path.join(dir, "out/reel-silent.mp4")];
for (const f of inputs) args.push("-i", f);
args.push("-filter_complex", parts.join(";"), "-map", "0:v", "-map", "[out]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", path.join(dir, "out/reel.mp4"));
execFileSync("ffmpeg", args, { stdio: "inherit" });
console.log(`Mixed ${vo.length} voice lines, ${fx.length} effects, ${mu.length} music sections → out/reel.mp4`);
