/**
 * TextIntegrityChecker
 *
 * REAL-WORLD FINDING: Uttarakhand Bhulekh PDFs often embed a text layer
 * generated with a custom/subsetted Devanagari font whose ToUnicode CMap
 * is broken. The PDF *has* a text layer (so a naive "text layer missing?"
 * check would say "fine, use it"), but copy-pasting it drops leading
 * consonants and half-forms, e.g. "पिता पति संरक्षक" comes out as
 * " ता प संरक", "गिरीशचन्द्र" as " रीशचन्द्र". The rendered page image
 * is perfectly readable; only the extracted text is corrupted.
 *
 * So we don't just check "does text exist" — we score how intact it is,
 * and force the OCR path when the text layer is present but broken.
 */
const TextIntegrityChecker = (() => {

  // Words that should appear intact on almost every Khatoni page.
  const EXPECTED_KEYWORDS = [
    'ग्राम', 'परगना', 'तहसील', 'जनपद', 'फसली', 'वर्ष', 'खाता',
    'खातेदार', 'निवास', 'क्षेत्रफल', 'खसरा', 'आदेश', 'टिप्पणी'
  ];

  // A Devanagari dependent vowel sign / virama with no consonant
  // immediately before it is a strong signal that a base consonant
  // (often the first syllable of a word) was dropped by the font's
  // broken CMap.
  const ORPHAN_MATRA_RE = /(^|[\s।,.()/:0-9])[\u093E-\u094D]/g;

  function score(fullText) {
    const keywordHits = EXPECTED_KEYWORDS.filter(k => fullText.includes(k)).length;
    const orphanMatches = (fullText.match(ORPHAN_MATRA_RE) || []).length;
    const devanagariCharCount = (fullText.match(/[\u0900-\u097F]/g) || []).length;
    const orphanRatio = devanagariCharCount > 0 ? orphanMatches / devanagariCharCount : 1;

    const corrupted = (keywordHits < 3) || (orphanRatio > 0.02 && devanagariCharCount > 50);

    return {
      keywordHits,
      keywordsExpected: EXPECTED_KEYWORDS.length,
      orphanMatches,
      orphanRatio: Number(orphanRatio.toFixed(4)),
      devanagariCharCount,
      corrupted
    };
  }

  return { score, EXPECTED_KEYWORDS };
})();
