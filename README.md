# NOCTIS — Drive the Night

Premium single-page scrollytelling website for **NOCTIS**, a fictional electric
motorcycle and performance e-bike brand.

## Project Structure

```
bike project/
├── index.html          # Page structure + preloader + all 5 sections
├── styles.css          # Design tokens, layout, animations, responsive
├── main.js             # ES module: loaders, animation loop, cursors, nav
├── config.js           # All tunables: frame counts, paths, heights, specs
├── convert_frames.py   # Frame regeneration script (requires Pillow)
├── assets/
│   ├── frames/
│   │   ├── hero/               # 622 desktop frames (1600px, q78)
│   │   ├── hero-mobile/        # 622 mobile frames (960px, q72)
│   │   ├── dismantle/          # 208 desktop frames
│   │   └── dismantle-mobile/   # 208 mobile frames
│   └── bikes/                  # NOCTIS lineup product images
├── bike image.png              # Meteor 350 visual reference for the interactive view
└── README.md
```

The Meteor 350 engineering showcase is added as its own section, separate from
the NOCTIS scrollytelling sequence. It reuses `bike image.png` and animates
clipped component layers with pointer hover, touch drag, and an accessible
exploded-view toggle. The source image is not sharpened or modified.

The NOCTIS hero sequence responds to scrolling and horizontal pointer movement.
When reduced motion is enabled, it uses static story panels by default, while
the first hero image can still be explored by moving the pointer across it.
The loader remains visible during initial frame loading, and the custom cursor
follows directly without easing in reduced-motion mode.

## Run the Website

This is a static site using ES modules. It **must be served over HTTP** — it will
not work via `file://` because `main.js` uses `import` syntax.

### Option A — Python (built-in)

```cmd
python -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

### Option B — VS Code Live Server

1. Install the **Live Server** extension (if not already installed).
2. Open the `bike project` folder in VS Code.
3. Right-click `index.html` → **Open with Live Server**.
4. The site opens at `http://127.0.0.1:5500`.

## Regenerate Animation Frames

The frames are JPG/PNG source files in clip folders. Use the conversion script:

```cmd
python convert_frames.py
```

Requirements: `pip install Pillow`

The script:
- Joins clip1 + clip2 + clip3 into one continuous 622-frame hero sequence
- Compares boundary frames and skips the first frame of a clip only when it is nearly identical to the previous clip's last frame
- Converts to WebP at the resolutions in `config.js`
- Outputs to `assets/frames/hero/`, `hero-mobile/`, `dismantle/`, `dismantle-mobile/`
- Validates frame counts against `config.js`
- Never deletes or modifies original source frames

Current conversion output:

| Output folder | Frames | Total size |
|---|---:|---:|
| `assets/frames/hero/` | 622 | 14.00 MiB |
| `assets/frames/hero-mobile/` | 622 | 6.40 MiB |
| `assets/frames/dismantle/` | 208 | 11.54 MiB |
| `assets/frames/dismantle-mobile/` | 208 | 5.52 MiB |

## Configuration

All tuneable values live in `config.js`:

- `HERO_FRAME_COUNT` — 622 hero frames
- `DISMANTLE_FRAME_COUNT` — 208 dismantle frames
- `HERO_FRAMES_DESKTOP` / `HERO_FRAMES_MOBILE` / `DISMANTLE_FRAMES_DESKTOP` / `DISMANTLE_FRAMES_MOBILE` — frame paths
- `HERO_HEIGHT_VH` / `DISMANTLE_HEIGHT_VH` — pinned section heights
- Section 1 chapter ranges and HUD values
- Section 3 callout positions (percentage coords)
- Lineup model copy, specs, colours, and temporary placeholder image path

## Production Notes

- The lineup temporarily reuses the first dismantle frame because matching NOCTIS product images have not yet been generated.
- Final product photos belong in `assets/bikes/` as WebP (1600px wide, 16:9).
- All animation frames live in `assets/frames/` as WebP
- Original source videos and JPG/PNG frames are preserved untouched
- The site uses Google Fonts (Archivo, Inter, JetBrains Mono) — no build step
- No frameworks, no npm packages, no libraries
- Reservation submission is intentionally disabled until a JSON booking endpoint is configured in the reservation form's `data-endpoint` attribute in `index.html`. The endpoint must be HTTPS (HTTP is allowed for localhost development) and accept a `POST` request with the form fields as JSON.

## Design Tokens

| Token | Value |
|---|---|
| `--asphalt` | `#07080A` |
| `--graphite` | `#121418` |
| `--fog` | `#8A8F98` |
| `--bone` | `#EDEAE4` |
| `--xenon` | `#CFE3FF` |
| `--taillight` | `#E1251B` |
| `--hairline` | `rgba(237,234,228,0.12)` |

## Font Stack

| Role | Font | Weights | Notes |
|---|---|---|---|
| Display | Archivo variable | 300/400, stretch 125% | uppercase, 0.02em tracking |
| Body | Inter | 400 | 15–17px, 1.6 line-height |
| HUD | JetBrains Mono | 400 | 11–12px, uppercase, 0.12em tracking |
