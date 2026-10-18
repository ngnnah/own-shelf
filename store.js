// Storage adapters. Both expose the same small key/value API the app uses:
//   get(key), put(key, value), del(key), all(prefix), watchMeta(cb), flush()
// Keys: "meta:<id>" (shelf entry), "doc:<id>" (book content), "state:<id>" (highlights,
// position), "settings:app".

/* ---------------- this device only (IndexedDB) ---------------- */
export function makeLocal() {
  let db = null;
  const mem = new Map();
  const tx = mode => db.transaction('kv', mode).objectStore('kv');
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return {
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
    async put(k, v) { mem.set(k, v); if (!db) return; await req(tx('readwrite').put(v, k)); },
    async del(k) { mem.delete(k); if (!db) return; try { await req(tx('readwrite').delete(k)); } catch (e) {} },
    async all(prefix) {
      if (!db) return [...mem].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);
      try { return await req(tx('readonly').getAll(IDBKeyRange.bound(prefix, prefix + '￿'))); } catch (e) { return []; }
    },
    watchMeta() { return () => {}; },
    async flush() {}
  };
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
    watchMeta(cb) {
      return fs.onSnapshot(col('meta'), s => {
        const list = s.docs.map(d => d.data());
        pending.forEach((job, key) => { if (key.startsWith('meta:')) { const i = list.findIndex(m => m.id === job.v.id); if (i >= 0) list[i] = job.v; else list.push(job.v); } });
        cb(list, s.metadata.fromCache);
      }, onError);
    },
    flush
  };
}
