# Light Up the Hood

Judging app for the Bellevue (Richmond, VA) holiday lights contest. Judges pick a street, walk it, and score each house.

## Files
- `index.html`: the app (works offline once loaded; "Add to Home Screen" on iPhone for a full-screen app)
- `streets.config.js`: the streets in the contest, with optional number ranges for long boundary streets
- `addresses.js`: real house numbers per street. **Generated**, do not hand-edit
- `scripts/build-addresses.mjs`: builds `addresses.js` from City of Richmond address points

## Load real house numbers
```sh
node scripts/build-addresses.mjs            # fetches Richmond GIS, falls back to Virginia VGIN
node scripts/build-addresses.mjs --file x.json   # or use a downloaded GeoJSON / Esri JSON export
```
It prints a count per street. Check those against what you know before committing. If a street shows "outside range", widen its `range` in `streets.config.js`.

Houses the data misses can be added in the app ("House not listed?"). They're saved on that judge's device.

## Judging flow
Streets → pick a street → houses shown odd side / even side → tap a house → score → **Save & next house** moves to the next unjudged house. **No display · skip** marks a house as reviewed. Each street shows progress.

Votes stay on each judge's device. Export a CSV from the Export tab, and the organizer merges them.
