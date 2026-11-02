// Builds the own-shelf looks as Obsidian CSS snippets, and reports contrast: the three app looks from
// design/looks.json and the themes lab's own token and texture code, and Horizon, an Obsidian-only look
// whose tokens and landscape are drawn here (see "Horizon" below).
// usage: node design/obsidian/build.mjs [outDir]   (default: design/obsidian/snippets)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DESIGN = path.join(HERE, '..');
const OUT = process.argv[2] || path.join(HERE, 'snippets');
const looks = JSON.parse(fs.readFileSync(path.join(DESIGN, 'looks.json'), 'utf8'));

// A data URI that stays readable and small: only the characters a quoted CSS url() needs escaped.
const svgURL = svg => `url("data:image/svg+xml,${svg.replace(/%/g, '%25').replace(/#/g, '%23').replace(/</g, '%3C').replace(/>/g, '%3E').replace(/"/g, "'")}")`;

// WHY: the lab is the source of truth for the looks, so its token and texture code is read from
// themes-lab.html at build time (from "THE SUBJECT" up to the mock screens), never copied.
function labCore() {
  const html = fs.readFileSync(path.join(DESIGN, 'themes-lab.html'), 'utf8');
  const start = html.indexOf('// THE SUBJECT:'), end = html.indexOf('// ── the mock screens');
  if (start < 0 || end < start) throw new Error('themes-lab.html: the look code is no longer between its markers');
  const code = html.slice(start, end).replace(/^const svgURL = .*$/m, 'const svgURL = compactSvgURL;');
  if (!code.includes('const svgURL = compactSvgURL;')) throw new Error('themes-lab.html: svgURL not found');
  return vm.runInNewContext(`${code}\n;({ rng, noise, f3, tokens, texture, mix, contrast, rgb, grainedPaper, defaults })`, { compactSvgURL: svgURL });
}
const L = labCore();
const { mix, contrast } = L;

const CFG = { leather: looks.cfg, ukiyoe: looks.otherEditedDirections.ukiyoe, scroll: looks.otherEditedDirections.scroll };

// ── colour helpers ──
const toward = (c, bgs, target, dir) => { let i = 0; while (Math.min(...bgs.map(b => contrast(c, b))) < target && i++ < 80) c = mix(c, dir, 0.03); return c; };
const over = (fg, alpha, bg) => mix(bg, fg, alpha); // fg at alpha laid over bg
function hsl(h) {
  let [r, g, b] = L.rgb(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let H = 0, S = 0;
  if (mx !== mn) { const d = mx - mn; S = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    H = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; }
  return [Math.round(H), Math.round(S * 100) + '%', Math.round(l * 100) + '%'];
}
const r2 = n => Math.round(n * 100) / 100;

// ── textures ──
// Washi with fewer fibres than the lab's 54 (which makes a 13 KB tile): same noise layers, 12 fibres, 1-decimal paths.
function washiLite(k, mode, col) {
  const day = mode === 'day', size = 300, R = L.rng(7), q = n => (Math.round(n * 10) / 10).toString();
  const Ls = [
    L.noise('m', { freq: 0.02, oct: 3, seed: 11, color: day ? mix(col.paper, col.ink, 0.5) : '#000000', a: (day ? 0.09 : 0.3) * k, s: 4, o: -1.7 }),
    L.noise('g', { freq: 0.75, seed: 4, color: day ? col.ink : '#FFFFFF', a: (day ? 0.06 : 0.04) * k }),
  ];
  const fc = day ? ['#FFFFFF', mix(col.paper, col.ink, 0.35)] : [mix(col.paper, col.ink, 0.2), '#000000'], fk = day ? k : k * 0.35;
  let fib = '';
  for (let i = 0; i < 12; i++) {
    const x = R() * size, y = R() * size, ang = R() * Math.PI * 2, len = 18 + R() * 60, bend = (R() - 0.5) * 26;
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, cx = (x + ex) / 2 - Math.sin(ang) * bend, cy = (y + ey) / 2 + Math.cos(ang) * bend;
    const op = L.f3((i % 2 ? 0.22 : 0.42) * fk * (0.6 + R() * 0.6)), w = q(0.5 + R() * 0.9);
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) {
      const xs = [x, ex, cx].map(v => v + dx), ys = [y, ey, cy].map(v => v + dy);
      if (Math.max(...xs) < 0 || Math.min(...xs) > size || Math.max(...ys) < 0 || Math.min(...ys) > size) continue;
      fib += `<path d='M${q(xs[0])} ${q(ys[0])}Q${q(xs[2])} ${q(ys[2])} ${q(xs[1])} ${q(ys[1])}' stroke='${fc[i % 2]}' stroke-opacity='${op}' stroke-width='${w}'/>`;
    }
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><defs>${Ls.map(l => l.def).join('')}</defs>${Ls.map(l => l.use).join('')}<g fill='none' stroke-linecap='round'>${fib}</g></svg>`;
  return { css: svgURL(svg), peaks: Ls.map(l => [l.color, Math.max(0, Math.min(1, l.peak))]).concat([[fc[0], 0.42 * 1.2 * fk], [fc[1], 0.22 * 1.2 * fk]]) };
}
const tex = (kind, k, mode, t) => kind === 'washi' ? washiLite(k, mode, t) : L.texture(kind, k, mode, t);

// The Scroll's wax seal: an uneven disc of sealing wax with a pressed ring and a four-petal mark. 48 x 48.
const SEAL = svgURL(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'><defs><radialGradient id='w' cx='.38' cy='.34' r='.75'><stop offset='0' stop-color='#D8564A'/><stop offset='.45' stop-color='#A3261B'/><stop offset='1' stop-color='#5E120C'/></radialGradient></defs><path d='M24 2.5c3.2-.3 5.4 2 8.4 2.4 3.2.5 6.2 1.6 7.6 4.7 1.2 2.7 4.4 4.3 4.9 7.5.5 2.9-1.3 5.6-.9 8.4.5 3.2-.2 6.4-2.6 8.6-2.2 2-3.4 5.3-6.6 6.3-2.8.9-5.7.2-8.5 1.3-3 1.1-6.2.4-8.8-1.3-2.4-1.6-5.7-2.3-7.1-5-1.4-2.6-.8-5.7-2-8.4-1.2-2.8-.9-6 .7-8.5 1.5-2.4 1.8-5.7 4.4-7.3 2.6-1.6 5.6-1.4 8-3.6 1-.9 2-1.9 3.4-2.1z' fill='url(%23w)'/><circle cx='24' cy='24' r='13.2' fill='none' stroke='%235E120C' stroke-width='1.6' opacity='.75'/><circle cx='24' cy='24' r='11.6' fill='none' stroke='%23E57A6B' stroke-width='.8' opacity='.55'/><g fill='%235E120C' opacity='.7'><ellipse cx='24' cy='19.2' rx='2.2' ry='4'/><ellipse cx='24' cy='28.8' rx='2.2' ry='4'/><ellipse cx='19.2' cy='24' rx='4' ry='2.2'/><ellipse cx='28.8' cy='24' rx='4' ry='2.2'/></g><circle cx='24' cy='24' r='1.6' fill='%23E57A6B' opacity='.7'/></svg>`.replace(/%23/g, '#'));

// ── Horizon ──
// WHY here and not in the lab: the lab designs the own-shelf app's looks on its shelf and reader mocks, and
// Horizon is drawn for Obsidian's note pane: a coast seen from a cliff, around the reading column. Its tokens
// and its drawings live in this file only, built on the lab's colour helpers.
const HORIZON = {
  // A clear afternoon over a cold sea.
  day: {
    sky: ['#A9C1D4', '#C9D7E1', '#E2E6E3', '#F2EDE3'], // zenith, middle, low, the haze at the horizon
    sea: ['#BCCDD5', '#86A5B6', '#57798D'], // at the horizon, middle, at the viewer's feet
    cloud: ['#FFFFFF', 0.6], crest: ['#F4F8F9', 0.75], fade: [0.75, 0.5, 0.25], glitter: '#FFFDF4', light: '#FFF8E8', halo: ['#FFF3D8', 0.7],
    ranges: ['#A9B9C6', '#7C90A1', '#4F6273'], snow: ['#FAFBF8', '#C6D0DA'], cliff: '#46545F', rim: '#66765F', pine: '#26332F',
    foam: '#FFFFFF', sail: '#FBFBF6', mist: ['#F2EDE3', 0.75], trough: ['#57798D', 0.4], sand: ['#E8DFCB', '#CDC3AE'],
    veil: [['#E2EAF0', '#F3EFE7', '#E3EBEF', '#DCE6EB'], 0.86], panel: ['#FFFFFF', 0.42],
    ink: '#16222B', accent: '#2A5A6E', mark: '#9A4B2E', pine2: '#3B6152', todo: '#94661A',
    chrome: '#9DB6CA', sidebar: '#D3DFE8', navSea: ['#8AA8B8', '#6E92A6'], highlight: ['#FFD43B', 0.6],
  },
  // Blue hour: the sun is down, the sky still holds light, a moon rises over the sea.
  night: {
    sky: ['#1B2547', '#2A3661', '#4C5179', '#8C7D90'],
    sea: ['#59627F', '#3E486B', '#29324F'],
    cloud: ['#646C93', 0.5], crest: ['#B4BCD6', 0.6], fade: [0.6, 0.18, 0.06], glitter: '#F3E8C6', light: '#F5F0DE', halo: ['#D8D0BC', 0.35],
    ranges: ['#474C6E', '#262B4A', '#171B33'], snow: ['#BAC1D6', '#7E87A6'], cliff: '#151A2E', rim: '#272D46', pine: '#0E1222',
    foam: '#D5DBEA', sail: '#141A2E', mist: ['#8C7D90', 0.45], trough: ['#1E2642', 0.5], sand: ['#3B3D5C', '#2E304D'],
    veil: [['#1F2949', '#262D4D', '#242C4B', '#1F2744'], 0.92], panel: ['#AFBEEA', 0.08],
    ink: '#E8ECF3', accent: '#96C0D2', mark: '#E6A584', pine2: '#A6CDB6', todo: '#E8C27A',
    chrome: '#162040', sidebar: '#1F2848', navSea: ['#3E486B', '#29324F'], highlight: ['#F2BE78', 0.26],
  },
};
const HZ = 0.68; // the horizon, as a fraction of the view's height: low, well below the middle
const q = n => Math.round(n);
const q1 = n => Math.round(n * 10) / 10;

// A mountain ridge: alpine peaks (concave flanks) joined by a soft maximum, with a little seeded crag, as one
// closed path on the base line. `at(x)` gives the ridge height.
function alpine(peaks, { w, base, step = 8, seed = 1, crag = 0.02, sharp = 1.3 }) {
  const R = L.rng(seed), ph = [R() * 6.3, R() * 6.3, R() * 6.3], top = Math.max(...peaks.map(p => p[1]));
  const raw = x => Math.pow(peaks.reduce((a, [px, h, wd]) => a + Math.pow(h * Math.pow(Math.max(0, 1 - Math.abs(x - px) / wd), sharp), 5), 0), 0.2);
  const lift = x => { const s = raw(x); return s + crag * top * (s / top) * (0.5 * Math.sin(x / 23 + ph[0]) + 0.3 * Math.sin(x / 9.7 + ph[1]) + 0.2 * Math.sin(x / 4.1 + ph[2])); };
  const ys = []; for (let x = 0; x <= w; x += step) ys.push([x, q(base - Math.max(0, lift(x)))]);
  const pts = ys.filter(([, y], i) => y < base || (ys[i - 1] || [0, base])[1] < base || (ys[i + 1] || [0, base])[1] < base);
  return { d: `M0 ${base + 2}` + pts.map(([x, y]) => `L${x} ${y}`).join('') + `L${w} ${base + 2}Z`, at: x => base - Math.max(0, lift(x)), pts };
}
// Snow on a peak: the ridge above the snow line, down to a ragged edge with couloirs; lit on the side of the light.
function snowCap(r, x0, x1, line, seed, [lit, shade], peakX, litRight) {
  const R = L.rng(seed), top = r.pts.filter(([x, y]) => x >= x0 && x <= x1 && y < line);
  if (!top.length) return { defs: '', body: '' };
  peakX = top.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  const edge = []; for (let x = top[top.length - 1][0]; x >= top[0][0]; x -= 6) edge.push([x, q(line + 14 * Math.abs(Math.sin(x / 11)) + R() * 10)]);
  const d = 'M' + top.concat(edge).map(([x, y]) => `${x} ${y}`).join('L') + 'Z';
  return { defs: `<clipPath id='sc'><path d='${r.d}'/></clipPath><linearGradient id='sl' gradientUnits='userSpaceOnUse' x1='${peakX - 12}' y1='0' x2='${peakX + 12}' y2='0'><stop offset='0' stop-color='${litRight ? shade : lit}'/><stop offset='1' stop-color='${litRight ? lit : shade}'/></linearGradient>`,
    body: `<path d='${d}' fill='url(#sl)' clip-path='url(#sc)'/>` };
}
// A lone pine bent by the wind off the sea (from the right): a leaning, tapering trunk, and flat tiers of needle
// clumps that stream to the left, ragged at their tips.
function pine(bx, by, h, col, seed) {
  const R = L.rng(seed), s = h / 150, P = (x, y) => `${q1(bx + x * s)} ${q1(by - y * s)}`;
  const trunk = `M${P(-4, 0)}C${P(-6, 40)} ${P(-24, 70)} ${P(-26, 96)}S${P(-44, 130)} ${P(-62, 146)}L${P(-58, 149)}C${P(-40, 132)} ${P(-18, 104)} ${P(-17, 94)}S${P(6, 40)} ${P(5, 0)}Z`;
  // tiers: [height, downwind end, upwind end, thickness]; each a run of long flat clumps that thin toward the tip
  const tiers = [[146, -128, -46, 6], [120, -118, -22, 7], [94, -92, -12, 7], [68, -58, -4, 5]];
  let crown = '';
  for (const [ty, xl, xr, th] of tiers) {
    for (let x = xr; x > xl; x -= 12 + R() * 6) { const t = (xr - x) / (xr - xl), rx = (12 + R() * 8) * (1 - 0.45 * t) * s, ry = th * (0.4 + 0.3 * R()) * (1 - 0.4 * t) * s;
      const cx = bx + x * s, cy = by - (ty + (R() - 0.4) * th * 0.5 + t * 3) * s;
      crown += `M${q(cx - rx)} ${q(cy)}a${q(rx)} ${q(ry)} 0 1 0 ${q(2 * rx)} 0a${q(rx)} ${q(ry)} 0 1 0 ${q(-2 * rx)} 0`; }
  }
  const limbs = `M${P(-26, 96)}L${P(-70, 92)}M${P(-40, 120)}L${P(-90, 120)}M${P(-12, 70)}L${P(-44, 66)}M${P(-56, 142)}L${P(-96, 146)}`;
  return `<path d='${trunk}${crown}' fill='${col}'/><path d='${limbs}' stroke='${col}' stroke-width='${q1(2.2 * s)}' fill='none' stroke-linecap='round'/>`;
}
// Wave crests in perspective between the horizon (y0) and the viewer (y1): rows spaced geometrically, so they are
// fine and dense far off and long and wide apart near; each crest an arc, the nearer ones with a darker trough
// beneath. `px` keeps strokes in screen pixels when the drawing is stretched.
function crests(R, { w, y0, y1, rows, col, alpha, trough, px = true, minLen = 10, maxLen = 240, grow = 1.28, lift = 5 }) {
  const ve = px ? " vector-effect='non-scaling-stroke'" : '', g0 = (y1 - y0) * (grow - 1) / (Math.pow(grow, rows) - 1);
  let out = '', y = y0;
  for (let k = 1; k <= rows; k++) {
    y += g0 * Math.pow(grow, k - 1);
    const f = k / rows, len = minLen + (maxLen - minLen) * Math.pow(f, 1.3), b = 0.6 + lift * f;
    let d = '', dt = '';
    for (let x = -R() * len * 2; x < w; ) { const l = len * (0.55 + 0.9 * R()), x2 = Math.min(w, x + l);
      if (x2 > 0) { const xa = q(Math.max(0, x)), xm = q((x + x2) / 2), xb = q(x2);
        d += `M${xa} ${q1(y)}Q${xm} ${q1(y - b)} ${xb} ${q1(y)}`;
        if (trough && f > 0.4) dt += `M${q(xa + l * 0.2)} ${q1(y + b * 0.9)}Q${xm} ${q1(y + b * 0.4)} ${q(xb - l * 0.05)} ${q1(y + b)}`; }
      x = x2 + l * (0.6 + 1.4 * R()); }
    const sw = q1(px ? 0.6 + 2.4 * f : 0.8 + 3.2 * f);
    out += `<path d='${d}' stroke='${col}' stroke-width='${sw}' stroke-opacity='${r2(alpha * (0.4 + 0.6 * f))}'${ve}/>`;
    if (dt) out += `<path d='${dt}' stroke='${trough[0]}' stroke-width='${sw}' stroke-opacity='${r2(trough[1] * f)}'${ve}/>`;
  }
  return `<g fill='none' stroke-linecap='round'>${out}</g>`;
}
// The sun's or moon's path on the water: short bright strokes, narrow at the horizon, widening toward the viewer.
function glitter(R, cx, y0, y1, spread, col) {
  let d = '';
  for (let y = y0 + 1.5; y < y1; ) { const f = (y - y0) / (y1 - y0), half = 4 + spread * Math.pow(f, 1.1);
    for (let n = 0; n < 2 + Math.round(3 * f); n++) { const off = (R() + R() - 1) * half, len = 2 + (6 + 30 * f) * R();
      d += `M${q(cx + off - len / 2)} ${q(y)}h${q(len) || 1}`; }
    y += 2.8 + 11 * f * (0.6 + R()); }
  return `<path d='${d}' stroke='${col}' stroke-width='1.6' stroke-linecap='round' fill='none'/>`;
}
const svg = (w, h, body, extra = '') => svgURL(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'${extra}>${body}</svg>`);
const vgrad = (id, stops) => `<linearGradient id='${id}' x1='0' y1='0' x2='0' y2='1'>${stops.map(([o, c, a]) => `<stop offset='${o}' stop-color='${c}'${a !== undefined ? ` stop-opacity='${a}'` : ''}/>`).join('')}</linearGradient>`;
const soft = (id, c, a) => `<radialGradient id='${id}'><stop offset='0' stop-color='${c}' stop-opacity='${a}'/><stop offset='1' stop-color='${c}' stop-opacity='0'/></radialGradient>`;

// The coast, as drawings in one coordinate frame per drawing; every one puts its horizon at the same height,
// so they line up at any size. `geo` is the desktop scene or the phone's panorama.
function coast(c, geo, day) {
  const { w, hz, ranges, main, headland, tree, cliffEdge } = geo, R = L.rng(day ? 41 : 43), k = geo.k;
  const rs = ranges.map((p, i) => alpine(p, { w, base: hz, seed: 21 + i, step: geo.step * [1.5, 1, 1.5][i], crag: [0.012, 0.022, 0.03][i] }));
  let defs = '', body = '';
  rs.forEach((r, i) => {
    defs += vgrad(`r${i}`, [[0, c.ranges[i]], [1, mix(c.ranges[i], c.sky[3], c.fade[i])]]);
    body += `<path d='${r.d}' fill='url(#r${i})'/>`;
    if (i === 1) { const [x0, x1, line, peakX] = main, sn = snowCap(r, x0, x1, line, 7, c.snow, peakX, true); defs += sn.defs; body += sn.body; }
    if (i === 1) { defs += soft('m', c.mist[0], c.mist[1]); body += `<ellipse cx='${q(w * 0.45)}' cy='${q(hz - (hz - geo.mistY) * 0.2)}' rx='${q(w * 0.6)}' ry='${q((hz - geo.mistY) * 0.45)}' fill='url(#m)'/>`; }
  });
  // surf at the foot of the near hills, far off: a thin pale line on the water
  const near = rs[2]; let surf = '';
  for (const [a, b] of near.pts.reduce((acc, [x, y], i, all) => { const on = y < hz - 1; if (on && !(all[i - 1] && all[i - 1][1] < hz - 1)) acc.push([x, x]); if (on) acc[acc.length - 1][1] = x; return acc; }, [])) surf += `M${a} ${hz + 1.2}H${b}`;
  body += `<path d='${surf}' stroke='${c.foam}' stroke-opacity='.55' stroke-width='${geo.surf}' fill='none'/>`;
  // the headland in the foreground, its cliff face to the sea, foam at its foot, and the pine
  body += `<path d='${headland}' fill='${c.cliff}'/><path d='${geo.rimD}' stroke='${c.rim}' stroke-width='${geo.rimW}' fill='none' stroke-linecap='round'/>`;
  // surf: white water curling along the cliff's foot, and two long lines of it drawn out to sea
  let foam = '';
  for (let i = 1; i < cliffEdge.length; i++) { const [xa, ya] = cliffEdge[i - 1], [xb, yb] = cliffEdge[i];
    for (let j = 0; j < 4; j++) { const t = R(), x = xa + (xb - xa) * t + 2 * k, y = ya + (yb - ya) * t, l = (8 + 16 * R()) * k;
      foam += `M${q(x)} ${q(y)}q${q(l * 0.5)} ${q1(-3 * k)} ${q(l)} ${q1(-0.5 * k)}`; } }
  const [ex, ey] = cliffEdge[Math.floor(cliffEdge.length / 2)], [fx, fy] = cliffEdge[cliffEdge.length - 2];
  foam += `M${ex} ${ey + 6 * k}c${q(30 * k)} ${q(-5 * k)} ${q(80 * k)} ${q(4 * k)} ${q(140 * k)} ${q(-2 * k)}M${fx} ${fy + 10 * k}c${q(40 * k)} ${q(-6 * k)} ${q(110 * k)} ${q(6 * k)} ${q(200 * k)} ${q(-3 * k)}`;
  body += `<path d='${foam}' stroke='${c.foam}' stroke-width='${q1(2.6 * k)}' stroke-linecap='round' fill='none' stroke-opacity='.85'/>`;
  body += pine(tree[0], tree[1], tree[2], c.pine, 81);
  return { defs, body };
}

// The desktop scene, a stack of drawings behind the note: land on the left, the light on the right, then clouds and
// wave crests over the sky-and-sea gradient. All share the horizon at HZ of their height.
const SCENE = { w: 1300, h: 1000 };
SCENE.hz = q(SCENE.h * HZ);
const SCENE_GEO = {
  w: SCENE.w, h: SCENE.h, hz: SCENE.hz, step: 9, mistY: 520, surf: 2, rimW: 3, k: 1,
  ranges: [
    [[40, 300, 260], [330, 340, 300], [640, 250, 300], [980, 150, 300], [1220, 80, 260]], // far: the palest, half lost in the mist
    [[150, 470, 300], [400, 320, 250], [640, 200, 240], [880, 110, 260]], // the main range, snow on its crown
    [[470, 90, 240], [760, 54, 220], [1010, 30, 200]], // near hills down to the water, clear of the pine
  ],
  main: [40, 280, 330, 150], // snow from x 40 to 280, down to y 330
  headland: 'M0 1000L0 798C50 792 120 800 170 804S220 808 238 812L250 828L258 856L266 880L272 912L286 948L298 1000Z',
  rimD: 'M0 799C50 793 120 801 170 805S218 809 236 813',
  cliffEdge: [[250, 840], [258, 864], [266, 886], [272, 912], [286, 948], [298, 1000]],
  tree: [204, 808, 140],
};
// The phone's panorama: the same coast in a 10:7 frame, horizon at the same 68% of its height.
const PANO = { w: 800, h: 560 };
PANO.hz = q(PANO.h * HZ);
const PANO_GEO = {
  w: PANO.w, h: PANO.h, hz: PANO.hz, step: 10, mistY: 240, surf: 1.4, rimW: 2, k: 0.7,
  ranges: [
    [[90, 200, 190], [320, 170, 200], [520, 100, 190], [700, 60, 160]],
    [[170, 270, 200], [380, 170, 160], [560, 70, 150]],
    [[430, 50, 150], [640, 26, 130]],
  ],
  main: [70, 280, 160, 170],
  headland: 'M0 560L0 470C40 466 90 472 130 474S170 477 186 480L196 492L202 510L208 528L218 546L224 560Z',
  rimD: 'M0 471C40 467 90 473 130 475S168 478 184 481',
  cliffEdge: [[198, 500], [202, 512], [208, 528], [218, 546], [224, 560]],
  tree: [150, 476, 112],
};

function sceneLayers(c, day) {
  const R = L.rng(day ? 51 : 53), S = SCENE;
  // land: the range, the near hills, the headland with its pine
  const land = coast(c, SCENE_GEO, day);
  const landURL = svg(S.w, S.h, `<defs>${land.defs}</defs>${land.body}`);
  // light: the sun (by day) or the moon, its path on the water, one distant sail
  const LW = 520, lx = 400, ly = S.hz - 118;
  let lightBody = `<circle cx='${lx}' cy='${ly}' r='${day ? 150 : 90}' fill='url(#h)'/><circle cx='${lx}' cy='${ly}' r='${day ? 19 : 15}' fill='${c.light}'/>`;
  lightBody += glitter(R, lx, S.hz, S.h, 110, c.glitter);
  lightBody += `<path d='M196 ${S.hz - 2}V${S.hz - 26}L213 ${S.hz - 2}ZM193 ${S.hz - 6}L193 ${S.hz - 20}L184 ${S.hz - 6}Z' fill='${c.sail}'/><path d='M182 ${S.hz}H216' stroke='${c.sail}' stroke-width='2'/>`;
  const lightURL = svg(LW, S.h, `<defs>${soft('h', c.halo[0], c.halo[1])}</defs>${lightBody}`);
  // air: long soft clouds and the wave crests, stretched to the view
  let air = `<defs>${soft('c', c.cloud[0], c.cloud[1])}</defs>`;
  for (const [x, y, rx, ry] of [[250, 120, 260, 18], [640, 74, 330, 14], [820, 260, 280, 24], [430, 400, 380, 20]]) air += `<ellipse cx='${x}' cy='${y}' rx='${rx}' ry='${ry}' fill='url(#c)'/>`;
  air += crests(R, { w: 1000, y0: S.hz, y1: S.h + 10, rows: 12, col: c.crest[0], alpha: c.crest[1], trough: c.trough, minLen: 10, maxLen: 200, lift: 4 });
  const airURL = svg(1000, S.h, air, " preserveAspectRatio='none'");
  const sky = `linear-gradient(180deg, ${c.sky[0]} 0%, ${c.sky[1]} 36%, ${c.sky[2]} 58%, ${c.sky[3]} ${HZ * 100}%, ${c.sea[0]} ${HZ * 100}%, ${c.sea[1]} 82%, ${c.sea[2]} 100%)`;
  // the veil: mist behind the reading column, in the colours of the sky and sea it covers; a feathered band
  const [vs, va] = c.veil;
  const veilBand = svg(1000, S.h, `<defs>${vgrad('v', [[0, vs[0]], [HZ, vs[1]], [HZ, vs[2]], [1, vs[3]]])}<linearGradient id='f'>${[[0, 0], [0.025, 0.1], [0.05, 0.35], [0.07, 0.7], [0.095, 1], [0.905, 1], [0.93, 0.7], [0.95, 0.35], [0.975, 0.1], [1, 0]].map(([o, a]) => `<stop offset='${o}' stop-color='#fff' stop-opacity='${a}'/>`).join('')}</linearGradient><mask id='k'><rect width='1000' height='${S.h}' fill='url(#f)'/></mask></defs><rect width='1000' height='${S.h}' fill='url(#v)' mask='url(#k)' opacity='${va}'/>`, " preserveAspectRatio='none'");
  const rgba = (hx, a) => `rgba(${L.rgb(hx).join(', ')}, ${a})`;
  const veilFlat = `linear-gradient(180deg, ${rgba(vs[0], va)}, ${rgba(vs[1], va)} ${HZ * 100}%, ${rgba(vs[2], va)} ${HZ * 100}%, ${rgba(vs[3], va)})`;
  return { landURL, lightURL, airURL, sky, veilBand, veilFlat };
}

// The phone's panorama under the note's title: the same coast, small, ending in the page.
function panorama(c, day, paper) {
  const R = L.rng(day ? 61 : 63), P = PANO, land = coast(c, PANO_GEO, day);
  let defs = vgrad('s', [[0, c.sky[1]], [0.6, c.sky[2]], [1, c.sky[3]]]) + vgrad('w', [[0, c.sea[0]], [0.55, c.sea[1]], [1, c.sea[2]]])
    + vgrad('e', [[0, paper, 0], [1, paper, 1]]) + soft('c', c.cloud[0], c.cloud[1]) + soft('h', c.halo[0], c.halo[1]) + land.defs;
  const lx = 650, ly = P.hz - 96;
  let body = `<rect width='${P.w}' height='${P.hz}' fill='url(#s)'/><rect y='${P.hz}' width='${P.w}' height='${P.h - P.hz}' fill='url(#w)'/>`;
  body += `<ellipse cx='560' cy='90' rx='220' ry='9' fill='url(#c)'/><ellipse cx='300' cy='40' rx='260' ry='8' fill='url(#c)'/>`;
  body += `<circle cx='${lx}' cy='${ly}' r='${day ? 90 : 60}' fill='url(#h)'/><circle cx='${lx}' cy='${ly}' r='${day ? 12 : 10}' fill='${c.light}'/>`;
  body += crests(R, { w: P.w, y0: P.hz, y1: P.h + 6, rows: 8, col: c.crest[0], alpha: c.crest[1], trough: c.trough, px: false, minLen: 12, maxLen: 160, lift: 5 });
  body += glitter(R, lx, P.hz, P.h, 70, c.glitter);
  body += `<path d='M552 ${P.hz - 1}V${P.hz - 16}L562 ${P.hz - 1}Z' fill='${c.sail}'/>`;
  body += land.body + `<rect y='${P.h - 80}' width='${P.w}' height='80' fill='url(#e)'/>`;
  return svg(P.w, P.h, `<defs>${defs}</defs>${body}`);
}

// The phone's navigation bar as a strip of sea: a crest tile that repeats across, its crests in the bar's lower
// part, below the icons.
function navSea(c) {
  const R = L.rng(71);
  return svg(400, 80, crests(R, { w: 400, y0: 58, y1: 84, rows: 3, col: c.crest[0], alpha: c.crest[1] * 0.7, px: false, minLen: 50, maxLen: 140, lift: 3 }), " preserveAspectRatio='none'");
}
// The end of a note on a phone: the sea running up a beach, after the last line, fading into the page at both ends.
function shore(c, day, paper) {
  const R = L.rng(day ? 91 : 93), W = 800, H = 320, edge = 214;
  let wash = `M0 ${edge}`; for (let x = 0; x <= W; x += 40) wash += `L${x} ${q(edge + 6 * Math.sin(x / 70) + 4 * R())}`;
  const defs = vgrad('w', [[0, c.sea[0]], [1, c.sea[1]]]) + vgrad('t', [[0, paper, 1], [1, paper, 0]]) + vgrad('b', [[0, paper, 0], [1, paper, 1]]);
  let body = `<rect width='${W}' height='${edge + 10}' fill='url(#w)'/><path d='${wash}L${W} ${H}L0 ${H}Z' fill='${c.sand[1]}'/><path d='${wash.replace(/L(\d+) (\d+)/g, (m, x, y) => `L${x} ${+y + 14}`)}L${W} ${H}L0 ${H}Z' fill='${c.sand[0]}'/>`;
  body += crests(R, { w: W, y0: 40, y1: edge - 6, rows: 4, col: c.crest[0], alpha: c.crest[1], trough: c.trough, px: false, minLen: 40, maxLen: 200, lift: 5 });
  body += `<path d='${wash}' stroke='${c.foam}' stroke-width='3' stroke-opacity='.9' fill='none' stroke-linejoin='round'/>`;
  body += `<rect width='${W}' height='110' fill='url(#t)'/><rect y='${H - 70}' width='${W}' height='70' fill='url(#b)'/>`;
  return svg(W, H, `<defs>${defs}</defs>${body}`, " preserveAspectRatio='none'");
}

// Every Horizon colour, per mode, and the list of every tone text can sit on.
function horizonTokens() {
  const out = {};
  for (const mode of ['day', 'night']) {
    const day = mode === 'day', c = HORIZON[mode], t = {}, [vs, va] = c.veil, [pc, pa] = c.panel;
    // the tones of the scene that can lie behind the column, each at its strongest
    const tones = [...c.sky, ...c.sea, over(c.cloud[0], c.cloud[1], c.sky[0]), over(c.cloud[0], c.cloud[1], c.sky[2]), c.light, over(c.halo[0], c.halo[1], c.sky[2]),
      c.glitter, over(c.crest[0], c.crest[1], c.sea[2]), over(c.crest[0], c.crest[1], c.sea[0]), ...c.ranges, ...c.snow, c.cliff, c.rim, c.pine, c.foam, c.sail, over(c.mist[0], c.mist[1], c.ranges[1])];
    // behind text: the veil over each of those tones, and a frosted callout panel over each of those
    const veiled = vs.flatMap(v => tones.map(s => over(v, va, s)));
    t.panels = veiled.map(b => over(pc, pa, b));
    t.bgs = veiled.concat(t.panels);
    t.paper = over(vs[0], va, c.sky[0]); // the column's top; the page on a phone, menus, the open tab
    Object.assign(t, { ink: c.ink, sea: c.accent, buoy: c.mark, pine: c.pine2, todo: c.todo, chrome: c.chrome, chromeHi: c.sky[0], chromeInk: c.ink, gilt: c.sky[3], sidebar: c.sidebar,
      skyMid: c.sky[1], hlColor: c.highlight[0], highlight: c.highlight[1], navSea: c.navSea, panelCSS: `rgba(${L.rgb(pc).join(', ')}, ${pa})` });
    t.sheet = day ? mix(t.paper, '#FFFFFF', 0.55) : mix(t.paper, c.ink, 0.055);
    t.wave = c.sea[1];
    // secondary text: 30% of the way to the page, darkened (lightened) until it reads at 5:1 on every tone and on cards
    let m = 0.3; t.muted = mix(c.ink, t.paper, m);
    while (Math.min(...t.bgs.concat(t.sheet).map(b => contrast(t.muted, b))) < 5 && m > 0.04) { m -= 0.02; t.muted = mix(c.ink, t.paper, m); }
    // the bar's icons sit above its crests, on the sea itself
    t.navBgs = [c.navSea[0], c.navSea[1]];
    t.navInk = toward(c.ink, t.navBgs, 4.6, day ? '#000000' : '#FFFFFF');
    const L1 = sceneLayers(c, day);
    Object.assign(t, { land: L1.landURL, light: L1.lightURL, air: L1.airURL, skyCSS: L1.sky, veilBand: L1.veilBand, veilFlat: L1.veilFlat, pano: panorama(c, day, t.paper), nav: navSea(c), shore: shore(c, day, t.paper) });
    out[mode] = t;
  }
  return out;
}

// ── the looks ──
const LOOKS = {
  leather: {
    file: 'shelf-leather-vellum.css', name: 'Leather & vellum', pin: 'Leather & vellum 3', kinds: ['vellum', 'leather'],
    display: '"IM Fell English", "EB Garamond", "Hoefler Text", "Iowan Old Style", Palatino, Georgia, serif',
    body: '"Newsreader", "Iowan Old Style", Palatino, Georgia, serif', weight: 400,
    gfonts: 'family=IM+Fell+English:ital@0;1&family=EB+Garamond:ital,wght@0,400..700;1,400..700&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..500',
    blurb: 'A bound book: warm vellum pages and dark brown ink, navy tooled-leather bars with gilt fillets,\n   library-green and oxblood accents, IM Fell English headings. Night is the same book under a lamp.',
  },
  ukiyoe: {
    file: 'shelf-ukiyo-e.css', name: 'Ukiyo-e', pin: 'Ukiyo-e 2', kinds: ['washi', 'woodblock'],
    display: '"Zen Old Mincho", "Hiragino Mincho ProN", "Yu Mincho", "EB Garamond", Georgia, serif',
    body: '"Newsreader", "Iowan Old Style", Palatino, Georgia, "Hiragino Mincho ProN", serif', weight: 600,
    gfonts: 'family=Zen+Old+Mincho:wght@400;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..500',
    blurb: 'A woodblock print: washi paper with fibres, indigo chrome with a woodblock grain and a bokashi\n   (dark at the top), vermilion seals, Zen Old Mincho headings. Night is a Hiroshige night: deep indigo.',
  },
  scroll: {
    file: 'shelf-scroll.css', name: 'Scroll', pin: 'Scroll 1', kinds: ['parchment', 'roll'],
    display: '"IM Fell English", "EB Garamond", "Hoefler Text", "Iowan Old Style", Palatino, Georgia, serif',
    body: '"Newsreader", "Iowan Old Style", Palatino, Georgia, serif', weight: 400,
    gfonts: 'family=IM+Fell+English:ital@0;1&family=EB+Garamond:ital,wght@0,400..700;1,400..700&family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..500',
    blurb: 'An unrolled scroll: mottled parchment that curls at both side edges, the bars drawn as the rolled\n   top with wooden rod ends, rubric red and lapis blue, a red drop cap and a wax seal, IM Fell headings.\n   Night is the same scroll by candlelight.',
  },
  horizon: {
    file: 'shelf-horizon.css', name: 'Horizon', tokens: horizonTokens,
    origin: 'an Obsidian-only look, drawn in own-shelf/design/obsidian/build.mjs',
    display: 'Optima, "Avenir Next", "Gill Sans", sans-serif',
    body: '"Iowan Old Style", Palatino, Georgia, serif', weight: 400,
    blurb: 'A coast seen from a cliff: a big sky over a low horizon, a snow-crowned range fading into mist on one\n   side, open sea with its waves and the light\'s path on the other, one wind-bent pine on the headland. The\n   text sits on a band of mist. Optima headings. Night is blue hour, with a moon rising over the sea.',
    texNote: 'the scene is a few small inline SVGs over CSS gradients',
    fontNote: 'Fonts: nothing is downloaded. Optima (headings) and Iowan Old Style (text) ship on macOS and iOS.',
  },
};

// Every value the snippet needs, per look and mode.
function palette(dir) {
  const lk = LOOKS[dir], hz = !!lk.tokens; // hz: Horizon, whose text sits on a mist veil over every tone of its scene
  const c = hz ? {} : Object.assign(L.defaults(dir), CFG[dir]);
  const T = hz ? lk.tokens() : L.tokens(dir, c), out = {}, report = {};
  for (const mode of ['day', 'night']) {
    const t = T[mode], day = mode === 'day', p = {};
    const paperTex = hz ? { css: 'none' } : tex(LOOKS[dir].kinds[0], c.grain, mode, t), chromeTex = hz ? { css: 'none' } : tex(LOOKS[dir].kinds[1], c.chromeGrain, mode, t);
    // Horizon's "grain" is the veiled scene tone that reads worst under the text
    const grained = hz ? t.bgs.reduce((w, b) => contrast(t.ink, b) < contrast(t.ink, w) ? b : w) : L.grainedPaper(t.paper, t.ink, paperTex.peaks || []);
    const page = hz ? t.bgs : [t.paper, grained];
    // Horizon holds every text tier, faint included, to 4.5:1 on every tone; the app looks keep faint at 3.1:1 on the page
    const textBgs = hz ? page : [t.paper], faintMin = hz ? 4.5 : 3.1;
    p.paper = t.paper; p.sheet = t.sheet; p.ink = t.ink; p.muted = t.muted; p.gilt = t.gilt; p.wave = t.wave;
    p.chrome = t.chrome; p['chrome-hi'] = t.chromeHi; p['chrome-ink'] = t.chromeInk;
    p['chrome-deep'] = mix(t.chrome, '#000000', day && dir === 'scroll' ? 0.28 : 0.22);
    p['chrome-ink-soft'] = toward(mix(t.chromeInk, t.chrome, 0.28), hz ? [t.chrome, t.chromeHi, t.sidebar, t.paper] : [t.chrome, t.chromeHi], 4.6, t.chromeInk);
    // text tiers
    let f = 0.62; p.faint = mix(t.ink, t.paper, f); while (Math.min(...textBgs.map(b => contrast(p.faint, b))) < faintMin && f > 0.2) { f -= 0.02; p.faint = mix(t.ink, t.paper, f); }
    // Horizon darkens (lightens) its coloured text toward a deep shade of its own hue, so the hue holds
    p.accent = hz ? toward(t.sea, page, 4.6, day ? mix(t.sea, '#000000', 0.75) : '#FFFFFF') : toward(t.sea, page, 4.5, day ? t.ink : '#FFFFFF');
    p['accent-hover'] = day ? mix(p.accent, t.ink, 0.25) : mix(p.accent, '#FFFFFF', 0.2);
    p.mark = t.buoy; // ribbon, seals, drop cap: decoration
    p['mark-text'] = hz ? toward(t.buoy, page, 4.6, day ? mix(t.buoy, '#000000', 0.75) : t.ink) : toward(t.buoy, page, 4.5, day ? t.ink : t.ink); // the mark when it carries text
    // surfaces
    p.secondary = hz ? t.sidebar : day ? mix(t.paper, t.gilt, dir === 'ukiyoe' ? 0.1 : 0.14) : mix(t.paper, '#000000', 0.18);
    p['secondary-alt'] = day ? t.sheet : mix(t.paper, t.ink, 0.06);
    p['primary-alt'] = day ? mix(t.paper, t.ink, 0.035) : mix(t.paper, t.ink, 0.04);
    p.border = hz ? (day ? mix(t.paper, t.ink, 0.16) : mix(t.paper, t.ink, 0.16)) : day ? mix(mix(t.paper, t.gilt, 0.35), t.ink, 0.14) : mix(t.paper, t.ink, 0.16);
    p['border-hover'] = day ? mix(p.border, t.ink, 0.18) : mix(t.paper, t.ink, 0.26);
    // rules and markers: gilt pressed into the page (leather), the look's own marks otherwise; >= 3:1 as graphics
    const giltOnPage = toward(t.gilt, [t.paper], 3, day ? t.ink : '#FFFFFF');
    if (dir === 'leather') { p.h2 = p.accent; p.h3 = p['mark-text']; p.rule = giltOnPage; p.marker = giltOnPage; p.quote = giltOnPage; p['band-rule'] = t.gilt; }
    if (dir === 'ukiyoe')  { p.h2 = p.accent; p.h3 = p['mark-text']; p.rule = mix(p.accent, t.paper, 0.55); p.marker = toward(t.buoy, [t.paper], 3, t.ink); p.quote = p.accent; p['band-rule'] = t.buoy; }
    if (dir === 'scroll')  { p.h2 = p['mark-text']; p.h3 = p.accent; p.rule = toward(t.wave, [t.paper], 1.6, t.ink); p.marker = toward(t.buoy, [t.paper], 3, t.ink); p.quote = p.accent; p['band-rule'] = '#5A3A22'; }
    // Horizon: ink H2 over a horizon line, sea-blue H3; bullets and "done" in pine, as text (4.5:1)
    if (hz) { p.h2 = t.ink; p.h3 = p.accent; p.rule = mix(p.accent, t.paper, 0.6); p.marker = toward(t.pine, page, 4.6, day ? mix(t.pine, '#000000', 0.75) : '#FFFFFF'); p.quote = mix(p.accent, t.paper, 0.35); p['band-rule'] = mix(t.chrome, t.ink, 0.22); }
    p['quote-bg'] = over(dir === 'leather' ? t.gilt : p.quote, day ? 0.1 : 0.09, t.paper);
    p['code-bg'] = over(t.sea, day ? 0.09 : 0.1, t.paper);
    p['code-pre-bg'] = day ? mix(t.sheet, t.paper, 0.35) : mix(t.paper, t.ink, 0.05);
    p['code-keyword'] = toward(t.buoy, [p['code-bg'], p['code-pre-bg']], 4.5, t.ink);
    p['code-string'] = toward(t.sea, [p['code-bg'], p['code-pre-bg']], 4.5, day ? t.ink : '#FFFFFF');
    p['code-comment'] = toward(t.muted, [p['code-bg'], p['code-pre-bg']], 4.5, day ? t.ink : '#FFFFFF');
    p['table-head'] = hz ? (day ? mix(t.paper, t.chromeHi, 0.4) : mix(t.paper, t.ink, 0.08)) : day ? mix(t.paper, t.gilt, 0.2) : mix(t.paper, t.gilt, 0.09);
    p.highlight = hz ? `rgba(${L.rgb(t.hlColor).join(', ')}, ${t.highlight})` : day ? 'rgba(255, 212, 59, 0.6)' : 'rgba(255, 212, 59, 0.38)'; // own-shelf's "sun" tint
    p.selection = `color-mix(in srgb, ${p.accent} ${day ? 22 : 30}%, transparent)`;
    if (hz) Object.assign(p, { todo: toward(t.todo, page, 4.6, day ? mix(t.todo, '#000000', 0.75) : '#FFFFFF'), shore: t.shore, sky: t.skyCSS, air: t.air, land: t.land, light: t.light, 'veil-band': t.veilBand, 'veil-flat': t.veilFlat, pano: t.pano, 'sky-mid': t.skyMid,
      nav: t.nav, 'nav-sea-top': t.navSea[0], 'nav-sea-low': t.navSea[1], 'nav-ink': t.navInk, panel: t.panelCSS });
    // Obsidian's neutral ramp, re-tinted from the page to the ink
    const base = day ? [['00', t.sheet], ['05', mix(t.sheet, t.paper, 0.5)], ['10', t.paper], ['20', mix(t.paper, t.ink, 0.04)], ['25', mix(t.paper, t.ink, 0.08)],
      ['30', mix(t.paper, t.ink, 0.14)], ['35', mix(t.paper, t.ink, 0.2)], ['40', mix(t.paper, t.ink, 0.32)], ['50', mix(t.paper, t.ink, 0.42)], ['60', mix(t.paper, t.ink, 0.62)], ['70', t.muted], ['100', t.ink]]
      : [['00', t.paper], ['05', mix(t.paper, t.ink, 0.02)], ['10', mix(t.paper, t.ink, 0.035)], ['20', t.sheet], ['25', mix(t.paper, t.ink, 0.08)], ['30', mix(t.paper, t.ink, 0.11)],
      ['35', mix(t.paper, t.ink, 0.16)], ['40', mix(t.paper, t.ink, 0.26)], ['50', mix(t.paper, t.ink, 0.36)], ['60', mix(t.paper, t.ink, 0.55)], ['70', t.muted], ['100', t.ink]];
    p.base = base;
    p.acc = hsl(p.accent);
    p['paper-tex'] = paperTex.css; p['chrome-tex'] = chromeTex.css;
    out[mode] = p;
    const hlC = hz ? t.hlColor : '#FFD43B', hlA = hz ? t.highlight : day ? 0.6 : 0.38, hl = over(hlC, hlA, t.paper);
    // worst contrast of fg over a set of backgrounds; for Horizon, "page" is every tone text can scroll over
    const w = (fg, bgs) => Math.min(...bgs.map(b => contrast(fg, b)));
    report[mode] = {
      'body text / page': w(t.ink, [t.paper]), [hz ? 'body text / veiled scene, worst tone' : 'body text / darkest grain']: contrast(t.ink, grained), 'muted / page': w(p.muted, textBgs),
      'faint / page': w(p.faint, textBgs), 'links, accent / page': Math.min(...page.map(b => contrast(p.accent, b))), 'H2 / page': Math.min(...page.map(b => contrast(p.h2, b))),
      'H3 / page': Math.min(...page.map(b => contrast(p.h3, b))), 'text / quote tint': contrast(t.ink, p['quote-bg']), 'text / inline code': contrast(t.ink, p['code-bg']),
      'text / sidebar': contrast(t.ink, p.secondary), 'muted / sidebar': contrast(p.muted, p.secondary), 'bar text / bar': Math.min(contrast(t.chromeInk, t.chrome), contrast(t.chromeInk, t.chromeHi)),
      'bar text soft / bar': Math.min(contrast(p['chrome-ink-soft'], t.chrome), contrast(p['chrome-ink-soft'], t.chromeHi)), 'list markers / page': w(p.marker, textBgs),
      'text / ==highlight==': contrast(t.ink, hl), 'code keyword / code': Math.min(contrast(p['code-keyword'], p['code-bg']), contrast(p['code-keyword'], p['code-pre-bg'])),
      'code comment / code': Math.min(contrast(p['code-comment'], p['code-bg']), contrast(p['code-comment'], p['code-pre-bg'])),
    };
    if (hz) {
      // callouts are frosted panels over the veiled scene; their titles are in the callout's colour
      Object.assign(report[mode], {
        'callout title, todo and info / panel': w(p.accent, t.panels), 'callout title, warning / panel': w(p['mark-text'], t.panels),
        'callout title, success / panel': w(p.marker, t.panels), 'callout title, example / panel': w(p.muted, t.panels),
        'text / panel': w(t.ink, t.panels), 'muted / panel': w(p.muted, t.panels), 'faint / panel': w(p.faint, t.panels),
        'text / table header': contrast(t.ink, p['table-head']), 'text / code block': contrast(t.ink, p['code-pre-bg']),
        'code string / code': w(p['code-string'], [p['code-bg'], p['code-pre-bg']]), 'text / ==highlight== over the veiled scene': w(t.ink, page.map(b => over(hlC, hlA, b))), 'callout title, todo (your move) / panel': w(p.todo, t.panels),
        'header text / sky (desktop)': w(p['chrome-ink-soft'], [t.chromeHi, t.chrome]), 'muted / sidebar, worst': w(p['chrome-ink-soft'], [t.sidebar]),
        'phone title / panorama sky': w(t.ink, [t.paper, t.skyMid]), 'phone bar icons / sea': w(t.navInk, t.navBgs),
      });
    }
    for (const k in report[mode]) report[mode][k] = r2(report[mode][k]);
  }
  return { pal: out, report, cfg: c };
}

// ── CSS ──
const PAL_KEYS = ['paper', 'sheet', 'ink', 'muted', 'faint', 'accent', 'accent-hover', 'mark', 'mark-text', 'h2', 'h3', 'gilt', 'rule', 'marker', 'quote', 'quote-bg',
  'secondary', 'secondary-alt', 'primary-alt', 'border', 'border-hover', 'code-bg', 'code-pre-bg', 'code-keyword', 'code-string', 'code-comment', 'table-head', 'highlight', 'selection',
  'chrome', 'chrome-hi', 'chrome-deep', 'chrome-ink', 'chrome-ink-soft', 'band-rule', 'wave'];

function modeBlock(dir, mode, p) {
  const sel = mode === 'day' ? ':root body.theme-light' : ':root body.theme-dark';
  const lines = PAL_KEYS.map(k => `  --shelf-${k}: ${p[k]};`);
  if (LOOKS[dir].tokens) lines.push(...['todo', 'sky-mid', 'nav-sea-top', 'nav-sea-low', 'nav-ink', 'panel', 'sky', 'veil-flat', 'veil-band', 'land', 'light', 'air', 'pano', 'nav', 'shore'].map(k => `  --shelf-${k}: ${p[k]};`));
  else lines.push(`  --shelf-paper-tex: ${p['paper-tex']};`, `  --shelf-chrome-tex: ${p['chrome-tex']};`);
  lines.push('', '  /* Obsidian\'s neutral ramp, re-tinted from page to ink (menus, modals, settings) */');
  for (const [k, v] of p.base) lines.push(`  --color-base-${k}: ${v};`);
  lines.push(`  --accent-h: ${p.acc[0]}; --accent-s: ${p.acc[1]}; --accent-l: ${p.acc[2]};`);
  // Callouts in the look's own inks: notes in the accent, questions and warnings in the mark, done in gilt.
  // Obsidian 1.14 takes full colours here (--callout-info: var(--color-blue)), not r, g, b triplets.
  const CALLOUTS = {
    accent: ['default', 'info', 'todo', 'summary', 'tip'], 'mark-text': ['question', 'warning', 'important', 'fail', 'error', 'bug'],
    marker: ['success'], muted: ['example', 'quote'] };
  lines.push('', '  /* callouts, in the look\'s inks */');
  for (const [key, types] of Object.entries(CALLOUTS)) lines.push(`  ${types.map(t => `--callout-${t}: ${p[key]};`).join(' ')}`);
  lines.push(`  --text-on-accent: ${mode === 'day' ? p.sheet : p.paper};`, `  --text-on-accent-inverted: ${p.ink};`);
  return `${sel} {\n  /* ${mode === 'day' ? 'Day' : 'Night'} */\n${lines.join('\n')}\n}\n`;
}

function css(dir) {
  const lk = LOOKS[dir], { pal, cfg } = palette(dir);
  const D = pal.day, N = pal.night;
  const fonts = lk.fontNote ? `   ${lk.fontNote}\n*/\n` : `   Fonts: nothing is downloaded. Each stack starts with the own-shelf font, used if it is installed,
   and falls back to fonts that ship on macOS and iOS. To fetch the own-shelf fonts instead, uncomment
   the next line; Obsidian then requests them from Google Fonts on every launch (and needs a network).
*/
/* @import url("https://fonts.googleapis.com/css2?${lk.gfonts}&display=swap"); */
`;
  const head = `/* ${lk.file}
   own-shelf look: ${lk.name} (${lk.origin || `own-shelf/design/looks.json, the pinned "${lk.pin}"`}), day and night.
   ${lk.blurb}
   Enable one shelf snippet at a time: Settings > Appearance > CSS snippets.
   Light and dark follow Obsidian's base colour scheme (Settings > Appearance > Base color scheme).
   No plugins, no remote images: ${lk.texNote || 'textures are small inline SVGs (feTurbulence) from own-shelf\'s themes lab'}.

${fonts}`;
  const shared = `
/* ── Obsidian variables, both modes (values come from the --shelf-* palette above) ── */
:root body.theme-light, :root body.theme-dark {
  --shelf-display: ${lk.display};
  --shelf-body: ${lk.body};
  --font-text-theme: var(--shelf-body);

  --background-primary: var(--shelf-paper);
  --background-primary-alt: var(--shelf-primary-alt);
  --background-secondary: var(--shelf-secondary);
  --background-secondary-alt: var(--shelf-secondary-alt);
  --background-modifier-border: var(--shelf-border);
  --background-modifier-border-hover: var(--shelf-border-hover);
  --background-modifier-border-focus: var(--shelf-accent);
  --background-modifier-hover: color-mix(in srgb, var(--shelf-ink) 7%, transparent);
  --background-modifier-active-hover: color-mix(in srgb, var(--shelf-accent) 14%, transparent);
  --background-modifier-form-field: var(--shelf-sheet);
  --divider-color: var(--shelf-border);

  --text-normal: var(--shelf-ink);
  --text-muted: var(--shelf-muted);
  --text-faint: var(--shelf-faint);
  --text-accent: var(--shelf-accent);
  --text-accent-hover: var(--shelf-accent-hover);
  --text-selection: var(--shelf-selection);
  --text-highlight-bg: var(--shelf-highlight);
  --caret-color: var(--shelf-accent);
  --interactive-accent: var(--shelf-accent);
  --interactive-accent-hover: var(--shelf-accent-hover);
  --bold-color: var(--shelf-ink);

  --h1-font: var(--shelf-display); --h2-font: var(--shelf-display); --h3-font: var(--shelf-display);
  --h4-font: var(--shelf-display); --h5-font: var(--shelf-display); --h6-font: var(--shelf-display);
  --h1-weight: ${lk.weight}; --h2-weight: ${lk.weight}; --h3-weight: ${lk.weight};
  --h4-weight: ${lk.weight}; --h5-weight: ${lk.weight}; --h6-weight: ${lk.weight};
  --h1-size: 1.75em; --h2-size: 1.5em; --h3-size: 1.22em; --h4-size: 1.1em; --h5-size: 1em; --h6-size: 0.94em;
  --h1-color: var(--shelf-ink); --h2-color: var(--shelf-h2); --h3-color: var(--shelf-h3);
  --h4-color: var(--shelf-ink); --h5-color: var(--shelf-muted); --h6-color: var(--shelf-muted);
  --heading-formatting: var(--shelf-faint);
  --inline-title-color: var(--shelf-ink);

  --link-color: var(--shelf-accent); --link-color-hover: var(--shelf-accent-hover);
  --link-external-color: var(--shelf-accent); --link-external-color-hover: var(--shelf-accent-hover);
  --link-unresolved-color: var(--shelf-mark-text);
  --list-marker-color: var(--shelf-marker); --list-marker-color-hover: var(--shelf-accent);
  --list-marker-color-collapsed: var(--shelf-accent);
  --checkbox-color: var(--shelf-accent); --checkbox-color-hover: var(--shelf-accent-hover);
  --checkbox-border-color: var(--shelf-faint);
  --hr-color: var(--shelf-rule); --hr-thickness: 1px;

  --blockquote-border-thickness: 3px;
  --blockquote-border-color: var(--shelf-quote);
  --blockquote-background-color: var(--shelf-quote-bg);
  --blockquote-color: inherit;
  --blockquote-font-style: normal;

  --code-background: var(--shelf-code-bg);
  --code-normal: var(--shelf-ink);
  --code-comment: var(--shelf-code-comment);
  --code-keyword: var(--shelf-code-keyword);
  --code-important: var(--shelf-code-keyword);
  --code-tag: var(--shelf-code-keyword);
  --code-string: var(--shelf-code-string);
  --code-function: var(--shelf-ink);
  --code-property: var(--shelf-code-string);
  --code-value: var(--shelf-code-keyword);
  --code-operator: var(--shelf-muted);
  --code-punctuation: var(--shelf-muted);

  --table-border-color: var(--shelf-border);
  --table-header-border-color: var(--shelf-border);
  --table-header-background: var(--shelf-table-head);
  --table-header-color: var(--shelf-ink);
  --table-header-weight: 600;
  --table-row-background-hover: color-mix(in srgb, var(--shelf-ink) 4%, transparent);

  /* the bars: ${{ leather: 'tooled leather with gilt fillets', ukiyoe: 'indigo woodblock with a bokashi', scroll: 'the rolled top of the scroll', horizon: 'the upper sky, paling down toward the page' }[dir]} */
  --titlebar-background: var(--shelf-chrome); --titlebar-background-focused: var(--shelf-chrome);
  --titlebar-text-color: var(--shelf-chrome-ink-soft); --titlebar-text-color-focused: var(--shelf-chrome-ink);
  --titlebar-border-color: var(--shelf-band-rule);
  --ribbon-background: var(--shelf-chrome); --ribbon-background-collapsed: var(--shelf-chrome);
  --status-bar-background: var(--shelf-chrome); --status-bar-text-color: var(--shelf-chrome-ink-soft);
  --status-bar-border-color: var(--shelf-band-rule);
  --tab-outline-color: var(--shelf-band-rule);
  --tab-divider-color: color-mix(in srgb, var(--shelf-chrome-ink) 22%, transparent);
  --tab-background-active: var(--shelf-paper);
  --tab-text-color: var(--shelf-chrome-ink-soft);
  --tab-text-color-active: var(--shelf-chrome-ink);
  --tab-text-color-focused: var(--shelf-chrome-ink-soft);
  --tab-text-color-focused-active: var(--shelf-chrome-ink);
  --tab-text-color-focused-active-current: var(--shelf-chrome-ink);
  --tab-text-color-focused-highlighted: var(--shelf-chrome-ink);
}
${pageRules(dir)}
/* ── bars: tab bars, ribbon, status bar ── */
.workspace-tab-header-container {
  --tab-container-background: var(--shelf-chrome);
${barBackground(dir, 'tabs')}}
.workspace-ribbon {
${barBackground(dir, 'ribbon')}}
.status-bar {
${barBackground(dir, 'status')}}
/* icons and labels on the bars use the bar's ink */
.workspace-tab-header-container, .workspace-ribbon, .status-bar, .titlebar, .sidebar-toggle-button {
  --icon-color: var(--shelf-chrome-ink-soft);
  --icon-color-hover: var(--shelf-chrome-ink);
  --icon-color-focused: var(--shelf-chrome-ink);
  --icon-color-active: var(--shelf-chrome-ink);
  --text-normal: var(--shelf-chrome-ink);
  --text-muted: var(--shelf-chrome-ink-soft);
  --text-faint: var(--shelf-chrome-ink-soft);
  --background-modifier-hover: color-mix(in srgb, var(--shelf-chrome-ink) 14%, transparent);
}
/* the open note's tab is cut from the page, so it takes the page's ink */
.workspace-split.mod-root .workspace-tab-header.is-active {
  --icon-color: var(--shelf-muted);
  --icon-color-hover: var(--shelf-ink);
  --icon-color-focused: var(--shelf-ink);
  --text-normal: var(--shelf-ink);
  --text-muted: var(--shelf-muted);
  --text-faint: var(--shelf-faint);
  --background-modifier-hover: color-mix(in srgb, var(--shelf-ink) 8%, transparent);
  --tab-text-color-active: var(--shelf-muted);
  --tab-text-color-focused-active: var(--shelf-muted);
  --tab-text-color-focused-active-current: var(--shelf-ink);
  --tab-text-color-focused-highlighted: var(--shelf-accent);
}
/* phone: no tab bar, so the note's header gets a thin band of the bars instead (kept off the iOS status bar) */
.is-phone .workspace-leaf-content .view-header {
  border-bottom: 4px solid var(--shelf-chrome);
  box-shadow: 0 1px 0 var(--shelf-band-rule);
}

/* ── headings ── */
${headingRules(dir)}
/* ── lists, code ── */
.markdown-rendered pre { border: 1px solid var(--shelf-border); }
.markdown-rendered pre, .markdown-source-view.mod-cm6 .cm-line.HyperMD-codeblock { background-color: var(--shelf-code-pre-bg); }
/* a quote that opens a list item (a desk answer, "- >> yes") sits beside its bullet, not a line below it */
.markdown-rendered li > .list-bullet + blockquote,
.markdown-rendered li > .list-bullet + blockquote blockquote:first-child { margin-top: 0; }
${extraRules(dir)}`;
  return head + '\n' + modeBlock(dir, 'day', D) + '\n' + modeBlock(dir, 'night', N) + shared;
}

function pageRules(dir) {
  if (dir !== 'horizon') return `
/* Reading text: a little more leading than Obsidian's 1.5, for a book page. */
.markdown-source-view, .markdown-rendered { --line-height-normal: 1.6; }

/* ── paper ── */
.workspace-split.mod-root .view-content,
.workspace-leaf-content.is-read-mode .markdown-preview-view {
  background-image: var(--shelf-paper-tex);
}
`;
  const H = `.workspace-split.mod-root .workspace-leaf-content[data-type="markdown"]`;
  return `
/* Reading text: generous leading and room between blocks, for air. */
.markdown-source-view, .markdown-rendered { --line-height-normal: 1.7; --p-spacing: 1.1rem; --heading-spacing: calc(var(--p-spacing) * 2.8); }

/* ── the scene: a coast seen from a cliff, in a note's own pane (not in embeds, popovers or other views) ──
   Painted once, on the note's leaf behind its header; the header, the editor and the reading view are clear over it.
   Layers, top first: a mist veil behind the reading column, the land on the left, the sun or moon and its path on
   the water on the right, clouds and wave crests, then sky and sea. Every drawing puts its horizon at ${HZ * 100}% of its
   height, so they line up at any size. Text sits on the veil, and keeps 4.5:1 over every tone of the scene. */
${H} {
  --file-header-background: transparent;
  --file-header-background-focused: transparent;
  --shelf-veil: var(--shelf-veil-flat);
  --shelf-veil-size: 100% 100%;
  background-color: var(--shelf-paper);
  background-image: var(--shelf-veil), var(--shelf-land), var(--shelf-light), var(--shelf-air), var(--shelf-sky);
  /* the land and the light are sized to the margin beside the column (full size on a wide pane), so the crown,
     the pine and the moon stay out from under the veil; set at ${HZ * 100}% down, their horizons stay on the sky's */
  --shelf-margin: calc(50% - var(--file-line-width) / 2 + 20px);
  background-size: var(--shelf-veil-size),
    max(260px, min(125vh, calc(var(--shelf-margin) * 5))) auto,
    max(200px, min(52vh, calc(var(--shelf-margin) * 2.8))) auto,
    100% 100%, 100% 100%;
  background-position: 50% 0, 0 ${HZ * 100}%, right 0 top ${HZ * 100}%, 0 0, 0 0;
  background-repeat: no-repeat;
}
/* with readable line length on, the veil is a band behind the column, feathered at its sides so it reads as haze */
${H}:has(> .view-content > .markdown-source-view.is-readable-line-width, > .view-content > .markdown-reading-view > .markdown-preview-view.is-readable-line-width) {
  --shelf-veil: var(--shelf-veil-band);
  --shelf-veil-size: calc(var(--file-line-width) + 200px) 100%;
}
${H} > .view-content,
${H} .markdown-reading-view > .markdown-preview-view {
  background-color: transparent;
}
/* the note's header sits on the sky, so it takes the bars' inks */
${H} > .view-header {
  --text-normal: var(--shelf-chrome-ink);
  --text-muted: var(--shelf-chrome-ink-soft);
  --text-faint: var(--shelf-chrome-ink-soft);
  --icon-color: var(--shelf-chrome-ink-soft);
  --icon-color-hover: var(--shelf-chrome-ink);
  --icon-color-focused: var(--shelf-chrome-ink);
  --icon-color-active: var(--shelf-chrome-ink);
}

/* ── phone: the column is the whole screen ──
   No scene behind the text: the page is the misty sky itself. The coast is a panorama under the note's title that
   scrolls away with it, and the sea runs along the navigation bar. */
.is-phone .workspace-split.mod-root .workspace-leaf-content[data-type="markdown"] {
  --file-header-background: var(--shelf-paper);
  --file-header-background-focused: var(--shelf-paper);
  background-image: none;
}
.is-phone .workspace-leaf-content[data-type="markdown"] .inline-title {
  margin-inline: calc(50% - 50vw);
  padding: 0.8em calc(50vw - 50%) calc(${PANO.h / PANO.w * 100}vw + 0.3em);
  background: var(--shelf-pano) 50% 100% / 100% auto no-repeat,
    linear-gradient(180deg, transparent, var(--shelf-sky-mid) calc(100% - ${PANO.h / PANO.w * 100}vw)) 0 0 / 100% 100% no-repeat;
}
/* the end of a note, in reading view: the sea running up a beach */
.is-phone .workspace-leaf-content[data-type="markdown"] .mod-footer::before {
  content: "";
  display: block;
  flex: none;
  height: 40vw;
  margin: 3rem calc(50% - 50vw) 0;
  background: var(--shelf-shore) 50% 0 / 100% 100% no-repeat;
}
.is-phone .mobile-navbar {
  --text-normal: var(--shelf-nav-ink);
  background-color: var(--shelf-nav-sea-low);
  background-image: var(--shelf-nav), linear-gradient(180deg, var(--shelf-nav-sea-top), var(--shelf-nav-sea-low));
  background-size: 400px 100%, 100% 100%;
  background-repeat: repeat-x, no-repeat;
}
`;
}

function barBackground(dir, where) {
  if (dir === 'horizon') return {
    tabs: `  background-image: linear-gradient(180deg, var(--shelf-chrome), var(--shelf-chrome-hi));\n`,
    ribbon: `  background-image: linear-gradient(180deg, var(--shelf-chrome), var(--shelf-chrome-hi) 40%, var(--shelf-secondary));\n`,
    status: `  background-image: none;\n  box-shadow: 0 -1px 0 var(--shelf-border);\n` }[where];
  if (dir === 'leather') {
    if (where === 'tabs') return `  /* a gilt fillet 4px above the bottom edge; the tab outline is the second; the open tab covers both */
  background-image: linear-gradient(var(--shelf-gilt), var(--shelf-gilt)), var(--shelf-chrome-tex),
    linear-gradient(180deg, var(--shelf-chrome-hi), var(--shelf-chrome) 55%, var(--shelf-chrome-deep));
  background-size: 100% 1px, auto, auto;
  background-position: 0 calc(100% - 4px), 0 0, 0 0;
  background-repeat: no-repeat, repeat, no-repeat;
  background-blend-mode: normal, overlay, normal;
`;
    if (where === 'ribbon') return `  background-image: var(--shelf-chrome-tex), linear-gradient(90deg, var(--shelf-chrome-deep), var(--shelf-chrome-hi) 45%, var(--shelf-chrome-deep));
  background-blend-mode: overlay, normal;
  box-shadow: inset -1px 0 0 var(--shelf-gilt);
`;
    return `  background-image: var(--shelf-chrome-tex);
  background-blend-mode: overlay;
`;
  }
  if (dir === 'ukiyoe') {
    if (where === 'ribbon') return `  background-image: var(--shelf-chrome-tex), linear-gradient(90deg, var(--shelf-chrome) 0%, var(--shelf-chrome) 28%, var(--shelf-chrome-hi) 100%);
`;
    return `  /* bokashi: the indigo is darkest at the top, as in a Hiroshige sky */
  background-image: var(--shelf-chrome-tex), linear-gradient(180deg, var(--shelf-chrome) 0%, var(--shelf-chrome) 28%, var(--shelf-chrome-hi) 100%);
`;
  }
  // scroll
  if (where === 'ribbon') return `  background-image: var(--shelf-chrome-tex), linear-gradient(90deg, var(--shelf-chrome-hi), var(--shelf-chrome) 60%, var(--shelf-chrome-deep));
`;
  return `  background-image: var(--shelf-chrome-tex),
    linear-gradient(180deg, var(--shelf-chrome-deep) 0%, var(--shelf-chrome-hi) 26%, var(--shelf-chrome) 60%, var(--shelf-chrome-deep) 100%);
`;
}

function headingRules(dir) {
  const H2 = `.markdown-rendered h2,\n.markdown-source-view.mod-cm6 .cm-line.HyperMD-header-2`;
  if (dir === 'leather') return `/* H2 sits on a double gilt rule, like the fillets on a spine */
${H2} {
  border-bottom: 3px double var(--shelf-rule);
  padding-bottom: 0.12em;
}
`;
  if (dir === 'ukiyoe') return `/* H2: an indigo rule beneath, with a small vermilion seal stamped on its right end, where a
   long heading can't wrap it onto a line of its own */
${H2} {
  position: relative;
  border-bottom: 1px solid var(--shelf-rule);
  padding-bottom: 0.12em;
  padding-inline-end: 0.8em;
}
.markdown-rendered h2::after,
.markdown-source-view.mod-cm6 .cm-line.HyperMD-header-2::after {
  content: "";
  position: absolute;
  inset-inline-end: 0;
  bottom: calc(-0.23em - 0.5px);
  width: 0.46em;
  height: 0.46em;
  border-radius: 2px;
  background: var(--shelf-mark);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--shelf-sheet) 40%, transparent);
  transform: rotate(-4deg);
}
`;
  if (dir === 'horizon') return `/* H2 over a horizon line: a hairline that fades out at both ends */
${H2} {
  padding-bottom: 0.16em;
  background: linear-gradient(90deg, transparent, var(--shelf-rule) 16%, var(--shelf-rule) 84%, transparent) 0 100% / 100% 1px no-repeat;
}
`;
  return `/* rubric H2, lapis H3, as in a manuscript */
${H2} {
  border-bottom: 1px solid var(--shelf-rule);
  padding-bottom: 0.1em;
}
`;
}

function extraRules(dir) {
  if (dir === 'horizon') return `
/* ── Horizon: quieter headings, frosted callouts, the bars' details ── */
:root body.theme-light, :root body.theme-dark {
  --inline-title-size: 2.1em; --inline-title-margin-bottom: 0.9em;
  --h1-size: 1.8em; --h2-size: 1.42em; --h3-size: 1.15em; --h4-size: 1em; --h4-weight: 600;
  --h1-letter-spacing: 0; --h2-letter-spacing: 0.01em;
  --h4-color: var(--shelf-muted);
  --callout-border-width: 1px; --callout-border-opacity: 0.22; --callout-radius: 10px; --callout-blend-mode: normal;
  --callout-todo: var(--shelf-todo);
  --status-bar-background: var(--shelf-secondary);
  --scrollbar-thumb-bg: color-mix(in srgb, var(--shelf-ink) 16%, transparent);
  --scrollbar-active-thumb-bg: color-mix(in srgb, var(--shelf-ink) 30%, transparent);
}
/* callouts: frosted panels over the scene, edged in their own colour; "your move" (todo) in the sun's gold */
.callout {
  background-color: var(--shelf-panel);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--shelf-sheet) 45%, transparent), 0 8px 22px -18px rgba(10, 20, 40, 0.35);
}
.callout-content > :last-child { margin-block-end: 0; }
/* a quote (a desk answer, ">>") gets room above and below its line */
.markdown-rendered blockquote { padding-block: 0.4em; }
.markdown-rendered p, .markdown-rendered li { text-wrap: pretty; }
/* phone: a hairline under the note's header, in place of the bars' band */
.is-phone .workspace-leaf-content .view-header {
  border-bottom: 1px solid var(--shelf-border);
  box-shadow: none;
}

/* Mermaid draws in its own lavender, which Obsidian inverts at night; turned here toward the sea's blue-grey. */
.theme-light .mermaid > svg { filter: hue-rotate(-38deg) saturate(0.45); }
.theme-dark .mermaid > svg { filter: invert(87%) hue-rotate(168deg) saturate(1.5) brightness(1.18); }
`;
  if (dir !== 'scroll') return '';
  return `
/* ── the scroll: rolled side edges, rod ends, drop cap, wax seal ── */
/* the curl at each side of the note; narrower on phones, and always inside the page margin */
.mod-root .workspace-leaf-content[data-type="markdown"]::before,
.mod-root .workspace-leaf-content[data-type="markdown"]::after {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  width: clamp(4px, 1.6vw, ${CFG.scroll.roll}px);
  z-index: 2;
  pointer-events: none;
}
.mod-root .workspace-leaf-content[data-type="markdown"]::before {
  left: 0;
  background: linear-gradient(90deg, rgba(50, 28, 8, 0.6), color-mix(in srgb, var(--shelf-chrome-hi) 80%, transparent) 40%, rgba(50, 28, 8, 0.22) 80%, transparent);
}
.mod-root .workspace-leaf-content[data-type="markdown"]::after {
  right: 0;
  background: linear-gradient(270deg, rgba(50, 28, 8, 0.6), color-mix(in srgb, var(--shelf-chrome-hi) 80%, transparent) 40%, rgba(50, 28, 8, 0.22) 80%, transparent);
}
/* wooden rod ends on the note area's tab bar */
.workspace-split.mod-root .workspace-tab-header-container {
  background-image: linear-gradient(90deg, #2E1C0E, #8A5E38 50%, #2E1C0E), linear-gradient(90deg, #2E1C0E, #8A5E38 50%, #2E1C0E),
    var(--shelf-chrome-tex),
    linear-gradient(180deg, var(--shelf-chrome-deep) 0%, var(--shelf-chrome-hi) 26%, var(--shelf-chrome) 60%, var(--shelf-chrome-deep) 100%);
  background-size: 9px 100%, 9px 100%, auto, auto;
  background-position: 0 0, 100% 0, 0 0, 0 0;
  background-repeat: no-repeat, no-repeat, repeat, no-repeat;
}
/* Reading view only: a red drop cap on a paragraph that opens the note right under its H1. The H1 and that
   paragraph render and unload together, so the cap never comes and goes, and resizes the page, as you scroll. */
.el-h1 + .el-p > p:first-child {
  display: flow-root;
}
.el-h1 + .el-p > p:first-child::first-letter {
  float: left;
  font-family: var(--shelf-display);
  font-weight: 400;
  font-size: 3.5em;
  line-height: 0.8;
  padding: 0.08em 0.1em 0 0;
  color: var(--shelf-mark);
}
/* a wax seal under the last line, in reading view: below the text, never over it. Not in the editor, whose
   scroll height CodeMirror works out itself. */
.mod-root .workspace-leaf-content[data-type="markdown"] .mod-footer::before {
  content: "";
  display: block;
  flex: none;
  align-self: center;
  width: 46px;
  height: 46px;
  margin: 2.5rem auto 1.5rem;
  background: ${SEAL} center / contain no-repeat;
  filter: drop-shadow(0 2px 2px rgba(40, 20, 6, 0.35));
}
`;
}

fs.mkdirSync(OUT, { recursive: true });
const reports = {};
for (const dir of Object.keys(LOOKS)) {
  const s = css(dir);
  fs.writeFileSync(path.join(OUT, LOOKS[dir].file), s);
  reports[dir] = palette(dir).report;
  console.log(LOOKS[dir].file, (s.length / 1024).toFixed(1) + ' KB');
}
fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(reports, null, 1));
for (const [dir, r] of Object.entries(reports)) {
  console.log('\n' + dir);
  for (const k of Object.keys(r.day)) console.log('  ' + k.padEnd(30) + String(r.day[k]).padStart(6) + String(r.night[k]).padStart(8));
}
