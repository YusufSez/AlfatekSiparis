const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure bridge only — no Node APIs exposed to the page.
 * React/web sources are unchanged; page hooks call these from injected script.
 */
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
  notify: (payload) => {
    ipcRenderer.send('desktop:notify', payload || {});
  },
  attention: () => {
    ipcRenderer.send('desktop:attention');
  },
  getAutoLaunch: () => ipcRenderer.invoke('desktop:get-auto-launch'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('desktop:set-auto-launch', Boolean(enabled)),
});
