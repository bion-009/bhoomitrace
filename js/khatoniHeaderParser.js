/**
 * KhatoniHeaderParser
 * Extracts the metadata block that appears at the top of every Khata
 * Vivaran page: ग्राम / परगना / तहसील / जनपद / फसली वर्ष / भाग / खाता संख्या.
 * Works on the flattened page text (order-independent regex — the
 * header line is short enough that stream order rarely scrambles it,
 * but we still validate against row-reconstructed text when available).
 */
const KhatoniHeaderParser = (() => {

  const PATTERNS = {
    village:   /ग्राम\s*का\s*नाम\s*:\s*([^\n|]+?)(?=\s+परगना|\s*$)/,
    pargana:   /परगना\s*:\s*\(?\s*([^)\n]+?)\)?(?=\s+तहसील|\s*$)/,
    tehsil:    /तहसील\s*:\s*([^\n]+?)(?=\s+जनपद|\s*$)/,
    district:  /जनपद\s*:\s*([^\n]+?)(?=\s+फसली|\s*$)/,
    fasliYear: /फसली\s*वर्ष\s*:\s*([\d०-९\-]+)/,
    part:      /भाग\s*:\s*(\d+)/,
    khataNo:   /खाता\s*संख्या\s*:\s*(\d+)/
  };

  function parse(headerText) {
    const result = {};
    const missing = [];
    for (const [field, re] of Object.entries(PATTERNS)) {
      const m = headerText.match(re);
      if (m) {
        result[field] = m[1].trim();
      } else {
        missing.push(field);
      }
    }
    return {
      metadata: result,
      needsVerification: missing.length > 0,
      missingFields: missing
    };
  }

  return { parse };
})();
