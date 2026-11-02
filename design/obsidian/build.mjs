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
// Horizon is drawn for Obsidian's note pane (a landscape along the foot of the view). Its tokens and its
// landscape live in this file only, built on the lab's colour helpers.
const HORIZON = {
  // sky: the page from its top (paper) to the foot of the view (skyLow); haze: the glow at the horizon.
  // ranges: [colour, strength over the haze] far to near, bluer with distance; trees: the treeline's.
  day: { paper: '#E3E9EC', skyLow: '#EDF0EE', haze: '#F3F2EB', ink: '#1B2630', accent: '#2D5D70', mark: '#97553A', pine: '#3F6553',
    chrome: '#C5D0D6', gilt: '#C8B590', sea: '#D3DEE1', wave: '#9DB2BB', moon: '#FFFFFF',
    ranges: [['#7D97AD', 0.16], ['#5E7884', 0.22], ['#4D655E', 0.22]], trees: ['#3A5049', 0.25], waveK: 0.3, moonK: 0.7, highlight: 0.6 },
  night: { paper: '#0E1621', skyLow: '#121C28', haze: '#1C2734', ink: '#D8E0E3', accent: '#8AB6C5', mark: '#D69474', pine: '#94C2A6',
    chrome: '#09101A', gilt: '#A38E66', sea: '#111B26', wave: '#3A4E60', moon: '#E8E3CF',
    // a low moon behind haze: bright enough to see, dim enough that text and ==highlights== still read over it
    ranges: [['#0D151F', 0.9], ['#0A111A', 0.92], ['#070D15', 0.95]], trees: ['#04080D', 1], waveK: 0.5, moonK: 0.12, highlight: 0.26 },
};
// Horizon's coloured text: pushed toward `to` until it reads at `min` over every tone and over its own callout
// tint (10% of itself) on each tone.
function towardTinted(c, bgs, min, to) {
  const worst = x => Math.min(...bgs.flatMap(b => [contrast(x, b), contrast(x, over(x, 0.1, b))]));
  let i = 0; while (worst(c) < min && i++ < 80) c = mix(c, to, 0.03);
  return c;
}
// The view's landscape: 3200 x 220 units, drawn at a fixed height and centred on x = 1600, so a wider pane
// shows more of the coast and a phone shows its middle (about 1220 to 1980). The horizon sits at y = 172; the
// sea below it is a CSS band, so it runs the full width of any pane.
const LAND = { w: 3200, h: 220, horizon: 172 };
const HZ_RANGES = [
  // far: the palest and bluest, the longest
  [[700, 28, 240], [980, 46, 200], [1220, 70, 170], [1440, 100, 190], [1640, 64, 150], [1830, 86, 190], [2080, 58, 210], [2360, 44, 220], [2650, 30, 240]],
  // middle: two masses, with open sea under the far peaks between them
  [[620, 30, 180], [900, 40, 170], [1080, 56, 140], [1240, 46, 120], [1360, 20, 90], [1980, 22, 110], [2120, 42, 130], [2300, 58, 160], [2500, 40, 170], [2720, 26, 200]],
  // near: a headland on the left that runs down into the sea, a low spit on the right
  [[600, 36, 160], [1050, 58, 130], [1180, 50, 110], [1290, 28, 90], [1900, 10, 70], [2010, 18, 90], [2560, 30, 150]],
];
// The trees: [x, height], in clusters on the near headland and the spit.
const HZ_TREES = [[1074, 34], [1098, 42], [1116, 30], [1162, 38], [1181, 44], [1199, 32], [1252, 28], [1270, 34], [1318, 22], [1342, 16],
  [1912, 15], [1930, 20], [1946, 14], [2018, 22], [2036, 17], [560, 26], [584, 32], [640, 22], [2540, 26], [2566, 20]];
// A range's ridge: smooth peaks joined by a soft maximum (so each keeps its own height, with saddles between),
// a little seeded roughness, as one closed path on the horizon.
function ridge(peaks, seed, step = 20) {
  const R = L.rng(seed), ph = [R() * 6.3, R() * 6.3, R() * 6.3];
  const lift = x => { const s = Math.cbrt(peaks.reduce((a, [px, h, w]) => a + (h * Math.exp(-(((x - px) / w) ** 2))) ** 3, 0));
    return s + Math.min(1, s / 18) * (2.2 * Math.sin(x / 41 + ph[0]) + 1.3 * Math.sin(x / 19 + ph[1]) + 0.7 * Math.sin(x / 8 + ph[2])); };
  const base = LAND.horizon + 1, ys = [];
  for (let x = 0; x <= LAND.w; x += step) ys.push([x, Math.round(base - Math.max(0, lift(x)))]);
  // points that lie flat on the horizon, between two others that do, add nothing
  const pts = ys.filter(([, y], i) => y < base || (ys[i - 1] || [0, base])[1] < base || (ys[i + 1] || [0, base])[1] < base);
  return { d: `M0 ${base}` + pts.map(([x, y]) => `L${x} ${y}`).join('') + `L${LAND.w} ${base}Z`, at: x => LAND.horizon - Math.max(0, lift(x)) };
}
// A two-tier conifer standing on (x, y).
const tree = (x, y, h) => { const w = h * 0.42, q = n => Math.round(n * 10) / 10;
  return `M${q(x)} ${q(y - h)}L${q(x + w * 0.32)} ${q(y - h * 0.5)}L${q(x + w * 0.18)} ${q(y - h * 0.5)}L${q(x + w / 2)} ${q(y + 2)}L${q(x - w / 2)} ${q(y + 2)}L${q(x - w * 0.18)} ${q(y - h * 0.5)}L${q(x - w * 0.32)} ${q(y - h * 0.5)}Z`; };

// Every Horizon colour, per mode, and the list of every tone text can scroll over.
function horizonTokens() {
  const out = {};
  for (const mode of ['day', 'night']) {
    const day = mode === 'day', c = HORIZON[mode], t = {};
    Object.assign(t, { paper: c.paper, ink: c.ink, sea: c.accent, buoy: c.mark, pine: c.pine, chrome: c.chrome, gilt: c.gilt });
    t.sheet = day ? mix(c.paper, '#FFFFFF', 0.55) : mix(c.paper, c.ink, 0.055);
    t.skyLow = c.skyLow; t.haze = c.haze;
    t.ranges = c.ranges.map(([col, k]) => mix(c.haze, col, k)); // each range at its ridge; its foot fades into the haze
    t.trees = mix(c.haze, c.trees[0], c.trees[1]);
    t.seaTone = c.sea; t.waveTone = mix(c.sea, c.wave, c.waveK);
    t.moon = mix(c.skyLow, c.moon, c.moonK); t.halo = mix(c.skyLow, c.moon, c.moonK * 0.35); t.road = mix(c.sea, c.moon, c.moonK * 0.8);
    t.wave = t.waveTone; t.highlight = c.highlight;
    t.chromeHi = mix(c.chrome, c.paper, 0.6);
    t.chromeInk = c.ink;
    // every tone behind text: the sky from top to foot, the haze, each range, the trees, the sea, its waves, the moon
    t.bgs = [c.paper, c.skyLow, c.haze, ...t.ranges, t.trees, t.seaTone, t.waveTone, t.moon, t.halo].concat(day ? [] : [t.road]);
    // secondary text: 30% of the way to the page, darkened (lightened) until it reads at 5:1 on every tone, on cards,
    // and on every callout's tint
    const tints = [c.accent, c.mark, c.pine].flatMap(col => t.bgs.map(b => over(col, 0.1, b)));
    let m = 0.3; t.muted = mix(c.ink, c.paper, m);
    while (Math.min(...t.bgs.concat(t.sheet, tints).map(b => contrast(t.muted, b))) < 5 && m > 0.04) { m -= 0.02; t.muted = mix(c.ink, c.paper, m); }
    t.muted = towardTinted(t.muted, t.bgs, 4.6, c.ink);
    t.land = landscape(mode, t);
    out[mode] = t;
  }
  return out;
}

// The landscape as one SVG: ranges that fade with distance into mist at their feet, a sparse treeline, long
// waves, and a low crescent moon (a pale sun in the haze by day). The glow of the sky toward the horizon, behind
// the ranges, is a CSS layer, so it runs the full width of any pane.
function landscape(mode, t) {
  const day = mode === 'day', R = L.rng(day ? 31 : 37);
  const rs = HZ_RANGES.map((p, i) => ridge(p, 11 + i));
  // each range fades toward the haze at its foot, the far ones most
  let defs = rs.map((r, i) => `<linearGradient id='r${i}' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${t.ranges[i]}'/><stop offset='1' stop-color='${mix(t.ranges[i], t.haze, [0.7, 0.55, 0.35][i])}'/></linearGradient>`).join('');
  let s = rs.map((r, i) => `<path d='${r.d}' fill='url(#r${i})'/>`).join('');
  const near = rs[2];
  s += `<path d='${HZ_TREES.map(([x, h]) => tree(x, near.at(x) + 1, h)).join('')}' fill='${t.trees}'/>`;
  // the moon (or the sun through haze), low over the gap between the middle ranges
  const mx = 1700, my = 42, r = day ? 13 : 12, r2 = Math.round(r * 1.3 * 10) / 10;
  defs += `<radialGradient id='h'><stop offset='0' stop-color='${t.halo}'/><stop offset='1' stop-color='${t.halo}' stop-opacity='0'/></radialGradient>`;
  const disc = day ? `<circle cx='${mx}' cy='${my}' r='${r}' fill='${t.moon}'/>`
    : `<path d='M${mx} ${my - r}A${r} ${r} 0 0 0 ${mx} ${my + r}A${r2} ${r2} 0 0 1 ${mx} ${my - r}Z' fill='${t.moon}' transform='rotate(-24 ${mx} ${my})'/>`;
  s = `<circle cx='${mx}' cy='${my}' r='${day ? 62 : 50}' fill='url(#h)'/>${disc}` + s;
  // waves: long, slow, broken lines, closer together toward the horizon; a moon road under the moon at night
  let wv = '';
  for (const [dy, minLen, maxLen, gap] of [[4, 90, 260, 140], [9, 140, 380, 180], [16, 200, 520, 220], [26, 260, 700, 260], [39, 320, 900, 300]]) {
    const y = LAND.horizon + dy;
    for (let x = -R() * 300; x < LAND.w; ) { const len = minLen + R() * (maxLen - minLen), x2 = Math.min(LAND.w, x + len);
      if (x2 > 0) wv += `M${Math.round(Math.max(0, x))} ${y}Q${Math.round((x + x2) / 2)} ${y - 0.8} ${Math.round(x2)} ${y}`;
      x = x2 + gap * (0.5 + R()); }
  }
  s += `<path d='${wv}' fill='none' stroke='${t.waveTone}' stroke-width='1.3' stroke-linecap='round'/>`;
  if (!day) { let road = ''; for (const [dy, half] of [[3, 10], [7, 16], [12, 22], [19, 30], [28, 38], [40, 46]]) { const j = (R() - 0.5) * 8; road += `M${Math.round(mx - half + j)} ${LAND.horizon + dy}H${Math.round(mx + half * (0.6 + R() * 0.4) + j)}`; }
    s += `<path d='${road}' fill='none' stroke='${t.road}' stroke-width='1.6' stroke-linecap='round'/>`; }
  return svgURL(`<svg xmlns='http://www.w3.org/2000/svg' width='${LAND.w}' height='${LAND.h}' viewBox='0 0 ${LAND.w} ${LAND.h}'><defs>${defs}</defs>${s}</svg>`);
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
    blurb: 'Open sky over a far coast: the sky pales toward a low horizon, mountain ranges fade with distance,\n   a sparse treeline and long slow waves lie along the foot of the note, and the text sits on open sky.\n   Optima headings. Night is the same coast at dusk, under a low moon.',
    texNote: 'the landscape is one small inline SVG; the sky, its glow at the horizon and the sea are CSS gradients',
    fontNote: 'Fonts: nothing is downloaded. Optima (headings) and Iowan Old Style (text) ship on macOS and iOS.',
  },
};

// Every value the snippet needs, per look and mode.
function palette(dir) {
  const lk = LOOKS[dir], hz = !!lk.tokens; // hz: Horizon, whose text can scroll over every tone of its landscape
  const c = hz ? {} : Object.assign(L.defaults(dir), CFG[dir]);
  const T = hz ? lk.tokens() : L.tokens(dir, c), out = {}, report = {};
  for (const mode of ['day', 'night']) {
    const t = T[mode], day = mode === 'day', p = {};
    const paperTex = hz ? { css: t.land } : tex(LOOKS[dir].kinds[0], c.grain, mode, t), chromeTex = hz ? { css: 'none' } : tex(LOOKS[dir].kinds[1], c.chromeGrain, mode, t);
    // Horizon's "grain" is the landscape tone that reads worst under the text
    const grained = hz ? t.bgs.reduce((w, b) => contrast(t.ink, b) < contrast(t.ink, w) ? b : w) : L.grainedPaper(t.paper, t.ink, paperTex.peaks || []);
    const page = hz ? t.bgs : [t.paper, grained];
    // Horizon holds every text tier, faint included, to 4.5:1 on every tone; the app looks keep faint at 3.1:1 on the page
    const textBgs = hz ? page : [t.paper], faintMin = hz ? 4.5 : 3.1;
    p.paper = t.paper; p.sheet = t.sheet; p.ink = t.ink; p.muted = t.muted; p.gilt = t.gilt; p.wave = t.wave;
    p.chrome = t.chrome; p['chrome-hi'] = t.chromeHi; p['chrome-ink'] = t.chromeInk;
    p['chrome-deep'] = mix(t.chrome, '#000000', day && dir === 'scroll' ? 0.28 : 0.22);
    p['chrome-ink-soft'] = toward(mix(t.chromeInk, t.chrome, 0.28), [t.chrome, t.chromeHi], 4.6, t.chromeInk);
    // text tiers
    let f = 0.62; p.faint = mix(t.ink, t.paper, f); while (Math.min(...textBgs.map(b => contrast(p.faint, b))) < faintMin && f > 0.2) { f -= 0.02; p.faint = mix(t.ink, t.paper, f); }
    // Horizon's coloured text is also read on its own callout tint
    p.accent = hz ? towardTinted(t.sea, page, 4.6, day ? mix(t.sea, '#000000', 0.75) : '#FFFFFF') : toward(t.sea, page, 4.5, day ? t.ink : '#FFFFFF');
    p['accent-hover'] = day ? mix(p.accent, t.ink, 0.25) : mix(p.accent, '#FFFFFF', 0.2);
    p.mark = t.buoy; // ribbon, seals, drop cap: decoration
    p['mark-text'] = hz ? towardTinted(t.buoy, page, 4.6, day ? mix(t.buoy, '#000000', 0.75) : t.ink) : toward(t.buoy, page, 4.5, day ? t.ink : t.ink); // the mark when it carries text
    // surfaces
    p.secondary = hz ? (day ? mix(t.paper, t.chrome, 0.3) : mix(t.paper, '#000000', 0.18)) : day ? mix(t.paper, t.gilt, dir === 'ukiyoe' ? 0.1 : 0.14) : mix(t.paper, '#000000', 0.18);
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
    if (hz) { p.h2 = t.ink; p.h3 = p.accent; p.rule = mix(p.accent, t.paper, 0.6); p.marker = towardTinted(t.pine, page, 4.6, day ? mix(t.pine, '#000000', 0.75) : '#FFFFFF'); p.quote = mix(p.accent, t.paper, 0.35); p['band-rule'] = mix(t.chrome, t.ink, 0.22); }
    p['quote-bg'] = over(dir === 'leather' ? t.gilt : p.quote, day ? 0.1 : 0.09, t.paper);
    p['code-bg'] = over(t.sea, day ? 0.09 : 0.1, t.paper);
    p['code-pre-bg'] = day ? mix(t.sheet, t.paper, 0.35) : mix(t.paper, t.ink, 0.05);
    p['code-keyword'] = toward(t.buoy, [p['code-bg'], p['code-pre-bg']], 4.5, t.ink);
    p['code-string'] = toward(t.sea, [p['code-bg'], p['code-pre-bg']], 4.5, day ? t.ink : '#FFFFFF');
    p['code-comment'] = toward(t.muted, [p['code-bg'], p['code-pre-bg']], 4.5, day ? t.ink : '#FFFFFF');
    p['table-head'] = hz ? (day ? mix(t.paper, t.chrome, 0.75) : mix(t.paper, t.ink, 0.08)) : day ? mix(t.paper, t.gilt, 0.2) : mix(t.paper, t.gilt, 0.09);
    p.highlight = hz ? `rgba(255, 212, 59, ${t.highlight})` : day ? 'rgba(255, 212, 59, 0.6)' : 'rgba(255, 212, 59, 0.38)'; // own-shelf's "sun" tint
    p.selection = `color-mix(in srgb, ${p.accent} ${day ? 22 : 30}%, transparent)`;
    if (hz) Object.assign(p, { 'sky-low': t.skyLow, haze: t.haze, sea: t.seaTone });
    // Obsidian's neutral ramp, re-tinted from the page to the ink
    const base = day ? [['00', t.sheet], ['05', mix(t.sheet, t.paper, 0.5)], ['10', t.paper], ['20', mix(t.paper, t.ink, 0.04)], ['25', mix(t.paper, t.ink, 0.08)],
      ['30', mix(t.paper, t.ink, 0.14)], ['35', mix(t.paper, t.ink, 0.2)], ['40', mix(t.paper, t.ink, 0.32)], ['50', mix(t.paper, t.ink, 0.42)], ['60', mix(t.paper, t.ink, 0.62)], ['70', t.muted], ['100', t.ink]]
      : [['00', t.paper], ['05', mix(t.paper, t.ink, 0.02)], ['10', mix(t.paper, t.ink, 0.035)], ['20', t.sheet], ['25', mix(t.paper, t.ink, 0.08)], ['30', mix(t.paper, t.ink, 0.11)],
      ['35', mix(t.paper, t.ink, 0.16)], ['40', mix(t.paper, t.ink, 0.26)], ['50', mix(t.paper, t.ink, 0.36)], ['60', mix(t.paper, t.ink, 0.55)], ['70', t.muted], ['100', t.ink]];
    p.base = base;
    p.acc = hsl(p.accent);
    p['paper-tex'] = paperTex.css; p['chrome-tex'] = chromeTex.css;
    out[mode] = p;
    const hlA = hz ? t.highlight : day ? 0.6 : 0.38, hl = over('#FFD43B', hlA, t.paper);
    // worst contrast of fg over a set of backgrounds; for Horizon, "page" is every tone text can scroll over
    const w = (fg, bgs) => Math.min(...bgs.map(b => contrast(fg, b)));
    report[mode] = {
      'body text / page': w(t.ink, hz ? [t.paper, t.skyLow, t.haze] : [t.paper]), [hz ? 'body text / landscape, worst tone' : 'body text / darkest grain']: contrast(t.ink, grained), 'muted / page': w(p.muted, textBgs),
      'faint / page': w(p.faint, textBgs), 'links, accent / page': Math.min(...page.map(b => contrast(p.accent, b))), 'H2 / page': Math.min(...page.map(b => contrast(p.h2, b))),
      'H3 / page': Math.min(...page.map(b => contrast(p.h3, b))), 'text / quote tint': contrast(t.ink, p['quote-bg']), 'text / inline code': contrast(t.ink, p['code-bg']),
      'text / sidebar': contrast(t.ink, p.secondary), 'muted / sidebar': contrast(p.muted, p.secondary), 'bar text / bar': Math.min(contrast(t.chromeInk, t.chrome), contrast(t.chromeInk, t.chromeHi)),
      'bar text soft / bar': Math.min(contrast(p['chrome-ink-soft'], t.chrome), contrast(p['chrome-ink-soft'], t.chromeHi)), 'list markers / page': w(p.marker, textBgs),
      'text / ==highlight==': contrast(t.ink, hl), 'code keyword / code': Math.min(contrast(p['code-keyword'], p['code-bg']), contrast(p['code-keyword'], p['code-pre-bg'])),
      'code comment / code': Math.min(contrast(p['code-comment'], p['code-bg']), contrast(p['code-comment'], p['code-pre-bg'])),
    };
    if (hz) {
      // callouts: a 10% tint of their colour over whatever tone is behind them; the title is in that colour
      const tints = col => page.map(b => over(col, 0.1, b)), cols = [p.accent, p['mark-text'], p.marker, p.muted];
      Object.assign(report[mode], {
        'callout title, todo and info / its tint': w(p.accent, tints(p.accent)), 'callout title, warning / its tint': w(p['mark-text'], tints(p['mark-text'])),
        'callout title, success / its tint': w(p.marker, tints(p.marker)), 'callout title, example / its tint': w(p.muted, tints(p.muted)),
        'text / callout tints': Math.min(...cols.map(col => w(t.ink, tints(col)))), 'muted / callout tints': Math.min(...cols.map(col => w(p.muted, tints(col)))),
        'text / table header': contrast(t.ink, p['table-head']), 'text / code block': contrast(t.ink, p['code-pre-bg']),
        'code string / code': w(p['code-string'], [p['code-bg'], p['code-pre-bg']]), 'text / ==highlight== over landscape': w(t.ink, page.map(b => over('#FFD43B', hlA, b))),
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
  if (LOOKS[dir].tokens) lines.push(...['sky-low', 'haze', 'sea'].map(k => `  --shelf-${k}: ${p[k]};`), `  --shelf-land: ${p['paper-tex']};`);
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
  const sea = `calc(var(--shelf-land-h) * ${LAND.h - LAND.horizon} / ${LAND.h})`;
  return `
/* Reading text: more leading than Obsidian's 1.5, for air between the lines. */
.markdown-source-view, .markdown-rendered { --line-height-normal: 1.65; }

/* ── the view: open sky over a low horizon, in a note's own pane (not in embeds, popovers or other views) ──
   Layers, top first: the landscape, the glow of the sky above the horizon, the sea, the sky. The landscape stays at the foot of the view while the
   note scrolls. It is drawn at a fixed height and centred, so a wider pane shows more of the coast and a phone
   shows its middle. Text passes over it: every tone in it keeps the text at 4.5:1. */
.workspace-split.mod-root .workspace-leaf-content[data-type="markdown"] { --shelf-land-h: 170px; }
.is-phone .workspace-split.mod-root .workspace-leaf-content[data-type="markdown"] { --shelf-land-h: 112px; }
.workspace-split.mod-root .workspace-leaf-content[data-type="markdown"] > .view-content,
.workspace-split.mod-root .workspace-leaf-content[data-type="markdown"].is-read-mode > .view-content > .markdown-reading-view > .markdown-preview-view {
  background-image: var(--shelf-land),
    linear-gradient(0deg, var(--shelf-sea) ${sea}, var(--shelf-haze) ${sea}, transparent calc(var(--shelf-land-h) * 0.8)),
    linear-gradient(180deg, var(--shelf-paper), var(--shelf-sky-low));
  background-size: auto var(--shelf-land-h), 100% 100%, 100% 100%;
  background-position: 50% 100%, 0 0, 0 0;
  background-repeat: no-repeat;
}
`;
}

function barBackground(dir, where) {
  if (dir === 'horizon') return `  background-image: linear-gradient(180deg, var(--shelf-chrome), var(--shelf-chrome-hi));
`;
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
/* phone: the note's header fades from the upper sky into the page, in place of the bars' band */
.is-phone .workspace-leaf-content .view-header {
  border-bottom: 0;
  box-shadow: none;
  background-image: linear-gradient(180deg, var(--shelf-chrome), var(--shelf-paper));
}

/* ── Mermaid in the look's blue-greys ── */
/* Mermaid draws in its own lavender, which Obsidian inverts at night; turned here toward the sea's blue-grey. */
.theme-light .mermaid > svg { filter: hue-rotate(-38deg) saturate(0.45); }
.theme-dark .mermaid > svg { filter: invert(100%) hue-rotate(142deg) saturate(0.55); }
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
