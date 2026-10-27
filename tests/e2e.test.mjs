// End-to-end tests: several simulated phones judging together against the Firebase
// emulators, with the real security rules. Run with `npm test` (needs Java for the emulator).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, devices } from 'playwright';
import { startServer } from './serve.mjs';

const PORT = 8766, URL = `http://localhost:${PORT}/index.html`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let server, browser;

before(async () => { server = await startServer(PORT); browser = await chromium.launch(); });
after(async () => { await browser?.close(); server?.close(); });

// One judge's phone. Prompts answer with the judge's name; confirms are accepted.
async function phone(name, query = '') {
  const page = await (await browser.newContext({ ...devices['iPhone 13'] })).newPage();
  page.errors = []; page.dialogs = []; page.toasts = [];
  page.on('pageerror', e => page.errors.push(e.message));
  page.on('dialog', async d => { page.dialogs.push(d.message()); d.type() === 'prompt' ? await d.accept(name) : await d.accept(); });
  await page.goto(URL + query);
  await page.waitForFunction(() => window.Cloud && Cloud.uid, null, { timeout: 15000 });
  await page.exposeFunction('logToast', t => page.toasts.push(t));
  await page.evaluate(() => { const show = window.toast; window.toast = m => { logToast(m); show(m); }; });
  return page;
}
const appLoaded = p => p.waitForFunction(() => window.TALLY_EVENT && typeof renderAll === 'function' && Cloud.eventId, null, { timeout: 15000 });
// The host starts the Bellevue preset from the landing page.
async function startBellevue(host) {
  host.dialogs.length = 0;
  await host.click('[data-start="bellevue"]');
  await appLoaded(host);
  return host.evaluate(() => Cloud.eventId);
}
// A host plus judges who opened the event link and joined the group by tapping it in the list.
async function group(...names) {
  const host = await phone(names[0]);
  const eventId = await startBellevue(host);
  await host.click('[data-action="start-session"]');
  await host.waitForFunction(() => Cloud.sessionCode);
  const code = await host.evaluate(() => Cloud.sessionCode);
  const judges = [];
  for (const n of names.slice(1)) {
    const p = await phone(n, '?event=' + eventId);
    await appLoaded(p);
    await p.evaluate(() => refreshGroups(true));
    await p.click(`[data-join-group="${code}"]`, { timeout: 10000 });
    await p.waitForFunction(() => Cloud.sessionCode);
    judges.push(p);
  }
  await sleep(800);
  return { host, judges, code, eventId };
}
async function openVoting(host, street, num, cat) {
  await host.evaluate(s => { closeSheet(); openStreet(s); }, street);
  await host.click(`[data-house="${num}"]`); await sleep(200);
  await host.click(`[data-cat="${cat}"]`);
  await host.click('[data-action="call-house"]'); await sleep(1200);
}
async function score(p, curb, overall, unique) {
  await p.click(`[data-key="curb"] [data-star="${curb}"]`);
  await p.click(`[data-key="overall"] [data-star="${overall}"]`);
  if (unique) await p.click(`[data-key="unique"] [data-star="${unique}"]`);
  await p.click('[data-action="save-next"]'); await sleep(900);
}
const sheetAddr = p => p.evaluate(() => sheet.open ? document.getElementById('sheet-addr').textContent : null);
const text = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const noErrors = (...pages) => pages.forEach(p => assert.deepEqual(p.errors, [], 'page errors'));

test('host opens a house; every judge is sent there with the host\'s category', async () => {
  const { host, judges: [sam, pat] } = await group('Alex', 'Sam', 'Pat');
  await openVoting(host, 'Greycourt Avenue', '1205', 'wonderful');
  assert.equal(await sheetAddr(sam), '1205 Greycourt Avenue');
  assert.equal(await sheetAddr(pat), '1205 Greycourt Avenue');
  assert.match(await text(sam, '#cat-chips'), /It's a Wonderful Life\s*Set by the host/);
  await score(sam, 5, 4);
  await pat.click('[data-action="skip-house"]'); await sleep(1000);
  assert.match(await text(host, '#host-panel'), /2 of 3 done/);
  assert.match(await text(host, '#host-panel'), /Sam\s*✓ 4\.5/);
  // Saving the host's own vote does not close the house; Close voting does.
  await score(host, 3, 3);
  assert.equal(await host.evaluate(() => !!Cloud.session.current), true);
  await host.click('[data-action="close-voting"]'); await sleep(1000);
  assert.equal(await host.evaluate(() => Cloud.session.current), null);
  assert.equal(await sam.evaluate(() => document.querySelector('.screen.active').id), 'screen-street');
  noErrors(host, sam, pat);
});

test('only one house can be open at a time', async () => {
  const { host } = await group('Alex', 'Sam');
  await openVoting(host, 'Greycourt Avenue', '1207', 'tree');
  await host.evaluate(() => { closeSheet(); openSheet('1209'); }); await sleep(300);
  assert.match(await text(host, '#host-panel'), /still open on 1207 Greycourt Avenue/);
  await host.evaluate(() => Cloud.callHouse('Greycourt Avenue', '1209', 'tree')); await sleep(600);
  assert.equal(await host.evaluate(() => Cloud.session.current.num), '1207');
  noErrors(host);
});

test('standings count official votes from 3 judges only, and list the rest', async () => {
  const { host, judges: [sam, pat] } = await group('Alex', 'Sam', 'Pat');
  await openVoting(host, 'Greycourt Avenue', '1302', 'doors');            // 3 judges: places
  for (const p of [host, sam, pat]) await score(p, 4, 4);
  await host.click('[data-action="close-voting"]'); await sleep(800);
  await openVoting(host, 'Greycourt Avenue', '1304', 'doors');            // 2 judges: needs one more
  await score(host, 5, 5); await score(sam, 5, 5);
  await pat.click('[data-action="skip-house"]'); await sleep(500);
  await host.click('[data-action="close-voting"]'); await sleep(800);
  await pat.evaluate(() => { openStreet('Greycourt Avenue'); openSheet('1306'); }); // vote outside the open house
  await pat.click('[data-cat="doors"]'); await score(pat, 5, 5);
  await host.click('[data-tab="results"]'); await sleep(800);
  const standings = await text(host, '#results-content');
  assert.match(standings, /Best Doors in Bellevue.*1302 Greycourt Avenue 3 votes 4/);
  assert.match(standings, /Needs 3 judges.*1304 Greycourt Avenue Best Doors in Bellevue · 2 of 3 judges/);
  assert.match(standings, /Outside a judging group.*1306 Greycourt Avenue Pat/);
  noErrors(host, sam, pat);
});

test('closed votes are locked, and the rules reject forged or out-of-range votes', async () => {
  const { host, judges: [sam], code, eventId } = await group('Alex', 'Sam');
  await openVoting(host, 'Greycourt Avenue', '1218', 'tree');
  await score(sam, 4, 4);
  await host.click('[data-action="close-voting"]'); await sleep(800);
  await sam.evaluate(() => { openStreet('Greycourt Avenue'); openSheet('1218'); }); await sleep(300);
  assert.match(await text(sam, '#sheet-status'), /locked/);
  const results = await sam.evaluate(async ([code, eventId]) => {
    const F = TALLY_FB, app = F.initializeApp(TALLY_FIREBASE, 'probe'), auth = F.getAuth(app);
    F.connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    const db = F.initializeFirestore(app, {}); F.connectFirestoreEmulator(db, 'localhost', 8080);
    const uid = (await F.signInAnonymously(auth)).user.uid;
    const vote = { judgeId: uid, category: 'tree', scores: { curb: 3, overall: 3 }, notes: '', address: 'x', total: 3 };
    const tryWrite = async (id, data) => { try { await F.setDoc(F.doc(db, 'events', eventId, 'votes', id), data); return 'allowed'; } catch { return 'denied'; } };
    return {
      forgedOfficial: await tryWrite(uid + '__a', { ...vote, sessionCode: code, callId: 'made-up' }),
      asSomeoneElse: await tryWrite('other__a', { ...vote, judgeId: 'other' }),
      scoreOfNine: await tryWrite(uid + '__b', { ...vote, scores: { curb: 9, overall: 3 } }),
      unknownCriterion: await tryWrite(uid + '__c', { ...vote, scores: { curb: 3, taste: 5 } }),
      unknownCategory: await tryWrite(uid + '__d', { ...vote, category: 'chili' }),
      plainVoteAllowed: await tryWrite(uid + '__e', vote),
      moveTheGroup: await F.updateDoc(F.doc(db, 'events', eventId, 'sessions', code), { current: null }).then(() => 'allowed', () => 'denied'),
      endSomeoneElsesEvent: await F.updateDoc(F.doc(db, 'events', eventId), { status: 'ended' }).then(() => 'allowed', () => 'denied'),
    };
  }, [code, eventId]);
  assert.deepEqual(results, { forgedOfficial: 'denied', asSomeoneElse: 'denied', scoreOfNine: 'denied', unknownCriterion: 'denied',
    unknownCategory: 'denied', plainVoteAllowed: 'allowed', moveTheGroup: 'denied', endSomeoneElsesEvent: 'denied' });
  noErrors(host, sam);
});

test('a house opened by mistake can be cancelled, then reopened and re-voted', async () => {
  const { host, judges: [sam, pat] } = await group('Alex', 'Sam', 'Pat');
  await openVoting(host, 'Greycourt Avenue', '1220', 'tree');
  await score(sam, 2, 2);
  await host.click('[data-action="cancel-house"]'); await sleep(1500);
  assert.ok(pat.toasts.includes('Host cancelled voting on 1220 Greycourt Avenue'));
  await openVoting(host, 'Greycourt Avenue', '1220', 'wonderful');
  assert.equal(await sheetAddr(sam), '1220 Greycourt Avenue', 'judge with a cancelled vote is sent back');
  for (const p of [host, sam, pat]) await score(p, 4, 4);
  assert.match(await text(host, '#host-panel'), /3 of 3 done/);
  noErrors(host, sam, pat);
});

test('a judge who leaves by mistake can rejoin in one tap; ending the group removes everyone', async () => {
  const { host, judges: [sam], code } = await group('Alex', 'Sam');
  await openVoting(host, 'Greycourt Avenue', '1222', 'tree');
  await sam.evaluate(() => { closeSheet(); showScreen('streets'); });
  await sam.click('[data-action="leave-session"]'); await sleep(1000);
  assert.match(sam.dialogs.at(-1), /Leave this judging group\?/);
  await sam.evaluate(() => refreshGroups(true)); await sleep(1500);
  assert.match(await text(sam, '#session-card .btn-primary'), /Rejoin Alex's group/);
  await sam.click('#session-card .btn-primary'); await sleep(1500);
  assert.equal(await sheetAddr(sam), '1222 Greycourt Avenue', 'rejoining lands on the open house');
  await host.evaluate(() => { closeSheet(); showScreen('streets'); });
  await host.click('[data-action="end-session"]'); await sleep(1500);
  assert.match(host.dialogs.at(-1), /End this judging group for everyone\?/);
  assert.equal(await sam.evaluate(() => Cloud.sessionCode), null);
  const rejoin = await sam.evaluate(async c => Cloud.joinSession(c, 'Sam').then(() => 'joined', e => e.message), code);
  assert.equal(rejoin, 'That judging group has ended');
  noErrors(host, sam);
});

test('hosting can be handed off, or taken over by a judge', async () => {
  const { host, judges: [sam, pat] } = await group('Alex', 'Sam', 'Pat');
  const samUid = await sam.evaluate(() => Cloud.uid);
  await host.click('[data-action="pick-host"]');
  await host.click(`[data-make-host="${samUid}"]`); await sleep(1200);
  assert.equal(await sam.evaluate(() => Cloud.isHost()), true);
  assert.ok(pat.toasts.includes('Sam is now the host'));
  await pat.click('[data-action="claim-host"]'); await sleep(1200);
  assert.equal(await pat.evaluate(() => Cloud.isHost()), true);
  assert.equal(await sam.evaluate(() => Cloud.isHost()), false);
  noErrors(host, sam, pat);
});

test('the landing page lists events in progress, and a second preset start warns first', async () => {
  const host = await phone('Alex');
  const eventId = await startBellevue(host);
  const visitor = await phone('Riley');
  await visitor.waitForSelector(`[data-open="${eventId}"]`, { timeout: 10000 });
  assert.match(await text(visitor, '#home-content'), /Bellevue Holiday Lights Competition.*Started by Alex/);
  visitor.dialogs.length = 0;
  await visitor.evaluate(() => { window.confirm = m => { window._lastConfirm = m; return false; }; });
  await visitor.click('[data-start="bellevue"]'); await sleep(300);
  assert.match(await visitor.evaluate(() => window._lastConfirm), /Alex already started Bellevue Holiday Lights Competition/);
  assert.equal(await visitor.evaluate(() => !!window.TALLY_EVENT), false, 'cancelling keeps them on the landing page');
  await visitor.fill('#event-code', eventId.toLowerCase());
  await visitor.click('[data-home="join-code"]');
  await appLoaded(visitor);
  assert.equal(await visitor.evaluate(() => Cloud.eventId), eventId);
  assert.match(await text(visitor, '#event-name'), /Bellevue Holiday Lights Competition/);
  noErrors(host, visitor);
});

test('a new event runs on its own entries, categories, and criteria', async () => {
  const host = await phone('Morgan');
  await host.click('[data-home="create"]');
  await host.fill('#f-name', 'Fall Chili Cook-off');
  await host.fill('#f-entries', 'Red tent:\nSmoky Joe\nThree Bean\nBlue tent:\nVerde Fuego');
  await host.fill('#f-cats', 'Best Overall\nHottest - most heat');
  await host.fill('#f-crit', 'Taste - flavor and balance\nAroma');
  await host.fill('#f-min', '2');
  await host.click('[data-home="create-submit"]');
  await appLoaded(host);
  const eventId = await host.evaluate(() => Cloud.eventId);
  assert.match(await text(host, '#street-groups'), /Red tent.*Blue tent/);
  await host.click('[data-action="start-session"]'); await host.waitForFunction(() => Cloud.sessionCode);
  const code = await host.evaluate(() => Cloud.sessionCode);
  const judge = await phone('Casey', '?event=' + eventId);
  await appLoaded(judge);
  await judge.evaluate(() => refreshGroups(true));
  await judge.click(`[data-join-group="${code}"]`, { timeout: 10000 }); await sleep(800);
  await host.evaluate(() => openStreet('Red tent'));
  await host.click('[data-house="Smoky Joe"]'); await sleep(200);
  await host.click('[data-cat="hottest"]'); await host.click('[data-action="call-house"]'); await sleep(1200);
  assert.equal(await sheetAddr(judge), 'Smoky Joe');
  assert.match(await text(judge, '#criteria'), /Taste.*flavor and balance.*Aroma/);
  await judge.click('[data-key="taste"] [data-star="5"]'); await judge.click('[data-key="aroma"] [data-star="4"]');
  await judge.click('[data-action="save-next"]'); await sleep(900);
  await host.click('[data-key="taste"] [data-star="3"]'); await host.click('[data-key="aroma"] [data-star="3"]');
  await host.click('[data-action="save-next"]'); await sleep(900);
  await host.click('[data-action="close-voting"]'); await sleep(800);
  await host.click('[data-tab="results"]'); await sleep(600);
  assert.match(await text(host, '#results-content'), /Hottest.*Smoky Joe 2 votes 3\.8/);
  // Organizer can end the event; votes are then refused.
  await host.click('[data-tab="export"]');
  await host.click('[data-action="end-event"]'); await sleep(1200);
  await judge.waitForFunction(() => TALLY_EVENT.status === 'ended', null, { timeout: 5000 });
  assert.equal(await judge.evaluate(() => getComputedStyle(document.getElementById('event-ended')).display), 'block');
  noErrors(host, judge);
});
