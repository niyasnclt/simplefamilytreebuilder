# Family Tree Maker

Build family trees with photos and export them as PNG or PDF. It's a static web app —
no account, no server, no upload. Trees and photos are saved in your browser and stay
on your device.

**≈136 KB, zero dependencies, no build step.** Works offline once loaded.

## Run it locally

```bash
npm start
```

Then open **http://localhost:4180**.

`server.js` is just a static file server — the app has no backend. It exists because ES
modules and service workers need a real origin, so opening `index.html` from the file
system won't work. Change the port with `PORT=5000 npm start`.

## Put it online

The whole site is the `public/` folder. Upload it anywhere that serves static files.

| Host | What to do |
|---|---|
| **GitHub Pages** | Push to `main`. `.github/workflows/pages.yml` publishes `public/` automatically — enable it once under **Settings → Pages → Source: GitHub Actions**. |
| **Netlify** | Connect the repo. `netlify.toml` already sets `publish = "public"` with no build command. |
| **Cloudflare Pages** | Connect the repo, build command empty, output directory `public`. |
| **Any web host** | Copy the contents of `public/` to the web root. |

Everything uses relative paths, so it works from a subdirectory (like
`username.github.io/repo/`) as well as a domain root.

## Where your data lives

In this browser, in IndexedDB — trees as JSON, photos as image blobs. Nothing is sent
anywhere; there's nothing to send it to. The library screen shows how much space you're
using.

That has one consequence worth understanding: **clearing your browser's site data
deletes your trees.** A different browser, a different machine, or a private window each
have their own separate library.

So back up:

- **Backup** downloads every tree and every photo as one JSON file.
- **Restore** reads that file back, either merging or replacing.
- **JSON** on a library card exports a single tree with its photos embedded, and
  **Import JSON** brings one in. Good for moving one tree between machines.

The app also asks the browser for persistent storage on first load, which stops routine
cache cleanups from evicting your data.

## Building a tree

**Fastest way in — paste an outline.** On the library screen choose **New from outline**
and type the family as indented text:

```
ARTHUR HOLLOWAY (Late) + ELEANOR HOLLOWAY (Late)
  JAMES HOLLOWAY + MARGARET REID
    DANIEL HOLLOWAY + SOPHIE LANG
      OLIVER HOLLOWAY
      AMELIA HOLLOWAY
  ROSE HOLLOWAY + HENRY CARTER
    GEORGE CARTER
```

- **Indent** one level per generation
- **` + `** adds a spouse
- **`(…)`** after a name becomes a small note, e.g. `(Late)`

Get the whole structure in first, then add photos by clicking each portrait. The
**Outline** button reopens this view at any time; re-applying it keeps photos attached to
anyone whose name still matches.

**Editing directly.** Click a portrait on the canvas or a row in the left list to select
someone. The right panel edits their name, note, photo, spouse and children.
`Enter` adds a child, `Tab` adds a sibling, `⌘S` forces a save. Everything autosaves
about a second after you stop typing.

**The sample tree.** A first visit is seeded with the Holloway family so there's
something to look at — generic names and generated placeholder portraits, not real
people. Delete it whenever you like; it won't come back.

## How the layout works

Generations run left to right:

- A person and their spouse are drawn as a pair of portraits.
- Children who have descendants of their own **continue to the right**.
- Children who don't **hang in a row below** their parents.

Two arrangements under **Design → Arrangement**:

| | |
|---|---|
| **Flow** (default) | Each branch of the family gets its own horizontal band, and descendants chain rightward within it. Compact and landscape. Set how many columns a band uses before wrapping. |
| **Generations** | One column per generation, strictly, with siblings stacked. Taller and narrower, but every column is exactly one generation. |

Names are wrapped and, if a single name is too long for its slot, shrunk slightly — so
labels never collide no matter what you type.

## Templates

Six looks, switchable at any time from the toolbar without touching your data:

- **Heritage** — cream paper, leaf watermark, vertical side title
- **Ivory Classic** — warm ivory, serif type, gold rings, framed border
- **Pure Minimal** — white, hairline connectors, no ornament; cleanest for print
- **Midnight** — dark charcoal-blue with luminous rings
- **Sage Botanical** — soft green, botanical fronds, rounded-square portraits
- **Rosewood** — blush paper with deep rose accents

Each supports an optional logo (**Design → Logo**) and a title/subtitle from the toolbar.

## Exporting

**Export** offers PNG or PDF at 1×–4×.

- **2×** is right for normal printing, **3–4×** for large wall prints.
- PDF page size can be **fit to tree** (page sized exactly to the artwork — best for
  print shops) or A4/A3/A2 in either orientation, centred with a margin.
- Photos are embedded in the file, so exports are self-contained.

Very large trees at 4× can exceed the browser's maximum canvas size; the app scales down
just enough to fit and tells you when it did.

## Layout of the code

```
server.js            static file server for local preview only
public/              this folder is the entire deployable site
  index.html         library + editor shell
  app.js             all UI: library, outline editor, inspector, modals, export dialog
  store.js           IndexedDB storage for trees and photos, plus backup/restore
  demo.js            the seeded sample tree and its generated placeholder portraits
  layout.js          positions every portrait and connector (both arrangements)
  render.js          turns a layout into SVG
  templates.js       the six templates: colours, fonts, watermarks, title treatments
  text.js            measured per-character font widths, shared by layout and render
  exporter.js        SVG → canvas → PNG, and a small built-in PDF writer
  outline.js         indented-text ↔ tree parser
  sw.js              service worker; caches the shell so the app runs offline
```

No build step — the browser loads the ES modules directly, so you can edit any file and
just reload.

**When you change a file in `public/`, bump `CACHE` in `sw.js`.** Otherwise returning
visitors keep the old cached shell.
