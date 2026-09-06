const SESSION_COOKIE = 'sanad_session';
const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return atob(padded);
}

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : encoder.encode(String(value));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  return diff === 0;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  return cookies.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) || '';
}

function sessionSecret(env) {
  return env.SANAD_SESSION_SECRET || `${env.SANAD_BASIC_USER}:${env.SANAD_BASIC_PASSWORD}`;
}

async function verifySession(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;
  const expected = await sign(payload, sessionSecret(env));
  if (!timingSafeEqual(signature, expected)) return null;
  try {
    const data = JSON.parse(base64UrlDecode(payload));
    return Number(data.exp) > Date.now() ? data : null;
  } catch {
    return null;
  }
}

function userVaultKey(session) {
  const identity = String(session.email || session.user || 'owner').trim().toLowerCase();
  const safe = identity.replace(/[^a-z0-9@._-]+/g, '-').replace(/^-+|-+$/g, '') || 'owner';
  return `private-vault:${session.provider || 'password'}:${safe}`;
}

function cleanArray(value, max = 10000) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanData(data) {
  const source = cleanObject(data);
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    savedJudgmentIds: cleanArray(source.savedJudgmentIds, 20000),
    memoryItems: cleanArray(source.memoryItems, 5000),
    localJudgments: cleanArray(source.localJudgments, 500),
    feeItems: cleanArray(source.feeItems, 5000),
    clientProfiles: cleanArray(source.clientProfiles, 5000),
    settings: cleanObject(source.settings),
    protection: cleanObject(source.protection)
  };
}

async function requireVault(request, env) {
  if (!env.SANAD_SYNC) return { error: jsonResponse({ ok: false, error: 'SANAD_SYNC binding is not configured.' }, 503) };
  const session = await verifySession(request, env);
  if (!session) return { error: jsonResponse({ ok: false, error: 'Authentication required.' }, 401) };
  return { session, key: userVaultKey(session) };
}

export async function onRequestGet({ request, env }) {
  const vault = await requireVault(request, env);
  if (vault.error) return vault.error;
  const stored = await env.SANAD_SYNC.get(vault.key, { type: 'json' });
  return jsonResponse({ ok: true, data: stored?.data || null, updatedAt: stored?.updatedAt || null });
}

export async function onRequestPut({ request, env }) {
  const vault = await requireVault(request, env);
  if (vault.error) return vault.error;
  const raw = await request.text();
  if (encoder.encode(raw).length > MAX_PAYLOAD_BYTES) {
    return jsonResponse({ ok: false, error: 'Private data payload is too large for the current vault limit.' }, 413);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON payload.' }, 400);
  }
  const data = cleanData(body.data || body);
  const payload = { ok: true, updatedAt: new Date().toISOString(), data };
  await env.SANAD_SYNC.put(vault.key, JSON.stringify(payload));
  return jsonResponse(payload);
}

export async function onRequestPost(context) {
  return onRequestPut(context);
}

export async function onRequestDelete({ request, env }) {
  const vault = await requireVault(request, env);
  if (vault.error) return vault.error;
  await env.SANAD_SYNC.delete(vault.key);
  return jsonResponse({ ok: true, updatedAt: new Date().toISOString(), data: null });
}
