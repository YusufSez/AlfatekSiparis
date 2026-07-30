const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const DEV_URL = 'http://127.0.0.1:5173';

function readBakedStartUrl() {
  try {
    const cfg = require('./start-url.json');
    const url = String(cfg?.url || '').trim();
    return url || '';
  } catch {
    return '';
  }
}

function resolveStartUrl() {
  const fromEnv = String(process.env.DESKTOP_START_URL || '').trim();
  if (fromEnv) return fromEnv;
  if (!app.isPackaged) return DEV_URL;
  const baked = readBakedStartUrl();
  if (baked) return baked;
  console.error(
    '[desktop] Packaged build has no DESKTOP_START_URL. Rebuild with DESKTOP_START_URL set.'
  );
  return DEV_URL;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  const startUrl = resolveStartUrl();
  win.loadURL(startUrl).catch((err) => {
    console.error('[desktop] failed to load', startUrl, err?.message || err);
  });

  // Open http(s) links outside the app shell
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      /* ignore */
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      const allowed = new URL(startUrl);
      if (target.origin !== allowed.origin) {
        event.preventDefault();
        if (target.protocol === 'http:' || target.protocol === 'https:') {
          shell.openExternal(url);
        }
      }
    } catch {
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
