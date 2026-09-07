/**
 * ShareParser
 *
 * REAL-DOCUMENT FINDING: actual Uttarakhand Khatoni records almost never
 * carry a clean "1/4" ownership fraction the way a generic spec-example
 * might suggest. What we actually see embedded inside the name/father
 * column (column 1) is a mix of:
 *
 *   - Traditional hill land-measure fractions: "2-1/2मु", "1-1/4मु भू",
 *     "2ना 10मु" (नाली/मुट्ठी units — 1 नाली ≈ 20 मुट्ठी, but the exact
 *     ratio is settlement-specific and NOT safe to hard-code).
 *   - A bare hectare figure stuck onto the name/father text, e.g.
 *     "0.201हे.", "0.137हे" — it is NOT clear whether this is the
 *     person's own share area, a cross-reference to another record, or
 *     something else. Treating it as "this row's Ansh Area" would be a
 *     guess.
 *   - Derivative-right phrases with NO number at all: "के हक से"
 *     (through/on the right of), "के नाम" (in the name of),
 *     "जरीये वसीयत" (via a will), "जरीये विक्रयपत्र" (via a sale deed),
 *     "कुल ... हक में" (in the joint right of ...).
 *
 * Per spec rule #13 (share semantics) and #12 (never assume equal
 * share), only a clean, unambiguous ownership fraction is computed.
 * Everything else is preserved as raw text and marked for verification
 * or as not determinable — never silently turned into a number.
 */
const ShareParser = (() => {

  const RE_SIMPLE_FRACTION = /(\d+)\s*\/\s*(\d+)\s*(हिस्सा|अंश|भाग)/; // requires an explicit share word
  const RE_TRADITIONAL_UNIT = /(\d+)\s*-?\s*(\d+)?\s*\/?\s*(\d+)?\s*(ना|नाली|मु|मुट्ठी|पैसा)\b/;
  const RE_EMBEDDED_HECTARE = /(\d+\.\d+)\s*हे[०o]?\.?/;
  const RE_DERIVATIVE = /के\s*हक\s*से|के\s*नाम|कुल\s*.*?हक\s*में|जरीये\s*(वसीयत|विक्रयपत्र|बैनामा)/;

  function classify(rawText) {
    if (!rawText || !rawText.trim()) {
      return { shareStatus: 'NONE', shareFraction: null, shareText: '', sourceText: rawText, needsVerification: false };
    }

    let m = rawText.match(RE_SIMPLE_FRACTION);
    if (m) {
      return {
        shareStatus: 'CALCULATED',
        shareFraction: { numerator: Number(m[1]), denominator: Number(m[2]) },
        shareText: m[0],
        sourceText: rawText,
        needsVerification: false
      };
    }

    m = rawText.match(RE_TRADITIONAL_UNIT);
    if (m) {
      return {
        shareStatus: 'NEEDS_VERIFICATION',
        shareFraction: null,
        shareText: m[0],
        sourceText: rawText,
        needsVerification: true,
        note: 'पारंपरिक इकाई (नाली/मुट्ठी/पैसा) — रूपांतरण दर गाँव/बंदोबस्त अनुसार भिन्न होती है, स्वतः गणना नहीं की गई (Traditional unit — conversion ratio varies by settlement, not auto-calculated)'
      };
    }

    m = rawText.match(RE_EMBEDDED_HECTARE);
    if (m) {
      return {
        shareStatus: 'NEEDS_VERIFICATION',
        shareFraction: null,
        shareText: m[0],
        sourceText: rawText,
        needsVerification: true,
        note: 'नाम/पिता कॉलम में एक हेक्टेयर मान मिला — यह इस पंक्ति के क्षेत्रफल कॉलम से मेल नहीं खा सकता; अर्थ अस्पष्ट (Hectare value embedded in name/father text — relationship to column-6 area is unclear; needs human check)'
      };
    }

    m = rawText.match(RE_DERIVATIVE);
    if (m) {
      return {
        shareStatus: 'NOT_DETERMINABLE',
        shareFraction: null,
        shareText: m[0],
        sourceText: rawText,
        needsVerification: false,
        note: 'व्युत्पन्न/संदर्भ स्वामित्व वाक्यांश — स्वतंत्र अंश नहीं (Derivative-right phrase, e.g. "through the right of X" — not an independent computable share)'
      };
    }

    return { shareStatus: 'NONE', shareFraction: null, shareText: '', sourceText: rawText, needsVerification: false };
  }

  return { classify };
})();
