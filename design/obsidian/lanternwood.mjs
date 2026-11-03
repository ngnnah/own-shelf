// The Lanternwood looks: three Obsidian CSS snippets derived from Lanternwood (David Hurtado, MIT), built from
// its vendored theme.css (lanternwood/, read as data, never run) plus our overrides. An upstream update is a
// file swap and a rebuild; the build stops on anything it would otherwise have to guess.
// Per variant: upstream's header, OFL notices and @font-face blocks; its Style Settings block dropped and each class
// option baked on or off (what Style Settings would toggle); its whole-workspace forest backdrop (every rule gated
// on lw-forest) dropped, keeping the variant's day/night image pair as custom properties; then our palette (every
// text tier pushed to >= 4.5:1 on the surfaces it sits on) and our band CSS. Last, the embedded fonts the finished
// CSS never reaches go, with their notices.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lanternwood');
// line endings normalised, so an upstream saved with CRLF builds the same
const read = f => fs.readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n?/g, '\n');
const fail = msg => { throw new Error(`lanternwood: ${msg}`); };

// ── colour helpers (WCAG 2) ──
const rgb = h => { h = h.replace(/^#+/, ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
// WHY: halves round to even, as in the Python build the palette was tuned with; Math.round would move some colours a step.
const roundEven = v => { const r = Math.round(v); return r - v === 0.5 && r % 2 ? r - 1 : r; };
const hexc = c => '#' + c.map(v => Math.max(0, Math.min(255, roundEven(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hexc(A.map((v, i) => v + (B[i] - v) * t)); };
const lum = h => {
  const [r, g, b] = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
const worst = (fg, bgs) => Math.min(...bgs.map(b => contrast(fg, b)));
const toward = (c, bgs, target, d) => { for (let i = 0; worst(c, bgs) < target && i < 100; i++) c = mix(c, d, 0.03); return c; };

// ── variants ──
// sky: the page, matched to the art's own sky where the band's top edge fades into it (sampled from the art).
// lake: the calm strip at the foot of the band, under the status bar and the phone's icons.
const DETAILED_DAY = { sky: '#d3e0cf', lake: '#2f6a6e', lift: 'none' };
const DETAILED_NIGHT = { sky: '#1f374a', lake: '#10262f', lift: 'brightness(1.12) saturate(1.05)' };
const VARIANTS = {
  'lanternwood-still': {
    title: 'Still', art: 'detailed', type: 'device', day: DETAILED_DAY, night: DETAILED_NIGHT,
    blurb: 'Detailed art; no pixel type anywhere: headings, text and interface in device fonts. The scene is the only pixel art.',
  },
  'lanternwood-lake': {
    title: 'Lake', art: 'detailed', type: 'pixel-headings', day: DETAILED_DAY, night: DETAILED_NIGHT,
    blurb: 'Detailed art; pixel type (Departure Mono) for headings only; device fonts for text and interface.',
  },
  'lanternwood-classic': {
    title: 'Classic', art: 'classic', type: 'pixel-headings',
    day: { sky: '#a2d6df', lake: '#2f7686', lift: 'none' }, night: { sky: '#223f4f', lake: '#112833', lift: 'brightness(1.08)' },
    blurb: 'Classic (chunkier, brighter) art; pixel type for headings only; device fonts for text and interface.',
  },
};
// Style Settings class options baked on per variant (every other lw-* option class is baked off).
const BAKE_ON = { detailed: ['lw-art-detailed'], classic: ['lw-art-classic'] };
const COMMON_ON = ['lw-font-departure', 'lw-plain-navigation', 'lw-native-icons'];
const TYPE_ON = { 'pixel-headings': [], device: ['lw-system-fonts', 'lw-plain-headings'] };
// Style Settings ids that are headings, selects and variable sliders: not classes
const NOT_CLASSES = ['lw-landscape', 'lw-type', 'lw-art-style', 'lw-font', 'lw-forest-height', 'lw-forest-opacity', 'lw-forest-brightness', 'lw-readable-width'];
const REPLACED = 'lw-forest'; // the backdrop: every rule gated on it is replaced by our band
// the comment that opens upstream's own CSS; everything above it is the header, OFL notices and @font-face
const SOURCE_HEADER = '/* Lanternwood — original theme by David Hurtado, MIT.';
// upstream's own text colours, the starting point for each tier
const TIERS = ['text-normal', 'text-muted', 'text-faint', 'text-accent', 'link-color', 'link-external-color', 'link-unresolved-color',
  'h1-color', 'h2-color', 'h3-color', 'h4-color', 'h5-color', 'h6-color', 'inline-title-color', 'bold-color',
  'italic-color', 'code-normal', 'blockquote-color', 'lw-gold', 'lw-sage', 'nav-item-color', 'tag-color',
  'color-red', 'color-orange', 'color-yellow', 'color-green', 'color-cyan', 'color-blue', 'color-purple', 'color-pink'];

// ── the top level as tokens: whitespace, comments, at-rules with blocks, rules (each block with its raw text) ──
const find = (s, q, from) => { const j = s.indexOf(q, from); if (j < 0) fail(`no ${q} after offset ${from} in a CSS block`); return j; };
function blocks(s) {
  const out = [], n = s.length; let i = 0;
  while (i < n) {
    if (/\s/.test(s[i])) { let j = i; while (j < n && /\s/.test(s[j])) j++; out.push(['ws', s.slice(i, j)]); i = j; }
    else if (s.startsWith('/*', i)) { const j = find(s, '*/', i) + 2; out.push(['comment', s.slice(i, j)]); i = j; }
    else {
      const j = find(s, '{', i); let depth = 1, k = j + 1;
      while (depth) {
        if (k >= n) fail(`unbalanced braces from offset ${i}`);
        if (s.startsWith('/*', k)) { k = find(s, '*/', k) + 2; continue; }
        if (s[k] === '"' || s[k] === "'") { k = find(s, s[k], k + 1) + 1; continue; }
        depth += s[k] === '{' ? 1 : s[k] === '}' ? -1 : 0; k++;
      }
      const head = s.slice(i, j).trim();
      out.push([head.startsWith('@') ? 'at' : 'rule', head, s.slice(j + 1, k - 1), s.slice(i, k)]); i = k;
    }
  }
  return out;
}

function splitSel(sel) {
  const parts = []; let depth = 0, cur = '';
  for (const ch of sel) {
    depth += ch === '(' ? 1 : ch === ')' ? -1 : 0;
    if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; } else cur += ch;
  }
  parts.push(cur.trim()); return parts.filter(Boolean);
}

function bakeSelector(s, on, options) {
  if (new RegExp(`\\.${REPLACED}(?![\\w-])`).test(s)) return null;
  for (const [, cls] of s.matchAll(/\.(lw-[\w-]+)/g))
    if (!options.has(cls)) fail(`unknown upstream option class .${cls} in: ${s}  (new upstream option? decide its default)`);
  // :where(:not(.x)) and :not(.x): an option baked on makes the selector unmatchable; baked off, the test goes
  const neg = (_, cls) => on.has(cls) ? '\0DROP' : '\0CLS';
  s = s.replace(/:where\(:not\(\.(lw-[\w-]+)\)\)/g, neg).replace(/:not\(\.(lw-[\w-]+)\)/g, neg);
  // .x: baked on, the test goes; baked off, the selector is unmatchable
  s = s.replace(/\.(lw-[\w-]+)(?![\w-])/g, (_, cls) => on.has(cls) ? '\0CLS' : '\0DROP');
  if (s.includes('\0DROP')) return null;
  // a removed test that was a whole compound (".lw-plain-headings { … }") stood for the body, which carries the class
  let out = '';
  s.split('\0CLS').forEach((part, i) => {
    const prev = out.slice(-1), nxt = part.slice(0, 1);
    if (i && (prev === '' || /\s/.test(prev) || '>+~'.includes(prev)) && (nxt === '' || /\s/.test(nxt) || '>+~,'.includes(nxt))) out += 'body';
    out += part;
  });
  return out.replace(/\s+/g, ' ').trim();
}

function bake(items, on, options, scenes) {
  const out = []; let pending = null; // index in out of a comment whose first rule is still to come
  const first = kept => { if (pending !== null && !kept) out[pending] = ''; pending = null; }; // a comment that heads a dropped rule goes with it
  for (const [kind, head, body] of items) {
    if (kind === 'ws' || kind === 'comment') {
      if (kind === 'comment' && head.includes('@settings')) continue;
      if (kind === 'comment') pending = out.length;
      out.push(head); continue;
    }
    if (kind === 'at') {
      if (head.startsWith('@font-face')) { out.push(`${head} {${body}}`); continue; }
      const inner = bake(blocks(body), on, options, scenes).trim(), kept = inner.includes('{');
      first(kept);
      if (kept) out.push(`${head} {\n  ${inner}\n}`);
      continue;
    }
    const img = body.match(/url\("(data:image\/webp;base64,[^"]+)"\)/);
    if (img) {
      scenes[`${head.includes('lw-art-detailed') ? 'detailed' : 'classic'}/${head.includes('theme-dark') ? 'dark' : 'light'}`] = img[1];
      first(false); continue;
    }
    const sels = splitSel(head).map(s => bakeSelector(s, on, options)).filter(Boolean);
    first(sels.length > 0);
    if (sels.length) out.push(sels.join(',\n') + ' {' + body + '}');
  }
  return out.join('').replace(/\n\s*\n(\s*\n)+/g, '\n\n');
}

// ── embedded fonts: a variant keeps the ones its finished CSS reaches ──
function declarations(body) {
  const out = []; let depth = 0, start = 0, cur = '';
  const take = d => {
    const m = d.match(/^\s*(--[\w-]+|[a-zA-Z-]+)\s*:([\s\S]*)$/), imp = /!\s*important\s*$/i;
    if (m) out.push({ prop: m[1].startsWith('--') ? m[1] : m[1].toLowerCase(), value: m[2].replace(imp, '').trim(), important: imp.test(m[2]) });
  };
  for (let k = 0; k < body.length; k++) {
    const ch = body[k];
    if (body.startsWith('/*', k)) { cur += body.slice(start, k); k = find(body, '*/', k + 2) + 1; start = k + 1; }
    else if (ch === '"' || ch === "'") k = find(body, ch, k + 1);
    else if (ch === '{') fail('a nested rule: the font check reads flat rules only');
    else if (ch === '(' || ch === ')') depth += ch === '(' ? 1 : -1;
    else if (ch === ';' && !depth) { take(cur + body.slice(start, k)); cur = ''; start = k + 1; }
  }
  take(cur + body.slice(start));
  return out;
}

// The families the CSS reaches. A declaration is live unless a later one of the same property, under the same
// selector in the same at-rule, overrides it. From every live font-family and font, and every live custom property
// outside the --lw-/--lwf- names (Obsidian reads --font-*, --h1-font and the like), var() is followed through
// each live declaration of the property it names.
function reachedFamilies(css, families) {
  const last = new Map();
  const walk = (items, ctx) => {
    for (const [kind, head, body] of items) {
      if (kind === 'at' && !head.startsWith('@font-face')) walk(blocks(body), `${ctx}${head}\n`);
      if (kind !== 'rule') continue;
      for (const d of declarations(body)) for (const sel of splitSel(head)) {
        const k = `${ctx}${sel.replace(/\s+/g, ' ')}\n${d.prop}`, prev = last.get(k);
        if (!prev || d.important || !prev.important) last.set(k, d);
      }
    }
  };
  walk(blocks(css), '');
  const live = [...new Set(last.values())], defs = {}, seen = new Set();
  for (const d of live) if (d.prop.startsWith('--')) (defs[d.prop] ||= []).push(d.value);
  const queue = live.filter(d => d.prop === 'font-family' || d.prop === 'font' || (d.prop.startsWith('--') && !/^--lwf?-/.test(d.prop))).map(d => d.value);
  let reached = '';
  while (queue.length) {
    const v = queue.pop(); reached += v + '\n';
    for (const [, name] of v.matchAll(/var\(\s*(--[\w-]+)/g)) if (!seen.has(name)) { seen.add(name); queue.push(...(defs[name] || [])); }
  }
  const flat = reached.replace(/["']/g, '').replace(/\s+/g, ' ').toLowerCase();
  return families.filter(f => new RegExp(`(^|[^\\w-])${f.toLowerCase().replace(/\s+/g, ' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(flat));
}

// Upstream's preamble with only the fonts the CSS reaches: an OFL notice goes when every @font-face under it does.
function trimFonts(pre, css) {
  const pieces = [];
  for (const [kind, head, body, raw] of blocks(pre)) {
    if (kind === 'ws') { if (pieces.length) pieces.at(-1).text += head; else pieces.push({ text: head }); continue; }
    if (kind === 'comment') { pieces.push({ text: head, faces: [] }); continue; }
    const family = head === '@font-face' && body.match(/font-family:\s*(["']?)([^"';]+)\1\s*;/)?.[2];
    if (!family) fail(`the font preamble holds more than notices and @font-face blocks: ${head}`);
    const notice = pieces.findLast(p => p.faces);
    if (!notice) fail(`no licence notice above the @font-face for ${family}`);
    notice.faces.push(family); pieces.push({ text: raw, family });
  }
  const families = [...new Set(pieces.filter(p => p.family).map(p => p.family))];
  const kept = reachedFamilies(css, families), dropped = families.filter(f => !kept.includes(f));
  const out = pieces.filter(p => p.family ? kept.includes(p.family) : !p.faces?.length || p.faces.some(f => kept.includes(f))).map(p => p.text).join('');
  // WHY: upstream's later notices point to the full OFL text "above", which only the first carries
  if (kept.length && !out.includes('PERMISSION & CONDITIONS')) fail('a kept font\'s OFL notice points to the full licence text, which went with an unused font');
  return { pre: out, kept, dropped };
}

// Our colours for one mode: the page is the art's sky; every text tier is pushed to >= 4.6:1 on its surfaces.
function palette(t, day, up) {
  const { sky } = t, ink = day ? '#23372f' : '#ecebdf', W = '#ffffff', K = '#000000';
  const far = day ? '#0b1a14' : '#fffaf0'; // where coloured text is pushed when it is too faint
  const tint = (dc, dt, nc, nt) => day ? mix(sky, dc, dt) : mix(sky, nc, nt); // the sky toward one colour by day, another by night
  const p = {};
  p['background-primary'] = sky;
  p['background-primary-alt'] = tint(W, 0.38, W, 0.05);
  p['background-secondary'] = tint(ink, 0.025, K, 0.2);
  p['background-secondary-alt'] = tint(ink, 0.05, K, 0.28);
  p['lw-panel'] = tint(W, 0.22, W, 0.07);
  p['code-background'] = tint(W, 0.5, K, 0.3);
  p['background-modifier-form-field'] = tint(W, 0.6, K, 0.3);
  p['tab-background-active'] = sky;
  p['titlebar-background'] = p['background-secondary-alt']; p['titlebar-background-focused'] = p['background-secondary'];
  p['nav-item-background-active'] = tint(W, 0.4, W, 0.08);
  p['tag-background'] = tint(W, 0.4, W, 0.08);
  p['lw-shadow'] = tint(ink, 0.18, K, 0.45);
  p['lw-edge'] = tint(ink, 0.3, W, 0.18);
  p['background-modifier-border'] = tint(ink, 0.2, W, 0.14);
  p['canvas-background'] = sky;
  p['lwf-panel'] = tint(W, 0.65, W, 0.06); // callouts: a pale panel, tinted below; day lifts enough to show without a frame
  p['link-unresolved-opacity'] = '1'; // Obsidian fades unresolved links to 70%, below 4.5:1
  const hl = '#e9b96e', hlAlpha = day ? 0.55 : 0.25;
  p['text-highlight-bg'] = hl + roundEven(hlAlpha * 255).toString(16).padStart(2, '0');
  const page = [sky, p['background-primary-alt']];
  // callout panels: the callout colour at 7% over the pale panel, as shared.css draws them
  const panels = ['color-blue', 'color-orange', 'color-purple', 'color-green', 'color-red', 'color-cyan'].map(c => mix(p['lwf-panel'], up[c], 0.07));
  const sidebar = [p['background-secondary'], p['background-secondary-alt'], p['nav-item-background-active']];
  const surfaces = { // every surface each tier is drawn on
    'text-normal': [...page, ...panels, p['code-background'], p['lw-panel'], mix(sky, hl, hlAlpha), ...sidebar],
    'text-muted': [...page, ...panels, ...sidebar], 'text-faint': [...page, ...panels, ...sidebar, p['code-background']],
    'nav-item-color': sidebar, 'lw-sage': [p['lw-panel'], ...sidebar], 'tag-color': [p['tag-background']],
    'code-normal': [p['code-background']], 'blockquote-color': [p['background-primary-alt']],
  };
  // targets: body text 7:1 on the page; muted a step above faint so the two tiers stay apart; everything else 4.6
  const targets = { 'text-normal': 7, 'text-muted': 5.4 };
  for (const k of TIERS) {
    let c = toward(up[k], surfaces[k] || [...page, ...panels, ...(k.startsWith('color-') ? [p['code-background']] : [])], 4.6, far);
    if (targets[k]) c = toward(c, page, targets[k], far);
    p[k] = c;
  }
  // muted stays a clear step above faint on the page, whichever way the surfaces pushed faint
  p['text-muted'] = toward(p['text-muted'], page, Math.max(5.4, worst(p['text-faint'], page) * 1.2), far);
  p['nav-item-color-active'] = p['inline-title-color']; p['nav-item-color-selected'] = p['inline-title-color'];
  p['nav-item-color-hover'] = p['text-normal']; p['tab-text-color'] = p['nav-item-color'];
  for (const k of ['tab-text-color-active', 'tab-text-color-focused-active', 'tab-text-color-focused-active-current', 'titlebar-text-color-focused'])
    p[k] = p['inline-title-color'];
  p['nav-collapse-icon-color'] = p['text-faint'];
  p['text-accent-hover'] = mix(p['text-accent'], far, 0.3); p['link-color-hover'] = p['text-accent-hover'];
  p['interactive-accent'] = p['lw-gold']; p['color-accent'] = p['lw-gold'];
  p['background-modifier-border-focus'] = p['lw-gold']; p['divider-color-hover'] = p['lw-gold'];
  // Obsidian's prism token colours, held on the code background
  for (const [k, src] of Object.entries({ 'code-comment': 'text-faint', 'code-function': 'color-yellow', 'code-keyword': 'color-pink',
    'code-string': 'color-green', 'code-property': 'color-cyan', 'code-tag': 'color-red', 'code-value': 'color-purple',
    'code-operator': 'color-red', 'code-punctuation': 'text-muted', 'code-important': 'color-orange' }))
    p[k] = toward(p[src], [p['code-background']], 4.6, far);
  // the lake strip: the art's deep water at its foot, darkened until its light ink reads
  const navInk = '#f1efe3';
  p['lwf-lake'] = toward(t.lake, [navInk], 4.8, K); p['lwf-lake-ink'] = navInk;
  p['lwf-scene-lift'] = t.lift;
  // the neutral ramp's first steps follow the sky (menus, modals, settings use them)
  p['color-base-00'] = sky; p['color-base-05'] = p['background-primary-alt'];
  p['color-base-10'] = p['background-secondary']; p['color-base-20'] = p['background-secondary-alt'];
  return p;
}

function upstream() {
  const css = read('theme.css');
  const version = css.match(/^\/\* Lanternwood (\S+) \| David Hurtado \| MIT/)?.[1];
  if (!version) fail('upstream header not found: is lanternwood/theme.css Lanternwood?');
  const settings = css.match(/\/\*\s*@settings([\s\S]*?)\*\//);
  if (!settings) fail('Style Settings block not found');
  const options = new Set([...settings[1].matchAll(/(?:id|value):\s*(lw-[\w-]+)/g)].map(m => m[1]));
  for (const id of NOT_CLASSES) options.delete(id);
  const colours = {};
  for (const [mode, cls] of [['day', 'theme-light'], ['night', 'theme-dark']]) {
    const blk = css.match(new RegExp(`\\n\\.${cls} \\{([\\s\\S]*?)\\n\\}`));
    if (!blk) fail(`upstream .${cls} block not found`);
    const vals = Object.fromEntries([...blk[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map(m => [m[1], m[2]]));
    const missing = TIERS.filter(k => vals[k] === undefined);
    if (missing.length) fail(`upstream .${cls} lacks ${missing.join(', ')}`);
    colours[mode] = vals;
  }
  const cut = css.indexOf(SOURCE_HEADER);
  if (cut < 0) fail(`upstream's source header ("${SOURCE_HEADER}") moved: the font preamble can't be found`);
  return { version, options, colours, pre: css.slice(0, cut), main: blocks(css.slice(cut)), lic: read('LICENSE.txt').trim(), shared: read('overrides/shared.css') };
}

function snippet(key, U) {
  const V = VARIANTS[key], on = new Set([...COMMON_ON, ...BAKE_ON[V.art], ...TYPE_ON[V.type]]), scenes = {};
  const body = bake(U.main, on, U.options, scenes);
  if (Object.keys(scenes).length !== 4) fail(`expected 4 scene images, found ${Object.keys(scenes).sort().join(', ') || 'none'}`);
  const modeBlock = mode => {
    const p = palette(V[mode], mode === 'day', U.colours[mode]);
    return `${mode === 'day' ? 'body.theme-light' : 'body.theme-dark'} {\n${Object.entries(p).map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n}\n`;
  };
  const sceneCss = `body.theme-light { --lwf-scene: url("${scenes[`${V.art}/light`]}"); }\nbody.theme-dark { --lwf-scene: url("${scenes[`${V.art}/dark`]}"); }\n`;
  const rest = body.trim() + "\n\n/* ── fork: palette (generated by lanternwood.mjs; the page is the art's sky) ── */\n" +
    modeBlock('day') + modeBlock('night') + '\n/* ── fork: the scenes ── */\n' + sceneCss + '\n' + U.shared + '\n' + read(`overrides/type-${V.type}.css`);
  const fonts = trimFonts(U.pre, rest);
  const header = `/* shelf-${key}.css: own-shelf's Lanternwood look, variant "${V.title}" (own-shelf/design/obsidian/lanternwood.mjs)
 * Derived from Lanternwood ${U.version} by David Hurtado, MIT, https://github.com/davidhurtadoai/lanternwood
 * Use as a theme (.obsidian/themes/<name>/theme.css) or as a CSS snippet with the default theme. No plugin needed.
 *
 * ${V.blurb}
 * What we changed from upstream ${U.version}:
 *  - The forest is on without Style Settings: its settings block is removed and each option is fixed
 *    (landscape: ${V.art}; native icons; regular interface font${V.type === 'device' ? '; reading font for headings' : ''}).
 *  - The scene is a band at the foot of the note pane, and the note's view stops above it, so no text is ever drawn
 *    on the art. On a phone the band is the navigation bar; with Obsidian's floating navigation the band stays in
 *    the pane and the floating bar sits on its lake. Upstream's whole-workspace backdrop is removed.
 *  - The page is the art's own sky colour, so the band's top edge melts into the page.
 *  - The crop keeps the centre (mountain, bridge, lake); on narrow panes and phones the cottages fall away first.
 *  - Night: a moonlit-blue page instead of near-black, and the scene lifted slightly.
 *  - Every text tier is at least 4.5:1 on the surfaces it sits on, day and night.
 *  - Quieter chrome: no pixel type in tabs, lists, properties or the status bar; thin 1px edges; no hard drop
 *    shadows on code blocks, buttons or header icons; smaller pixel headings at Departure Mono's 11 px steps;
 *    callouts are flat pale panels without the cut-corner frame.
 * Unused upstream art (the other landscape style) is not included.
 * Embedded fonts kept with their OFL notices: ${fonts.kept.join(', ') || 'none'}.
 * Dropped with theirs, as this variant never uses them: ${fonts.dropped.join(', ') || 'none'}.
 */

/* Lanternwood licence (MIT), kept as required:

${U.lic}
*/

`;
  return header + fonts.pre + rest;
}

// [{ key, file, css }] for Still, Lake and Classic.
export function lanternwoodSnippets() {
  const U = upstream();
  return Object.keys(VARIANTS).map(key => ({ key, file: `shelf-${key}.css`, css: snippet(key, U) }));
}
