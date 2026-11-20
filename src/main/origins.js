'use strict';
// Which addresses belong to a deployment, and which a deployment may use at all. Pure functions: tested in
// test/unit/origins.test.mjs.
//
// A deployment is its dashboard's address (`https://host[:port]`) and its plugins' hosts below it,
// `{instance}.plugins.{host}` (decisions/021). Plain http only for `localhost` and `*.localhost`
// (spec/the-desktop-shows-the-same-pages, requirement 6).

function isLoopbackName(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return h === 'localhost' || h.endsWith('.localhost');
}

// A deployment's address, as the person typed it, made canonical: scheme, host and port, no path. Throws a
// sentence the person can read when it cannot be one.
function canonicalAddress(typed) {
  let url;
  try {
    url = new URL(String(typed).trim().includes('://') ? String(typed).trim() : `https://${String(typed).trim()}`);
  } catch {
    throw new Error('That is not an address. Type the deployment\'s address, such as https://meridian.example.com.');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('A deployment\'s address starts with https://.');
  if (url.protocol === 'http:' && !isLoopbackName(url.hostname)) {
    throw new Error('Plain http is only for localhost and names ending in .localhost. Use https://.');
  }
  if (url.username || url.password) throw new Error('A deployment\'s address carries no name or password.');
  if (url.pathname !== '/' || url.search || url.hash) throw new Error('A deployment\'s address has no path: just its host.');
  return url.origin;
}

// Whether a URL is on the deployment: its dashboard's origin, or a plugin host under it on the same scheme and port.
function onDeployment(address, target) {
  let dep, url;
  try { dep = new URL(address); url = new URL(target); } catch { return false; }
  if (url.protocol !== dep.protocol || url.port !== dep.port) return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  const home = dep.hostname.toLowerCase();
  if (host === home) return true;
  const suffix = `.plugins.${home}`;
  if (!host.endsWith(suffix)) return false;
  const instance = host.slice(0, -suffix.length);
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(instance);
}

// Whether a host name is the deployment's (for certificates): the dashboard's, or a plugin host below it.
function hostOnDeployment(address, hostname) {
  const dep = new URL(address);
  return onDeployment(address, `${dep.protocol}//${hostname}${dep.port ? `:${dep.port}` : ''}/`);
}

// Whether any request may leave over plain http (or ws): only to loopback names.
function plainAllowed(target) {
  let url;
  try { url = new URL(target); } catch { return false; }
  if (url.protocol !== 'http:' && url.protocol !== 'ws:') return true;
  return isLoopbackName(url.hostname);
}

// The plugin instance a dashboard path opens, `/plugins/{instance}` (its area page), or null.
function areaInstance(address, target) {
  if (!onDeployment(address, target)) return null;
  const url = new URL(target);
  if (url.hostname.toLowerCase() !== new URL(address).hostname.toLowerCase()) return null;
  const m = /^\/plugins\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\/?$/.exec(url.pathname);
  return m ? m[1] : null;
}

// A path kept in a setup: on the dashboard's own host, starting with one `/`, no scheme or authority.
function isKeptPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
    && !/[\u0000-\u001f]/.test(path) && path.length <= 2048;
}

// Only these leave for the person's browser; anything else is dropped.
function mayOpenOutside(target) {
  try { return ['https:', 'http:', 'mailto:'].includes(new URL(target).protocol); } catch { return false; }
}

module.exports = { isLoopbackName, canonicalAddress, onDeployment, hostOnDeployment, plainAllowed, areaInstance, isKeptPath, mayOpenOutside };
