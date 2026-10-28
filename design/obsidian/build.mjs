// Builds the three own-shelf looks as Obsidian CSS snippets, from design/looks.json and the themes lab's
// own token and texture code, and reports contrast.
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

// ── the three looks ──
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
};

// Every value the snippet needs, per look and mode.
function palette(dir) {
  const c = Object.assign(L.defaults(dir), CFG[dir]);
  const T = L.tokens(dir, c), out = {}, report = {};
  for (const mode of ['day', 'night']) {
    const t = T[mode], day = mode === 'day', p = {};
    const paperTex = tex(LOOKS[dir].kinds[0], c.grain, mode, t), chromeTex = tex(LOOKS[dir].kinds[1], c.chromeGrain, mode, t);
    const grained = L.grainedPaper(t.paper, t.ink, paperTex.peaks || []);
    const page = [t.paper, grained];
    p.paper = t.paper; p.sheet = t.sheet; p.ink = t.ink; p.muted = t.muted; p.gilt = t.gilt; p.wave = t.wave;
    p.chrome = t.chrome; p['chrome-hi'] = t.chromeHi; p['chrome-ink'] = t.chromeInk;
    p['chrome-deep'] = mix(t.chrome, '#000000', day && dir === 'scroll' ? 0.28 : 0.22);
    p['chrome-ink-soft'] = toward(mix(t.chromeInk, t.chrome, 0.28), [t.chrome, t.chromeHi], 4.6, t.chromeInk);
    // text tiers
    let f = 0.62; p.faint = mix(t.ink, t.paper, f); while (contrast(p.faint, t.paper) < 3.1 && f > 0.2) { f -= 0.02; p.faint = mix(t.ink, t.paper, f); }
    p.accent = toward(t.sea, page, 4.5, day ? t.ink : '#FFFFFF');
    p['accent-hover'] = day ? mix(p.accent, t.ink, 0.25) : mix(p.accent, '#FFFFFF', 0.2);
    p.mark = t.buoy; // ribbon, seals, drop cap: decoration
    p['mark-text'] = toward(t.buoy, page, 4.5, day ? t.ink : t.ink); // the mark when it carries text
    // surfaces
    p.secondary = day ? mix(t.paper, t.gilt, dir === 'ukiyoe' ? 0.1 : 0.14) : mix(t.paper, '#000000', 0.18);
    p['secondary-alt'] = day ? t.sheet : mix(t.paper, t.ink, 0.06);
    p['primary-alt'] = day ? mix(t.paper, t.ink, 0.035) : mix(t.paper, t.ink, 0.04);
    p.border = day ? mix(mix(t.paper, t.gilt, 0.35), t.ink, 0.14) : mix(t.paper, t.ink, 0.16);
    p['border-hover'] = day ? mix(p.border, t.ink, 0.18) : mix(t.paper, t.ink, 0.26);
    // rules and markers: gilt pressed into the page (leather), the look's own marks otherwise; >= 3:1 as graphics
    const giltOnPage = toward(t.gilt, [t.paper], 3, day ? t.ink : '#FFFFFF');
    if (dir === 'leather') { p.h2 = p.accent; p.h3 = p['mark-text']; p.rule = giltOnPage; p.marker = giltOnPage; p.quote = giltOnPage; p['band-rule'] = t.gilt; }
    if (dir === 'ukiyoe')  { p.h2 = p.accent; p.h3 = p['mark-text']; p.rule = mix(p.accent, t.paper, 0.55); p.marker = toward(t.buoy, [t.paper], 3, t.ink); p.quote = p.accent; p['band-rule'] = t.buoy; }
    if (dir === 'scroll')  { p.h2 = p['mark-text']; p.h3 = p.accent; p.rule = toward(t.wave, [t.paper], 1.6, t.ink); p.marker = toward(t.buoy, [t.paper], 3, t.ink); p.quote = p.accent; p['band-rule'] = '#5A3A22'; }
    p['quote-bg'] = over(dir === 'leather' ? t.gilt : p.quote, day ? 0.1 : 0.09, t.paper);
    p['code-bg'] = over(t.sea, day ? 0.09 : 0.1, t.paper);
    p['code-pre-bg'] = day ? mix(t.sheet, t.paper, 0.35) : mix(t.paper, t.ink, 0.05);
    p['code-keyword'] = toward(t.buoy, [p['code-bg'], p['code-pre-bg']], 4.5, t.ink);
    p['code-string'] = toward(t.sea, [p['code-bg'], p['code-pre-bg']], 4.5, day ? t.ink : '#FFFFFF');
    p['code-comment'] = toward(t.muted, [p['code-bg'], p['code-pre-bg']], 4.5, day ? t.ink : '#FFFFFF');
    p['table-head'] = day ? mix(t.paper, t.gilt, 0.2) : mix(t.paper, t.gilt, 0.09);
    p.highlight = day ? 'rgba(255, 212, 59, 0.6)' : 'rgba(255, 212, 59, 0.38)'; // own-shelf's "sun" tint
    p.selection = `color-mix(in srgb, ${p.accent} ${day ? 22 : 30}%, transparent)`;
    // Obsidian's neutral ramp, re-tinted from the page to the ink
    const base = day ? [['00', t.sheet], ['05', mix(t.sheet, t.paper, 0.5)], ['10', t.paper], ['20', mix(t.paper, t.ink, 0.04)], ['25', mix(t.paper, t.ink, 0.08)],
      ['30', mix(t.paper, t.ink, 0.14)], ['35', mix(t.paper, t.ink, 0.2)], ['40', mix(t.paper, t.ink, 0.32)], ['50', mix(t.paper, t.ink, 0.42)], ['60', mix(t.paper, t.ink, 0.62)], ['70', t.muted], ['100', t.ink]]
      : [['00', t.paper], ['05', mix(t.paper, t.ink, 0.02)], ['10', mix(t.paper, t.ink, 0.035)], ['20', t.sheet], ['25', mix(t.paper, t.ink, 0.08)], ['30', mix(t.paper, t.ink, 0.11)],
      ['35', mix(t.paper, t.ink, 0.16)], ['40', mix(t.paper, t.ink, 0.26)], ['50', mix(t.paper, t.ink, 0.36)], ['60', mix(t.paper, t.ink, 0.55)], ['70', t.muted], ['100', t.ink]];
    p.base = base;
    p.acc = hsl(p.accent);
    p['paper-tex'] = paperTex.css; p['chrome-tex'] = chromeTex.css;
    out[mode] = p;
    const hl = over('#FFD43B', day ? 0.6 : 0.38, t.paper);
    report[mode] = {
      'body text / page': contrast(t.ink, t.paper), 'body text / darkest grain': contrast(t.ink, grained), 'muted / page': contrast(p.muted, t.paper),
      'faint / page': contrast(p.faint, t.paper), 'links, accent / page': Math.min(...page.map(b => contrast(p.accent, b))), 'H2 / page': Math.min(...page.map(b => contrast(p.h2, b))),
      'H3 / page': Math.min(...page.map(b => contrast(p.h3, b))), 'text / quote tint': contrast(t.ink, p['quote-bg']), 'text / inline code': contrast(t.ink, p['code-bg']),
      'text / sidebar': contrast(t.ink, p.secondary), 'muted / sidebar': contrast(p.muted, p.secondary), 'bar text / bar': Math.min(contrast(t.chromeInk, t.chrome), contrast(t.chromeInk, t.chromeHi)),
      'bar text soft / bar': Math.min(contrast(p['chrome-ink-soft'], t.chrome), contrast(p['chrome-ink-soft'], t.chromeHi)), 'list markers / page': contrast(p.marker, t.paper),
      'text / ==highlight==': contrast(t.ink, hl), 'code keyword / code': Math.min(contrast(p['code-keyword'], p['code-bg']), contrast(p['code-keyword'], p['code-pre-bg'])),
      'code comment / code': Math.min(contrast(p['code-comment'], p['code-bg']), contrast(p['code-comment'], p['code-pre-bg'])),
    };
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
  lines.push(`  --shelf-paper-tex: ${p['paper-tex']};`, `  --shelf-chrome-tex: ${p['chrome-tex']};`);
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
  const head = `/* ${lk.file}
   own-shelf look: ${lk.name} (own-shelf/design/looks.json, the pinned "${lk.pin}"), day and night.
   ${lk.blurb}
   Enable one shelf snippet at a time: Settings > Appearance > CSS snippets.
   Light and dark follow Obsidian's base colour scheme (Settings > Appearance > Base color scheme).
   No plugins, no remote images: textures are small inline SVGs (feTurbulence) from own-shelf's themes lab.

   Fonts: nothing is downloaded. Each stack starts with the own-shelf font, used if it is installed,
   and falls back to fonts that ship on macOS and iOS. To fetch the own-shelf fonts instead, uncomment
   the next line; Obsidian then requests them from Google Fonts on every launch (and needs a network).
*/
/* @import url("https://fonts.googleapis.com/css2?${lk.gfonts}&display=swap"); */
`;
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

  /* the bars: ${dir === 'leather' ? 'tooled leather with gilt fillets' : dir === 'ukiyoe' ? 'indigo woodblock with a bokashi' : 'the rolled top of the scroll'} */
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

/* Reading text: a little more leading than Obsidian's 1.5, for a book page. */
.markdown-source-view, .markdown-rendered { --line-height-normal: 1.6; }

/* ── paper ── */
.workspace-split.mod-root .view-content,
.workspace-leaf-content.is-read-mode .markdown-preview-view {
  background-image: var(--shelf-paper-tex);
}

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

function barBackground(dir, where) {
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
  return `/* rubric H2, lapis H3, as in a manuscript */
${H2} {
  border-bottom: 1px solid var(--shelf-rule);
  padding-bottom: 0.1em;
}
`;
}

function extraRules(dir) {
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
/* Reading view only: a red drop cap on the note's first paragraph. The pusher check keeps it off whichever
   paragraph happens to come first once Obsidian has unloaded the top of a long note. */
.markdown-preview-pusher[style*="margin-bottom: 0px"] ~ .el-p:not(.el-p ~ .el-p) > p:first-child {
  display: flow-root;
}
.markdown-preview-pusher[style*="margin-bottom: 0px"] ~ .el-p:not(.el-p ~ .el-p) > p:first-child::first-letter {
  float: left;
  font-family: var(--shelf-display);
  font-weight: 400;
  font-size: 3.5em;
  line-height: 0.8;
  padding: 0.08em 0.1em 0 0;
  color: var(--shelf-mark);
}
/* a wax seal under the last line, in both views: below the text, never over it */
.mod-root .workspace-leaf-content[data-type="markdown"] .cm-sizer::after,
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
