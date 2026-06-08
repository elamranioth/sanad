const SESSION_COOKIE = 'sanad_session';
const SESSION_SECONDS = 60 * 60 * 10;

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
};

const encoder = new TextEncoder();

function unavailable() {
  return new Response('SANAD protection is not configured.', {
    status: 503,
    headers: {
      ...securityHeaders,
      'Content-Type': 'text/plain; charset=UTF-8'
    }
  });
}

function forbidden() {
  return new Response('Authentication required.', {
    status: 401,
    headers: {
      ...securityHeaders,
      'Content-Type': 'text/plain; charset=UTF-8'
    }
  });
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function base64UrlEncode(value) {
  const bytes = value instanceof Uint8Array ? value : encoder.encode(String(value));
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  return atob(padded);
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return base64UrlEncode(new Uint8Array(signature));
}

function sessionSecret(env) {
  return env.SANAD_SESSION_SECRET || `${env.SANAD_BASIC_USER}:${env.SANAD_BASIC_PASSWORD}`;
}

async function createSession(username, env) {
  const payload = base64UrlEncode(JSON.stringify({
    user: username,
    exp: Date.now() + SESSION_SECONDS * 1000
  }));
  const signature = await sign(payload, sessionSecret(env));
  return `${payload}.${signature}`;
}

async function verifySession(token, env) {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return false;
  const expected = await sign(payload, sessionSecret(env));
  if (!timingSafeEqual(signature, expected)) return false;
  try {
    const data = JSON.parse(base64UrlDecode(payload));
    return Number(data.exp) > Date.now();
  } catch {
    return false;
  }
}

function getCookie(request, name) {
  const cookies = request.headers.get('Cookie') || '';
  return cookies
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function safeRedirect(value) {
  const fallback = '/sanad.html';
  const target = String(value || fallback);
  if (!target.startsWith('/') || target.startsWith('//')) return fallback;
  if (target === '/login' || target.startsWith('/login?')) return fallback;
  return target;
}

function wantsHtml(request, url) {
  const accept = request.headers.get('Accept') || '';
  return request.method === 'GET' && (
    accept.includes('text/html') ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html')
  );
}

function loginPage({ error = '', redirect = '/sanad.html' } = {}, status = 200) {
  const safeTarget = safeRedirect(redirect);
  const errorHtml = error ? `<div class="error">${escapeHtml(error)}</div>` : '';
  const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SANAD Private Access</title>
<style>
*{box-sizing:border-box}html,body{min-height:100%}body{margin:0;font-family:Georgia,'Times New Roman',serif;color:#eef4f8;background:#07111c;display:grid;place-items:center;padding:28px;overflow-x:hidden}
body:before{content:'';position:fixed;inset:0;background:radial-gradient(circle at 18% 12%,#254e72 0,#07111c 28%),linear-gradient(135deg,#07111c 0,#0f2234 52%,#050b12 100%);z-index:-2}
body:after{content:'';position:fixed;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff07 1px,transparent 1px);background-size:36px 36px;mask-image:linear-gradient(120deg,#000 0,#0008 48%,transparent 100%);z-index:-1}
.shell{width:min(1080px,100%);display:grid;grid-template-columns:1.05fr .95fr;border:1px solid #2b5674;border-radius:24px;overflow:hidden;background:#081827d9;box-shadow:0 28px 90px #0009}
.intro{padding:54px 50px;background:linear-gradient(145deg,#0b2033,#081320);border-right:1px solid #2b5674;min-height:610px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px}.mark{width:58px;height:58px;border:1px solid #c8a84b88;border-radius:18px;display:grid;place-items:center;color:#c8a84b;font-size:28px;background:#2a1f082e}.brand span{display:block;color:#7fb7d8;font-size:12px;letter-spacing:3px;text-transform:uppercase}.brand strong{display:block;color:#f7e7bc;font-size:28px;letter-spacing:2px;margin-top:4px}
h1{font-size:56px;line-height:1.05;margin:58px 0 18px;color:#fff;letter-spacing:.4px}p{font-size:18px;line-height:1.8;color:#a9c2d2;margin:0;max-width:560px}.chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:34px}.chips span{border:1px solid #2b5674;border-radius:999px;padding:10px 14px;color:#d8c06e;background:#07111c99;font-size:13px}
.note{border-top:1px solid #2b5674;margin-top:42px;padding-top:20px;color:#779bb2;font-size:13px;line-height:1.7}.panel{padding:54px 48px;display:flex;align-items:center;background:#081420}.card{width:100%;background:#0b1d2e;border:1px solid #2b5674;border-radius:20px;padding:34px;box-shadow:inset 0 1px 0 #ffffff0d}.card h2{margin:0 0 8px;color:#f7e7bc;font-size:32px}.card p{font-size:14px;color:#8cb0c5;margin-bottom:26px}
label{display:block;color:#b9ccda;font-size:13px;margin:16px 0 8px}input{width:100%;height:52px;border-radius:12px;border:1px solid #2b5674;background:#06111d;color:#fff;padding:0 15px;font:inherit;font-size:16px;outline:none}input:focus{border-color:#c8a84b;box-shadow:0 0 0 4px #c8a84b1f}
button{width:100%;height:54px;border:0;border-radius:12px;background:#c8a84b;color:#06111d;font:inherit;font-weight:800;font-size:16px;margin-top:22px;cursor:pointer;box-shadow:0 14px 30px #c8a84b22}button:hover{filter:brightness(1.08)}.error{border:1px solid #d95c5c88;background:#3a1117;color:#ffd0d0;border-radius:12px;padding:12px 14px;margin-bottom:16px;font-size:13px;line-height:1.6}.meta{display:flex;justify-content:space-between;gap:14px;margin-top:18px;color:#648ba3;font-size:12px}
@media(max-width:820px){body{padding:14px}.shell{grid-template-columns:1fr;border-radius:18px}.intro{min-height:auto;border-right:0;border-bottom:1px solid #2b5674;padding:34px 24px}.panel{padding:24px}.card{padding:24px}h1{font-size:38px;margin:36px 0 14px}.brand strong{font-size:24px}.meta{flex-direction:column}}
</style>
</head>
<body>
<main class="shell">
  <section class="intro">
    <div>
      <div class="brand">
        <div class="mark">S</div>
        <div><span>Private legal workspace</span><strong>SANAD</strong></div>
      </div>
      <h1>Your protected legal research desk.</h1>
      <p>Judgments, laws, clients, invoices, and important excerpts are kept behind private access before any file can be opened.</p>
      <div class="chips"><span>Judgments</span><span>Laws</span><span>Clients</span><span>Important excerpts</span></div>
    </div>
    <div class="note">Access is limited to the account owner. Direct downloads of legal text files are blocked until a valid session is created.</div>
  </section>
  <section class="panel">
    <form class="card" method="POST" action="/login">
      <h2>Enter SANAD</h2>
      <p>Sign in to open the private web app.</p>
      ${errorHtml}
      <input type="hidden" name="redirect" value="${escapeHtml(safeTarget)}">
      <label for="username">Username</label>
      <input id="username" name="username" type="text" autocomplete="username" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Open Web App</button>
      <div class="meta"><span>Secure private session</span><span>No public indexing</span></div>
    </form>
  </section>
</main>
</body>
</html>`;
  return new Response(html, {
    status,
    headers: {
      ...securityHeaders,
      'Content-Type': 'text/html; charset=UTF-8'
    }
  });
}

function redirectResponse(location, headers = {}) {
  return new Response(null, {
    status: 303,
    headers: {
      ...securityHeaders,
      ...headers,
      Location: location
    }
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const expectedUser = env.SANAD_BASIC_USER;
  const expectedPassword = env.SANAD_BASIC_PASSWORD;
  if (!expectedUser || !expectedPassword) return unavailable();

  const url = new URL(request.url);
  const session = getCookie(request, SESSION_COOKIE);
  const authenticated = await verifySession(session, env);

  if (url.pathname === '/logout') {
    return redirectResponse('/login', {
      'Set-Cookie': `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
    });
  }

  if (url.pathname === '/login' && request.method === 'GET') {
    return authenticated
      ? redirectResponse(safeRedirect(url.searchParams.get('redirect')))
      : loginPage({ redirect: url.searchParams.get('redirect') || '/sanad.html' });
  }

  if (url.pathname === '/login' && request.method === 'POST') {
    const form = await request.formData();
    const username = String(form.get('username') || '').trim();
    const password = String(form.get('password') || '');
    const redirect = safeRedirect(form.get('redirect'));
    const allowed = timingSafeEqual(username, expectedUser) && timingSafeEqual(password, expectedPassword);
    if (!allowed) return loginPage({ error: 'Invalid username or password.', redirect }, 401);
    const token = await createSession(username, env);
    return redirectResponse(redirect, {
      'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax`
    });
  }

  if (!authenticated) {
    const target = safeRedirect(`${url.pathname}${url.search}`);
    return wantsHtml(request, url) ? loginPage({ redirect: target }) : forbidden();
  }

  const response = await context.next();
  const protectedResponse = new Response(response.body, response);
  Object.entries(securityHeaders).forEach(([key, value]) => protectedResponse.headers.set(key, value));
  return protectedResponse;
}
