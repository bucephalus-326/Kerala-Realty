# Promo reel

A 42-second 9:16 promotional reel built from the real app plus motion graphics. The script, shot list, Google Flow prompts and sound brief are in [BRIEF.md](BRIEF.md).

## How it's made

1. **Capture** (`capture/`): Playwright records the running app (API on :4000, web on :3100) as 1080×1920 phone frames into `assets/`. Video-only cosmetics: the product name is hidden and the assistant is called Hella. The app itself is unchanged.
   ```bash
   node capture/shots.cjs assets && node capture/fix.cjs assets && node capture/badge.cjs assets/badge-hi.png
   ```
2. **Compose** (`compose/`): `reel.js` draws every frame on a canvas from its time `t`. Timing lives in `compose/timeline.js`: voice-over starts, captions, Flow clip windows, and `REMAP`, which maps final-video time onto the scene choreography so cuts land on the recorded words. Preview single moments:
   ```bash
   node render.cjs stills 3.3,12.8,29.5   # → out/still-*.jpg
   ```
3. **Google Flow clips**: put `flowA.mp4` / `flowB.mp4` / `flowC.mp4` in `incoming/`, then run `./flow.sh`. A plays under the opening, B's grid dissolves into the 3D map, C is the reaction shot after Hella appears (windows in `FLOW` in `timeline.js`).
4. **Render**:
   ```bash
   node render.cjs video
   ffmpeg -y -framerate 30 -i out/frames/%04d.jpg -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart out/reel-silent.mp4
   ```
5. **Mix**: put `vo01.mp3` … `vo08.mp3`, `music.mp3` and the `sfx_*.mp3` files in `incoming/`, then run `node mix.cjs` → `out/reel.mp4` (music ducked under the voice, loudness −14 LUFS for Instagram).

`assets/`, `incoming/` and `out/` are not committed (large or user-provided media).
