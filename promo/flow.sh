#!/usr/bin/env bash
# Turn Google Flow clips (incoming/flowA.mp4, flowB.mp4, flowC.mp4) into 1080×1920 frames the reel uses.
set -euo pipefail
cd "$(dirname "$0")"
for n in A B C; do
  src="incoming/flow$n.mp4"; [ -f "$src" ] || continue
  out="assets/flow$n"; rm -rf "$out"; mkdir -p "$out"
  ffmpeg -loglevel error -y -i "$src" -an -vf "fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" -q:v 2 -start_number 0 "$out/%03d.jpg"
  echo "flow$n: $(ls "$out" | wc -l) frames"
done
