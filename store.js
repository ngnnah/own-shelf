// Storage adapters. Both expose the same small key/value API the app uses:
//   get(key), put(key, value), del(key), all(prefix), watchMeta(cb, onErr), flush()
// watchMeta calls cb(list) at least once with the current shelf, then again on remote changes.
// Keys: "meta:<id>" (shelf entry), "doc:<id>" (book content), "state:<id>" (highlights,
// position), "settings:app".

/* ---------------- this device only (IndexedDB) ---------------- */
export function makeLocal({ onError = () => {} } = {}) {
  let db = null;
  const mem = new Map();
  const tx = mode => db.transaction('kv', mode).objectStore('kv');
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const api = {
    kind: 'local',
    async open() {
      try {
        db = await new Promise((res, rej) => {
          const r = indexedDB.open('upwind', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('kv');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
      } catch (e) { db = null; }
    },
    async get(k) { if (!db) return mem.get(k); try { return await req(tx('readonly').get(k)); } catch (e) { return mem.get(k); } },
    async put(k, v) { mem.set(k, v); if (!db) return; try { await req(tx('readwrite').put(v, k)); } catch (e) { onError(e); } },
    async del(k) { mem.delete(k); if (!db) return; try { await req(tx('readwrite').delete(k)); } catch (e) {} },
    async all(prefix) {
      if (!db) return [...mem].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
      try { return await req(tx('readonly').getAll(IDBKeyRange.bound(prefix, prefix + '￿'))); } catch (e) { return []; }
    },
    watchMeta(cb) { api.all('meta:').then(list => cb(list, false)); return () => {}; },
    async flush() {}
  };
  return api;
}

/* ---------------- Firestore ---------------- */
// Layout under users/{uid}/:
//   meta/{id}                 shelf entry (small)
//   books/{id}                book header (everything except blocks) + nChunks
//   books/{id}/chunks/{i}     slices of the blocks array, each well under Firestore's 1 MiB doc limit
//   state/{id}                highlights, reading position, checkpoints
//   settings/app              app settings that follow you between devices
export const CHUNK_BYTES = 700 * 1024;
const enc = new TextEncoder();
const size = v => enc.encode(JSON.stringify(v)).length;

export function chunkBlocks(blocks, limit = CHUNK_BYTES) {
  const out = []; let cur = [], curSize = 2;
  for (const b of blocks) {
    const s = size(b) + 1;
    if (cur.length && curSize + s > limit) { out.push(cur); cur = []; curSize = 2; }
    cur.push(b); curSize += s;
  }
  if (cur.length || !out.length) out.push(cur);
  return out;
}

// fs: the firebase-firestore module namespace (injected so this can be tested without Firebase)
export function makeCloud(fs, db, uid, { onError = () => {}, delay = 2500 } = {}) {
  const base = ['users', uid];
  const ref = (...p) => fs.doc(db, ...base, ...p);
  const col = (...p) => fs.collection(db, ...base, ...p);
  const split = k => { const i = k.indexOf(':'); return [k.slice(0, i), k.slice(i + 1)]; };
  const plain = v => v == null ? v : JSON.parse(JSON.stringify(v)); // drops undefined, keeps Firestore happy
  const pathFor = (kind, id) => kind === 'meta' ? ['meta', id] : kind === 'state' ? ['state', id] : kind === 'settings' ? ['settings', id] : null;

  // Read the server copy when it answers quickly, otherwise the offline cache.
  async function fresh(r, ms = 2500) {
    let timer;
    const cache = () => fs.getDocFromCache(r).catch(() => null);
    try {
      const snap = await Promise.race([
        fs.getDoc(r),
        new Promise(res => { timer = setTimeout(() => res('timeout'), ms); })
      ]);
      clearTimeout(timer);
      return snap === 'timeout' ? await cache() : snap;
    } catch (e) { clearTimeout(timer); return await cache(); }
  }
  async function cacheFirst(r) {
    try { const s = await fs.getDocFromCache(r); if (s.exists()) return s; } catch (e) {}
    return fresh(r, 8000);
  }
  async function chunkDocs(id) {
    let snap = null;
    try { snap = await fs.getDocsFromCache(col('books', id, 'chunks')); } catch (e) {}
    if (!snap || snap.empty) snap = await fs.getDocs(col('books', id, 'chunks'));
    return snap;
  }

  // Coalesce frequent writes (reading position, highlights) so a long reading
  // session costs a handful of writes instead of hundreds.
  const pending = new Map(); let timer = null;
  const write = (p, v) => fs.setDoc(ref(...p), plain(v)).catch(onError);
  function flush() {
    clearTimeout(timer); timer = null;
    const jobs = [...pending.values()].map(({ p, v }) => write(p, v));
    pending.clear();
    return Promise.all(jobs);
  }

  return {
    kind: 'cloud', uid,
    async open() {},
    async get(k) {
      const [kind, id] = split(k);
      if (pending.has(k)) return plain(pending.get(k).v);
      if (kind === 'doc') {
        const h = await cacheFirst(ref('books', id));
        if (!h || !h.exists()) return undefined;
        const head = h.data();
        const snap = await chunkDocs(id);
        const parts = snap.docs.map(d => d.data()).sort((a, b) => a.i - b.i);
        if (parts.length < (head.nChunks || 0)) {
          const s2 = await fs.getDocs(col('books', id, 'chunks'));
          parts.splice(0, parts.length, ...s2.docs.map(d => d.data()).sort((a, b) => a.i - b.i));
        }
        const { nChunks, ...rest } = head;
        return { ...rest, blocks: parts.slice(0, nChunks || parts.length).flatMap(p => p.blocks || []) };
      }
      const p = pathFor(kind, id); if (!p) return undefined;
      const s = await fresh(ref(...p));
      return s && s.exists() ? s.data() : undefined;
    },
    async put(k, v) {
      const [kind, id] = split(k);
      if (kind === 'doc') {
        const { blocks = [], ...head } = plain(v);
        const parts = chunkBlocks(blocks);
        // chunks first, header last: a header always points at chunks that exist
        parts.forEach((b, i) => fs.setDoc(ref('books', id, 'chunks', String(i)), { i, blocks: b }).catch(onError));
        fs.setDoc(ref('books', id), { ...head, nChunks: parts.length }).catch(onError);
        // remove leftovers from an older, longer version
        fs.getDocsFromCache(col('books', id, 'chunks')).then(s => s.docs.forEach(d => {
          if (+d.id >= parts.length) fs.deleteDoc(d.ref).catch(onError);
        })).catch(() => {});
        return;
      }
      const p = pathFor(kind, id); if (!p) return;
      if (kind === 'settings') { write(p, v); return; }
      pending.set(k, { p, v: plain(v) });
      if (!timer) timer = setTimeout(flush, delay);
    },
    async del(k) {
      const [kind, id] = split(k);
      pending.delete(k);
      if (kind === 'doc') {
        try { const s = await fs.getDocs(col('books', id, 'chunks')); s.docs.forEach(d => fs.deleteDoc(d.ref).catch(onError)); } catch (e) {}
        fs.deleteDoc(ref('books', id)).catch(onError);
        return;
      }
      const p = pathFor(kind, id); if (p) fs.deleteDoc(ref(...p)).catch(onError);
    },
    async all(prefix) {
      if (prefix !== 'meta:') return [];
      let s = null;
      try { s = await fs.getDocs(col('meta')); } catch (e) { try { s = await fs.getDocsFromCache(col('meta')); } catch (e2) {} }
      return s ? s.docs.map(d => d.data()) : [];
    },
    // live shelf: other devices' changes show up without a reload
    watchMeta(cb, onErr = onError) {
      return fs.onSnapshot(col('meta'), s => {
        const list = s.docs.map(d => d.data());
        pending.forEach((job, key) => { if (key.startsWith('meta:')) { const i = list.findIndex(m => m.id === job.v.id); if (i >= 0) list[i] = job.v; else list.push(job.v); } });
        cb(list, s.metadata.fromCache);
      }, onErr);
    },
    flush
  };
}

/* ---------------- backup and restore ---------------- */
// Format: { app: 'upwind', version: 1, exported, books: [{ meta, doc, state }] }.
// The artifact's "Back up shelf" button writes the same format.
export async function exportShelf(db, metas) {
  metas = metas || await db.all('meta:');
  const books = [];
  for (const meta of metas) {
    const [doc, state] = await Promise.all([db.get('doc:' + meta.id), db.get('state:' + meta.id)]);
    if (doc) books.push({ meta, doc, state: state || null });
  }
  return { app: 'upwind', version: 1, exported: new Date().toISOString(), books };
}

// Adds books that aren't on the shelf yet. For books already there, adds the
// backup's highlights whose ids are missing and leaves everything else alone.
// metaFor(doc, state) builds the shelf entry, so it always matches the content.
export async function importShelf(db, data, existing, metaFor) {
  if (!data || data.app !== 'upwind' || !Array.isArray(data.books)) throw new Error('not_backup');
  if (data.version > 1) throw new Error('newer_version');
  const have = new Set(existing.map(m => m.id));
  const res = { added: 0, merged: 0, highlights: 0, metas: [] };
  for (const b of data.books) {
    const id = b && b.doc && (b.doc.id || (b.meta && b.meta.id));
    if (!id || !Array.isArray(b.doc.blocks)) continue;
    if (!have.has(id)) {
      const doc = { ...b.doc, id }, state = { hl: [], pos: 0, maxP: 0, done: [], ...(b.state || {}) };
      await db.put('doc:' + id, doc); await db.put('state:' + id, state);
      const meta = metaFor(doc, state); await db.put('meta:' + id, meta);
      have.add(id); res.metas.push(meta); res.added++;
      continue;
    }
    const incoming = (b.state && b.state.hl) || [];
    if (!incoming.length) continue;
    const state = (await db.get('state:' + id)) || { hl: [], pos: 0, maxP: 0, done: [] };
    const ids = new Set((state.hl || []).map(h => h.id));
    const extra = incoming.filter(h => h && h.id && !ids.has(h.id));
    if (!extra.length) continue;
    state.hl = (state.hl || []).concat(extra);
    const doc = await db.get('doc:' + id); if (!doc) continue;
    await db.put('state:' + id, state);
    const meta = metaFor(doc, state); await db.put('meta:' + id, meta);
    res.metas.push(meta); res.merged++; res.highlights += extra.length;
  }
  return res;
}
