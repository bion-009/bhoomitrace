# BhoomiTrace — Phase 1

Non-government, session-only land-record analysis tool for Uttarakhand.
**Phase 1 scope: Steps 1–4 only** — Upload Khatoni → Extraction → Extracted
plot listing → Ansh (share) calculation. Steps 5–12 (Bhu-Naksha upload, map
matching, final report, Google Map, print) are Phase 2.

No values in this codebase are hard-coded. Everything shown in the UI comes
from whatever the user uploads in their own browser tab.

---

## 1. What was learned from the real sample documents

Two real Bhulekh documents (a Khata Vivaran / Khatoni PDF and an eBhunaksha
PDF) were studied — **only their structure**, not their land values — before
writing the parser. Two findings shaped the architecture directly:

### Finding 1 — PDF.js returns text in paint order, not reading order
For these Khatoni PDFs, `getTextContent()` yields every "column 1" cell for
the whole page first, then every year-column cell, then every khasra number,
then every area — not row by row. Joining `item.str` in stream order
destroys all row/column correspondence.

**Fix:** every text item carries a transform matrix giving its x/y position.
`js/pdfTextExtractor.js` clusters items into rows by y-position, sorts each
row by x-position, then clusters x-starts across the whole page into column
bands (gap-based clustering). The table is rebuilt geometrically, not by
trusting the order PDF.js hands text back in.

### Finding 2 — a present text layer can still be unusable
The Khatoni PDF's embedded text layer exists, but is generated with a
Devanagari font whose Unicode mapping drops leading consonants and
half-forms (e.g. "पिता पति संरक्षक" extracts as " ता प संरक"). The rendered
page image is perfectly legible; the copy-pasted text is not. A simple
"does a text layer exist?" check would wrongly trust this corrupted text.

**Fix:** `js/textIntegrityChecker.js` scores extracted text against a list
of words that should appear on every Khatoni page (ग्राम, तहसील, खसरा,
क्षेत्रफल, etc.) and checks for vowel-signs with no consonant before them
(a signature of a dropped syllable). If the text layer is corrupted, the
page is re-processed as an image through Tesseract.js OCR instead — even
though PDF.js technically found a text layer.

### Finding 3 — real share/Ansh notation is not simple fractions
The sample Khatoni almost never carries a clean "1/4" ownership fraction.
What appears embedded in the name/father column is a mix of:
- traditional hill land-measure units — "2-1/2मु", "2ना 10मु"
  (नाली/मुट्ठी — the नाली→मुट्ठी ratio is settlement-specific, so it is
  **not** hard-coded or auto-converted);
- a bare hectare figure stuck onto the name/father text ("0.201हे.") whose
  relationship to the row's own area column is not self-evident;
- derivative-right phrases with no number at all — "के हक से" (through the
  right of), "जरीये वसीयत" (via a will), "जरीये विक्रयपत्र" (via a sale
  deed).

`js/shareParser.js` classifies each of these separately and only ever
returns a computable Ansh when an explicit fraction is tied to a share word
(हिस्सा/अंश/भाग). Everything else is stored as raw text with a
`NEEDS_VERIFICATION` or `NOT_DETERMINABLE` status — never guessed, never
divided equally among multiple owners.

---

## 2. Architecture

```
index.html                 UI shell, step indicator, tables
css/style.css               styling
js/documentLoader.js        file validation (type, size ≤5MB)
js/pdfTextExtractor.js      PDF.js load + position-based row/column rebuild
js/textIntegrityChecker.js  Devanagari text-layer corruption scoring
js/ocrProcessor.js          Tesseract.js OCR (page-render or image file)
js/khatoniHeaderParser.js   ग्राम/परगना/तहसील/जनपद/फसली वर्ष/भाग/खाता संख्या
js/shareParser.js           share/Ansh text classification (see Finding 3)
js/ownerIdentityResolver.js composite identity key (never name-only)
js/khatoniTableParser.js    rows → Khata/Plot/Holder records, श्रेणी + योग handling
js/revenueCalculator.js     conservative Ansh Area calculation + holder summary
js/app.js                   orchestrates the pipeline and renders the tables
```

Everything runs in the browser. No backend, no upload to any server —
this satisfies the "no permanent storage" privacy requirement by
construction, and works as-is on GitHub Pages.

### Why no backend (yet)
PDF.js and Tesseract.js both run entirely client-side and were sufficient
for real-sample text/table extraction and OCR fallback in this phase. A
backend would only become necessary for materially better table detection
(e.g. a trained layout model) — see Limitations below. If that is ever
needed, the contract would be: `POST /extract` with the PDF/image bytes,
returning the same `KhatoniDocument` JSON shape already used internally by
`app.js`, so the frontend would not need to change.

---

## 3. Ansh (share) calculation — exact rule

For a plot row:
- If the share text matches an explicit fraction tied to a share word
  (e.g. "1/4 हिस्सा") → `Ansh Area = Plot Area × (numerator/denominator)`,
  status **Calculated**.
- If it matches a traditional unit (नाली/मुट्ठी/पैसा) or an embedded
  hectare figure with no share word → status **Needs Verification**, no
  number is computed.
- If it matches a derivative-right phrase (के हक से / जरीये वसीयत / जरीये
  विक्रयपत्र / कुल … हक में) → status **Not Determinable**.
- If several owners share a plot/Khata with no explicit fraction at all →
  status **Not Determinable** for all of them. The app never divides area
  equally among co-owners.

---

## 4. Privacy

Files are read with the browser's File API and processed entirely in
memory (PDF.js, Tesseract.js, all parsing) inside the current tab. Nothing
is written to disk, sent to a server, or persisted between sessions.
Reloading or closing the tab clears everything.

---

## 5. Known limitations (Phase 1)

- **OCR fallback loses column structure.** When a page's text layer is
  corrupted and OCR takes over, `app.js` currently outputs OCR'd pages as
  raw text per line (shown under "OCR कच्चा पाठ") rather than reconstructed
  table rows, because Tesseract.js word bounding boxes are not yet mapped
  back into the same column-band logic used for the PDF text layer. These
  pages are flagged and must be checked manually against the source. Wiring
  Tesseract word boxes through the same `detectColumnBands`/`rowsToTable`
  functions is the natural next step.
- **Column-band detection is heuristic**, tuned against the one real
  sample studied. Khatoni layouts with a different column count, merged
  cells, or unusual spacing may need the gap-threshold in
  `detectColumnBands` adjusted.
- **नाली/मुट्ठी/पैसा unit conversion is intentionally not implemented** —
  the conversion ratio is settlement-specific and hard-coding one would
  risk silently wrong Ansh figures, which the spec explicitly forbids.
- Phase 1 does not yet include Bhu-Naksha upload, plot matching,
  coordinates, the final report, Google Map display, or print/PDF export.

---

## 6. Deploy on GitHub Pages

1. Create a new GitHub repository and push this folder's contents to it
   (`index.html` at the repo root).
2. In the repo, go to **Settings → Pages**.
3. Under **Source**, choose the branch (e.g. `main`) and folder `/root`.
4. Save, then open the URL GitHub Pages gives you.

No build step is required — it is plain HTML/CSS/JS loading PDF.js and
Tesseract.js from a CDN.

## 7. Local testing

Because the app loads files via `fetch`-based Web Workers (PDF.js/Tesseract),
open it through a local server rather than `file://`:

```bash
cd bhoomitrace
python3 -m http.server 8080
# open http://localhost:8080
```

Upload a real Khatoni PDF/JPG and confirm: the file appears in the file
list, extraction progress messages update, the extracted-plots table
populates, and the Ansh summary shows the correct status (Calculated /
Needs Verification / Not Determinable) for each holder.

## 8. Test fixtures

Per the sample-data policy, no real land-record values are stored in this
repository. Add any synthetic sample Khatoni PDFs you build for testing
under `tests/fixtures/` — never in the live app path.

## 9. Phase 2 — Steps 5–12 (Bhu-Naksha, matching, report, map, print)

Phase 2 adds the rest of the workflow on top of Phase 1's Khatoni engine:

```
js/bhuNakshaParser.js    eBhunaksha header/owner-table/coordinate/court-orders parsing
js/coordinateExtractor.js point-only Lat/Lng extraction (never fabricated, never a polygon)
js/recordMatcher.js      Khata+Khasra matching (Matched / Needs Verification / Mismatch / Map Matching Required)
js/reportGenerator.js    assembles the Section-22 final report shape
js/mapRenderer.js        key-free Google Maps links by default, optional embedded JS-API map
js/config.js             optional GOOGLE_MAPS_API_KEY slot (empty by default)
```

### What was learned from the real eBhunaksha sample
- Its text layer came out largely in reading order already (unlike the
  Khatoni's column-major stream), so the same row/column reconstruction
  engine from Phase 1 is reused, not replaced.
- The page's background parcel-map image leaks stray digit runs (map
  plot-number labels) into the text stream with no relation to the
  OWNER DETAILS table. `BhuNakshaParser.isNoiseLine` filters these out,
  along with the repeated site-boilerplate footer.
- "No active court orders." / "No remarks found." are genuine source
  strings, not extraction failures — they are preserved and shown as-is.
- Only one MAP REPORT point (Lat/Lng) was present, never a vertex list —
  `polygonBoundary` is therefore always `null` unless a future source
  actually enumerates vertices; it is never synthesized from a point.

### Matching rule (spec §21)
| Condition | Result |
|---|---|
| Khata No + Khasra No both match a Bhu-Naksha record | **Matched** |
| Khasra No matches, Khata No differs | **Needs Verification (Khata mismatch)** |
| Khata No matches, Khasra No differs | **Mismatch** |
| Neither matches any uploaded Bhu-Naksha record | **Map Matching Required** |

### Google Map (spec §23)
By default, **no API key is needed** — each verified coordinate renders
as an "Open in Google Maps" link (`https://www.google.com/maps?q=lat,lng`).
To get an embedded in-page map with markers instead, add a key in
`js/config.js`:

```js
window.BHOOMITRACE_CONFIG = { GOOGLE_MAPS_API_KEY: 'YOUR_KEY' };
```

**Restrict that key** in the Google Cloud Console to your GitHub Pages
domain (HTTP referrer restriction, e.g. `https://your-username.github.io/*`)
before adding it — never commit an unrestricted key to a public repo.
If no key is set, or the key/domain restriction fails, the app silently
falls back to the link-based map (no broken UI).

### Print / Save as PDF (spec §24)
The "🖨 Print / Save as PDF" button calls the browser's native
`window.print()`. A print stylesheet (`@media print` in `css/style.css`)
hides every non-report section (upload forms, extraction progress,
matching table, map) so only the header, holder identity, and the
detailed plot/Ansh/coordinate/source/verification table print. In the
print dialog, choosing "Save as PDF" as the destination produces the PDF.

### Known limitations (Phase 2)
- Matching is done against whatever Bhu-Naksha pages were uploaded in
  the current session — there is no lookup against any external registry.
- The embedded Google Maps JS-API path is untested against a real key
  (validated so far only in the key-free link mode); test it with your
  own restricted key before relying on it.
- OCR-derived Bhu-Naksha pages (corrupted text layer or JPG/PNG uploads)
  parse owner rows from raw OCR text line-by-line, which is more fragile
  than the PDF text-layer path — verify these against the source image.

## 10. OCR pages now render as real tables, not raw text

Earlier, any page that needed OCR (a corrupted Khatoni text-layer, or a
plain JPG/PNG upload) was shown as an unstructured wall of text — because
Tesseract.js's word positions weren't being used.

That gap is now closed: **Tesseract word bounding boxes are fed into the
exact same geometric row/column engine used for the PDF text layer**
(`PDFTextExtractor.reconstructRows` / `detectColumnBands` / `rowsToTable`).
So a scanned Khatoni or an eBhunaksha JPG now produces the same clean
Khata/Plot/Owner table as a clean-text PDF — not a text dump.

Honesty is kept, not traded away, for that convenience:
- Tesseract's own per-word confidence score is averaged per page. Below
  70%, every row that page produced is force-marked **"सत्यापन आवश्यक" /
  Needs Verification** — never shown as a clean read it isn't.
- The raw OCR text is still kept and shown (now under "OCR क्रॉस-चेक
  पाठ") specifically so a person can compare it against the structured
  table and the original scan.
- No OCR system is 100% accurate on handwritten/stamped/scanned revenue
  records — this app's honesty mechanism is the verification flags, not
  a claim of perfect reading.

## 11. Plot number = Khasra number

Uttarakhand Khatoni/eBhunaksha records call the plot identifier "खसरा
संख्या" (Khasra Number) — the app uses this term consistently and every
table column is now labelled **"प्लॉट/खसरा नंबर"** so it's unambiguous
to someone unfamiliar with the term.

## 12. Two real multi-owner bugs found and fixed (from user-provided samples)

A second real Khatoni sample (Khata 00081, Khasra 776, village महतगांव) and
its matching eBhunaksha exposed two bugs that the first sample hadn't:

1. **Merged khasra/area cells across co-owners.** When several owners
   hold the same undivided plot, the source prints the खसरा/क्षेत्रफल
   values only once (on the first owner's line) — the other owners' rows
   have those cells blank. The parser was silently dropping those rows
   entirely (no khasra number = "not a data row"). Fixed: a blank
   khasra/area cell now carries forward the last value read from the
   row(s) above it, within the same श्रेणी block — every co-owner is kept,
   and the UI marks them with a **"साझा प्लॉट" (shared plot)** badge so
   it's clear the repeated number is real, not a duplicate-extraction bug.
2. **"के हक की" variant of the derivative-right phrase** ("के हक से")
   wasn't recognized. `shareParser.js` now matches से/की/में as the same
   family of phrase.

Both were verified against the exact sample data (see
`tests/fixtures/` note below) before being marked fixed — including a
full run through matching, report generation, and Google Maps link
output using the real Khata 00081 / Khasra 776 pair across both
document types.

## 13. Third real Khatoni format ("प्रमाणित प्रति" / certified copy) — dynamic columns + cross-page Khata carry-forward

A third real sample (Khata 00003, village कौला, 3 pages, ~21+ co-owners)
exposed a different column layout entirely:

- **Khata Number is a table column here** (merged across dozens of owner
  rows), not a page-header field like the first two samples.
- **An extra "खातेदार द्वारा देय मालगुजारी/लगान" (rent payable) column**
  exists that the earlier two samples didn't have.
- Continuation pages (2, 3, ...) often **do not repeat the column-header
  row at all**.

### Fixes
- `khatoniTableParser.js` now detects column meaning **by matching the
  printed header labels** (खातेदार/नाम, खसरा संख्या, क्षेत्रफल, खाता
  संख्या, मालगुजारी/लगान, आदेश, टिप्पणी) instead of guessing fixed
  positions. Position-based guessing is kept only as a last-resort
  fallback for badly OCR'd pages where no header row survives.
- Once column roles are recognized (normally on page 1), they are now
  **cached in the parser state and reused for the rest of the file** —
  fixing a real bug where continuation pages with no header row were
  silently mis-parsed (the name column was misread as the Khata-Number
  column, so every owner's name came out empty and the whole page was
  dropped).
- Khata Number, once read from its merged table cell, is **carried
  forward across page breaks** (`state.carriedKhataNo`) — it identifies
  one stable Khata for the whole multi-page block, unlike a per-row
  measurement.

### An honest, unresolved edge case
On page 1 of this sample, 9 khasra numbers are printed against the
first 9 owner names; 4 more owner names follow with no khasra of their
own before the योग (total) row. Structurally, this looks **identical**
to the earlier "3 co-owners share one merged khasra cell" case — there
is no reliable way to tell, from table geometry alone, whether a
trailing owner with a blank khasra cell (a) shares the last printed
khasra (a genuine merged cell), or (b) has no individually listed plot
at all (extra owners in a large joint/ancestral Khata). The app does
not fabricate a distinction it cannot support. Instead:
- Every carried-forward row is now **always** marked "सत्यापन आवश्यक"
  (needs verification), never shown as a clean read.
- When a Khata's holder count is well beyond its own योग-stated khasra
  count (more than double, and at least 3 more holders than khasras),
  the Extracted Plots screen shows an explicit warning naming the Khata
  and asking for a manual check against the source scan.
- Page-to-page carry-forward of खसरा/क्षेत्रफल is deliberately **not**
  extended across a page break (only Khata Number is) — a merged print
  cell is a same-page layout artifact, so a new page always requires a
  fresh value before any further carry-forward resumes on it.
