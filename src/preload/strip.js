'use strict';
// The only preload in the product: for the desktop's own strips (app://desk/), never for a deployment's page.
// It exposes three calls, never ipcRenderer itself.
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'app:' && location.host === 'desk') {
  contextBridge.exposeInMainWorld('desk', {
    info: () => ipcRenderer.invoke('desk:info'),
    act: (action, arg) => ipcRenderer.invoke('desk:act', String(action), arg === undefined ? null : JSON.parse(JSON.stringify(arg))),
    onUpdate: (callback) => { ipcRenderer.on('desk:update', () => callback()); },
  });
}
