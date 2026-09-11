/**
 * ReportGenerator
 * Assembles the spec's Section 22 final report: header metadata, the
 * selected Khata Dharak, and a detailed table combining Khatoni Ansh
 * data with matched Bhu-Naksha coordinates and verification status.
 */
const ReportGenerator = (() => {

  function buildReport({ khataMetadata, holder, matchedRows }) {
    const rows = matchedRows.map(m => {
      const plot = m.plot;
      const bn = m.bhuNaksha;
      return {
        khataNo: plot.khataNo,
        plotNo: plot.plotNo,
        area: plot.area,
        recordedAnsh: plot.shareText || '—',
        anshArea: plot.anshArea != null ? plot.anshArea : null,
        anshStatus: plot.anshStatus || 'Not Determinable',
        latitude: bn && bn.coordinateAvailable ? bn.latitude : null,
        longitude: bn && bn.coordinateAvailable ? bn.longitude : null,
        coordinateLabel: bn && bn.coordinateAvailable
          ? `${bn.latitude}, ${bn.longitude}`
          : 'No Lat/Long Available',
        source: `${plot.sourceFile} · पृष्ठ ${plot.sourcePage}`,
        verification: m.matchStatus
      };
    });

    return {
      header: {
        district: khataMetadata.district || '—',
        pargana: khataMetadata.pargana || '—',
        tehsil: khataMetadata.tehsil || '—',
        village: khataMetadata.village || '—',
        fasliYear: khataMetadata.fasliYear || '—'
      },
      holder: {
        name: holder.name,
        fatherHusband: holder.fatherHusband,
        khataNo: holder.khataNo
      },
      rows,
      generatedAt: new Date().toISOString()
    };
  }

  return { buildReport };
})();
