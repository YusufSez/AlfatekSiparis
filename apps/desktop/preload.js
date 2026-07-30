const { contextBridge } = require('electron');

/**
 * Minimal, safe bridge. React app does not need to call this —
 * exposed only so the shell can be detected later without Node access.
 */
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true,
});
