// Sanity checks on the generated municipality seeds, without a database.
//   node --test packages/db/test/municipalities-catalog.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SEEDS = join(HERE, '../seeds');

// Parse every VALUES tuple of `insert into municipalities (...) values ...`.
function parse(file) {
  const sql = readFileSync(join(SEEDS, file), 'utf8');
  const rows = [];
  for (const stmt of sql.matchAll(/insert into municipalities \(([^)]*)\)\s*values([\s\S]*?)on conflict/g)) {
    const cols = stmt[1].split(',').map((c) => c.trim());
    const body = stmt[2];
    let i = 0;
    while (i < body.length) {
      if (body[i] !== '(') { i++; continue; }
      i++;
      const vals = [];
      for (;;) {
        while (/\s/.test(body[i])) i++;
        if (body[i] === "'") {
          let s = '';
          i++;
          for (;;) {
            if (body[i] === "'" && body[i + 1] === "'") { s += "'"; i += 2; } else if (body[i] === "'") { i++; break; } else s += body[i++];
          }
          vals.push(s);
        } else {
          const m = /^[^,)]+/.exec(body.slice(i));
          const raw = m[0].trim();
          vals.push(raw === 'null' ? null : Number(raw));
          i += m[0].length;
        }
        while (/\s/.test(body[i])) i++;
        if (body[i] === ',') { i++; continue; }
        if (body[i] === ')') { i++; break; }
        throw new Error(`${file}: unexpected '${body[i]}' near ${body.slice(i - 40, i + 10)}`);
      }
      assert.equal(vals.length, cols.length, `${file}: tuple width`);
      rows.push(Object.fromEntries(cols.map((c, k) => [c, vals[k]])));
    }
  }
  return { sql, rows };
}

const GENERATED = {
  HN: 'municipalities_hn.sql',
  GT: 'municipalities_gt.sql',
  MX: 'municipalities_mx.sql',
  JM: 'municipalities_jm_towns.sql',
};
const data = Object.fromEntries(Object.entries(GENERATED).map(([cc, f]) => [cc, parse(f)]));
const handJm = parse('municipalities_jm.sql');

// Generous boxes around each country's land (incl. islands that host ADM2 points).
const BBOX = {
  HN: { lat: [12.9, 17.5], lng: [-89.4, -83.1] },
  GT: { lat: [13.6, 17.9], lng: [-92.3, -88.1] },
  MX: { lat: [14.5, 32.8], lng: [-118.5, -86.6] },
  JM: { lat: [17.6, 18.6], lng: [-78.4, -76.1] },
};

const find = (cc, region, name) => data[cc].rows.find((r) => r.admin_region === region && r.name === name);
const near = (r, lat, lng, tol = 0.15) => Math.abs(r.lat - lat) < tol && Math.abs(r.lng - lng) < tol;

test('headers carry source, licence, attribution, download date, generator and row count', () => {
  for (const [cc, { sql, rows }] of Object.entries(data)) {
    assert.match(sql, /Contains data from GeoNames, CC BY 4\.0/, cc);
    assert.match(sql, /creativecommons\.org\/licenses\/by\/4\.0/, cc);
    assert.match(sql, /Downloaded:\s+\d{4}-\d{2}-\d{2}/, cc);
    assert.match(sql, /node packages\/db\/scripts\/build-municipalities\.mjs/, cc);
    assert.equal(Number(/Rows:\s+(\d+)/.exec(sql)[1]), rows.length, `${cc} header row count`);
    for (const stmt of sql.match(/on conflict[^;]*;/g)) {
      assert.equal(stmt, 'on conflict (country, admin_region, name) do update set lat = excluded.lat, lng = excluded.lng, timezone = excluded.timezone, population = excluded.population;');
    }
  }
});

test('inserts are batched at 500 rows or fewer', () => {
  for (const [cc, { sql }] of Object.entries(data)) {
    for (const stmt of sql.split(/^insert into/m).slice(1)) {
      assert.ok((stmt.match(/^\s+\(/gm) ?? []).length <= 500, cc);
    }
  }
});

test('row counts against official counts', () => {
  // Honduras: 298 municipios (INE). Guatemala: 340 municipios (INE).
  assert.equal(data.HN.rows.length, 298);
  assert.equal(data.GT.rows.length, 340);
  // Mexico: INEGI catalogue (2026-09) lists 2,478 = 2,462 municipios + 16 CDMX
  // alcaldías. GeoNames (2026-09-13) lacks 7 municipios created after the 2020
  // census: Las Vigas, Ñuu Savi, Santa Cruz del Rincón, San Nicolás (Guerrero),
  // Villa de Pozos (San Luis Potosí), Eldorado, Juan José Ríos (Sinaloa).
  assert.ok(data.MX.rows.length >= 2471 && data.MX.rows.length <= 2478, `MX ${data.MX.rows.length}`);
  assert.equal(data.MX.rows.filter((r) => r.admin_region === 'Ciudad de México').length, 16);
  assert.equal(new Set(data.HN.rows.map((r) => r.admin_region)).size, 18);
  assert.equal(new Set(data.GT.rows.map((r) => r.admin_region)).size, 22);
  assert.equal(new Set(data.MX.rows.map((r) => r.admin_region)).size, 32);
});

test('every row: right country, non-empty trimmed name, point inside the country, timezone set', () => {
  for (const [cc, { rows }] of Object.entries(data)) {
    const box = BBOX[cc];
    for (const r of rows) {
      const where = `${cc} ${r.admin_region} / ${r.name}`;
      assert.equal(r.country, cc, where);
      assert.ok(r.name && r.name === r.name.trim(), `empty or untrimmed name: ${where}`);
      assert.ok(r.admin_region && r.admin_region === r.admin_region.trim(), `bad region: ${where}`);
      assert.doesNotMatch(r.name, /^Munic[ií]pio |[Mm]unicipality$|Dto\./, where);
      assert.doesNotMatch(r.admin_region, /^(Departamento|Estado) de/, where);
      assert.ok(r.lat >= box.lat[0] && r.lat <= box.lat[1], `lat out of box: ${where} ${r.lat}`);
      assert.ok(r.lng >= box.lng[0] && r.lng <= box.lng[1], `lng out of box: ${where} ${r.lng}`);
      assert.ok(r.timezone, `timezone missing: ${where}`);
      assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone: r.timezone }), where);
      assert.ok(r.population === null || (Number.isInteger(r.population) && r.population > 0), where);
    }
  }
});

test('(country, admin_region, name) is unique within and across municipality seeds', () => {
  const seen = new Map();
  const files = readdirSync(SEEDS).filter((f) => /^municipalities_.*\.sql$/.test(f)).sort();
  for (const f of files) {
    for (const r of parse(f).rows) {
      const k = `${r.country}|${r.admin_region}|${r.name}`;
      assert.ok(!seen.has(k), `${k} in both ${seen.get(k)} and ${f}`);
      seen.set(k, f);
    }
  }
});

test('Mexico uses more than one timezone, and the right ones where it matters', () => {
  assert.ok(new Set(data.MX.rows.map((r) => r.timezone)).size >= 5);
  assert.equal(find('MX', 'Baja California', 'Tijuana').timezone, 'America/Tijuana');
  assert.equal(find('MX', 'Quintana Roo', 'Benito Juárez').timezone, 'America/Cancun');
  assert.equal(find('MX', 'Sonora', 'Hermosillo').timezone, 'America/Hermosillo');
  assert.equal(find('MX', 'Guanajuato', 'León').timezone, 'America/Mexico_City');
});

test('spot checks: known places are where they should be', () => {
  assert.ok(near(find('HN', 'Cortés', 'San Pedro Sula'), 15.50, -88.03));
  // Points are the town, not somewhere in the municipio: these ADM2 points were
  // 5-10 km out, in the hills, and their forecasts ran several degrees cold.
  assert.ok(near(find('HN', 'Atlántida', 'La Ceiba'), 15.76, -86.79, 0.03));
  assert.ok(near(find('HN', 'Cortés', 'San Pedro Sula'), 15.505, -88.025, 0.03));
  assert.ok(near(find('GT', 'Huehuetenango', 'Huehuetenango'), 15.32, -91.47, 0.03));
  assert.ok(near(find('MX', 'Michoacán', 'Uruapan'), 19.42, -102.06, 0.03));
  assert.ok(near(find('HN', 'Francisco Morazán', 'Distrito Central'), 14.10, -87.20, 0.3));
  assert.ok(near(find('GT', 'Quetzaltenango', 'Quetzaltenango'), 14.84, -91.52));
  assert.ok(near(find('GT', 'Guatemala', 'Guatemala'), 14.63, -90.51));
  // Guanajuato and Michoacán: where many Leamington workers come from.
  assert.ok(near(find('MX', 'Guanajuato', 'León'), 21.12, -101.68));
  assert.ok(near(find('MX', 'Guanajuato', 'Irapuato'), 20.67, -101.35));
  assert.ok(near(find('MX', 'Guanajuato', 'Celaya'), 20.52, -100.81));
  assert.ok(near(find('MX', 'Guanajuato', 'Pénjamo'), 20.43, -101.72, 0.2));
  assert.ok(near(find('MX', 'Guanajuato', 'Acámbaro'), 20.03, -100.72));
  assert.ok(near(find('MX', 'Michoacán', 'Morelia'), 19.70, -101.19, 0.2));
  assert.ok(near(find('MX', 'Michoacán', 'Uruapan'), 19.42, -102.06));
  assert.ok(near(find('MX', 'Michoacán', 'Zamora'), 19.99, -102.28));
  assert.ok(near(find('MX', 'Michoacán', 'Apatzingán'), 19.09, -102.35, 0.2));
  assert.equal(data.MX.rows.filter((r) => r.admin_region === 'Guanajuato').length, 46);
  assert.equal(data.MX.rows.filter((r) => r.admin_region === 'Michoacán').length, 113);
  assert.ok(near(find('JM', 'St. James', 'Barrett Town'), 18.51, -77.80));
});

test('Jamaica: the hand-written 12 are untouched and parish names match them', () => {
  assert.equal(handJm.rows.length, 12);
  assert.match(handJm.sql, /do nothing;/);
  const kingston = handJm.rows.find((r) => r.name === 'Kingston');
  assert.deepEqual([kingston.admin_region, kingston.lat, kingston.lng], ['Kingston', 17.9714, -76.7931]);
  const parishes = new Set(['Clarendon', 'Hanover', 'Manchester', 'Portland', 'St. Andrew', 'St. Ann',
    'St. Catherine', 'St. Elizabeth', 'St. James', 'St. Mary', 'St. Thomas', 'Trelawny', 'Westmoreland', 'Kingston']);
  for (const r of [...handJm.rows, ...data.JM.rows]) assert.ok(parishes.has(r.admin_region), r.admin_region);
  // Every parish is represented once both files load.
  assert.equal(new Set([...handJm.rows, ...data.JM.rows].map((r) => r.admin_region)).size, 14);
  // Parish capitals not in the hand-written file.
  for (const [parish, town] of [['Hanover', 'Lucea'], ['St. Elizabeth', 'Black River'], ['Trelawny', 'Falmouth'],
    ['St. Thomas', 'Morant Bay'], ['St. Ann', "St. Ann's Bay"]]) {
    assert.ok(find('JM', parish, town), `${parish} / ${town}`);
  }
});
