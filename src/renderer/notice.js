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
function renderNotice(box, notice) {
  box.replaceChildren();
  if (!notice) return;
  const panel = el('div', '', { class: 'notice', role: 'alert', 'data-notice': notice.kind });
  const actions = el('div', '', { class: 'actions' });
  if (notice.kind === 'certificate' && notice.seen) {
    if (notice.pinned) {
      panel.append(el('p', `The certificate of ${notice.hostname} has changed, so the desktop refuses it until you accept the new one.`));
      const pinned = el('p', 'Pinned: '); pinned.append(el('code', notice.pinned, { 'data-fingerprint': 'pinned' })); panel.append(pinned);
      const now = el('p', 'Now: '); now.append(el('code', notice.seen, { 'data-fingerprint': 'seen' })); panel.append(now);
      panel.append(el('p', 'Accept it only if your administrator says the certificate was changed.'));
      actions.append(button('Accept the new certificate', 'acceptCertificate', true), button('Not now', 'dismissNotice'));
    } else {
      panel.append(el('p', `No public authority vouches for the certificate of ${notice.hostname}.`));
      const fp = el('p', 'Fingerprint (SHA-256): '); fp.append(el('code', notice.seen, { 'data-fingerprint': 'seen' })); panel.append(fp);
      panel.append(el('p', 'Trust it only if it matches the fingerprint your administrator gave you. It is then pinned for this deployment.'));
      actions.append(button('Trust this certificate', 'acceptCertificate', true), button('Not now', 'dismissNotice'));
    }
  } else if (notice.kind === 'browser-sign-in') {
    panel.append(el('p', 'This deployment signs in through your firm\'s identity provider. Until the desktop can take that sign-in over, sign in to it in your browser.'));
    actions.append(button('Open in browser', 'openInBrowser', true), button('Dismiss', 'dismissNotice'));
  }
  panel.append(actions);
  box.append(panel);
}
