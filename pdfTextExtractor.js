/**
 * PDFTextExtractor
 *
 * IMPORTANT FINDING (from studying real Uttarakhand Bhulekh Khatoni PDFs):
 * PDF.js's getTextContent() returns text items in the order they are
 * painted in the PDF content stream — NOT in reading order. For these
 * Khatoni PDFs the stream is column-major: every value of "column 1"
 * for the whole page appears first, then every value of the year column,
 * then every khasra number, then every area, etc. Naively joining
 * item.str in stream order produces a document where all the names
 * appear in one block, all the khasra numbers in another, with no
 * row correspondence at all.
 *
 * Fix: every text item carries a transform matrix (item.transform),
 * whose [4] and [5] entries are the item's x/y position on the page.
 * We cluster items into rows by y (line bands) and, inside each row,
 * sort by x — then group x into column bands. This reconstructs the
 * table geometrically instead of trusting stream order.
 */
const PDFTextExtractor = (() => {

  const Y_ROW_TOLERANCE = 4; // px — items within this y-delta are the same row

  async function loadDocument(arrayBuffer) {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    return await loadingTask.promise;
  }

  async function extractPageItems(pdfDoc, pageNumber) {
    const page = await pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.0 });
    const content = await page.getTextContent();
    const items = content.items
      .filter(it => it.str && it.str.trim().length > 0)
      .map(it => ({
        text: it.str,
        x: it.transform[4],
        // PDF space is bottom-up; flip so smaller y = higher on page (reading order)
        y: viewport.height - it.transform[5],
        width: it.width
      }));
    return { page, viewport, items };
  }

  /** Groups items into visual rows using y-clustering, then sorts each row by x. */
  function reconstructRows(items) {
    const sorted = [...items].sort((a, b) => a.y - b.y);
    const rows = [];
    let current = [];
    let currentY = null;

    for (const item of sorted) {
      if (currentY === null || Math.abs(item.y - currentY) <= Y_ROW_TOLERANCE) {
        current.push(item);
        currentY = current.reduce((s, i) => s + i.y, 0) / current.length; // running avg
      } else {
        rows.push(current);
        current = [item];
        currentY = item.y;
      }
    }
    if (current.length) rows.push(current);

    return rows.map(row => row.sort((a, b) => a.x - b.x));
  }

  /**
   * Clusters column x-start positions across every row into column bands.
   * Uses gap-based clustering: sort distinct x starts, split where the
   * gap between consecutive values exceeds `gapThreshold`.
   */
  function detectColumnBands(rows, gapThreshold = 25) {
    const xs = [];
    rows.forEach(row => row.forEach(item => xs.push(item.x)));
    const uniqueSorted = [...new Set(xs.map(x => Math.round(x)))].sort((a, b) => a - b);
    const bands = [];
    let bandStart = uniqueSorted[0];
    let prev = uniqueSorted[0];
    for (let i = 1; i < uniqueSorted.length; i++) {
      if (uniqueSorted[i] - prev > gapThreshold) {
        bands.push([bandStart, prev]);
        bandStart = uniqueSorted[i];
      }
      prev = uniqueSorted[i];
    }
    bands.push([bandStart, prev]);
    return bands; // array of [minX, maxX]
  }

  function assignToBand(x, bands) {
    for (let i = 0; i < bands.length; i++) {
      // widen band edges slightly to absorb rounding
      if (x >= bands[i][0] - 3 && x <= bands[i][1] + 15) return i;
    }
    // fall back to nearest band
    let best = 0, bestDist = Infinity;
    bands.forEach((b, i) => {
      const d = Math.min(Math.abs(x - b[0]), Math.abs(x - b[1]));
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  /** Produces an array of rows, each row an array of cell strings indexed by column band. */
  function rowsToTable(rows, bands) {
    return rows.map(row => {
      const cells = new Array(bands.length).fill('');
      row.forEach(item => {
        const b = assignToBand(item.x, bands);
        cells[b] = cells[b] ? `${cells[b]} ${item.text}` : item.text;
      });
      return cells.map(c => c.trim());
    });
  }

  function flattenRowsToText(rows) {
    return rows.map(row => row.map(i => i.text).join(' ')).join('\n');
  }

  return {
    loadDocument,
    extractPageItems,
    reconstructRows,
    detectColumnBands,
    rowsToTable,
    flattenRowsToText
  };
})();
