#!/usr/bin/env python3
"""
Scans photos/ and builds the site into _site/.

For each image it writes a display-size and a thumbnail-size WebP, reads
dimensions and EXIF, and emits _site/photos.json for the front end.

Run locally with:  python scripts/build_gallery.py
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

try:  # iPhones shoot HEIC by default; Pillow needs a plug-in to read it.
    import pillow_heif

    pillow_heif.register_heif_opener()
    HEIC_OK = True
except ImportError:
    HEIC_OK = False

ROOT = Path(__file__).resolve().parent.parent
PHOTOS_IN = ROOT / "photos"
SRC = ROOT / "src"
OUT = ROOT / "_site"

SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic", ".heif"}

# Camera RAW needs a full decoder; flagged by name so the log can say so.
RAW_SUFFIXES = {".cr2", ".cr3", ".nef", ".arw", ".dng", ".raf", ".orf", ".rw2", ".pef"}

# EXIF tag numbers we care about.
TAG_MAKE, TAG_MODEL = 0x010F, 0x0110
TAG_EXIF_IFD = 0x8769
TAG_EXPOSURE, TAG_FNUMBER = 0x829A, 0x829D
TAG_ISO, TAG_DATE = 0x8827, 0x9003
TAG_FOCAL, TAG_LENS = 0x920A, 0xA434


def load_config() -> dict:
    defaults = {
        "name": "Your Name",
        "tagline": "Selected work",
        "location": "",
        "email": "",
        "links": [],
        "footer": "",
        "sort": "date-desc",
        "show_exif": True,
        "row_height": 360,
        "thumb_size": 1400,
        "full_size": 2560,
    }
    path = ROOT / "config.json"
    if path.exists():
        defaults.update(json.loads(path.read_text(encoding="utf-8")))
    return defaults


def clean(value) -> str:
    """EXIF strings arrive padded, null-terminated, or as bytes."""
    if value is None:
        return ""
    if isinstance(value, bytes):
        value = value.decode("utf-8", "ignore")
    return str(value).replace("\x00", "").strip()


def fmt_shutter(value) -> str:
    try:
        seconds = float(value)
    except (TypeError, ValueError):
        return ""
    if seconds <= 0:
        return ""
    if seconds >= 1:
        return f"{seconds:g}s"
    return f"1/{round(1 / seconds)}s"


def read_exif(img: Image.Image) -> dict:
    out = {}
    try:
        exif = img.getexif()
    except Exception:
        return out
    if not exif:
        return out

    make, model = clean(exif.get(TAG_MAKE)), clean(exif.get(TAG_MODEL))
    # Camera models usually repeat the maker ("NIKON" / "NIKON Z 6").
    if model and make and model.upper().startswith(make.split()[0].upper()):
        out["camera"] = model
    else:
        out["camera"] = " ".join(p for p in (make, model) if p)

    try:
        sub = exif.get_ifd(TAG_EXIF_IFD)
    except Exception:
        sub = {}

    if lens := clean(sub.get(TAG_LENS)):
        out["lens"] = lens
    if focal := sub.get(TAG_FOCAL):
        try:
            out["focal"] = f"{float(focal):g}mm"
        except (TypeError, ValueError):
            pass
    if fnum := sub.get(TAG_FNUMBER):
        try:
            out["aperture"] = f"f/{float(fnum):g}"
        except (TypeError, ValueError):
            pass
    if shutter := fmt_shutter(sub.get(TAG_EXPOSURE)):
        out["shutter"] = shutter
    if iso := sub.get(TAG_ISO):
        iso = iso[0] if isinstance(iso, (tuple, list)) and iso else iso
        try:
            out["iso"] = f"ISO {int(iso)}"
        except (TypeError, ValueError):
            pass
    if raw_date := clean(sub.get(TAG_DATE)):
        # "2026:03:12 08:41:20"
        out["date"] = raw_date.split(" ")[0].replace(":", "-")

    return {k: v for k, v in out.items() if v}


def resize(img: Image.Image, longest: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= longest:
        return img.copy()
    scale = longest / max(w, h)
    return img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)


def safe_name(path: Path, taken: set[str]) -> str:
    """A URL-safe stem that stays unique across sub-folders and odd characters."""
    rel = path.relative_to(PHOTOS_IN).with_suffix("")
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", "-".join(rel.parts)).strip("-.") or "frame"
    candidate, n = slug, 2
    while candidate.lower() in taken:
        candidate = f"{slug}-{n}"
        n += 1
    taken.add(candidate.lower())
    return candidate


def process(path: Path, cfg: dict, taken: set[str]) -> dict | None:
    try:
        with Image.open(path) as raw:
            img = ImageOps.exif_transpose(raw)
            exif = read_exif(raw)
            if img.mode not in ("RGB", "L"):
                img = img.convert("RGB")

            stem = safe_name(path, taken)
            full_name = thumb_name = f"{stem}.webp"

            resize(img, cfg["full_size"]).save(
                OUT / "photos" / full_name, "WEBP", quality=86, method=5
            )
            resize(img, cfg["thumb_size"]).save(
                OUT / "thumbs" / thumb_name, "WEBP", quality=80, method=5
            )
            width, height = img.size
    except Exception as exc:  # a corrupt file shouldn't kill the whole build
        print(f"  ! skipped {path.name}: {exc}", file=sys.stderr)
        return None

    # An optional sidecar file lets you caption a photo without leaving the folder.
    caption = ""
    sidecar = path.with_suffix(".txt")
    if sidecar.exists():
        caption = sidecar.read_text(encoding="utf-8").strip()

    print(f"  · {path.name}  {width}x{height}")
    return {
        "src": f"photos/{full_name}",
        "thumb": f"thumbs/{thumb_name}",
        "w": width,
        "h": height,
        "name": path.stem,
        "caption": caption,
        "exif": exif if cfg["show_exif"] else {},
    }


def sort_photos(photos: list[dict], mode: str) -> list[dict]:
    if mode == "filename":
        return sorted(photos, key=lambda p: p["name"].lower())
    reverse = mode != "date-asc"
    # Photos with no capture date fall back to filename, kept together at the end.
    return sorted(
        photos,
        key=lambda p: (p["exif"].get("date", ""), p["name"].lower()),
        reverse=reverse,
    )


def main() -> int:
    cfg = load_config()

    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "photos").mkdir(parents=True)
    (OUT / "thumbs").mkdir(parents=True)

    PHOTOS_IN.mkdir(exist_ok=True)
    everything = [p for p in PHOTOS_IN.rglob("*") if p.is_file() and not p.name.startswith(".")]
    files = sorted(p for p in everything if p.suffix.lower() in SUFFIXES)
    raw = [p for p in everything if p.suffix.lower() in RAW_SUFFIXES]
    other = [p for p in everything
             if p.suffix.lower() not in SUFFIXES | RAW_SUFFIXES | {".txt"}]

    print(f"Found {len(files)} image(s) in photos/")

    if raw:
        print(f"\n!! Ignored {len(raw)} camera RAW file(s) — these can't be read directly.")
        print("   Export them as JPEG and add those instead. Example:")
        for p in raw[:4]:
            print(f"     {p.relative_to(PHOTOS_IN)}")
    if other:
        kinds = sorted({p.suffix.lower() or "(no extension)" for p in other})
        print(f"\n!! Ignored {len(other)} unrecognised file(s): {', '.join(kinds)}")
    if any(p.suffix.lower() in {".heic", ".heif"} for p in files) and not HEIC_OK:
        print("\n!! HEIC files found but pillow-heif isn't installed — they will fail below.")
    if not files:
        print("\n   Nothing to build. Check that image files really are inside photos/.")

    taken: set[str] = set()
    photos = [p for p in (process(f, cfg, taken) for f in files) if p]

    skipped = len(files) - len(photos)
    if skipped:
        print(f"\n!! {skipped} file(s) failed to open — see the errors above.")
    photos = sort_photos(photos, cfg["sort"])
    for i, photo in enumerate(photos, 1):
        photo["frame"] = f"{i:02d}"

    (OUT / "photos.json").write_text(
        json.dumps(
            {
                "site": {k: cfg[k] for k in ("name", "tagline", "location", "email", "links", "footer")},
                "rowHeight": cfg["row_height"],
                "photos": photos,
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    # Copy the front end, substituting the few values that belong in the markup.
    html = (SRC / "index.html").read_text(encoding="utf-8")
    for key in ("name", "tagline"):
        html = html.replace("{{" + key + "}}", str(cfg[key]))
    (OUT / "index.html").write_text(html, encoding="utf-8")
    for asset in ("style.css", "app.js"):
        shutil.copy(SRC / asset, OUT / asset)
    (OUT / ".nojekyll").touch()

    print(f"Built {len(photos)} frame(s) into _site/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
