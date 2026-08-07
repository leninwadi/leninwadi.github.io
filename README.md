# Photography portfolio

A single continuous gallery that builds itself from whatever is in the `photos/`
folder. Add an image, push, and it appears on the site — no HTML editing.

---

## One-time setup

**1. Create the repository.**
Name it `yourusername.github.io` to publish at `https://yourusername.github.io`.
Any other name works too and publishes at `https://yourusername.github.io/repo-name`.

**2. Push these files to the `main` branch.**

```bash
git init
git add .
git commit -m "Set up portfolio"
git branch -M main
git remote add origin https://github.com/yourusername/yourusername.github.io.git
git push -u origin main
```

**3. Turn on Pages.**
In the repository, go to **Settings → Pages**, and under *Source* choose
**GitHub Actions**. This step is easy to miss — the default is "Deploy from a
branch", which will not work here, because the site is generated during the build.

**4. Edit `config.json`** with your name, contact details, and links.

That's it. Every push to `main` rebuilds and republishes in about a minute.
Progress is visible under the **Actions** tab.

---

## Adding photographs

Drop image files into `photos/` and push:

```bash
cp ~/exports/*.jpg photos/
git add photos && git commit -m "Add new frames" && git push
```

JPEG, PNG, WebP, and TIFF all work. On each build the site:

- reads dimensions and rotates by the EXIF orientation flag, so phone photos land the right way up
- generates a 2560px display copy and a 1400px thumbnail, both WebP
- pulls camera, lens, focal length, aperture, shutter, ISO, and capture date from EXIF
- lays everything out in justified rows and numbers the frames

**Export originals at around 2500px on the long edge.** The build makes its own
web copies, so full-resolution files only inflate the repository — and Git
handles large binaries poorly. GitHub warns above 1 GB and rejects any single
file over 100 MB.

### Captions

Put a text file next to a photo with the same name:

```
photos/harbour_dawn.jpg
photos/harbour_dawn.txt     ← "Low tide, second morning"
```

The caption shows in the viewer and becomes the image's alt text.

### Ordering

`config.json` takes a `sort` value:

| Value | Behaviour |
|---|---|
| `date-desc` | Newest capture date first (default) |
| `date-asc` | Oldest first |
| `filename` | Alphabetical — prefix files `01_`, `02_` to sequence them by hand |

Photos with no EXIF date fall back to filename order, so if you're working with
scans or stripped files, use `filename` and number them yourself.

### The opening photograph

The site opens on one photograph filling the screen, with your name over it.

| Key | Purpose |
|---|---|
| `hero` | `false` reverts to the earlier layout — name on paper, photo below |
| `hero_frame` | Filename without extension, e.g. `"harbour_dawn"`. Blank picks whichever sorts first |
| `site_url` | Your full address. Needed so shared links preview with your photograph |

### The About section

Fill any of these in `config.json` and the section appears; leave them all empty
and it disappears entirely.

| Key | Purpose |
|---|---|
| `statement` | Two or three sentences. Blank line between paragraphs |
| `available_for` | List of commission types |
| `clients` | List of publications or clients. Leave `[]` if you'd rather not |
| `portrait` | Filename of an image in the `about/` folder |

### Other settings

| Key | Purpose |
|---|---|
| `show_exif` | Set `false` to hide all camera data |
| `row_height` | Target row height in pixels — lower means more photos per row |
| `thumb_size` / `full_size` | Long-edge pixel limits for the generated copies |

---

## When photos don't appear

The build log says exactly what happened. Go to the **Actions** tab, click the
newest run, click **build**, and open the **Build gallery** step. The first line
reads `Found N image(s) in photos/`.

| What the log says | What to do |
|---|---|
| `Found 0 image(s)` | The files aren't in `photos/`. Check GitHub's own **Code** tab — if you can't see them there, they were never pushed. |
| `Ignored N camera RAW file(s)` | RAW can't be read directly. Export JPEGs and add those. |
| `Ignored N unrecognised file(s)` | Anything not JPEG, PNG, WebP, TIFF, or HEIC is skipped. |
| `N file(s) failed to open` | Those files are corrupt or truncated. Re-export them. |
| Log looks fine, site looks stale | Hard-refresh with **Ctrl + Shift + R**. |

Sub-folders inside `photos/` are scanned too, so dragging a whole camera folder
in works. Spaces and duplicate filenames are handled automatically.

## Previewing locally

```bash
pip install Pillow pillow-heif
python scripts/build_gallery.py
python -m http.server -d _site 8000
```

Then open `http://localhost:8000`. Open `_site` directly with `file://` and the
gallery will stay empty — the browser blocks the `photos.json` fetch.

`_site/` is generated and gitignored; nothing in it needs committing.

---

## Custom domain

Add a file named `CNAME` in `src/`, containing just your domain (e.g.
`stills.example.com`), then add `shutil.copy(SRC / "CNAME", OUT / "CNAME")` next
to the other asset copies in `scripts/build_gallery.py`. Point a CNAME DNS
record at `yourusername.github.io`, then set the domain under **Settings → Pages**.

---

## Layout notes

- **Justified rows.** Each row is scaled to a shared height so it fills the full
  measure exactly, the way a picture editor sets a spread. The final row keeps
  its natural height rather than stretching to fit.
- **Frame numbers.** The gallery is one continuous roll, so each photo carries
  its index, contact-sheet style. Hover to see it; it stays visible on mobile.
- **The viewer** takes arrow keys, Escape, swipes, and clicks outside the image.
  Neighbouring photos preload so arrowing through is instant.
