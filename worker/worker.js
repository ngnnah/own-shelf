// own-shelf link-import helper — a Cloudflare Worker.
// Fetches a web page (or PDF) for the own-shelf app so it can extract the article.
// Only answers requests that carry a valid Firebase ID token for an allowed email,
// from an allowed origin. Settings (Worker → Settings → Variables and Secrets):
//   FIREBASE_PROJECT_ID  your-project-id                      (projectId in config.js)
//   ALLOWED_ORIGINS      https://you.github.io                (comma-separated)
//   ALLOWED_EMAILS       you@gmail.com                        (comma-separated)

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 15000;

let jwksCache = { keys: null, exp: 0 };

const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const b64urlBytes = s => {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlJSON = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

async function getKeys(fetchImpl) {
  if (jwksCache.keys && Date.now() < jwksCache.exp) return jwksCache.keys;
  const r = await fetchImpl(JWKS_URL);
  if (!r.ok) throw new Error('jwks');
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  const keys = (await r.json()).keys || [];
  jwksCache = { keys, exp: Date.now() + (m ? +m[1] : 3600) * 1000 };
  return keys;
}

export async function verifyToken(token, projectId, { getKeysImpl, now = Date.now() } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('malformed');
  const [h, p, s] = parts;
  const header = b64urlJSON(h), payload = b64urlJSON(p);
  if (header.alg !== 'RS256' || !header.kid) throw new Error('alg');
  const keys = await getKeysImpl();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) throw new Error('signature');
  const t = Math.floor(now / 1000);
  if (payload.aud !== projectId) throw new Error('aud');
  if (payload.iss !== 'https://securetoken.google.com/' + projectId) throw new Error('iss');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('sub');
  if (!(payload.exp > t)) throw new Error('expired');
  if (payload.iat > t + 300) throw new Error('iat');
  return payload;
}

const PRIVATE_V4 = [/^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^22[4-9]\./, /^2[3-5]\d\./];
export function checkTarget(raw) {
  let u;
  try { u = new URL(raw); } catch (e) { return 'That isn’t a valid link.'; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return 'Only http and https links can be imported.';
  if (u.username || u.password) return 'Links with a username or password can’t be imported.';
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return 'Private addresses can’t be imported.';
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && PRIVATE_V4.some(r => r.test(host))) return 'Private addresses can’t be imported.';
  if (host.includes(':')) {
    if (host === '::' || host === '::1' || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith('::ffff:')) return 'Private addresses can’t be imported.';
  }
  if (!host.includes('.') && !host.includes(':')) return 'That isn’t a public web address.';
  return null;
}

async function readCapped(resp) {
  const reader = resp.body.getReader(); const chunks = []; let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > MAX_BYTES) { try { reader.cancel(); } catch (e) {} throw new Error('too_large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(n); let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

export async function handle(req, env, deps = {}) {
  const fetchImpl = deps.fetch || fetch;
  const origins = list(env.ALLOWED_ORIGINS), emails = list(env.ALLOWED_EMAILS).map(e => e.toLowerCase());
  const origin = req.headers.get('Origin') || '';
  const cors = {
    'Access-Control-Allow-Origin': origins.includes(origin) ? origin : (origins[0] || 'null'),
    'Access-Control-Allow-Headers': 'Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Final-URL',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return fail(405, 'Only GET is supported.');
  if (!env.FIREBASE_PROJECT_ID || !origins.length || !emails.length) return fail(500, 'The helper isn’t configured yet: set FIREBASE_PROJECT_ID, ALLOWED_ORIGINS and ALLOWED_EMAILS.');
  if (!origins.includes(origin)) return fail(403, 'This helper only answers your own-shelf site.');

  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let user;
  try { user = await verifyToken(token, env.FIREBASE_PROJECT_ID, { getKeysImpl: deps.getKeys || (() => getKeys(fetchImpl)) }); }
  catch (e) { return fail(401, 'Sign in again, then retry.'); }
  if (!user.email || user.email_verified === false || !emails.includes(String(user.email).toLowerCase())) return fail(403, 'This account isn’t allowed to use the helper.');

  const target = new URL(req.url).searchParams.get('url') || '';
  const bad = checkTarget(target);
  if (bad) return fail(400, bad);

  // follow redirects ourselves so every hop is checked
  let url = target, resp;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop < 6; hop++) {
      resp = await fetchImpl(url, {
        redirect: 'manual', signal: ctl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
          'Accept': 'text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.5',
          'Accept-Language': 'en,ja;q=0.8,vi;q=0.7'
        }
      });
      if (resp.status >= 300 && resp.status < 400 && resp.headers.get('Location')) {
        const next = new URL(resp.headers.get('Location'), url).href;
        const b2 = checkTarget(next); if (b2) return fail(400, b2);
        url = next; continue;
      }
      break;
    }
    if (!resp || (resp.status >= 300 && resp.status < 400)) return fail(502, 'That link redirects too many times.');
    if (!resp.ok) return fail(502, `The site answered ${resp.status}. It may need a login or block automated reading.`);
    const type = (resp.headers.get('Content-Type') || '').toLowerCase();
    if (!/text\/html|application\/xhtml|application\/pdf|text\/plain|text\/markdown/.test(type)) return fail(415, 'That link isn’t a web page, PDF or text file.');
    const body = await readCapped(resp);
    return new Response(body, { status: 200, headers: { ...cors, 'Content-Type': type || 'text/html', 'X-Final-URL': url, 'Cache-Control': 'private, no-store' } });
  } catch (e) {
    if (e && e.message === 'too_large') return fail(413, 'That page is over 15 MB.');
    if (e && e.name === 'AbortError') return fail(504, 'The site took too long to answer.');
    return fail(502, 'Couldn’t reach that site.');
  } finally { clearTimeout(timer); }
}

export default { fetch: (req, env) => handle(req, env) };
