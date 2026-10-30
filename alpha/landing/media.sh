#!/bin/bash
# Rebuilds the landing page's media from the demo film's clips and uploads it to R2. Needs ffmpeg, cwebp and a logged-in wrangler.
#   landing/media.sh <own-plant.png>
# own-plant.png is a 1920 x 1200 capture of an imported plant in the twin, for "Bring your own plant".
# Objects are cached as immutable, so a change needs a new SET, plus the same change to MEDIA in landing.ts and the paths in index.html.
set -euo pipefail
SET=v1
BUCKET=deck-twin-alpha-media
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CLIPS="$HERE/../../deck-twin/video/out/clips"
OUT="$(mktemp -d)"
OWN="${1:?usage: media.sh <own-plant.png>}"

# name, source clip, start s, length s, width px, x264 crf; a length of 0 makes only the still
while read -r name clip start length width crf; do
  [ -z "$name" ] && continue
  if [ "$length" != 0 ]; then
    ffmpeg -nostdin -v error -y -ss "$start" -t "$length" -i "$CLIPS/$clip.mp4" -an -vf "scale=$width:-2:flags=lanczos,fps=30" \
      -c:v libx264 -profile:v high -preset slow -crf "$crf" -pix_fmt yuv420p -movflags +faststart "$OUT/$name.mp4"
  fi
  ffmpeg -nostdin -v error -y -ss "$start" -i "$CLIPS/$clip.mp4" -frames:v 1 -vf "scale=$width:-2:flags=lanczos" "$OUT/$name.png"
  cwebp -quiet -q 80 -m 6 "$OUT/$name.png" -o "$OUT/$name.webp"
done <<'LIST'
hero-flyover f1_flyover 5 7 1600 30
walk-bridge w2_bridge 1 5 1280 25
inspect w1_inspect 3 5 1280 24
cut-open p3_section 1 5 1280 24
xray p2_xray 1 5 1280 25
control-wall w3_ccr 1.5 0 1920 0
dashboard k1_dashboard 0 5 1280 22
shutdown k2_shutdown 0 5 1280 22
leak i1_release 1 5 1280 25
cctv c2_cctv 5 6 1280 23
flare i3_flare 0 5 1280 24
fire i4_fire 1 5 1280 25
investigate a1_investigate 4 6 1280 22
scenarios k3_scenarios 0 5 1280 22
fg-map s1_fg 2 5 1280 25
field-close f0_skim 4 6 1600 25
LIST
ffmpeg -nostdin -v error -y -i "$OWN" -vf "scale=1600:-2:flags=lanczos" "$OUT/own-plant.png"
cwebp -quiet -q 84 -m 6 "$OUT/own-plant.png" -o "$OUT/own-plant.webp"

cd "$HERE/.."
for f in "$OUT"/*.mp4 "$OUT"/*.webp; do
  case "$f" in *.mp4) type=video/mp4 ;; *) type=image/webp ;; esac
  npx wrangler r2 object put "$BUCKET/$SET/$(basename "$f")" --file "$f" --content-type "$type" --remote </dev/null
done
