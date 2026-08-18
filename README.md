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
ARTHUR HOLLOWAY (Late) [1918] + ELEANOR HOLLOWAY (Late) [1921]
  JAMES HOLLOWAY [1944] + MARGARET REID [1947]
    DANIEL HOLLOWAY [1971] + SOPHIE LANG [1973]
      OLIVER HOLLOWAY [1999]
      AMELIA HOLLOWAY [2002]
  ROSE HOLLOWAY [1948] + HENRY CARTER [1945]
    GEORGE CARTER [1979]
```

- **Indent** one level per generation
- **` + `** adds a spouse — repeat it for more than one, e.g. `ABDUL + FATIMA + RUQIYA`
- **` & `** at the end of a child's line names their other parent, e.g. `OLIVER [1999] & FATIMA`
- **`(…)`** after a name becomes a small note, e.g. `(Late)`
- **`[…]`** after a name is a birth year, e.g. `[1948]` — used to order branches by age

Get the whole structure in first, then add photos by clicking each portrait. The
**Outline** button reopens this view at any time; re-applying it keeps photos attached to
anyone whose name still matches.

**Editing directly.** Click a portrait on the canvas or a row in the left list to select
someone. The right panel edits their name, note, photo, spouses and children. **+ Add
spouse** can be used more than once; the arrows beside each spouse set the order they
appear in.

**Children of a particular marriage.** Once someone has two or more spouses, the
structure list splits their children into a group per marriage, each with its own **＋**.
The **+ Child** button inside a Spouse section adds against that marriage; the plain
**+ Child** under Family adds a child not tied to one. To move a child between marriages,
select them and use **Child of → Which marriage**, or drag their row onto another
marriage's heading. Removing a spouse leaves their children in place, untied.
`Enter` adds a child, `Tab` adds a sibling, `⌘S` forces a save. Everything autosaves
about a second after you stop typing.

## Framing a photo

Portraits are drawn in a circle (or a rounded square, depending on the template), so a
photo has to be cropped to fit. **Adjust framing** under any photo opens a preview of
exactly what will print — drag to move it, scroll or use the slider to zoom.

At 100% the photo is scaled to just cover the frame, which is the tightest crop that
leaves no gaps. Zooming in past that crops harder; **zooming out below 100% pulls the
photo away from the edges**, and the gap prints as plain paper in the template's colour.
That's the way to keep a wide group shot or a full-length portrait whole instead of
cutting it down to a head.

**Whole photo** jumps straight to the point where nothing is cropped at all — 67% for a
3:2 photo, less for a panorama. The slider bottoms out at 25%. Panning is only offered
while there's something hidden to slide into view; once the photo fits, it stays centred.

## Ordering branches

Siblings are drawn in the order they appear in the left-hand list — top of the list is
the first branch on the sheet. There are two ways to set that order.

**By age.** Give people a birth year in the **Born** field on the right (a bare year like
`1948` is enough; `1948-03-12` sorts more precisely). Then **Structure → Order** and pick
**Eldest first** or **Youngest first**: every group of siblings, at every level, is
sorted by birth year and stays sorted as you edit. Anyone with no year yet holds their
current place, after the dated siblings — a blank year never shuffles a branch to the top.

**By hand.** With **Manual** order, drag any row in the structure list:

- drop on the **upper or lower edge** of a row to sit before or after it
- drop in the **middle** of a row to move in under it as a child

`↑` and `↓` on a row (or in the right-hand panel) nudge one step. Moving anyone by hand
switches the tree back to Manual, so a by-hand arrangement is never overwritten.

Selecting a parent with more than one child also gives an **Order these children** pair
of buttons, for sorting one group by age without committing the whole tree to it.

**The sample tree.** A first visit is seeded with the Holloway family so there's
something to look at — generic names and generated placeholder portraits, not real
people. Delete it whenever you like; it won't come back.

## How the layout works

Generations run left to right:

- A person and their spouses are drawn as a row of portraits, joined by a marriage line.
- With several marriages, each one's children hang in their own block below, connected
  back to that marriage's line.
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
  order.js           birth-year parsing and sibling ordering (eldest / youngest first)
  sw.js              service worker; caches the shell so the app runs offline
```

No build step — the browser loads the ES modules directly, so you can edit any file and
just reload.

**When you change a file in `public/`, bump `CACHE` in `sw.js`.** Otherwise returning
visitors keep the old cached shell.
