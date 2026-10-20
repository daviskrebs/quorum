#!/usr/bin/env node
// Builds addresses.js: the house numbers that exist on each Bellevue street.
//
// Source: City of Richmond address points (ArcGIS), falling back to the
// Virginia statewide address points (VGIN). Or pass a local export:
//   npm run build:addresses                          # fetch from the web
//   node scripts/build-addresses.mjs --file pts.json # use a downloaded GeoJSON/Esri JSON
// (Behind a proxy, run with NODE_USE_ENV_PROXY=1.)
//
// Every house number is a real address point. The neighborhood outline is traced
// from the four boundary streets' own address points (edge: in streets.config.js),
// and only points inside it are kept. Review the printed counts before committing.

import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { STREETS, BBOX } = createRequire(import.meta.url)('../streets.config.js');

const ABBR = { AVENUE: 'AVE', ROAD: 'RD', DRIVE: 'DR', STREET: 'ST', WEST: 'W', EAST: 'E', NORTH: 'N', SOUTH: 'S' };
const norm = s => s.toUpperCase().replace(/\./g, '').split(/\s+/).filter(Boolean).map(w => ABBR[w] || w).join(' ');
const baseName = name => name.split(' ').filter(w => !/^(W|E|N|S)$/.test(w)).slice(0, -1).join(' ');

// Richmond's layer is queried by street name; the statewide fallback by bounding box.
const SOURCES = [
  { url: 'https://services1.arcgis.com/k3vhq11XkBNeeOfM/ArcGIS/rest/services/Addresses/FeatureServer',
    where: () => `StreetName IN (${[...new Set(STREETS.map(s => baseName(s.name)))].map(n => `'${n.replace(/'/g, "''")}'`).join(',')})` },
  { url: 'https://gismaps.vdem.virginia.gov/arcgis/rest/services/VA_Base_Layers/VA_Address_Points/FeatureServer', bbox: true },
];
const LABEL_FIELDS = ['AddressLabel', 'FULLADDR', 'FullAddress', 'FULL_ADDRESS', 'ADDRESS', 'Address', 'SITE_ADDRESS'];

// "1405 Bellevue Ave Unit 2" -> { num: "1405", street: "BELLEVUE AVE" }. Also "1313 1/2 ..." -> "1313½"
// and "1600 A ..." -> "1600A" (a lone N/S/E/W is a street direction, not a suffix).
function parseLabel(label) {
  const m = String(label).trim().match(/^(\d+)(\s+1\/2|[A-Z](?=\s)|\s[A-DF-MO-RT-VX-Z](?=\s))?\s+(.+?)(?:\s+(?:UNIT|APT|STE|SUITE|BLDG|#)\b.*)?$/i);
  if (!m) return null;
  const suffix = !m[2] ? '' : m[2].includes('1/2') ? '½' : m[2].trim().toUpperCase();
  return { num: m[1] + suffix, street: norm(m[3]) };
}
function labelOf(attrs) {
  for (const f of LABEL_FIELDS) if (attrs[f]) return attrs[f];
  return Object.values(attrs).find(v => typeof v === 'string' && /^\d+[A-Z]?\s+[A-Z]/i.test(v.trim()));
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const json = await res.json();
  if (json.error) throw new Error(`${json.error.message} ${url}`);
  return json;
}

async function fetchFromService({ url: base, where, bbox }) {
  const meta = await getJSON(`${base}?f=json`);
  const layerId = (meta.layers && meta.layers[0] && meta.layers[0].id) ?? 0;
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const q = new URLSearchParams({
      where: where ? where() : '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326', f: 'json',
      orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: '1000',
    });
    if (bbox) {
      const [xmin, ymin, xmax, ymax] = BBOX;
      Object.entries({ geometry: `${xmin},${ymin},${xmax},${ymax}`, geometryType: 'esriGeometryEnvelope',
        inSR: '4326', spatialRel: 'esriSpatialRelIntersects' }).forEach(([k, v]) => q.set(k, v));
    }
    const page = await getJSON(`${base}/${layerId}/query?${q}`);
    rows.push(...page.features.map(f => ({ attrs: f.attributes, lon: f.geometry?.x, lat: f.geometry?.y })));
    if (!page.exceededTransferLimit && page.features.length < 1000) break;
  }
  return rows;
}

async function loadRows(file) {
  if (file) {
    const json = JSON.parse(await readFile(file, 'utf8'));
    return { source: file, rows: json.features.map(f => {
      const c = f.geometry?.coordinates;
      return { attrs: f.properties || f.attributes, lon: c ? c[0] : f.geometry?.x, lat: c ? c[1] : f.geometry?.y };
    }) };
  }
  for (const src of SOURCES) {
    try {
      const rows = await fetchFromService(src);
      if (rows.length) return { source: src.url, rows };
      console.warn(`No rows from ${src.url}`);
    } catch (e) { console.warn(`Failed: ${src.url}: ${e.message}`); }
  }
  throw new Error('No address source reachable. Download an export and pass --file.');
}

// A boundary street as a line: lon at a given lat (west/east edges) or lat at a given lon (south/north).
function edgeLine(points, edge) {
  const ns = edge === 'west' || edge === 'east';
  const P = points.map(p => ns ? [p.lat, p.lon] : [p.lon, p.lat]).sort((a, b) => a[0] - b[0]);
  return x => {
    let i = P.findIndex(p => p[0] >= x); if (i < 0) i = P.length;
    const near = P.slice(Math.max(0, i - 3), i + 3).map(p => p[1]).sort((a, b) => a - b);
    return near[Math.floor(near.length / 2)];
  };
}

const fileArg = process.argv.indexOf('--file');
const { source, rows } = await loadRows(fileArg > 0 ? process.argv[fileArg + 1] : null);

const byKey = new Map(STREETS.map(s => [norm(s.name), s]));
const parsed = [];
for (const r of rows) {
  const p = parseLabel(labelOf(r.attrs) || '');
  const s = p && byKey.get(p.street);
  if (s) parsed.push({ ...p, s, lat: r.lat, lon: r.lon });
}

// Neighborhood outline from the boundary streets.
const edges = {};
for (const s of STREETS) if (s.edge) {
  const pts = parsed.filter(p => p.s === s && p.lat != null);
  if (pts.length) edges[s.edge] = edgeLine(pts, s.edge);
}
const haveOutline = ['west', 'east', 'south', 'north'].every(e => edges[e]);
if (!haveOutline) console.warn('Could not trace all four boundary streets; keeping every point.');
const TOL = 0.0004; // about 40 m, so houses on the boundary streets themselves count
const inside = p => !haveOutline || p.lat == null || (
  edges.west(p.lat) - TOL <= p.lon && p.lon <= edges.east(p.lat) + TOL &&
  edges.south(p.lon) - TOL <= p.lat && p.lat <= edges.north(p.lon) + TOL);

const out = new Map(STREETS.map(s => [s.name, new Set()])), outside = new Map(STREETS.map(s => [s.name, 0]));
for (const p of parsed) {
  const n = parseInt(p.num, 10);
  const inRange = !p.s.range || (n >= p.s.range[0] && n <= p.s.range[1]);
  if (inside(p) && inRange) out.get(p.s.name).add(p.num);
  else outside.set(p.s.name, outside.get(p.s.name) + 1);
}

const streets = {};
console.log(`Source: ${source} (${rows.length} address points)\n`);
for (const s of STREETS) {
  const list = streets[s.name] = [...out.get(s.name)].sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b));
  const note = outside.get(s.name) ? `  (${outside.get(s.name)} points outside Bellevue)` : '';
  const warn = list.length ? '' : '  <-- none inside the outline; is this street in the contest?';
  console.log(`${s.name.padEnd(20)} ${String(list.length).padStart(4)} houses  ${list[0] ?? '-'}..${list.at(-1) ?? '-'}${note}${warn}`);
}

const data = { generatedAt: new Date().toISOString(), source, streets };
await writeFile(new URL('../addresses.js', import.meta.url),
  `// Generated by scripts/build-addresses.mjs. Do not edit by hand.\nwindow.LUTH_ADDRESSES = ${JSON.stringify(data, null, 1)};\n`);
console.log('\nWrote addresses.js');
