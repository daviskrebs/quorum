# Light Up the Hood

Judging app for the Bellevue (Richmond, VA) holiday lights contest. Judges pick a street, walk it, and score each house.

## Files
- `index.html`: the app (works offline once loaded; "Add to Home Screen" on iPhone for a full-screen app)
- `streets.config.js`: the streets in the contest, with optional number ranges for long boundary streets
- `addresses.js`: real house numbers per street. **Generated**, do not hand-edit
- `scripts/build-addresses.mjs`: builds `addresses.js` from City of Richmond address points

## Load real house numbers
```sh
npm run build:addresses                   # fetches Richmond GIS (NODE_USE_ENV_PROXY=1 behind a proxy)
node scripts/build-addresses.mjs --file x.json   # or use a downloaded GeoJSON / Esri JSON export
```
It traces the neighborhood outline from the four boundary streets (`edge:` in `streets.config.js`) and keeps only addresses inside it. It prints a count per street; check them before committing.

Houses the data misses can be added in the app ("House not listed?"). They're saved on that judge's device.

## Judging flow
Streets → pick a street → houses shown odd side / even side → tap a house → score → **Save & next house** moves to the next unjudged house. **No display · skip** marks a house as reviewed. Each street shows progress.

## Live sync (Firebase)
With `firebase.config.js` filled in, votes and photos sync to Firestore under `contests/{YEAR}`. Standings are live for every judge, and phones that lose signal catch up when they reconnect. With it set to `null`, votes stay on each phone and judges export CSVs.

**Judging sessions:** one person taps **Start session** and shares the 4-letter code or invite link. When the host opens a house and taps **Open voting**, every judge's phone jumps to that house. The host sees who has scored, skipped, or is still deciding, and taps **Close voting** when everyone is done (saving their own vote does not close it). After voting, phones return to the street's house list.

**Setup:** paste `firestore.rules` into Firebase console → Firestore → Rules → Publish. Re-paste it whenever it changes.

**Each year:** bump `YEAR` in `streets.config.js` and rerun the address import.

**Local testing:** `npx firebase-tools emulators:start --project demo-luth --only auth,firestore`, then set `useEmulator: true` and `projectId: 'demo-luth'` in a local copy of the config.

`vendor/firebase.js` is the bundled Firebase SDK (`npm install && npm run build:firebase` to rebuild).
