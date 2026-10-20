// Vocabulary: pure helpers for saving words from the reader and studying them. No DOM, no storage; unit-tested
// in vocab.test.mjs. The app stores each word as `word:<id>`:
//   { id, term, def, pos, defSource, examples: [Example], added, srs }
//   Example = { text, s, e, bookId, pid, ws, we, title, at }
//     text is the sentence the word was found in, s/e the word's place in it;
//     bookId/pid/ws/we its place in the book (to jump back), title the book's title then.
//   srs = { due, interval, ease, reps, lapses }: the flashcard schedule (see schedule()).

const DAY = 86400000;

// "  “Ephemeral,” " → "Ephemeral": trims spaces and punctuation around the selection.
export function normTerm(s) { return String(s || '').replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''); }
export const termKey = s => normTerm(s).toLowerCase();
// Same word, same id, whichever book it came from (djb2, like the app's hash()).
export function wordId(term) { let h = 5381; const k = termKey(term); for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0; return 'w' + (h >>> 0).toString(36); }

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
