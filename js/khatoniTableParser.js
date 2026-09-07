/**
 * KhatoniTableParser
 * Turns the geometrically-reconstructed row/column table (from
 * PDFTextExtractor) into structured Khata / Plot / KhataHolder records.
 *
 * Handles three real structural features found in actual Bhulekh pages:
 *  1. "श्रेणी : ..." lines — a tenure-class sub-header that applies to
 *     every row beneath it until the next श्रेणी or the योग row.
 *  2. "योग" (total) row — carries the section's total khasra count and
 *     total area; stored as totalArea/totalKhasraCount, never mistaken
 *     for a data row.
 *  3. Page continuation — if page N+1 repeats the same खाता संख्या in
 *     its header, its rows are appended to the SAME Khata, not a new one.
 */
const KhatoniTableParser = (() => {

  function splitNameFatherResidence(cellText) {
    // Column 1 is "नाम / पिता-पति-संरक्षक / निवास" separated by "/"
    const parts = cellText.split('/').map(p => p.trim()).filter(Boolean);
    return {
      name: parts[0] || '',
      fatherHusband: parts[1] || '',
      address: parts[2] || '',
      raw: cellText
    };
  }

  function isCategoryHeaderRow(cells) {
    return /श्रेणी\s*:/.test(cells.join(' '));
  }

  function isTotalRow(cells) {
    return cells.some(c => c.trim() === 'योग');
  }

  function looksLikeDataRow(cells, khasraColIdx) {
    // A real data row has a khasra-like token (digits + optional trailing
    // devanagari letter, e.g. "28ब", "58अ") in the khasra column.
    const v = cells[khasraColIdx] || '';
    return /\d/.test(v);
  }

  /**
   * @param {Array<Array<string>>} table - rows of column-band cell strings
   * @param {Object} metadata - result of KhatoniHeaderParser for this page
   * @param {Object} accumulator - running state across pages, keyed by khataNo
   * @param {Object} source - { fileName, pageNumber }
   */
  function parsePageIntoKhatas(table, metadata, accumulator, source) {
    const khataNo = metadata.khataNo || 'UNKNOWN';
    if (!accumulator[khataNo]) {
      accumulator[khataNo] = {
        khataNo,
        metadata,
        holders: {},       // identityKey -> holder object
        plots: [],
        totalArea: null,
        totalKhasraCount: null,
        currentCategory: null,
        source: []
      };
    }
    const khata = accumulator[khataNo];
    khata.source.push(source);

    // Try to guess column indices: name/father/residence is usually the
    // widest/leftmost band; khasra + area are numeric bands further right.
    // We use position heuristics rather than fixed indices since band
    // count can vary slightly per page.
    const colCount = table.reduce((m, r) => Math.max(m, r.length), 0);
    const nameColIdx = 0;
    const areaColIdx = colCount - 3 >= 0 ? colCount - 3 : colCount - 1;
    const khasraColIdx = Math.max(areaColIdx - 1, 0);
    const ordersColIdx = Math.min(areaColIdx + 1, colCount - 1);
    const remarksColIdx = colCount - 1;

    for (const cells of table) {
      if (!cells.some(c => c && c.trim())) continue; // blank row

      if (isCategoryHeaderRow(cells)) {
        khata.currentCategory = cells.join(' ').match(/श्रेणी\s*:\s*(.+)/)?.[1]?.trim() || cells.join(' ');
        continue;
      }

      if (isTotalRow(cells)) {
        const nums = cells.filter(c => /^\d+(\.\d+)?$/.test(c.trim()));
        if (nums.length >= 2) {
          khata.totalKhasraCount = Number(nums[0]);
          khata.totalArea = Number(nums[1]);
        } else if (nums.length === 1) {
          khata.totalArea = Number(nums[0]);
        }
        continue;
      }

      if (!looksLikeDataRow(cells, khasraColIdx)) continue;

      const { name, fatherHusband, address, raw } = splitNameFatherResidence(cells[nameColIdx] || '');
      if (!name) continue;

      const khasraNo = (cells[khasraColIdx] || '').trim();
      const areaText = (cells[areaColIdx] || '').trim();
      const area = parseFloat(areaText.replace(/[^\d.]/g, ''));
      const ordersText = (cells[ordersColIdx] || '').trim();
      const remarksText = (cells[remarksColIdx] || '').trim();

      const shareFromName = ShareParser.classify(raw);
      const shareFromOrders = ordersText ? ShareParser.classify(ordersText) : null;
      const share = (shareFromName.shareStatus !== 'NONE') ? shareFromName
                  : (shareFromOrders && shareFromOrders.shareStatus !== 'NONE') ? shareFromOrders
                  : shareFromName;

      const identityKey = OwnerIdentityResolver.buildIdentityKey({ name, fatherHusband, address, khataNo });

      if (!khata.holders[identityKey]) {
        khata.holders[identityKey] = {
          identityKey,
          name,
          fatherHusband,
          address,
          category: khata.currentCategory,
          recordedShares: [],
          source: [],
          confidence: 'unverified',
          needsVerification: share.needsVerification
        };
      }
      khata.holders[identityKey].recordedShares.push(share);
      khata.holders[identityKey].source.push(source);

      khata.plots.push({
        plotNo: khasraNo,
        area: isNaN(area) ? null : area,
        areaUnit: 'hectare',
        khataNo,
        holderIdentityKey: identityKey,
        category: khata.currentCategory,
        shareFraction: share.shareFraction,
        shareText: share.shareText,
        shareStatus: share.shareStatus,
        shareNote: share.note || null,
        remarks: remarksText,
        sourceFile: source.fileName,
        sourcePage: source.pageNumber,
        sourceText: raw,
        confidence: isNaN(area) || !khasraNo ? 'low' : 'medium',
        needsVerification: share.needsVerification || isNaN(area) || !khasraNo
      });
    }

    return accumulator;
  }

  return { parsePageIntoKhatas, splitNameFatherResidence };
})();
