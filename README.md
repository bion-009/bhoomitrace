# BhoomiTrace

Browser-only Uttarakhand land-record analyzer.

## GitHub Pages setup

1. Create a new GitHub repository, e.g. `bhoomitrace`.
2. Upload `index.html` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`.
6. Save. GitHub will publish the site.

## What this version does

- Multiple Khatoni PDF/JPG/JPEG uploads.
- Multi-page PDF reading.
- PDF text extraction with PDF.js.
- OCR fallback with Tesseract.js for scanned pages/images.
- Dynamic Khatoni header/plot/owner extraction.
- Explicit-share-only Ansh calculation.
- No equal division when multiple owners are present.
- Multiple Bhu-Naksha/eBhunaksha files.
- Plot/Khata matching.
- Latitude/longitude extraction when present.
- Source file/page and confidence information.
- Print / Save as PDF through the browser.
- No permanent database or server-side land-record storage.

## Important limitation

This is a static GitHub Pages implementation. Generic OCR/table heuristics cannot guarantee legal-grade 100% extraction from every Uttarakhand Khatoni layout. Complex rows, handwritten/poor scans, column drift, and ambiguous OCR must be marked for verification.

For production-grade reliability, replace the parser with a server/API or specialized document-AI pipeline that detects table coordinates and validates every row against the source page.

## Privacy

The page is designed for session-only browser processing. Do not add analytics, external logging, or a database if the intended privacy model is no permanent storage.

## Google Maps

The current report displays source coordinates. Interactive Google Maps requires a Google Maps JavaScript API key and proper key restrictions/billing configuration.
