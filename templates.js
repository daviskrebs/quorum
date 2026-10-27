// Preset events. Starting one creates an event from it; everything an event needs to run
// (layout, wording, categories, criteria, entries) lives here or in the event record.
//
// Event shape (shared with events created on the landing page):
//   name, place, layout: 'streets' (house numbers by block and side) | 'list' (named entries)
//   nouns: words the app uses for entries and sections, e.g. house/street or entry/section
//   theme: optional look, e.g. 'lights'
//   categories: [{ key, label, sub }]
//   criteria:   [{ key, label, desc, cats }]   cats: category keys it applies to, or null for all
//   minJudges:  judges needed before an entry places
//   sections:   [{ name, entries: [string], boundary, side, sideLabel }]
//   allowAdd:   judges may add an entry that isn't listed (e.g. a house the data missed)
(function () {
  const B = window.TALLY_BELLEVUE, A = (window.TALLY_BELLEVUE_ADDRESSES || {}).streets || {};
  const bellevue = {
    key: 'bellevue',
    name: 'Bellevue Holiday Lights Competition',
    place: 'Richmond, VA',
    blurb: 'Holiday lights in the Bellevue neighborhood, judged street by street.',
    layout: 'streets',
    theme: 'lights',
    nouns: { entry: 'house', entries: 'houses', section: 'street', sections: 'streets', skip: 'No display' },
    categories: [
      { key: 'wonderful', label: "It's a Wonderful Life", sub: 'Traditional, no inflatables' },
      { key: 'anything', label: 'Anything Goes', sub: 'Unique!' },
      { key: 'tree', label: 'Oh, Christmas Tree', sub: 'Best single tree' },
      { key: 'doors', label: 'Best Doors in Bellevue', sub: '' },
    ],
    criteria: [
      { key: 'curb', label: 'Curb Appeal', desc: 'First impression: wow factor from the street', cats: null },
      { key: 'overall', label: 'Overall Presentation', desc: 'Cohesion, effort, and execution', cats: null },
      { key: 'unique', label: 'Unique Design', desc: 'Creative use of lights and decorations', cats: ['anything'] },
    ],
    minJudges: 3,
    allowAdd: true,
    source: (window.TALLY_BELLEVUE_ADDRESSES || {}).source || null,
    sourceDate: (window.TALLY_BELLEVUE_ADDRESSES || {}).generatedAt || null,
    sections: B ? B.STREETS.map(s => ({ name: s.name, entries: A[s.name] || [], boundary: !!s.boundary, side: s.side || null, sideLabel: s.sideLabel || null })) : [],
  };
  bellevue.count = bellevue.sections.reduce((n, s) => n + s.entries.length, 0);
  window.TALLY_TEMPLATES = { bellevue };
})();
