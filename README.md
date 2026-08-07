# Family Tree Maker

A local app for building family trees with photos and exporting them as PNG or PDF.
Runs entirely on your machine — no login, no cloud, no limits on how many trees you make.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:4180**.

(Port 3000 was already in use on this machine, so 4180 is the default. Change it with
`PORT=5000 npm start`.)

## Where your data lives

```
data/
├── trees/          one .json file per tree — this is your data, back it up
│   ├── <id>.json
│   └── …
└── photos/         uploaded photos, named by content hash
```

Everything is plain files. Copy `data/` to back up all 40 trees, or drop it on another
machine and they're all there. The same face uploaded to several trees is stored once.

## Building a tree

**Fastest way in — paste an outline.** On the library screen choose **New from outline**
and type the family as indented text:

```
MUHAMMED SHAH (Late) + KADEESHABI (Late)
  SULEIKHA + ALAVI (Late)
    SALEEM + SAMEENA
      SAGIL RAHMAN + SHERIN
      SALIH RAHMAN
    SAHIRA + FAISAL
      FARSHID
  ABU (Late) + NARGIS
    ABDUL RAHOOF + LAYLA
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

## How the layout works

Generations run left to right, exactly like the reference artwork:

- A person and their spouse are drawn as a pair of portraits.
- Children who have descendants of their own **continue to the right**.
- Children who don't **hang in a row below** their parents.

Two arrangements under **Design → Arrangement**:

| | |
|---|---|
| **Flow** (default) | Each branch of the family gets its own horizontal band, and descendants chain rightward within it. Compact and landscape — matches the reference. Set how many columns a band uses before wrapping. |
| **Generations** | One column per generation, strictly, with siblings stacked. Taller and narrower, but every column is exactly one generation. |

Names are wrapped and, if a single name is too long for its slot, shrunk slightly — so
labels never collide no matter what you type.

## Templates

Six looks, switchable at any time from the toolbar without touching your data:

- **Heritage** — cream paper, leaf watermark, vertical side title (the reference look)
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

## Managing 40 trees

- **Duplicate** on a library card copies a whole tree — handy for related families that
  share an upper structure.
- **JSON** downloads a single tree; **Import JSON** brings one back. Good for moving a
  tree between machines.
- The search box filters by name.

## Layout of the code

```
server.js            Express API + static hosting; reads and writes data/
sample.js            the seed tree, transcribed from the reference PDF
public/
  index.html         library + editor shell
  app.js             all UI: library, outline editor, inspector, modals, export dialog
  layout.js          positions every portrait and connector (both arrangements)
  render.js          turns a layout into SVG
  templates.js       the six templates: colours, fonts, watermarks, title treatments
  text.js            measured per-character font widths, shared by layout and render
  exporter.js        SVG → canvas → PNG, and a small built-in PDF writer
  outline.js         indented-text ↔ tree parser, shared by server and browser
```

There is no build step — the browser loads the ES modules directly, so you can edit any
file and just reload.
