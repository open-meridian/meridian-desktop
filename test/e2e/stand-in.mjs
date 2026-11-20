// A stand-in deployment for the desktop's run: the dashboard's paths and behaviour the desktop meets, on one
// port, by Host header: `{name}.localhost` is the dashboard and `{instance}.plugins.{name}.localhost` a plugin's
// host. It is used where CI's real deployment cannot be: a second deployment, a certificate that changes, and an
// OIDC deployment. Its markup copies the dashboard's classes the run reads (meridian-core crates/dashboard).
import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

export function standIn({ name, instances = ['alpha', 'beta'], person = { name: 'pat', password: 'stand-in-only' }, oidc = false, tls = null }) {
  const sessions = new Set();
  const cookieName = tls ? '__Host-meridian_session' : 'meridian_session';
  const page = (title, body, extra = {}) => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...extra }, body: `<!doctype html><title>${title}</title>${body}` });
  const go = (to, extra = {}) => ({ status: 303, headers: { location: to, ...extra }, body: '' });
  const sessionOf = (req) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k, v]) => k === cookieName && sessions.has(v));

  function dashboard(req, url, body) {
    const signed = !!sessionOf(req);
    if (url.pathname === '/' && !signed) return page('Sign in', '<h1>Open Meridian</h1><p><a href="/sign-in">Sign in</a> to this deployment.</p>');
    if (url.pathname === '/') {
      const rows = instances.map((i) => `<li class="list-row" data-instance="${i}"><div class="plugin-card"><span class="plugin-name">${i}</span>`
        + `<a class="plugin-level" data-level="admin" href="/plugins/${i}?level=admin">Manage</a></div></li>`).join('');
      return page('Home', `<h1>Your plugins</h1><ul class="plugins list">${rows}</ul><p id="cookies">${(req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')[0]).join(' ')}</p>`);
    }
    if (url.pathname === '/sign-in' && req.method === 'GET') {
      if (oidc) return go('https://identity.example.invalid/authorize?client_id=stand-in');
      return page('Sign in', '<form method="post" action="/sign-in"><input id="name" name="name"><input id="password" name="password" type="password"><button type="submit">Sign in</button></form>');
    }
    if (url.pathname === '/sign-in' && req.method === 'POST') {
      const form = new URLSearchParams(body);
      if (form.get('name') !== person.name || form.get('password') !== person.password) return page('Sign in', '<p class="refused">That name and password do not match.</p>');
      const key = crypto.randomBytes(16).toString('hex');
      sessions.add(key);
      return go('/', { 'set-cookie': `${cookieName}=${key}; Path=/; Max-Age=43200; HttpOnly; SameSite=Lax${tls ? '; Secure' : ''}` });
    }
    // A framed page's way in (the dashboard's `/plugins/{instance}/enter`): on to the plugin's own host.
    const enter = /^\/plugins\/([a-z0-9-]+)\/enter$/.exec(url.pathname);
    if (enter) {
      if (!signed) return go('/sign-in');
      const to = url.searchParams.get('path') || '/';
      if (!instances.includes(enter[1]) || !to.startsWith('/') || to.startsWith('//')) return { status: 404, headers: {}, body: 'not found' };
      return go(`${tls ? 'https' : 'http'}://${enter[1]}.plugins.${req.headers.host}${to}`);
    }
    // The area, as the dashboard draws it under Manage (meridian-core crates/dashboard, area.rs): its own Summary
    // first, drawn and framing nothing; the plugin's pages are the tabs after it, each framed on the plugin's host.
    const area = /^\/plugins\/([a-z0-9-]+)$/.exec(url.pathname);
    if (area) {
      if (!signed) return go('/sign-in');
      const i = area[1];
      if (!instances.includes(i)) return { ...page('No such plugin', `<h1>No such plugin</h1><p>No plugin ${i} runs in this deployment.</p>`), status: 404 };
      const framed = url.searchParams.get('tab') === 'setup';
      const here = ' class="here" aria-current="page"';
      const nav = '<nav class="tabs view-tabs" aria-label="The plugin\'s pages">'
        + `<a href="/plugins/${i}?level=admin&amp;tab=summary" data-tab="summary" data-drawn${framed ? '' : here}>Summary</a>`
        + `<a href="/plugins/${i}?level=admin&amp;tab=setup" data-tab="setup" data-page="/setup"${framed ? here : ''}>Setup</a></nav>`;
      const body = framed
        ? `<iframe class="plugin-frame" id="plugin-page" data-page="/setup" data-plugin-frame src="/plugins/${i}/enter?path=%2Fsetup&amp;level=admin" style="width:100%;height:80vh;border:0"></iframe>`
        : '<div class="area-drawn" id="plugin-page"><p>Summary</p></div>';
      return page(i, `<div class="plugin-area" data-level="admin"><h1>${i}</h1>${nav}<div class="tab-body">${body}</div></div>`,
        { 'content-security-policy': "frame-ancestors 'self'" });
    }
    return { status: 404, headers: {}, body: 'not found' };
  }

  function plugin(req, instance) {
    return page(instance, `<h1>The ${instance} plugin's page</h1><a id="out" href="https://example.org/">example.org</a>`,
      { 'content-security-policy': `frame-ancestors ${tls ? 'https' : 'http'}://${req.headers.host.replace(/^[^.]+\.plugins\./, '')}` });
  }

  const handler = (req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e5) req.destroy(); });
    req.on('end', () => {
      const host = (req.headers.host || '').split(':')[0];
      const url = new URL(req.url, 'http://x');
      const pluginHost = new RegExp(`^([a-z0-9-]+)\\.plugins\\.${name}\\.localhost$`).exec(host);
      const answer = pluginHost ? plugin(req, pluginHost[1]) : host === `${name}.localhost` ? dashboard(req, url, body) : { status: 421, headers: {}, body: 'wrong host' };
      res.writeHead(answer.status, answer.headers);
      res.end(answer.body);
    });
  };
  const server = tls ? https.createServer({ key: tls.key, cert: tls.cert }, handler) : http.createServer(handler);
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ server, port, address: `${tls ? 'https' : 'http'}://${name}.localhost:${port}`, person, instances, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) });
  }));
}
