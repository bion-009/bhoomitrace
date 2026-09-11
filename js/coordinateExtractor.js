/**
 * CoordinateExtractor
 * Spec rule #19/#20: never invent lat/long, never geocode from a village
 * name, and never call a single point a polygon boundary unless the
 * source actually lists vertex arrays (which this eBhunaksha format does
 * not — it exposes one "MAP REPORT" point only).
 */
const CoordinateExtractor = (() => {

  const RE_LATLNG = /Lat:?\s*([-\d.]+)\s*\|\s*Lng:?\s*([-\d.]+)/i;

  function extractPoint(text) {
    const m = text.match(RE_LATLNG);
    if (!m) return { latitude: null, longitude: null, available: false };
    const latitude = parseFloat(m[1]);
    const longitude = parseFloat(m[2]);
    if (isNaN(latitude) || isNaN(longitude)) return { latitude: null, longitude: null, available: false };
    return { latitude, longitude, available: true };
  }

  // Real eBhunaksha samples only ever exposed a single MAP REPORT point —
  // no vertex list. Polygon support is left null unless a source is found
  // that actually enumerates [[lat,lng], ...] vertices; we never derive one.
  function extractPolygon(_text) {
    return null;
  }

  return { extractPoint, extractPolygon };
})();
