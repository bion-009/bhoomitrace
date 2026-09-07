/**
 * RecordMatcher
 * Spec rule #21: primary key is Khata No + Khasra No, secondary is
 * Khasra No alone. Never guesses — every plot gets one of four
 * unambiguous outcomes.
 */
const RecordMatcher = (() => {

  function normalizePlotNo(v) {
    return (v || '').toString().trim().toLowerCase();
  }

  /**
   * @param {Array} khatoniPlots - selected plots from Phase 1 (each has khataNo, plotNo)
   * @param {Array} bhuNakshaRecords - parsed eBhunaksha pages (each has khataNo, khasraNo)
   */
  function match(khatoniPlots, bhuNakshaRecords) {
    return khatoniPlots.map(plot => {
      const plotKhasra = normalizePlotNo(plot.plotNo);
      const plotKhata = normalizePlotNo(plot.khataNo);

      const exact = bhuNakshaRecords.find(bn =>
        normalizePlotNo(bn.khasraNo) === plotKhasra && normalizePlotNo(bn.khataNo) === plotKhata
      );
      if (exact) {
        return { plot, bhuNaksha: exact, matchStatus: 'Matched' };
      }

      const khasraOnly = bhuNakshaRecords.find(bn => normalizePlotNo(bn.khasraNo) === plotKhasra);
      if (khasraOnly) {
        // Khasra matches but Khata differs → conflicting record, needs a human check.
        return { plot, bhuNaksha: khasraOnly, matchStatus: 'Needs Verification (Khata mismatch)' };
      }

      const khataOnly = bhuNakshaRecords.find(bn => normalizePlotNo(bn.khataNo) === plotKhata);
      if (khataOnly) {
        // Khata matches but the specific plot doesn't → wrong map document for this plot.
        return { plot, bhuNaksha: khataOnly, matchStatus: 'Mismatch' };
      }

      return { plot, bhuNaksha: null, matchStatus: 'Map Matching Required' };
    });
  }

  return { match };
})();
