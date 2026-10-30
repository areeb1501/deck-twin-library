#!/bin/bash
# Rebuilds the landing page's media from the demo film's clips and uploads it to R2. Needs ffmpeg, cwebp and a logged-in wrangler.
#   landing/media.sh <own-plant.png>
# own-plant.png is a 1920 x 1200 capture of an imported plant in the twin, for "Bring your own plant".
# Needs video/out/clips/w2_bridge_long.mp4 (deck-twin: node video/record.mjs walk w2_bridge_long).
# Objects are cached as immutable, so a change needs a new SET, plus the same change to MEDIA in landing.ts and the paths in index.html.
set -euo pipefail
SET=v2
BUCKET=deck-twin-alpha-media
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CLIPS="$HERE/../../deck-twin/video/out/clips"
OUT="$(mktemp -d)"
MASTERS="$(mktemp -d)"
OWN="${1:?usage: media.sh <own-plant.png>}"

# The long films, from a master that has its loop dissolve baked in, so the last frame meets the first.
# name, master, width px, x264 crf, AV1 crf, small width px
film() {
  local name=$1 master=$2 width=$3 crf=$4 av1crf=$5 small=$6
  local x264=(-an -c:v libx264 -profile:v high -preset slow -g 60 -keyint_min 60 -sc_threshold 0 -pix_fmt yuv420p -movflags +faststart)
  ffmpeg -nostdin -v error -y -i "$master" -vf "scale=$width:-2:flags=lanczos" "${x264[@]}" -crf "$crf" "$OUT/$name.mp4"
  ffmpeg -nostdin -v error -y -i "$master" -an -c:v libsvtav1 -preset 5 -crf "$av1crf" -g 120 -svtav1-params tune=0 -pix_fmt yuv420p -movflags +faststart "$OUT/$name.av1.mp4"
  ffmpeg -nostdin -v error -y -i "$master" -vf "scale=$small:-2:flags=lanczos" "${x264[@]}" -crf "$((crf + 1))" "$OUT/$name-sm.mp4"
  ffmpeg -nostdin -v error -y -i "$master" -frames:v 1 -vf "scale=1600:-2:flags=lanczos" "$OUT/$name.png"
  cwebp -quiet -q 80 -m 6 "$OUT/$name.png" -o "$OUT/$name.webp"
}
# the hero: the flyover, the whole field from high up, and back into the flyover
ffmpeg -nostdin -v error -y -ss 2.2 -t 14.3 -i "$CLIPS/f1_flyover.mp4" -ss 0 -t 12.5 -i "$CLIPS/f9_outro.mp4" -ss 1 -t 1.2 -i "$CLIPS/f1_flyover.mp4" -filter_complex \
  "[0:v]settb=1/30,setpts=PTS-STARTPTS,fps=30[a];[1:v]settb=1/30,setpts=PTS-STARTPTS,fps=30[b];[2:v]settb=1/30,setpts=PTS-STARTPTS,fps=30[c];[a][b]xfade=transition=fade:duration=1.2:offset=13.1[ab];[ab][c]xfade=transition=fade:duration=1.2:offset=24.4,scale=1920:-2:flags=lanczos,hqdn3d=1.2:1.2:3:3,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -preset veryfast -crf 10 "$MASTERS/hero.mp4"
film hero-flyover "$MASTERS/hero.mp4" 1600 32 52 960
# the walk: the south bridge end to end, dissolving back to its first second
ffmpeg -nostdin -v error -y -ss 1 -t 13 -i "$CLIPS/w2_bridge_long.mp4" -ss 0 -t 1 -i "$CLIPS/w2_bridge_long.mp4" -filter_complex \
  "[0:v]settb=1/30,setpts=PTS-STARTPTS,fps=30[a];[1:v]settb=1/30,setpts=PTS-STARTPTS,fps=30[b];[a][b]xfade=transition=fade:duration=1:offset=12,scale=1600:-2:flags=lanczos,format=yuv420p[v]" \
  -map "[v]" -an -c:v libx264 -preset veryfast -crf 10 "$MASTERS/walk.mp4"
film walk-bridge "$MASTERS/walk.mp4" 1280 27 46 640

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
