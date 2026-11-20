import test from 'node:test';
import assert from 'node:assert/strict';
import certificates from '../../src/main/certificates.js';

const { fingerprint, decide } = certificates;
const pemA = '-----BEGIN CERTIFICATE-----\nAAECAwQ=\n-----END CERTIFICATE-----';
const pemB = '-----BEGIN CERTIFICATE-----\nBQYHCAk=\n-----END CERTIFICATE-----';
const dep = { address: 'https://m.example.com', pins: [] };

test('a fingerprint is SHA-256 of the DER in colon hex', () => {
  assert.match(fingerprint(pemA), /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.notEqual(fingerprint(pemA), fingerprint(pemB));
});

test('a publicly trusted certificate needs no pin; an untrusted one is shown first', () => {
  assert.equal(decide(dep, { hostname: 'm.example.com', errorCode: 0, pem: pemA }).verdict, 'chromium');
  const first = decide(dep, { hostname: 'x.plugins.m.example.com', errorCode: -202, pem: pemA });
  assert.equal(first.verdict, 'refuse');
  assert.deepEqual(first.tell, { kind: 'first', hostname: 'x.plugins.m.example.com', seen: fingerprint(pemA) });
});

test('a pinned certificate is accepted; a changed one is refused with both fingerprints, trusted or not', () => {
  const pinned = { ...dep, pins: [fingerprint(pemA)] };
  assert.equal(decide(pinned, { hostname: 'm.example.com', errorCode: -202, pem: pemA }).verdict, 'accept');
  for (const errorCode of [0, -202]) {
    const changed = decide(pinned, { hostname: 'm.example.com', errorCode, pem: pemB });
    assert.equal(changed.verdict, 'refuse');
    assert.deepEqual(changed.tell, { kind: 'changed', hostname: 'm.example.com', seen: fingerprint(pemB), pinned: fingerprint(pemA) });
  }
});

test('another site keeps Chromium\'s own answer', () => {
  assert.equal(decide({ ...dep, pins: ['X'] }, { hostname: 'example.org', errorCode: -202, pem: pemA }).verdict, 'chromium');
});
