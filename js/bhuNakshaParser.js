/**
 * BhuNakshaParser
 * Extracts Khasra No, Khata Number, Area, Fasli Year, the owner table,
 * Court Orders, Remarks, and the single MAP REPORT coordinate point from
 * an eBhunaksha PDF page's reconstructed text/rows.
 *
 * REAL-DOCUMENT FINDINGS:
 *  - This document type's text layer came out largely in reading order
 *    already (unlike the Khatoni), but the page also carries background
 *    map-label digits (plot numbers rendered on the parcel map image)
 *    that leak into the text stream with no spatial relation to the
 *    OWNER DETAILS table — these are filtered out, not treated as data.
 *  - "No active court orders." / "No remarks found." are real empty-state
 *    strings the source itself prints — they are NOT parsing failures and
 *    must be shown as-is, not silently dropped or reworded.
 *  - Every page repeats a boilerplate footer ("राजस्व पर्षद...",
 *    "Contents owned by...", version tag, nav links) that must be
 *    excluded from extracted fields.
 */
const BhuNakshaParser = (() => {

  const HEADER_PATTERNS = {
    khasraNo:     /Khasra\s*No\s*:?\s*([A-Za-z0-9]+)/i,
    khataNumber:  /Khata\s*Number\s*:?\s*([A-Za-z0-9]+)/i,
    area:         /Area\s*:?\s*([\d.]+)\s*Hect\.?/i,
    fasliYear:    /Fasli\s*Year\s*:?\s*([\d\-]+)/i
  };

  const FOOTER_NOISE_RE = /राजस्व\s*पर्षद|Contents\s*owned|Technical\s*Support|संस्करण\s*:|Data\s*Updated\s*Upto|SEARCH\s*PLOT|BHUNAKSHA|©|सर्वाधिकार|itcell-rev|nic\.in|Government of Uttarakhand|Revenue Department|Land Parcel Details|CLOSE|PRINT RECORD|HOME/i;

  function isNoiseLine(line) {
    if (!line || !line.trim()) return true;
    if (FOOTER_NOISE_RE.test(line)) return true;
    // Pure runs of digits with no separating spaces/letters = map-label
    // leakage from the parcel map background, not table data.
    if (/^\d{4,}$/.test(line.trim())) return true;
    return false;
  }

  function parseHeader(fullText) {
    const result = {};
    const missing = [];
    for (const [field, re] of Object.entries(HEADER_PATTERNS)) {
      const m = fullText.match(re);
      if (m) result[field] = m[1].trim();
      else missing.push(field);
    }
    return { metadata: result, needsVerification: missing.length > 0, missingFields: missing };
  }

  function parseCourtOrdersAndRemarks(fullText) {
    const courtMatch = fullText.match(/COURT ORDERS[^\n]*\n?([\s\S]*?)(?=REMARKS|$)/i);
    const remarksMatch = fullText.match(/REMARKS[^\n]*\n?([\s\S]*?)(?=CLOSE|PRINT RECORD|$)/i);

    const courtText = courtMatch ? courtMatch[1].trim() : '';
    const remarksText = remarksMatch ? remarksMatch[1].trim() : '';

    return {
      courtOrders: courtText && !/No active court orders\.?/i.test(courtText) ? courtText : 'No active court orders.',
      remarks: remarksText && !/No remarks found\.?/i.test(remarksText) ? remarksText : 'No remarks found.'
    };
  }

  /**
   * Owner rows: uses the same geometric row/column reconstruction as the
   * Khatoni parser (PDFTextExtractor), then keeps only rows that look like
   * "S.No  Name  Father/Husband  Address" — an integer in the first band
   * followed by non-empty Devanagari/Latin text in the rest.
   */
  function parseOwnerRows(table) {
    const owners = [];
    for (const cells of table) {
      if (cells.every(c => isNoiseLine(c))) continue;
      const sNo = (cells[0] || '').trim();
      if (!/^\d+$/.test(sNo)) continue; // not an "S.No name father address" row
      const name = (cells[1] || '').trim();
      const fatherHusband = (cells[2] || '').trim();
      const address = (cells[3] || '').trim();
      if (!name) continue;
      owners.push({ sNo: Number(sNo), name, fatherHusband, address });
    }
    return owners;
  }

  /**
   * @param {Array<Array<string>>} table - row/column table from PDFTextExtractor
   * @param {string} fullText - flattened page text (for header/coords/court/remarks regex)
   * @param {Object} source - { fileName, pageNumber }
   */
  function parsePage(table, fullText, source) {
    const header = parseHeader(fullText);
    const point = CoordinateExtractor.extractPoint(fullText);
    const polygon = CoordinateExtractor.extractPolygon(fullText);
    const { courtOrders, remarks } = parseCourtOrdersAndRemarks(fullText);
    const owners = parseOwnerRows(table);

    return {
      khasraNo: header.metadata.khasraNo || null,
      khataNo: header.metadata.khataNumber || null,
      area: header.metadata.area ? Number(header.metadata.area) : null,
      fasliYear: header.metadata.fasliYear || null,
      latitude: point.latitude,
      longitude: point.longitude,
      coordinateAvailable: point.available,
      polygonBoundary: polygon, // always null unless a real vertex list is ever found
      owners,
      courtOrders,
      remarks,
      sourceFile: source.fileName,
      sourcePage: source.pageNumber,
      needsVerification: header.needsVerification || !point.available,
      missingFields: header.missingFields
    };
  }

  return { parsePage, isNoiseLine, parseHeader, parseCourtOrdersAndRemarks, parseOwnerRows };
})();
