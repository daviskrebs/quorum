// Bellevue streets (interior first, then boundary). Shared by the app and scripts/build-addresses.mjs.
// edge: which side of the neighborhood a boundary street forms. The importer traces the
// outline from these and keeps only addresses inside it.
// range: optional [min, max] house-number filter, if the outline ever needs help.
// House numbers themselves come from addresses.js (real address points).
var LUTH_CONFIG = {
  // Contest year. Synced votes are stored per year so seasons never mix.
  YEAR: 2026,
  // Search box for address points: [west, south, east, north] in lon/lat.
  BBOX: [-77.472, 37.578, -77.438, 37.605],
  STREETS: [
    { name: 'Amherst Avenue' },
    { name: 'Avondale Avenue' },
    { name: 'Bellevue Avenue' },
    { name: 'Claremont Avenue' },
    { name: 'Fauquier Avenue' },
    { name: 'Greycourt Avenue' },
    { name: 'MacArthur Avenue' },
    { name: 'Newport Drive' },
    { name: 'Nottoway Avenue' },
    { name: 'Pope Avenue' },
    { name: 'Princeton Road' },
    { name: 'Seminary Avenue' },
    { name: 'Westminster Avenue' },
    { name: 'Windsor Avenue' },
    { name: 'Hermitage Road', boundary: true, edge: 'west' },
    { name: 'Brook Road', boundary: true, edge: 'east' },
    { name: 'W Laburnum Avenue', boundary: true, edge: 'south' },
    { name: 'Westbrook Avenue', boundary: true, edge: 'north' },
  ],
};
if (typeof module !== 'undefined') module.exports = LUTH_CONFIG;
