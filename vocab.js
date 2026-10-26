// Vocabulary: pure helpers for saving words from the reader and studying them. No DOM, no storage; unit-tested
// in vocab.test.mjs. The app stores each word as `word:<id>`:
//   { id, term, def, pos, defSource, examples: [Example], added, srs }
//   Example = { text, s, e, bookId, pid, ws, we, title, at }
//     text is the sentence the word was found in, s/e the word's place in it;
//     bookId/pid/ws/we its place in the book (to jump back), title the book's title then.
//   srs = { due, interval, ease, reps, lapses }: the flashcard schedule (see schedule()).
// A fact card, made from a coral highlight, is stored the same way so Study, the Trash, backups and sync treat both alike:
//   { id, kind: 'fact', text, blank: {s, e} | null, note, bookId, hlId, pid, ws, we, title, section, added, srs }
//     text is the highlight's text (its blocks joined with a space), blank the phrase the card hides, as offsets into
//     text (null: a re-read card); hlId the highlight, pid/ws/we its first block's place; title and section the book's then.
// Both may also hold (fact cards only pics and tried), filled by the dictionaries or by hand:
//   pics  [{ src, credit?: {title, url} }]  up to 3 pictures, JPEG data URLs ≤640 px; credit: the Wikipedia page
//   syn, ant  [term]                        synonyms and antonyms
//   dex   [{ text, s, e, cite }]            the dictionary's examples: a sentence, the word's place in it (s = e: not
//                                           found), and "year, author" when known
//   tried { wiki, muse, wikt }              the query each source answered, found or not, so a miss isn't asked again

const DAY = 86400000;
const djb2 = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

// "  “Ephemeral,” " → "Ephemeral": trims spaces and punctuation around the selection.
export function normTerm(s) { return String(s || '').replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); }
export const termKey = s => normTerm(s).toLowerCase();
// Same word, same id, whichever book it came from (djb2, like the app's hash()).
export const wordId = term => 'w' + djb2(termKey(term));

// The sentence around text[s..e), and the word's place in it. A very long sentence is cut to about
// `room` characters on each side of the word, at word boundaries, with "…".
export function sentenceAround(text, s, e, room = 140) {
  text = String(text || ''); s = Math.max(0, Math.min(s, text.length)); e = Math.max(s, Math.min(e, text.length));
  const END = /[.!?…]+["'”’)\]]*\s+/g;
  let a = 0, m;
  while ((m = END.exec(text)) && m.index + m[0].length <= s) a = m.index + m[0].length;
  END.lastIndex = e; m = END.exec(text);
  const b = m ? m.index + m[0].length : text.length;
  const raw = text.slice(a, b), lead = raw.length - raw.trimStart().length;
  let out = raw.trim(), ws = s - a - lead, we = e - a - lead;
  if (ws - room > 0) { const cut = out.indexOf(' ', ws - room); if (cut > 0 && cut < ws) { out = '…' + out.slice(cut + 1); ws -= cut; we -= cut; } }
  if (out.length - we > room) { const cut = out.lastIndexOf(' ', we + room); if (cut > we) out = out.slice(0, cut) + '…'; }
  return { text: out, s: ws, e: we };
}
// The sentence with the word blanked out, for a "which word?" card.
export const cloze = ex => ex.text.slice(0, ex.s) + '_____' + ex.text.slice(ex.e);

/* ---------- fact cards ---------- */
export const isFact = w => !!w && w.kind === 'fact';
// One card per highlight, whenever it's made: 'f' + a hash of the book and highlight ids (word ids start with 'w').
export const factId = (bookId, hlId) => 'f' + djb2(bookId + '|' + hlId);
// The fact's blank when it is a phrase inside its text, else null (a re-read card).
export function factBlank(f) {
  const b = f && f.blank, n = String((f && f.text) || '').length;
  return b && Number.isInteger(b.s) && Number.isInteger(b.e) && b.s >= 0 && b.s < b.e && b.e <= n ? { s: b.s, e: b.e } : null;
}
// The fact's cloze: the text before its blank, the blanked phrase and the text after; null for a re-read card.
export function factCloze(f) { const b = factBlank(f), t = String(f.text || ''); return b ? { before: t.slice(0, b.s), phrase: t.slice(b.s, b.e), after: t.slice(b.e) } : null; }
// The words of a text, for tapping: runs of letters and digits, with ' ’ or - inside a word ("don't", "well-known").
const WORD = /[\p{L}\p{M}\p{N}]+(?:['’-][\p{L}\p{M}\p{N}]+)*/gu;
export const wordsIn = text => [...String(text || '').matchAll(WORD)].map(m => ({ s: m.index, e: m.index + m[0].length }));
// A selection text[s..e) stretched to whole words, without the spaces and punctuation around it. null: no word in it.
export function snapWords(text, s, e) {
  if (!(e > s)) return null;
  const ws = wordsIn(text).filter(w => w.e > s && w.s < e);
  return ws.length ? { s: ws[0].s, e: ws[ws.length - 1].e } : null;
}

/* ---------- flashcards: a small SM-2-style schedule ---------- */
export const newSrs = now => ({ due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 });
export const isDue = (srs, now) => !srs || (srs.due || 0) <= now;
// rating: 'again' (see it again in 10 min), 'good' or 'easy'. Intervals are in days.
export function schedule(srs, rating, now) {
  const c = Object.assign(newSrs(now), srs || {});
  if (rating === 'again') { if (c.reps) c.lapses += 1; c.reps = 0; c.interval = 0; c.ease = Math.max(1.3, c.ease - 0.2); c.due = now + 10 * 60000; return c; }
  const easy = rating === 'easy';
  let iv = c.reps === 0 ? (easy ? 4 : 1) : c.reps === 1 ? (easy ? 6 : 3) : Math.round(c.interval * c.ease * (easy ? 1.3 : 1));
  if (easy) c.ease = Math.min(3, c.ease + 0.15);
  c.reps += 1; c.interval = Math.max(1, iv); c.due = now + c.interval * DAY;
  return c;
}
// "10 min", "1 day", "4 days", "2 mo": what a rating would give, for the buttons.
export function nextLabel(srs, rating, now) {
  const d = schedule(srs, rating, now).due - now;
  if (d < DAY) return Math.round(d / 60000) + ' min';
  const days = Math.round(d / DAY);
  return days < 45 ? `${days} day${days === 1 ? '' : 's'}` : `${Math.round(days / 30)} mo`;
}

/* ---------- progress: the Words tab's panel ---------- */
// Local midnight `days` days after the day of t (negative: before). Set through local fields, so a day with a DST
// change still starts at midnight.
export const dayStart = (t, days = 0) => { const d = new Date(t); d.setHours(24 * days, 0, 0, 0); return d.getTime(); };
export const LEARNED_DAYS = 21;
// The panel's figures over every card, words and fact cards alike (Study takes both). Each card is new (never rated:
// no srs), learning or learned, so those three add up to the total:
//   due       cards rated before whose next review falls before tomorrow's local midnight, overdue ones included.
//             Study shows the ones whose time has come (srs.due ≤ now); the rest come up later today
//   newLeft   new cards Study still takes today: at most `limit` a day, less the `newToday` already rated today
//   learning  rated cards whose interval is under three weeks: seen once or twice, or sent back by Again
//   learned   rated cards whose interval is three weeks or more: the next review is at least 21 days after the last
//   total     every card
export function progress(cards, now, newToday = 0, limit = 20) {
  const end = dayStart(now, 1), f = { due: 0, newLeft: 0, learning: 0, learned: 0, total: 0 };
  let fresh = 0;
  for (const c of cards || []) {
    if (!c) continue;
    f.total++;
    const s = c.srs;
    if (!s) { fresh++; continue; }
    if ((s.due || 0) < end) f.due++;
    if ((s.interval || 0) >= LEARNED_DAYS) f.learned++; else f.learning++;
  }
  f.newLeft = Math.min(fresh, Math.max(0, limit - newToday));
  return f;
}
// Rated cards due on each of the `days` days from today, by local date: today first, with every overdue card in it
// (so it matches progress().due). New cards aren't scheduled yet, so they're in none.
export function dueByDay(cards, now, days = 14) {
  const out = new Array(days).fill(0), ends = out.map((_, i) => dayStart(now, i + 1));
  for (const c of cards || []) {
    const s = c && c.srs; if (!s) continue;
    const i = ends.findIndex(e => (s.due || 0) < e); if (i >= 0) out[i]++;
  }
  return out;
}

/* ---------- dictionaries (free, no key, CORS-enabled) ---------- */
// Datamuse first: plain-text definitions with a part of speech.
export const datamuseUrl = term => `https://api.datamuse.com/words?sp=${encodeURIComponent(termKey(term))}&md=d&max=1`;
const POS = { adj: 'adjective', n: 'noun', v: 'verb', adv: 'adverb', u: '' };
export function parseDatamuse(json) {
  const w = Array.isArray(json) && json[0];
  if (!w || !Array.isArray(w.defs) || !w.defs.length) return null;
  const defs = w.defs.map(d => { const [p, ...rest] = String(d).split('\t'); return { pos: POS[p] ?? p, def: rest.join('\t').trim() }; }).filter(d => d.def);
  return defs.length ? { def: defs[0].def, pos: defs[0].pos, more: defs.slice(1, 3).map(d => d.def), defSource: 'Datamuse' } : null;
}
// Wiktionary as the fallback: its definitions are HTML.
export const wiktionaryUrl = term => `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(termKey(term))}`;
const strip = h => String(h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
export function parseWiktionary(json) {
  const en = json && json.en;
  if (!Array.isArray(en)) return null;
  for (const sense of en) {
    const defs = (sense.definitions || []).map(d => strip(d.definition)).filter(Boolean);
    if (defs.length) return { def: defs[0], pos: String(sense.partOfSpeech || '').toLowerCase(), more: defs.slice(1, 3), defSource: 'Wiktionary' };
  }
  return null;
}
// Simple English base forms to try when the exact form has no entry: "ships" → "ship", "studied" → "study".
export function baseForms(term) {
  const t = termKey(term), out = [];
  const add = w => { if (w && w.length > 2 && w !== t && !out.includes(w)) out.push(w); };
  if (/ies$/.test(t)) add(t.slice(0, -3) + 'y');
  if (/ied$/.test(t)) add(t.slice(0, -3) + 'y');
  if (/es$/.test(t)) add(t.slice(0, -2));
  if (/s$/.test(t) && !/ss$/.test(t)) add(t.slice(0, -1));
  if (/ed$/.test(t)) { add(t.slice(0, -2)); add(t.slice(0, -1)); }
  if (/ing$/.test(t)) { add(t.slice(0, -3)); add(t.slice(0, -3) + 'e'); }
  if (/ly$/.test(t)) add(t.slice(0, -2));
  return out;
}

/* ---------- pictures, synonyms, antonyms and examples (free, no key, CORS-enabled) ---------- */
// Wikipedia's page summary: its thumbnail, only for an article whose title is the word (any case, spaces or
// underscores, or a base form), so "ephemeral" → "Ephemerality" brings no unrelated photo.
export const wikiSummaryUrl = q => `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(normTerm(q).replace(/ /g, '_'))}`;
export function parseWikiSummary(json, q) {
  const th = json && json.thumbnail, k = s => termKey(String(s || '').replace(/_/g, ' '));
  if (!json || json.type !== 'standard' || !th || !/^https:\/\//.test(th.source || '')) return null;
  if (![termKey(q), ...baseForms(q)].includes(k(json.title))) return null;
  const page = json.content_urls && json.content_urls.desktop && json.content_urls.desktop.page;
  return { src: th.source, title: json.title, url: /^https:\/\//.test(page || '') ? page : `https://en.wikipedia.org/wiki/${encodeURIComponent(json.title.replace(/ /g, '_'))}` };
}
// Datamuse synonyms (rel 'syn') and antonyms ('ant'): up to 6 words, not the word itself.
export const datamuseRelUrl = (term, rel) => `https://api.datamuse.com/words?rel_${rel}=${encodeURIComponent(termKey(term))}&max=6`;
export function parseDatamuseWords(json, term) {
  const k = termKey(term), out = [];
  (Array.isArray(json) ? json : []).forEach(x => { const w = normTerm(x && x.word); if (w && w.toLowerCase() !== k && !out.includes(w) && out.length < 6) out.push(w); });
  return out;
}
// Wiktionary's wikitext: its definitions API no longer carries examples.
export const wikitextUrl = term => `https://en.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(termKey(term))}&prop=wikitext&format=json&formatversion=2&origin=*`;

// s split at `sep` outside {{templates}} and [[links]].
function splitTop(s, sep = '|') {
  const out = []; let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === '{{' || two === '[[') { d++; cur += two; i++; continue; }
    if ((two === '}}' || two === ']]') && d) { d--; cur += two; i++; continue; }
    if (s[i] === sep && !d) { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}
// The templates at the top level of s: [{ name, args (positional), named }]. Nested ones stay inside their arguments.
function templates(s) {
  const out = []; let i = 0;
  while ((i = s.indexOf('{{', i)) >= 0) {
    let d = 0, j = i;
    for (; j < s.length; j++) {
      if (s.startsWith('{{', j)) { d++; j++; } else if (s.startsWith('}}', j)) { d--; j++; if (!d) break; }
    }
    if (d) break;
    const [name, ...parts] = splitTop(s.slice(i + 2, j - 1)), t = { name: name.trim().toLowerCase(), args: [], named: {} };
    parts.forEach(p => { const m = /^\s*([\w-]+)\s*=([\s\S]*)$/.exec(p); if (m) t.named[m[1]] = m[2].trim(); else t.args.push(p.trim()); });
    out.push(t); i = j + 1;
  }
  return out;
}
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", mdash: '—', ndash: '–', hellip: '…' };
// Wiki markup to plain text: links and {{w|…}} keep their text, {{...}} is "…", other templates, refs and comments
// go, bold and italic quotes go. The \u0001 and \u0002 marks (the headword, see wikiExample) are kept.
export function stripWiki(s) {
  s = String(s || '').replace(/<ref[^>]*\/>|<ref[\s\S]*?<\/ref>|<!--[\s\S]*?-->/g, '')
    .replace(/\[\[([^\[\]]*)\]\]/g, (_, l) => { const p = l.split('|'); return /^(file|image|category):/i.test(l) ? '' : p.length > 1 ? p.pop() : p[0].replace(/#.*$/, ''); });
  for (let k = 0; k < 20 && /\{\{[^{}]*\}\}/.test(s); k++) s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
    const [n, ...ps] = inner.split('|'), name = n.trim().toLowerCase(), pos = ps.filter(p => !/^\s*[\w-]+\s*=/.test(p));
    if (name === '...' || name === '…') return '…';
    if (name === 'w') return pos[1] || pos[0] || '';
    if (['l', 'm', 'l-self', 'll', 'mention', 'link'].includes(name)) return pos[2] || pos[1] || '';
    return '';
  });
  return s.replace(/'{2,}/g, '').replace(/<[^>]+>/g, '').replace(/&(nbsp|amp|lt|gt|quot|#39|mdash|ndash|hellip);/g, (_, e) => ENT[e])
    .replace(/\[(?:https?:)?\/\/\S+\s([^\]]*)\]/g, '$1').replace(/\s+/g, ' ').trim();
}
// The place of the word in a sentence: the word itself or a base form, as a whole word; else a word that starts with
// it or its stem ("study" → "studied"). null: not there.
export function findWord(text, term) {
  const t = String(text || ''), low = t.toLowerCase(), k = termKey(term);
  if (!k) return null;
  const forms = [k, ...baseForms(k)], L = /[\p{L}\p{M}\p{N}]/u;
  const at = (f, whole) => {
    for (let i = low.indexOf(f); i >= 0; i = low.indexOf(f, i + 1)) {
      if (i > 0 && L.test(t[i - 1])) continue;
      let e = i + f.length;
      if (whole) { if (e < t.length && L.test(t[e])) continue; } else while (e < t.length && L.test(t[e])) e++;
      return { s: i, e };
    }
    return null;
  };
  for (const f of forms) { const r = at(f, true); if (r) return r; }
  for (const f of [k, ...(k.length > 3 && /[ey]$/.test(k) ? [k.slice(0, -1)] : [])]) { const r = at(f, false); if (r) return r; }
  return null;
}
// An example from wikitext: plain text cut to the sentence holding the word (bold in Wiktionary, else found), with
// the word's place. null when the word isn't in it or the sentence is still very long.
const LONG_EXAMPLE = 250;
function wikiExample(raw, term, cite) {
  let t = stripWiki(String(raw || '').replace(/'''(.+?)'''/, '\u0001$1\u0002'));
  let s = t.indexOf('\u0001'), e = t.indexOf('\u0002');
  t = t.replace(/[\u0001\u0002]/g, '');
  if (s >= 0 && e > s) e -= 1; else { const f = findWord(t, term); if (!f) return null; ({ s, e } = f); }
  const x = sentenceAround(t, s, e, Infinity);
  return x.text.length > LONG_EXAMPLE || x.e <= x.s ? null : { text: x.text, s: x.s, e: x.e, cite };
}
// "1853, Mary Shelley" from a quotation's citation line: a quote template's year (or date) and author, or the plain
// form '''1821-1822''', {{w|Vicesimus Knox}}, ''Title'', …
function citeOf(line) {
  const year = s => ((String(s || '').match(/\d{4}/) || [])[0] || '');
  const q = templates(line).find(t => /^quote-/.test(t.name));
  if (q) {
    const n = q.named, a = stripWiki(n.author || n.authors || [n.first, n.last].filter(Boolean).join(' '));
    return [year(n.year || n.date), a.length <= 60 ? a : ''].filter(Boolean).join(', ');
  }
  const m = /^#+\*\s*'''([^']+)'''\s*,?([\s\S]*)$/.exec(line);
  if (!m) return '';
  const first = splitTop(m[2], ',')[0].trim(), a = /^(''|")/.test(first) ? '' : stripWiki(first);
  return [year(m[1]), a.length <= 60 && /\p{L}/u.test(a) ? a : ''].filter(Boolean).join(', ');
}
const NYMS = { syn: 'syn', synonyms: 'syn', ant: 'ant', antonyms: 'ant' };
const UX = ['ux', 'usex', 'uxi'];
const NOT_EXAMPLE = /^(syn|synonyms|ant|antonyms|hyper|hypernyms|hypo|hyponyms|cot|coordinate terms|holo|holonyms|mero|meronyms|tropo|troponyms|alti|alt|altform|der|rel|also|desc|q|qual|i|gloss|senseid)$/;
// A nym line's terms: "transient", without inline qualifiers (<qq:…>), "#Noun", thesaurus links or ";" separators.
const nymTerms = t => t.args.slice(1).filter(a => !/^thesaurus:/i.test(a.trim())).map(a => stripWiki(a.replace(/<[^>]*>/g, '').replace(/#.*$/, ''))).filter(a => a && a !== ';');
// From a Wiktionary page (the parse API's JSON, formatversion 2): the first English sense's synonyms and antonyms, and
// up to 2 examples, first sense first: its usage examples, then its quotations. null: no English entry.
export function parseWikitext(json, term) {
  const p = json && json.parse, wt = p && (typeof p.wikitext === 'string' ? p.wikitext : p.wikitext && p.wikitext['*']);
  if (typeof wt !== 'string') return null;
  const en = /^==\s*English\s*==\s*$/m.exec(wt);
  if (!en) return null;
  let body = wt.slice(en.index + en[0].length);
  const next = /^==[^=].*==\s*$/m.exec(body);
  if (next) body = body.slice(0, next.index);
  // lines, with a template that runs over several lines joined into one
  const lines = [];
  body.split('\n').forEach(l => {
    const open = s => (s.match(/\{\{/g) || []).length - (s.match(/\}\}/g) || []).length;
    if (lines.length && open(lines[lines.length - 1]) > 0) lines[lines.length - 1] += ' ' + l; else lines.push(l);
  });
  const senses = []; let sense = null, quote = null;
  for (const l of lines) {
    const m = /^(#+)([:*]*)\s*([\s\S]*)$/.exec(l);
    if (!m) { if (/^=/.test(l)) sense = quote = null; continue; }
    const kind = m[2], text = m[3];
    if (!kind) { sense = { ux: [], quotes: [], syn: [], ant: [] }; senses.push(sense); quote = null; continue; }
    if (!sense) continue;
    if (kind === ':') {
      const ts = templates(text), ux = ts.find(t => UX.includes(t.name));
      ts.forEach(t => { const k = NYMS[t.name]; if (k) sense[k].push(...nymTerms(t)); });
      if (ux) sense.ux.push(ux.args[1] || '');
      else if (!ts.some(t => NOT_EXAMPLE.test(t.name)) && stripWiki(text)) sense.ux.push(text);
    } else if (kind === '*') {
      const q = templates(text).find(t => /^(quote-|rq:)/.test(t.name)), passage = q && (q.named.passage || q.named.text);
      quote = { cite: citeOf(m[1] + kind + ' ' + text), text: passage || '', done: !!passage };
      sense.quotes.push(quote);
    } else if (kind === '*:' && quote && !quote.done) quote.text += (quote.text ? ' ' : '') + text;
  }
  const first = senses[0] || { syn: [], ant: [] }, dex = [];
  for (const s of senses) {
    for (const [raw, cite] of [...s.ux.map(u => [u, '']), ...s.quotes.map(q => [q.text, q.cite])]) {
      const x = dex.length < 2 && raw && wikiExample(raw, term, cite);
      if (x && !dex.some(y => y.text === x.text)) dex.push(x);
    }
    if (dex.length >= 2) break;
  }
  const six = l => [...new Set(l)].filter(w => w.toLowerCase() !== termKey(term)).slice(0, 6);
  return { syn: six(first.syn), ant: six(first.ant), dex };
}

/* ---------- editing them as text ---------- */
// A meaning as the card shows it (white-space: pre-line): line breaks kept, spaces collapsed, ends trimmed, at most
// one empty line in a row.
export const cleanText = s => String(s || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/[ \t\f\v ]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
// "transient, transitory" (or one per line) → ['transient', 'transitory'], without repeats.
export function parseList(s) {
  const seen = new Set();
  return String(s || '').split(/[,;\n]+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(x => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
}
// An example as one line of text: "sentence — 1853, Mary Shelley".
export const exampleLine = x => x.text + (x.cite ? ' — ' + x.cite : '');
// Examples edited as text, one per line. A line unchanged keeps its example; a line ending in an example's " — cite"
// keeps that cite; the word's place is found again.
export function parseExamples(s, old, term) {
  old = old || [];
  return String(s || '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).map(l => {
    const same = old.find(x => exampleLine(x) === l);
    if (same) return same;
    const o = old.find(x => x.cite && l.endsWith(' — ' + x.cite)), text = o ? l.slice(0, l.length - o.cite.length - 3).trim() : l, f = findWord(text, term) || { s: 0, e: 0 };
    return { text, s: f.s, e: f.e, cite: o ? o.cite : '' };
  });
}
// For a word or fact card already here: the pictures, synonyms, antonyms and examples it lacks, from another copy (a
// backup, the Trash), and the lookups either one tried. → the merged entry, or null when there's nothing to add.
export function mergeExtras(have, from) {
  const add = ['pics', 'syn', 'ant', 'dex'].filter(k => !(Array.isArray(have[k]) && have[k].length) && from && Array.isArray(from[k]) && from[k].length);
  if (!add.length) return null;
  const out = { ...have };
  add.forEach(k => { out[k] = from[k]; });
  if (have.tried || from.tried) out.tried = { ...(from.tried || {}), ...(have.tried || {}) };
  return out;
}
