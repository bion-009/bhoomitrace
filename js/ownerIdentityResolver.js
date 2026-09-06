/**
 * OwnerIdentityResolver
 * A person must never be identified by name alone (spec rule #9).
 * Two "राम सिंह" entries with different fathers, addresses, or Khata
 * numbers are different people and must never be silently merged.
 */
const OwnerIdentityResolver = (() => {

  function normalize(s) {
    return (s || '')
      .replace(/[.,()०-९]/g, m => m) // keep devanagari digits as-is (not stripped)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function buildIdentityKey({ name, fatherHusband, address, khataNo }) {
    return [khataNo, normalize(name), normalize(fatherHusband), normalize(address)]
      .join('::');
  }

  return { buildIdentityKey, normalize };
})();
