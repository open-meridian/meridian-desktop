import test from 'node:test';
import assert from 'node:assert/strict';
import origins from '../../src/main/origins.js';

const { canonicalAddress, onDeployment, plainAllowed, areaInstance, isKeptPath, hostOnDeployment, mayOpenOutside } = origins;

test('an address is made canonical, and plain http is only for loopback names', () => {
  assert.equal(canonicalAddress('meridian.example.com'), 'https://meridian.example.com');
  assert.equal(canonicalAddress('http://meridian.localhost'), 'http://meridian.localhost');
  assert.equal(canonicalAddress('http://localhost:8080/'), 'http://localhost:8080');
  assert.throws(() => canonicalAddress('http://meridian.example.com'), /Plain http/);
  assert.throws(() => canonicalAddress('http://127.0.0.1'), /Plain http/);
  assert.throws(() => canonicalAddress('ftp://x'), /https/);
  assert.throws(() => canonicalAddress('https://a@b.example.com'), /no name/);
  assert.throws(() => canonicalAddress('https://b.example.com/path'), /no path/);
});

test('the deployment is its dashboard host and its plugin hosts, on its scheme and port', () => {
  const dep = 'https://m.example.com';
  assert.ok(onDeployment(dep, 'https://m.example.com/plugins/x'));
  assert.ok(onDeployment(dep, 'https://fx-1.plugins.m.example.com/'));
  assert.ok(!onDeployment(dep, 'http://m.example.com/'));
  assert.ok(!onDeployment(dep, 'https://m.example.com:8443/'));
  assert.ok(!onDeployment(dep, 'https://evil.example.com/'));
  assert.ok(!onDeployment(dep, 'https://m.example.com.evil.net/'));
  assert.ok(!onDeployment(dep, 'https://a.b.plugins.m.example.com/'));
  assert.ok(!onDeployment(dep, 'https://plugins.m.example.com/'));
  assert.ok(!onDeployment(dep, 'https://u:p@m.example.com/'));
  assert.ok(hostOnDeployment(dep, 'x.plugins.m.example.com'));
  assert.ok(!hostOnDeployment(dep, 'example.com'));
});

test('plain http leaves only for loopback names', () => {
  assert.ok(plainAllowed('http://meridian.localhost/x'));
  assert.ok(plainAllowed('ws://a.plugins.meridian.localhost/'));
  assert.ok(plainAllowed('https://example.org/'));
  assert.ok(!plainAllowed('http://example.org/'));
  assert.ok(!plainAllowed('ws://example.org/'));
});

test('an area page names its instance, and only the dashboard host serves one', () => {
  const dep = 'http://meridian.localhost';
  assert.equal(areaInstance(dep, 'http://meridian.localhost/plugins/reference?level=admin'), 'reference');
  assert.equal(areaInstance(dep, 'http://meridian.localhost/plugins/reference/enter'), null);
  assert.equal(areaInstance(dep, 'http://reference.plugins.meridian.localhost/plugins/x'), null);
  assert.equal(areaInstance(dep, 'https://meridian.localhost/plugins/x'), null);
});

test('a kept path is a path, and only links on the web leave for the browser', () => {
  assert.ok(isKeptPath('/plugins/x?level=open&tab=blotter'));
  for (const bad of ['//evil.example', 'https://x', 'plugins/x', '/a\\b', '/a\nb', 42]) assert.ok(!isKeptPath(bad), String(bad));
  assert.ok(mayOpenOutside('https://example.org'));
  assert.ok(!mayOpenOutside('file:///etc/passwd'));
  assert.ok(!mayOpenOutside('javascript:alert(1)'));
});
