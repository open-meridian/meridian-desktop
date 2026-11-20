# meridian-desktop

The Open Meridian desktop application: a hardened Electron browser with a trading desk's window manager, pointed at
one or more Open Meridian deployments. It shows the deployment's own pages and adds nothing a page can call.

- **The bar** shows your deployment's plugins home; each plugin opens in a window of its own, on its area page.
- **Windows** carry a frame that names the deployment and the plugin, snap to each other's edges, and can be pinned
  on top.
- **Setups** keep where your windows are and what they show, to relaunch, export and import. They live on your
  machine only.
- **Each deployment** has its own cookies and storage. A self-signed certificate is shown with its fingerprint and
  pinned once you accept it; a changed one is refused until you accept it again.
- **Sign-in** is your deployment's own: local accounts and LDAP inside the window. A deployment that signs in
  through a firm's identity provider asks you to use your browser for now.

## Run it from source
```
npm ci
node node_modules/electron/install.js
npm start
```
Then add your deployment's address in the bar, for example `http://meridian.localhost` for a deployment
`meridian up` made on this machine.

Licensed under the GNU Affero General Public License, version 3 or later. See [LICENSE](LICENSE) and
[NOTICE](NOTICE).
