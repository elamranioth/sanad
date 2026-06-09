const STORAGE_KEY_PREFIX = 'memory:';
const MAX_ITEMS = 5000;
const MAX_FIELD_LENGTH = 12000;

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'Cache-Control': 'no-store'
    }
  });
}

function storageKey(env) {
  const owner = String(env.SANAD_BASIC_USER || 'owner')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'owner';
  return `${STORAGE_KEY_PREFIX}${owner}`;
}

function cleanText(value, limit = MAX_FIELD_LENGTH) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function cleanItem(item) {
  if (!item || typeof item !== 'object') return null;
  const text = cleanText(item.text);
  if (!text) return null;
  const id = cleanText(item.id, 140) || `mem-${crypto.randomUUID()}`;
  return {
    id,
    text,
    reference: cleanText(item.reference),
    docId: Number(item.docId) || 0,
    docTitle: cleanText(item.docTitle),
    docType: cleanText(item.docType, 80),
    docNumber: cleanText(item.docNumber, 120),
    court: cleanText(item.court, 240),
    date: cleanText(item.date, 120),
    url: cleanText(item.url, 600),
    createdAt: cleanText(item.createdAt, 80) || new Date().toISOString()
  };
}

function normalizeItems(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map(cleanItem)
    .filter(Boolean)
    .filter(item => {
      const fingerprint = `${item.docId}:${item.text.toLowerCase()}`;
      if (seen.has(item.id) || seen.has(fingerprint)) return false;
      seen.add(item.id);
      seen.add(fingerprint);
      return true;
    })
    .slice(0, MAX_ITEMS);
}

async function readPayload(env) {
  if (!env.SANAD_SYNC) return null;
  const saved = await env.SANAD_SYNC.get(storageKey(env), { type: 'json' });
  return saved && typeof saved === 'object' ? saved : { version: 1, updatedAt: null, items: [] };
}

async function writePayload(env, items) {
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: normalizeItems(items)
  };
  await env.SANAD_SYNC.put(storageKey(env), JSON.stringify(payload));
  return payload;
}

function bindingUnavailable() {
  return jsonResponse({ ok: false, error: 'SANAD_SYNC binding is not configured.' }, 503);
}

export async function onRequestGet({ env }) {
  if (!env.SANAD_SYNC) return bindingUnavailable();
  const payload = await readPayload(env);
  return jsonResponse({
    ok: true,
    updatedAt: payload.updatedAt || null,
    items: normalizeItems(payload.items)
  });
}

export async function onRequestPut({ request, env }) {
  if (!env.SANAD_SYNC) return bindingUnavailable();
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON payload.' }, 400);
  }
  const payload = await writePayload(env, body.items);
  return jsonResponse({ ok: true, updatedAt: payload.updatedAt, items: payload.items });
}

export async function onRequestPost(context) {
  return onRequestPut(context);
}

export async function onRequestDelete({ env }) {
  if (!env.SANAD_SYNC) return bindingUnavailable();
  const payload = await writePayload(env, []);
  return jsonResponse({ ok: true, updatedAt: payload.updatedAt, items: [] });
}
