'use strict';
// The bar's own part (spec requirement 7): the person's deployments and setups. Below it, the deployment view
// shows the deployment's plugins home; its plugin links open plugin windows.
const $ = (id) => document.getElementById(id);
let state = null;

function option(value, text, selected) { const o = document.createElement('option'); o.value = value; o.textContent = text; o.selected = selected; return o; }

async function act(action, arg) {
  const said = await window.desk.act(action, arg);
  $('refused').hidden = !said.refused;
  $('refused').textContent = said.refused || '';
  if (said.done && said.done.deployments) state = said.done;
  return said;
}

function fit() { window.desk.act('height', document.body.scrollHeight); }

async function draw() {
  const info = await window.desk.info();
  if (!info) return;
  state = info.bar;
  const deps = $('deployments');
  deps.replaceChildren(...(state.deployments.length ? state.deployments.map((d) => option(d.id, d.name, d.id === state.active)) : [option('', 'No deployment yet', true)]));
  const active = state.deployments.find((d) => d.id === state.active);
  document.documentElement.style.setProperty('--dep', active ? active.colour : 'transparent');
  $('remove').disabled = !active;
  const setups = $('setups');
  setups.replaceChildren(...(state.setups.length ? state.setups.map((n) => option(n, n === state.defaultSetup ? `${n} (default)` : n, false)) : [option('', 'No setup saved', true)]));
  for (const id of ['launch', 'save', 'default', 'export']) $(id).disabled = !state.setups.length;
  $('default').setAttribute('aria-pressed', String(!!state.defaultSetup && setups.value === state.defaultSetup));
  $('atstart').checked = state.launchAtStart;
  if (!state.deployments.length) $('add').hidden = false;
  renderNotice($('notice'), info.notice);
  fit();
}

function toggle(id, open) { $(id).hidden = !open; if (open) $(id).querySelector('input').focus(); fit(); }

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.open) return toggle(b.dataset.open, $(b.dataset.open).hidden);
  if (b.hasAttribute('data-close')) return toggle(b.closest('form').id, false);
  if (b.dataset.act) { await act(b.dataset.act); return draw(); }
  const setup = $('setups').value;
  if (b.id === 'remove') await act('removeDeployment', $('deployments').value);
  if (b.id === 'launch') await act('launchSetup', setup);
  if (b.id === 'save') await act('saveSetup', setup);
  if (b.id === 'default') await act('setDefault', state.defaultSetup === setup ? null : setup);
  if (b.id === 'export') await act('exportSetup', setup);
  if (b.id === 'import') await act('importSetup');
  draw();
});
$('deployments').addEventListener('change', async (e) => { await act('selectDeployment', e.target.value); draw(); });
$('setups').addEventListener('change', draw);
$('atstart').addEventListener('change', async (e) => { await act('launchAtStart', e.target.checked); });
$('add').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const said = await act('addDeployment', { address: f.get('address'), name: f.get('name'), colour: f.get('colour') });
  if (!said.refused) { e.target.reset(); toggle('add', false); }
  draw();
});
$('saveas').addEventListener('submit', async (e) => {
  e.preventDefault();
  const said = await act('saveSetup', new FormData(e.target).get('name'));
  if (!said.refused) { e.target.reset(); toggle('saveas', false); }
  draw();
});
window.desk.onUpdate(draw);
draw();
