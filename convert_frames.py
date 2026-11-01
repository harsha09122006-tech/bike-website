"""
NOCTIS — Frame conversion script
Joins hero clip1 + clip2 + clip3, converts everything to WebP.
Skips a clip's first frame only when it nearly matches the previous clip's last frame.
Outputs:
  assets/frames/hero/frame_XXXX.webp         1600px wide, quality 78
  assets/frames/hero-mobile/frame_XXXX.webp   960px wide, quality 72
  assets/frames/dismantle/frame_XXXX.webp     1600px wide, quality 78
  assets/frames/dismantle-mobile/frame_XXXX.webp 960px wide, quality 72
"""

import re
from pathlib import Path
from PIL import Image, ImageChops, ImageStat

BASE = Path(__file__).parent

# ── Source folders ──────────────────────────────────────────────────────────
CLIP1_DIR = BASE / "clip1zip1"
CLIP2_DIR = BASE / "clip2frame"
CLIP3_DIR = BASE / "clip3frame"
FLOW_DIR  = BASE / "flow clip"

# ── Output folders ──────────────────────────────────────────────────────────
OUT = {
    "hero":            BASE / "assets/frames/hero",
    "hero_mobile":     BASE / "assets/frames/hero-mobile",
    "dismantle":       BASE / "assets/frames/dismantle",
    "dismantle_mobile":BASE / "assets/frames/dismantle-mobile",
}
for d in OUT.values():
    d.mkdir(parents=True, exist_ok=True)

def natural_sort_key(p: Path):
    """Sort file names numerically (frame2 before frame10)."""
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', p.name)]

def list_frames(folder: Path):
    files = sorted(
        [f for f in folder.iterdir() if f.suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp')],
        key=natural_sort_key
    )
    return files

def frames_are_nearly_identical(first: Path, second: Path, threshold: float = 3.0):
    """Compare small RGB previews so compressed copies at clip joins are skipped."""
    with Image.open(first) as first_image, Image.open(second) as second_image:
        first_preview = first_image.convert("RGB").resize((160, 90), Image.LANCZOS)
        second_preview = second_image.convert("RGB").resize((160, 90), Image.LANCZOS)
    difference = ImageChops.difference(first_preview, second_preview)
    mean_difference = sum(ImageStat.Stat(difference).mean) / 3
    return mean_difference <= threshold

def convert_and_save(img: Image.Image, dest: Path, width: int, quality: int):
    """Resize to given width (maintain aspect) and save as WebP."""
    if img.width != width:
        ratio = width / img.width
        height = int(img.height * ratio)
        img_resized = img.resize((width, height), Image.LANCZOS)
    else:
        img_resized = img
    # Ensure RGB for WebP
    if img_resized.mode in ('RGBA', 'P'):
        img_resized = img_resized.convert('RGB')
    img_resized.save(dest, 'WEBP', quality=quality, method=6)

# ════════════════════════════════════════════════════════════════════════════
# STEP 1 — Build the joined hero sequence and remove duplicate clip boundaries
# ════════════════════════════════════════════════════════════════════════════
print("Building hero frame list …")
hero_sources = []

clip1_frames = list_frames(CLIP1_DIR)
clip2_frames = list_frames(CLIP2_DIR)
clip3_frames = list_frames(CLIP3_DIR)

print(f"  Clip1: {len(clip1_frames)} frames")
print(f"  Clip2: {len(clip2_frames)} frames")
print(f"  Clip3: {len(clip3_frames)} frames")

hero_sources.extend(clip1_frames)
for previous_clip, next_clip, clip_name in (
    (clip1_frames, clip2_frames, "clip 2"),
    (clip2_frames, clip3_frames, "clip 3"),
):
    if previous_clip and next_clip and frames_are_nearly_identical(previous_clip[-1], next_clip[0]):
        print(f"  Skipping duplicate first frame of {clip_name}")
        hero_sources.extend(next_clip[1:])
    else:
        hero_sources.extend(next_clip)

total_hero = len(hero_sources)
print(f"  Hero total: {total_hero} frames")

# ════════════════════════════════════════════════════════════════════════════
# STEP 2 — Convert hero frames
# ════════════════════════════════════════════════════════════════════════════
print("\nConverting hero frames …")
for i, src in enumerate(hero_sources, start=1):
    dest_name = f"frame_{i:04d}.webp"
    img = Image.open(src)
    # Desktop 1600px q78
    convert_and_save(img, OUT["hero"] / dest_name, 1600, 78)
    # Mobile 960px q72
    convert_and_save(img, OUT["hero_mobile"] / dest_name, 960, 72)
    img.close()
    if i % 50 == 0 or i == total_hero:
        print(f"  Hero: {i}/{total_hero}")

# ════════════════════════════════════════════════════════════════════════════
# STEP 3 — Convert dismantle frames
# ════════════════════════════════════════════════════════════════════════════
print("\nConverting dismantle frames …")
dismantle_sources = list_frames(FLOW_DIR)
total_dismantle = len(dismantle_sources)
print(f"  Dismantle: {total_dismantle} frames")

for i, src in enumerate(dismantle_sources, start=1):
    dest_name = f"frame_{i:04d}.webp"
    img = Image.open(src)
    convert_and_save(img, OUT["dismantle"] / dest_name, 1600, 78)
    convert_and_save(img, OUT["dismantle_mobile"] / dest_name, 960, 72)
    img.close()
    if i % 50 == 0 or i == total_dismantle:
        print(f"  Dismantle: {i}/{total_dismantle}")

# ════════════════════════════════════════════════════════════════════════════
# STEP 4 — Report sizes
# ════════════════════════════════════════════════════════════════════════════
print("\n── Output Summary ────────────────────────────────────")
for key, path in OUT.items():
    files = list(path.glob("*.webp"))
    total_bytes = sum(f.stat().st_size for f in files)
    print(f"  {key:20s}: {len(files):4d} frames, {total_bytes/1024/1024:.1f} MB  → {path}")

print(f"\nHERO_FRAME_COUNT   = {total_hero}")
print(f"DISMANTLE_FRAME_COUNT = {total_dismantle}")
print("\nDone.")
