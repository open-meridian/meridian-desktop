'use strict';
// A plugin or dashboard window's strip: the deployment (name and colour), what the window shows, the controls.
const dep = document.getElementById('dep');
const what = document.getElementById('what');
const pin = document.getElementById('pin');
const noticeBox = document.getElementById('notice');

async function draw() {
  const info = await window.desk.info();
  if (!info) return;
  if (info.deployment) {
    document.documentElement.style.setProperty('--dep', info.deployment.colour);
    dep.textContent = info.deployment.name;
  }
  what.textContent = info.instance ? `· ${info.instance}` : '· Dashboard';
  document.title = `${info.deployment ? info.deployment.name : ''} ${what.textContent}`;
  pin.setAttribute('aria-pressed', String(info.pinned));
  renderNotice(noticeBox, info.notice);
  window.desk.act('height', document.body.scrollHeight);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (b) window.desk.act(b.dataset.act).then(draw);
});
document.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) window.desk.act('maximize'); });
window.desk.onUpdate(draw);
draw();
