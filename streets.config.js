// Bellevue streets (interior first, then boundary). Shared by the app and scripts/build-addresses.mjs.
// edge: which side of the neighborhood a boundary street forms. The importer traces the
// outline from these and keeps only addresses inside it.
// range: optional [min, max] house-number filter, if the outline ever needs help.
// side: on boundary streets only the Bellevue side is judged. Odd/even was checked
// against map coordinates of neighboring houses.
// House numbers themselves come from addresses.js (real address points).
var LUTH_CONFIG = {
  // Contest year. Synced votes are stored per year so seasons never mix.
  YEAR: 2026,
  // Change this number to wipe what's saved on each phone (skips, added houses, session)
  // the next time it opens the site. Bump it once when testing is done.
  PHONE_DATA_VERSION: 1,
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
    { name: 'Lamont Street' },
    { name: 'Lorraine Avenue' },
    { name: 'MacArthur Avenue' },
    { name: 'Monticello Street' },
    { name: 'Mt Vernon Street' },
    { name: 'Newport Drive' },
    { name: 'Nottoway Avenue' },
    { name: 'Pope Avenue' },
    { name: 'Princeton Road' },
    { name: 'Stanhope Avenue' },
    { name: 'Stratford Avenue' },
    { name: 'Warren Avenue' },
    { name: 'Westminster Avenue' },
    { name: 'Windsor Avenue' },
    { name: 'Hermitage Road', boundary: true, edge: 'west', side: 'odd', sideLabel: 'East side' },
    { name: 'Brook Road', boundary: true, edge: 'east', side: 'even', sideLabel: 'West side' },
    // The 1700 block sits across Hermitage, outside Bellevue.
    { name: 'W Laburnum Avenue', boundary: true, edge: 'south', range: [1100, 1699], side: 'even', sideLabel: 'North side' },
    { name: 'Westbrook Avenue', boundary: true, edge: 'north', side: 'odd', sideLabel: 'South side' },
  ],
};
if (typeof module !== 'undefined') module.exports = LUTH_CONFIG;
