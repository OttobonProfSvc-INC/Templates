const test = require('node:test');
const assert = require('node:assert');

const BASE_URL = 'http://localhost:3000';

test('Full Login, Session, and Logout E2E Flow', async (t) => {
  let sessionCookie = '';
  let csrfToken = '';
  let csrfCookie = '';

  await t.test('1-2. Open /login and get CSRF token', async () => {
    // 1. NextAuth requires a CSRF token to login.
    const res = await fetch(`${BASE_URL}/api/auth/csrf`);
    assert.strictEqual(res.status, 200, 'CSRF endpoint should be accessible');
    const data = await res.json();
    csrfToken = data.csrfToken;
    assert.ok(csrfToken, 'CSRF token should be returned');
    
    // Extract CSRF cookie
    const setCookie = res.headers.get('set-cookie');
    assert.ok(setCookie, 'Set-Cookie header should be present');
    const match = setCookie.match(/next-auth\.csrf-token=([^;]+)/);
    assert.ok(match, 'CSRF cookie should be found');
    csrfCookie = `next-auth.csrf-token=${match[1]}`;
  });

  await t.test('3-4. Submit login with valid credentials and verify authentication succeeds', async () => {
    const formData = new URLSearchParams();
    formData.append('email', 'admin@sbloom.com');
    formData.append('password', 'password123');
    formData.append('csrfToken', csrfToken);
    formData.append('json', 'true');

    const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': csrfCookie,
      },
      body: formData.toString(),
      redirect: 'manual'
    });

    const data = await res.json();
    assert.ok(data.url, 'Login should succeed and return a redirect URL');

    const setCookies = res.headers.get('set-cookie');
    assert.ok(setCookies, 'Server should return Set-Cookie headers for session');
    
    // Extract session cookie
    const sessionMatch = setCookies.match(/next-auth\.session-token=([^;]+)/);
    assert.ok(sessionMatch, 'Session cookie should be established');
    sessionCookie = `next-auth.session-token=${sessionMatch[1]}`;

    // 2. COOKIE VERIFICATION check (HttpOnly, Path, SameSite)
    assert.ok(setCookies.includes('HttpOnly'), 'Cookie must be HttpOnly');
    assert.ok(setCookies.includes('Path=/'), 'Cookie must have Path=/');
    assert.ok(setCookies.includes('SameSite=Lax'), 'Cookie must have SameSite=Lax');
  });

  await t.test('5-7. Verify authenticated session grants access to /library', async () => {
    const res = await fetch(`${BASE_URL}/library`, {
      headers: {
        'Cookie': sessionCookie,
      },
      redirect: 'manual'
    });
    
    // If it redirects, it means we are rejected. It should be 200 OK.
    assert.strictEqual(res.status, 200, 'Authenticated user should access /library with 200 OK');
    const html = await res.text();
    assert.ok(html.includes('Library Foundation Ready') || html.includes('sBLOOM Hub'), 'Page content should be visible');
  });

  await t.test('7b. Verify BFF route hits internal backend', async () => {
    const res = await fetch(`${BASE_URL}/api/bff/test`, {
      headers: {
        'Cookie': sessionCookie,
      },
    });
    
    assert.strictEqual(res.status, 200, 'Authenticated user should access /api/bff/test with 200 OK');
    const data = await res.json();
    assert.ok(data.id, 'Response should contain the user ID');
  });

  await t.test('8-9. Logout and verify session invalidation', async () => {
    // We need a fresh CSRF token to logout
    const csrfRes = await fetch(`${BASE_URL}/api/auth/csrf`, {
      headers: { 'Cookie': sessionCookie }
    });
    const csrfData = await csrfRes.json();
    const newCsrfToken = csrfData.csrfToken;
    const newCsrfCookie = csrfRes.headers.get('set-cookie')?.match(/next-auth\.csrf-token=([^;]+)/)?.[0] || csrfCookie;

    const formData = new URLSearchParams();
    formData.append('csrfToken', newCsrfToken);
    formData.append('json', 'true');

    const res = await fetch(`${BASE_URL}/api/auth/signout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': `${sessionCookie}; ${newCsrfCookie}`,
      },
      body: formData.toString()
    });

    assert.strictEqual(res.status, 200, 'Signout should succeed');
    
    const setCookies = res.headers.get('set-cookie');
    assert.ok(setCookies, 'Server should clear cookies');
    assert.ok(setCookies.includes('next-auth.session-token=;'), 'Session token should be cleared (empty)');
    
    // Clear our local session state
    sessionCookie = '';
  });

  await t.test('10-11. Verify /library is inaccessible after logout', async () => {
    const res = await fetch(`${BASE_URL}/library`, {
      redirect: 'manual'
    });
    
    assert.strictEqual(res.status, 307, 'Unauthenticated user should be redirected');
    assert.ok(res.headers.get('location').includes('/login'), 'Redirect location should be /login');
  });
});
