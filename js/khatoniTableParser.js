/**
 * KhatoniTableParser
 * Turns the geometrically-reconstructed row/column table (from
 * PDFTextExtractor) into structured Khata / Plot / KhataHolder records.
 *
 * REAL-DOCUMENT FINDING (third sample, "प्रमाणित प्रति" / certified-copy
 * format): the column layout is NOT fixed across Bhulekh document
 * variants. This sample's table has an extra "खातेदार द्वारा देय
 * मालगुजारी/लगान" (rent payable) column, AND — critically — खाता संख्या
 * (Khata Number) is itself a TABLE COLUMN here (merged across dozens of
 * owner rows), not a page-header field like the first two samples.
 * Guessing column meaning from position alone breaks the moment the
 * layout shifts. So columns are now identified by matching the actual
 * printed header-row labels (खातेदार/नाम, खसरा संख्या, क्षेत्रफल, खाता
 * संख्या, मालगुजारी/लगान, आदेश, टिप्पणी) — falling back to the older
 * position-based guess only when no recognizable header row survives
 * (e.g. a badly OCR'd page).
 *
 * Handles these real structural features:
 *  1. "श्रेणी : ..." — a tenure-class sub-header applying to every row
 *     below it until the next श्रेणी or योग row. Persists across pages.
 *  2. "योग" (total) row — captures total khasra count / area / rent for
 *     the block; never mistaken for a data row.
 *  3. Page continuation — a Khata Number printed once (merged across a
 *     whole multi-page owner block) is carried forward ACROSS pages
 *     (state.carriedKhataNo), because it identifies one stable Khata,
 *     not a per-row measurement.
 *  4. Merged खसरा/क्षेत्रफल cells across co-owner lines — carried
 *     forward only WITHIN a page and reset at every new page, श्रेणी,
 *     or योग boundary. A merged numeric cell is a print-layout artifact
 *     scoped to the page it's printed on; carrying it across a page
 *     break would be a guess, not a read. When no khasra/area is
 *     available for an owner (as with dozens of owners in the third
 *     sample's pages 2-3, who hold a joint right in the Khata's total
 *     land with no individual khasra stated), the owner is still kept
 *     — never dropped — with plotNo/area left null and a clear note,
 *     rather than fabricating a number by over-extending the carry.
 */
const KhatoniTableParser = (() => {

  const HEADER_KEYWORDS = {
    khataNo: /खाता\s*संख्या/,
    name: /खातेदार.*नाम|पिता.*पति.*संरक्षक/,
    year: /भौमिक.*अधिकार|अधिकार.*वर्ष/,
    khasra: /खसरा\s*संख्या/,
    area: /क्षेत्रफल/,
    rent: /मालगुजारी|लगान/,
    orders: /आदेश/,
    remarks: /टिप्पणी/
  };

  function detectColumnRoles(table) {
    for (const cells of table) {
      const roles = {};
      cells.forEach((cell, idx) => {
        for (const [role, re] of Object.entries(HEADER_KEYWORDS)) {
          if (roles[role] === undefined && re.test(cell)) roles[role] = idx;
        }
      });
      // Trust it only once the three most stable anchors all show up together.
      if (roles.name !== undefined && roles.khasra !== undefined && roles.area !== undefined) {
        return roles;
      }
    }
    return null;
  }

  function isHeaderLabelRow(cells) {
    const joined = cells.join(' ');
    if (/खातेदार.*नाम.*पिता|पिता.*पति.*संरक्षक/.test(joined)) return true;
    // The "1  2  3  4  5  6  7-12  13" column-number row.
    const nonEmpty = cells.filter(c => c && c.trim());
    if (nonEmpty.length >= 4 && nonEmpty.every(c => /^\d+(-\d+)?$/.test(c.trim()))) return true;
    return false;
  }

  function splitNameFatherResidence(cellText) {
    const parts = (cellText || '').split('/').map(p => p.trim()).filter(Boolean);
    return { name: parts[0] || '', fatherHusband: parts[1] || '', address: parts[2] || '', raw: cellText };
  }

  function isCategoryHeaderRow(cells) {
    return /श्रेणी\s*:/.test(cells.join(' '));
  }

  function isTotalRow(cells) {
    return cells.some(c => c.trim() === 'योग');
  }

  function createState() {
    return { carriedKhataNo: null, carriedKhasra: null, carriedArea: null, currentCategory: null, columnRoles: null };
  }

  function ensureKhata(accumulator, khataNo, metadata) {
    if (!accumulator[khataNo]) {
      accumulator[khataNo] = {
        khataNo, metadata, holders: {}, plots: [],
        totalArea: null, totalKhasraCount: null, totalRent: null,
        currentCategory: null, source: []
      };
    }
    return accumulator[khataNo];
  }

  /**
   * @param {Array<Array<string>>} table - rows of column-band cell strings
   * @param {Object} metadata - KhatoniHeaderParser result for this page (page-level fields; khataNo may be absent when it's a table column instead)
   * @param {Object} accumulator - running state across pages, keyed by khataNo
   * @param {Object} source - { fileName, pageNumber }
   * @param {Object} state - KhatoniTableParser.createState() output; reuse the SAME object across every page of one file so carry-forward works across page breaks
   */
  function parsePageIntoKhatas(table, metadata, accumulator, source, state) {
    state = state || createState();

    // A continuation page (page 2, 3, ...) often does NOT repeat the
    // column-header row at all — real sample confirmed this. Detecting
    // roles fresh on every page would then fall back to the wrong,
    // position-only guess and silently misread (or drop) every row on
    // that page. So once roles are recognized (usually on page 1), they
    // are cached in `state` and reused for the rest of this file.
    const detected = detectColumnRoles(table);
    if (detected) state.columnRoles = detected;
    const roles = state.columnRoles;

    const colCount = table.reduce((m, r) => Math.max(m, r.length), 0);
    // Fallback (older two-sample layout: name, blank, year, khasra, area, orders, remarks)
    const fallback = {
      name: 0,
      khasra: Math.max((colCount - 3 >= 0 ? colCount - 3 : colCount - 1) - 1, 0),
      area: colCount - 3 >= 0 ? colCount - 3 : colCount - 1,
      orders: Math.min((colCount - 3 >= 0 ? colCount - 3 : colCount - 1) + 1, colCount - 1),
      remarks: colCount - 1
    };
    const col = roles || fallback;

    let touchedKhataNo = null;

    for (const cells of table) {
      if (!cells.some(c => c && c.trim())) continue;
      if (isHeaderLabelRow(cells)) continue;

      if (isCategoryHeaderRow(cells)) {
        state.currentCategory = cells.join(' ').match(/श्रेणी\s*:\s*(.+)/)?.[1]?.trim() || cells.join(' ');
        state.carriedKhasra = null;
        state.carriedArea = null;
        continue;
      }

      if (isTotalRow(cells)) {
        const activeKhataNo = state.carriedKhataNo || metadata.khataNo || touchedKhataNo || 'UNKNOWN';
        const khata = ensureKhata(accumulator, activeKhataNo, metadata);
        const nums = cells.filter(c => /^\d+(\.\d+)?$/.test(c.trim()));
        if (nums.length >= 1) khata.totalKhasraCount = Number(nums[0]);
        if (nums.length >= 2) khata.totalArea = Number(nums[1]);
        if (nums.length >= 3) khata.totalRent = Number(nums[2]);
        state.carriedKhasra = null;
        state.carriedArea = null;
        continue;
      }

      const { name, fatherHusband, address, raw } = splitNameFatherResidence(cells[col.name] || '');
      if (!name) continue;

      // Khata Number: either a page-level header field (older format) or
      // its own merged table column (this format) carried across pages.
      let khataNo;
      if (col.khataNo !== undefined) {
        const cellVal = (cells[col.khataNo] || '').trim();
        if (cellVal) state.carriedKhataNo = cellVal;
        khataNo = state.carriedKhataNo || metadata.khataNo || 'UNKNOWN';
      } else {
        khataNo = metadata.khataNo || 'UNKNOWN';
      }
      touchedKhataNo = khataNo;

      const khata = ensureKhata(accumulator, khataNo, metadata);
      if (khata.source.every(s => s.fileName !== source.fileName || s.pageNumber !== source.pageNumber)) {
        khata.source.push(source);
      }
      khata.currentCategory = state.currentCategory;

      let khasraNo = (cells[col.khasra] || '').trim();
      let areaText = (cells[col.area] || '').trim();
      let khasraSource = 'row';

      if (/\d/.test(khasraNo)) {
        state.carriedKhasra = khasraNo;
        state.carriedArea = areaText;
      } else if (state.carriedKhasra) {
        khasraNo = state.carriedKhasra;
        areaText = state.carriedArea;
        khasraSource = 'merged-cell-carried-forward';
      } else {
        // No khasra of its own, and nothing to safely carry forward on
        // THIS page — never fabricate one. The owner is still kept.
        khasraNo = '';
        areaText = '';
        khasraSource = 'not-specified';
      }

      const area = areaText ? parseFloat(areaText.replace(/[^\d.]/g, '')) : null;
      const rentText = col.rent !== undefined ? (cells[col.rent] || '').trim() : '';
      const ordersText = (cells[col.orders] || '').trim();
      const remarksText = (cells[col.remarks] || '').trim();

      const shareFromName = ShareParser.classify(raw);
      const shareFromOrders = ordersText ? ShareParser.classify(ordersText) : null;
      const share = (shareFromName.shareStatus !== 'NONE') ? shareFromName
                  : (shareFromOrders && shareFromOrders.shareStatus !== 'NONE') ? shareFromOrders
                  : shareFromName;

      const identityKey = OwnerIdentityResolver.buildIdentityKey({ name, fatherHusband, address, khataNo });

      if (!khata.holders[identityKey]) {
        khata.holders[identityKey] = {
          identityKey, name, fatherHusband, address,
          category: state.currentCategory, recordedShares: [], source: [],
          confidence: 'unverified', needsVerification: share.needsVerification
        };
      }
      khata.holders[identityKey].recordedShares.push(share);
      khata.holders[identityKey].source.push(source);

      const noPlotInfo = khasraSource === 'not-specified';

      khata.plots.push({
        plotNo: khasraNo || null,
        area: (area == null || isNaN(area)) ? null : area,
        areaUnit: 'hectare',
        landRevenue: rentText || null,
        khataNo,
        holderIdentityKey: identityKey,
        category: state.currentCategory,
        shareFraction: share.shareFraction,
        shareText: share.shareText,
        shareStatus: share.shareStatus,
        shareNote: share.note || null,
        remarks: remarksText,
        sourceFile: source.fileName,
        sourcePage: source.pageNumber,
        sourceText: raw,
        khasraSource,
        noPlotInfo,
        confidence: noPlotInfo ? 'low' : ((area == null || !khasraNo || khasraSource === 'merged-cell-carried-forward') ? 'medium' : 'medium'),
        needsVerification: share.needsVerification || noPlotInfo || area == null || !khasraNo || khasraSource === 'merged-cell-carried-forward',
        note: noPlotInfo
          ? 'इस खातेदार के सामने दस्तावेज़ में कोई विशिष्ट खसरा/क्षेत्रफल नहीं दिया गया — यह खाता की सामूहिक भूमि में सम्मिलित अधिकार हो सकता है (No specific khasra/area listed against this holder — may reflect a joint right in the Khata\'s total land)'
          : null
      });
    }

    return accumulator;
  }

  return { parsePageIntoKhatas, splitNameFatherResidence, createState, detectColumnRoles };
})();
