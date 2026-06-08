const securityHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow, noarchive'
};

function challenge() {
  return new Response('SANAD is private.', {
    status: 401,
    headers: {
      ...securityHeaders,
      'WWW-Authenticate': 'Basic realm="SANAD Private", charset="UTF-8"'
    }
  });
}

function unavailable() {
  return new Response('SANAD protection is not configured.', {
    status: 503,
    headers: securityHeaders
  });
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

function readBasicAuth(request) {
  const header = request.headers.get('Authorization') || '';
  if (!header.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(':');
    if (separator === -1) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1)
    };
  } catch {
    return null;
  }
}

export async function onRequest(context) {
  const expectedUser = context.env.SANAD_BASIC_USER;
  const expectedPassword = context.env.SANAD_BASIC_PASSWORD;
  if (!expectedUser || !expectedPassword) return unavailable();

  const credentials = readBasicAuth(context.request);
  const allowed = credentials &&
    timingSafeEqual(credentials.username, expectedUser) &&
    timingSafeEqual(credentials.password, expectedPassword);

  if (!allowed) return challenge();

  const response = await context.next();
  const protectedResponse = new Response(response.body, response);
  Object.entries(securityHeaders).forEach(([key, value]) => protectedResponse.headers.set(key, value));
  return protectedResponse;
}
