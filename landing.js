// Tally's front door: pick, join, or create an event, then load the judging app (app.js) for it.
// Also defines helpers shared with app.js.

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('Storage full: export and remove photos'); return false; } },
};
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200); }

// Change this number to wipe what's saved on every phone (skips, added entries, groups)
// the next time it opens Tally. Judge names are kept. Bump it once when testing is done.
const PHONE_DATA_VERSION = 1;
try {
  if (localStorage.getItem('tally_phone_data_version') !== String(PHONE_DATA_VERSION)) {
    const keep = ['tally_judge_name', 'tally_judge_id'];
    Object.keys(localStorage).filter(k => k.startsWith('tally_') && !keep.includes(k)).forEach(k => localStorage.removeItem(k));
    localStorage.setItem('tally_phone_data_version', String(PHONE_DATA_VERSION));
  }
} catch (e) {}

const TEMPLATES = window.TALLY_TEMPLATES || {};
const LOCAL_PREFIX = 'LOCAL-'; // phone-only events (no Firebase config)

function askName() {
  let n = store.get('tally_judge_name', '');
  while (!n) { n = (prompt('Your name (shown to the other judges)') || '').trim(); if (!n) return null; }
  store.set('tally_judge_name', n); return n;
}
function goHome() {
  try { localStorage.removeItem('tally_current_event'); } catch (e) {}
  location.href = location.pathname;
}

// ---------- Loading an event ----------
// A preset event's record holds its settings; its entries (e.g. Bellevue's 1,243 houses) come from the template.
function withTemplate(ev) {
  const t = ev.template && TEMPLATES[ev.template];
  return t ? { ...t, ...ev, sections: t.sections, source: t.source, sourceDate: t.sourceDate } : ev;
}
async function openEvent(id) {
  id = id.trim().toUpperCase();
  let ev;
  if (id.startsWith(LOCAL_PREFIX)) {
    const t = TEMPLATES[id.slice(LOCAL_PREFIX.length).toLowerCase()];
    ev = t && { ...t, id, template: t.key, status: 'active', year: new Date().getFullYear() };
  } else if (Cloud.enabled) {
    ev = await Cloud.getEvent(id).catch(() => null);
  }
  if (!ev) { showHome(); toast('No event with code ' + id); return; }
  ev = withTemplate(ev);
  window.TALLY_EVENT = ev;
  store.set('tally_current_event', id);
  store.set('tally_recent_event', { id, name: ev.name });
  const q = new URLSearchParams(location.search); q.set('event', id);
  history.replaceState(null, '', location.pathname + '?' + q);
  if (Cloud.enabled && !id.startsWith(LOCAL_PREFIX)) await Cloud.startEvent(id);
  $('loading').hidden = true; $('home').hidden = true;
  $('app-root').hidden = false; $('app-chrome').hidden = false;
  const s = document.createElement('script'); s.src = 'app.js'; document.body.appendChild(s);
}

// ---------- Landing page ----------
let liveEvents = null;
let homeView = 'main'; // 'create' while the create-event form is open, so background refreshes leave it alone
function showHome() {
  $('loading').hidden = true; $('home').hidden = false; $('app-root').hidden = true; $('app-chrome').hidden = true;
  document.title = 'Tally · Judge anything together';
  renderHome();
  if (Cloud.enabled) Cloud.listActiveEvents().then(list => { liveEvents = list; }).catch(() => { liveEvents = liveEvents || []; })
    .finally(() => { if (homeView === 'main') renderHome(); });
}
function when(ms) { return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function renderHome() {
  homeView = 'main';
  const recent = store.get('tally_recent_event', null);
  const events = liveEvents || [];
  const presets = Object.values(TEMPLATES);
  const join = Cloud.enabled ? `<div class="card"><div class="card-title">Join an event</div>
      <label for="event-code">Event code</label>
      <div class="code-row"><input type="text" id="event-code" placeholder="ABC123" maxlength="12" autocomplete="off" autocapitalize="characters">
        <button class="btn btn-primary btn-sm" data-home="join-code">Join</button></div>
      ${events.length ? `<div class="section-label" style="margin:16px 0 4px">In progress</div>` + events.map(e => `<div class="event-row">
          <span><b>${esc(e.name)}</b><span class="muted" style="font-size:12px">${[e.place, e.createdByName && 'Started by ' + e.createdByName, when(e.createdMs), 'code ' + e.id].filter(Boolean).map(esc).join(' &middot; ')}</span></span>
          <button class="btn btn-secondary btn-sm" data-open="${esc(e.id)}">Join</button></div>`).join('')
        : `<p class="muted" style="margin-top:12px">${liveEvents ? 'No events are in progress right now.' : 'Looking for events in progress...'}</p>`}
    </div>` : '';
  $('home-content').innerHTML =
    (recent ? `<button class="btn btn-primary" style="margin:0 0 12px" data-open="${esc(recent.id)}">Continue: ${esc(recent.name)}</button>` : '') +
    join +
    `<div class="card"><div class="card-title">Start a preset event</div>
      <p class="muted">Ready to go, with entries, categories, and scoring already set up.</p>
      ${presets.map(t => `<div class="preset"><b>${esc(t.name)}</b>
        <div class="muted" style="margin:4px 0 2px">${esc(t.blurb || '')}</div>
        <div class="muted" style="font-size:12px">${esc([t.place, t.count ? t.count.toLocaleString() + ' ' + t.nouns.entries : '', t.categories.length + ' categories'].filter(Boolean).join(' · '))}</div>
        <button class="btn btn-gold" data-start="${esc(t.key)}">Start ${esc(t.name)}</button></div>`).join('')}
    </div>` +
    (Cloud.enabled ? `<div class="card"><div class="card-title">Create a new event</div>
      <p class="muted">Any judged competition: a chili cook-off, a science fair, a talent show. Add your entries, categories, and what judges score.</p>
      <button class="btn btn-secondary" data-home="create">Create an event</button></div>` : '');
}
async function startPreset(key) {
  const t = TEMPLATES[key]; if (!t) return;
  if (!Cloud.enabled) { openEvent(LOCAL_PREFIX + key.toUpperCase()); return; }
  const same = (liveEvents || []).filter(e => e.template === key);
  if (same.length && !confirm(`${same[0].createdByName || 'Someone'} already started ${t.name} (code ${same[0].id}). Start a separate one anyway?\n\nTo judge with them, tap Join instead.`)) return;
  const name = askName(); if (!name) return;
  try {
    const { key: template, name: evName, place, layout, theme, nouns, categories, criteria, minJudges, allowAdd, blurb } = t;
    const id = await Cloud.createEvent({ template, name: evName, place, layout, theme, nouns, categories, criteria, minJudges, allowAdd, blurb, createdByName: name });
    openEvent(id);
  } catch (e) { toast('Could not start the event. Try again.'); }
}

// ---------- Create an event ----------
const slugKey = (s, used) => {
  let k = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'item';
  let out = k, n = 2; while (used.has(out)) out = k + '_' + n++;
  used.add(out); return out;
};
// "Label - description" per line.
const parseLines = text => text.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
  const m = l.match(/^(.*?)\s+[-–—]\s+(.*)$/); return m ? { label: m[1].trim(), desc: m[2].trim() } : { label: l, desc: '' };
});
// Entries, one per line; a line ending in ":" starts a section.
function parseEntries(text) {
  const sections = []; let cur = null; const seen = new Set();
  for (const raw of text.split('\n')) {
    const l = raw.trim(); if (!l) continue;
    if (l.endsWith(':')) { cur = { name: l.slice(0, -1).trim() || 'Entries', entries: [] }; sections.push(cur); continue; }
    if (!cur) { cur = { name: 'Entries', entries: [] }; sections.push(cur); }
    let name = l, n = 2; while (seen.has(name.toLowerCase())) name = `${l} (${n++})`;
    seen.add(name.toLowerCase()); cur.entries.push(name);
  }
  return sections.filter(s => s.entries.length);
}
function showCreate() {
  homeView = 'create';
  $('home-content').innerHTML = `<div class="card"><div class="card-title">Create an event</div>
    <div class="form-row"><label for="f-name">Event name</label><input type="text" id="f-name" placeholder="Fall Chili Cook-off" maxlength="80"></div>
    <div class="form-row"><label for="f-place">Where (optional)</label><input type="text" id="f-place" placeholder="Bryan Park, Richmond" maxlength="80"></div>
    <div class="form-row"><label for="f-entries">Entries</label>
      <textarea id="f-entries" rows="7" placeholder="Red tent:\nSmoky Joe's\nThree Bean Surprise\nBlue tent:\nVerde Fuego"></textarea>
      <div class="form-hint">One entry per line. Optional: group them under a heading that ends with a colon, like "Red tent:".</div></div>
    <div class="form-row"><label for="f-cats">Categories</label>
      <textarea id="f-cats" rows="3" placeholder="Best Overall\nPeople's Choice - crowd favorite">Best Overall</textarea>
      <div class="form-hint">One per line. The host picks one when opening voting on an entry.</div></div>
    <div class="form-row"><label for="f-crit">What judges score (1 to 5 stars each)</label>
      <textarea id="f-crit" rows="3" placeholder="Taste - flavor and balance\nPresentation">Overall - your overall impression</textarea>
      <div class="form-hint">One per line, with an optional description after a dash.</div></div>
    <div class="form-row"><label for="f-min">Judges needed before an entry places</label><input type="number" id="f-min" value="3" min="1" max="50"></div>
    <button class="btn btn-primary" data-home="create-submit">Create event</button>
    <button class="btn btn-ghost" data-home="cancel">Cancel</button></div>`;
  $('f-name').focus();
}
async function createSubmit() {
  const name = $('f-name').value.trim(), place = $('f-place').value.trim();
  const sections = parseEntries($('f-entries').value);
  const used = new Set(), usedC = new Set();
  const categories = parseLines($('f-cats').value).slice(0, 20).map(c => ({ key: slugKey(c.label, used), label: c.label, sub: c.desc }));
  const criteria = parseLines($('f-crit').value).slice(0, 10).map(c => ({ key: slugKey(c.label, usedC), label: c.label, desc: c.desc, cats: null }));
  const minJudges = Math.max(1, Math.min(50, parseInt($('f-min').value, 10) || 3));
  if (!name) return toast('Give the event a name');
  if (!sections.length) return toast('Add at least one entry');
  if (!categories.length) return toast('Add at least one category');
  if (!criteria.length) return toast('Add at least one thing to score');
  const judge = askName(); if (!judge) return;
  try {
    const id = await Cloud.createEvent({
      template: null, name, place: place || null, layout: 'list', theme: null,
      nouns: { entry: 'entry', entries: 'entries', section: 'section', sections: 'sections', skip: 'Skip' },
      categories, criteria, minJudges, allowAdd: false, sections, createdByName: judge,
    });
    openEvent(id);
  } catch (e) { toast('Could not create the event. Try again.'); }
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-home],[data-open],[data-start]');
  if (!t || $('home').hidden) return;
  if (t.dataset.open) return openEvent(t.dataset.open);
  if (t.dataset.start) return startPreset(t.dataset.start);
  ({
    'join-code': () => { const c = $('event-code').value.trim(); if (c) openEvent(c); else toast('Enter an event code'); },
    create: showCreate, cancel: renderHome, 'create-submit': createSubmit,
  })[t.dataset.home]?.();
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'event-code') { const c = e.target.value.trim(); if (c) openEvent(c); } });

// ---------- Boot ----------
(function boot() {
  const q = new URLSearchParams(location.search);
  const id = q.get('event') || store.get('tally_current_event', null);
  if (id) openEvent(id); else showHome();
})();
