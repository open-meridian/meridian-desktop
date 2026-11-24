'use strict';
// What a strip tells the person about its deployment: a certificate to accept, or a sign-in to do in the browser.
// Built with DOM calls, never markup from strings.
function el(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function button(text, act, primary) {
  const b = el('button', text, { type: 'button', 'data-act': act });
  if (primary) b.className = 'primary';
  return b;
}
// Below this width a notice keeps its fingerprints behind a click. Once the person opens or closes them, that holds
// for the notice while it shows, whatever redraws the strip.
const WIDE = 480;
let prints = { for: null, open: null };
function renderNotice(box, notice) {
  box.replaceChildren();
  if (!notice) return;
  const panel = el('div', '', { class: 'notice', role: 'alert', 'data-notice': notice.kind });
  const actions = el('div', '', { class: 'actions' });
  if (notice.kind === 'certificate' && notice.seen) {
    // The fingerprints are shown at once where the strip has room, and behind one click in a narrow window, so the
    // strip still fits a window at its minimum size (test/browser/pages.spec.mjs).
    const shown = el('details', '', { class: 'prints' });
    const key = `${notice.hostname} ${notice.seen}`;
    if (prints.for !== key) prints = { for: key, open: null };
    shown.open = prints.open ?? window.innerWidth >= WIDE;
    shown.addEventListener('toggle', () => { prints.open = shown.open; });
    if (notice.pinned) {
      panel.append(el('p', `The certificate of ${notice.hostname} has changed. Accept the new one only if your administrator says it was changed.`));
      shown.append(el('summary', 'Fingerprints (SHA-256)'));
      const pinned = el('p', 'Pinned: '); pinned.append(el('code', notice.pinned, { 'data-fingerprint': 'pinned' })); shown.append(pinned);
      const now = el('p', 'Now: '); now.append(el('code', notice.seen, { 'data-fingerprint': 'seen' })); shown.append(now);
      actions.append(button('Accept the new certificate', 'acceptCertificate', true), button('Not now', 'dismissNotice'));
    } else {
      panel.append(el('p', `No public authority vouches for the certificate of ${notice.hostname}. Trust it only if its fingerprint matches the one your administrator gave you; it is then pinned.`));
      shown.append(el('summary', 'Fingerprint (SHA-256)'));
      const fp = el('p'); fp.append(el('code', notice.seen, { 'data-fingerprint': 'seen' })); shown.append(fp);
      actions.append(button('Trust this certificate', 'acceptCertificate', true), button('Not now', 'dismissNotice'));
    }
    panel.append(shown);
  } else if (notice.kind === 'browser-sign-in') {
    panel.append(el('p', 'This deployment signs in through your firm\'s identity provider. Until the desktop can take that sign-in over, sign in to it in your browser.'));
    actions.append(button('Open in browser', 'openInBrowser', true), button('Dismiss', 'dismissNotice'));
  }
  panel.append(actions);
  box.append(panel);
}
