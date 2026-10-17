// Bellevue streets (interior first, then boundary). Shared by the app and scripts/build-addresses.mjs.
// range: optional [min, max] filter for long streets that run past Bellevue.
// House numbers themselves come from addresses.js (real address points).
var LUTH_CONFIG = {
  // Search box for address points: [west, south, east, north] in lon/lat.
  BBOX: [-77.472, 37.578, -77.438, 37.605],
  STREETS: [
    { name: 'Amherst Avenue',     range: [1200, 1400] },
    { name: 'Avondale Avenue',    range: [1200, 1520] },
    { name: 'Bellevue Avenue',    range: [1200, 1720] },
    { name: 'Claremont Avenue',   range: [1300, 1520] },
    { name: 'Fauquier Avenue',    range: [3900, 4320] },
    { name: 'Greycourt Avenue',   range: [1200, 1620] },
    { name: 'MacArthur Avenue',   range: [3900, 4220] },
    { name: 'Newport Drive',      range: [4300, 4520] },
    { name: 'Nottoway Avenue',    range: [1200, 1440] },
    { name: 'Pope Avenue',        range: [1400, 1820] },
    { name: 'Princeton Road',     range: [1400, 1720] },
    { name: 'Seminary Avenue',    range: [1200, 1620] },
    { name: 'Westminster Avenue', range: [1200, 1400] },
    { name: 'Windsor Avenue',     range: [1200, 1400] },
    { name: 'Hermitage Road',     range: [3801, 4203], boundary: true },
    { name: 'Brook Road',         range: [3806, 4708], boundary: true },
    { name: 'W Laburnum Avenue',  range: [1200, 1520], boundary: true },
    { name: 'Westbrook Avenue',   range: [1201, 1631], boundary: true },
  ],
};
if (typeof module !== 'undefined') module.exports = LUTH_CONFIG;
