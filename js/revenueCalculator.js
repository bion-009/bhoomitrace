/**
 * RevenueCalculator
 * Computes Ansh (share) Area ONLY when a plot has an unambiguous,
 * explicit computable fraction. Never divides equally among multiple
 * owners of the same plot/Khata (spec rule #12) and never converts a
 * traditional unit or an embedded hectare annotation into an ownership
 * fraction on its own (spec rule #13).
 */
const RevenueCalculator = (() => {

  function computePlotAnsh(plot) {
    if (plot.shareStatus === 'CALCULATED' && plot.shareFraction && plot.area != null) {
      const { numerator, denominator } = plot.shareFraction;
      if (denominator > 0) {
        return {
          status: 'Calculated',
          anshArea: Number((plot.area * (numerator / denominator)).toFixed(4))
        };
      }
    }
    if (plot.shareStatus === 'NEEDS_VERIFICATION') {
      return { status: 'Needs Verification', anshArea: null };
    }
    if (plot.shareStatus === 'NOT_DETERMINABLE') {
      return { status: 'Not Determinable', anshArea: null };
    }
    // No explicit share found at all.
    return { status: 'Not Determinable', anshArea: null };
  }

  /** Builds the Khata Dharak summary table (spec rule #14). */
  function buildHolderSummary(khata) {
    return Object.values(khata.holders).map(holder => {
      const holderPlots = khata.plots.filter(p => p.holderIdentityKey === holder.identityKey);
      let totalAnshArea = 0;
      let anyCalculated = false;
      let anyUncertain = false;

      const plotRows = holderPlots.map(plot => {
        const { status, anshArea } = computePlotAnsh(plot);
        if (status === 'Calculated') { anyCalculated = true; totalAnshArea += anshArea; }
        if (status === 'Needs Verification') anyUncertain = true;
        return { ...plot, anshStatus: status, anshArea };
      });

      const totalKhataArea = holderPlots.reduce((sum, p) => sum + (p.area || 0), 0);

      let overallStatus;
      if (anyCalculated && !anyUncertain) overallStatus = 'Calculated';
      else if (anyUncertain) overallStatus = 'Needs Verification';
      else overallStatus = 'Not Determinable';

      return {
        khataNo: khata.khataNo,
        name: holder.name,
        fatherHusband: holder.fatherHusband,
        plots: plotRows,
        totalKhataArea: Number(totalKhataArea.toFixed(4)),
        recordedShareTexts: [...new Set(holder.recordedShares.map(s => s.shareText).filter(Boolean))],
        calculatedAnshArea: anyCalculated ? Number(totalAnshArea.toFixed(4)) : null,
        status: overallStatus,
        needsVerification: overallStatus !== 'Calculated'
      };
    });
  }

  return { computePlotAnsh, buildHolderSummary };
})();
