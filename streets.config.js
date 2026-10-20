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
    { name: 'Chevy Chase Street' },
    { name: 'Claremont Avenue' },
    { name: 'Clinton Avenue' },
    { name: 'Crestwood Road' },
    { name: 'Fauquier Avenue' },
    { name: 'Greycourt Avenue' },
    { name: 'Lorraine Avenue' },
    { name: 'MacArthur Avenue' },
    { name: 'Monticello Street' },
    { name: 'Mt Vernon Street' },
    { name: 'Newport Drive' },
    { name: 'Nottoway Avenue' },
    { name: 'Pope Avenue' },
    { name: 'Princeton Road' },
    { name: 'Stanhope Avenue' },
    { name: 'Warren Avenue' },
    { name: 'Westminster Avenue' },
    { name: 'Windsor Avenue' },
    { name: 'Hermitage Road', boundary: true, edge: 'west' },
    { name: 'Brook Road', boundary: true, edge: 'east' },
    // The 1700 block sits across Hermitage, outside Bellevue.
    { name: 'W Laburnum Avenue', boundary: true, edge: 'south', range: [1100, 1699] },
    { name: 'Westbrook Avenue', boundary: true, edge: 'north' },
  ],
};
if (typeof module !== 'undefined') module.exports = LUTH_CONFIG;
