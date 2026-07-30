const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
  Notification,
  session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { initCrashLogging, logStartup } = require('./crashLog');

initCrashLogging();

const DEV_URL = 'http://127.0.0.1:5173';
const DEFAULT_PRODUCTION_URL = 'https://alfateksiparis-1.onrender.com';

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {Tray | null} */
let tray = null;
let isQuitting = false;
/** @type {ReturnType<typeof setInterval> | null} */
let trayBlinkTimer = null;
let trayAlertActive = false;

const SETTINGS_DEFAULTS = {
  openAtLogin: true,
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function readSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...SETTINGS_DEFAULTS, ...parsed };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

function writeSettings(partial) {
  const next = { ...readSettings(), ...partial };
  try {
    fs.writeFileSync(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.warn('[desktop] settings write failed', err?.message || err);
  }
  return next;
}

function usableHttpUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {
    /* ignore */
  }
  return '';
}

function readBakedStartUrl() {
  try {
    const cfg = require('./start-url.json');
    return usableHttpUrl(cfg?.url);
  } catch {
    return '';
  }
}

function resolveStartUrl() {
  const fromEnv = usableHttpUrl(process.env.DESKTOP_START_URL);
  if (fromEnv) return fromEnv;
  if (!app.isPackaged) return DEV_URL;
  const baked = readBakedStartUrl();
  if (baked) return baked;
  console.error(
    `[desktop] Packaged build has no start URL — using production fallback: ${DEFAULT_PRODUCTION_URL}`
  );
  return DEFAULT_PRODUCTION_URL;
}

function trayHintFlagPath() {
  return path.join(app.getPath('userData'), 'tray-hint-shown');
}

function hasShownTrayHint() {
  try {
    return fs.existsSync(trayHintFlagPath());
  } catch {
    return false;
  }
}

function markTrayHintShown() {
  try {
    fs.writeFileSync(trayHintFlagPath(), '1', 'utf8');
  } catch (err) {
    console.warn('[desktop] could not persist tray hint flag', err?.message || err);
  }
}

function loadTrayImage(fileName) {
  const iconPath = path.join(__dirname, 'assets', fileName);
  const image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) return image;
  console.warn('[desktop] tray icon missing or invalid:', iconPath);
  return nativeImage.createEmpty();
}

function resolveAppIcon() {
  const ico = loadTrayImage('app-icon.ico');
  if (!ico.isEmpty()) return ico;
  return loadTrayImage('tray-icon.png');
}

function resolveTrayIcon() {
  // Prefer shared favicon (.ico) on Windows tray; fall back to PNG placeholder
  const fromFavicon = loadTrayImage('app-icon.ico');
  if (!fromFavicon.isEmpty()) {
    const sized = fromFavicon.resize({ width: 16, height: 16 });
    return sized.isEmpty() ? fromFavicon : sized;
  }
  const png = loadTrayImage('tray-icon.png');
  if (!png.isEmpty()) return png;
  return nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAMElEQVRYhe3OMQEAAAjDMMC/52ECkg7W0UzN1gEAAAAAAAAAAAAAAAAAAAAA4G0B1vAAAdk5uG8AAAAASUVORK5CYII='
  );
}

function resolveTrayAlertIcon() {
  const png = loadTrayImage('tray-icon-alert.png');
  if (!png.isEmpty()) return png;
  return resolveTrayIcon();
}

function applyAutoLaunch(enabled) {
  const openAtLogin = Boolean(enabled);
  writeSettings({ openAtLogin });

  const settings = {
    openAtLogin,
    openAsHidden: false,
  };

  if (!app.isPackaged) {
    // Dev: point login item at electron.exe + this app entry
    settings.path = process.execPath;
    settings.args = [path.resolve(__dirname)];
  }

  app.setLoginItemSettings(settings);
  return openAtLogin;
}

function syncAutoLaunchFromSettings() {
  const { openAtLogin } = readSettings();
  applyAutoLaunch(openAtLogin);
  return openAtLogin;
}

function stopTrayAttention() {
  trayAlertActive = false;
  if (trayBlinkTimer) {
    clearInterval(trayBlinkTimer);
    trayBlinkTimer = null;
  }
  if (tray && !tray.isDestroyed?.()) {
    try {
      tray.setImage(resolveTrayIcon());
      tray.setToolTip('Alfatek Ofis Sipariş');
    } catch {
      /* ignore */
    }
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.flashFrame(false);
  }
}

function startTrayAttention() {
  if (!tray) return;
  trayAlertActive = true;
  const normal = resolveTrayIcon();
  const alert = resolveTrayAlertIcon();
  let flip = false;
  if (trayBlinkTimer) clearInterval(trayBlinkTimer);
  tray.setToolTip('Alfatek Ofis Sipariş — yeni bildirim');
  trayBlinkTimer = setInterval(() => {
    if (!tray || !trayAlertActive) return;
    flip = !flip;
    try {
      tray.setImage(flip ? alert : normal);
    } catch {
      /* ignore */
    }
  }, 600);

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.flashFrame(true);
  }
}

function showMainWindow() {
  stopTrayAttention();
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.hide();

  if (hasShownTrayHint()) return;

  if (process.platform === 'win32' && tray) {
    try {
      tray.displayBalloon({
        title: 'Alfatek Ofis Sipariş',
        content: 'Alfatek arka planda çalışmaya devam ediyor.',
        iconType: 'info',
      });
    } catch (err) {
      console.warn('[desktop] tray balloon failed', err?.message || err);
    }
    markTrayHintShown();
  } else if (process.platform === 'darwin' && Notification.isSupported()) {
    // Windows balloon is win32-only; macOS uses a one-time native notification.
    try {
      const n = new Notification({
        title: 'Alfatek Ofis Sipariş',
        body: 'Alfatek arka planda çalışmaya devam ediyor.',
        silent: true,
      });
      n.show();
    } catch (err) {
      console.warn('[desktop] mac hide hint failed', err?.message || err);
    }
    markTrayHintShown();
  }
}

function quitApp() {
  isQuitting = true;
  stopTrayAttention();
  app.quit();
}

function autoLaunchMenuLabel() {
  return process.platform === 'darwin'
    ? 'Açılışta otomatik başlat'
    : 'Windows açıldığında otomatik başlat';
}

function buildTrayMenu() {
  const { openAtLogin } = readSettings();
  return Menu.buildFromTemplate([
    {
      label: 'Aç',
      click: () => showMainWindow(),
    },
    {
      label: 'Yenile',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      },
    },
    { type: 'separator' },
    {
      label: autoLaunchMenuLabel(),
      type: 'checkbox',
      checked: openAtLogin,
      click: (item) => {
        applyAutoLaunch(item.checked);
        if (tray) tray.setContextMenu(buildTrayMenu());
      },
    },
    { type: 'separator' },
    {
      label: 'Çıkış',
      click: () => quitApp(),
    },
  ]);
}

function createTray() {
  if (tray) return tray;

  tray = new Tray(resolveTrayIcon());
  tray.setToolTip('Alfatek Ofis Sipariş');
  tray.setContextMenu(buildTrayMenu());

  // Windows: double-click restores (unchanged)
  tray.on('double-click', () => {
    showMainWindow();
  });

  // macOS menu bar: single click restores (double-click is unreliable on darwin)
  if (process.platform === 'darwin') {
    tray.on('click', () => {
      showMainWindow();
    });
  }

  return tray;
}

function showNativeNotification({ title, body, tag } = {}) {
  if (!Notification.isSupported()) {
    startTrayAttention();
    return;
  }

  const n = new Notification({
    title: title || 'Alfatek',
    body: body || '',
    silent: false,
  });

  n.on('click', () => {
    showMainWindow();
  });

  n.show();
  startTrayAttention();

  // tag reserved for future dedupe
  void tag;
}

function installPageHooks(win) {
  // Runs in the page world (contextIsolation-safe via exposed bridge).
  const script = `
    (function () {
      if (window.__alfatekDesktopHooksInstalled) return;
      window.__alfatekDesktopHooksInstalled = true;

      var DesktopNotify = window.desktop && window.desktop.notify;
      var DesktopAttention = window.desktop && window.desktop.attention;

      if (typeof DesktopNotify === 'function') {
        var NativeNotification = window.Notification;
        window.Notification = function (title, options) {
          options = options || {};
          try {
            DesktopNotify({
              title: String(title || ''),
              body: String(options.body || ''),
              tag: options.tag ? String(options.tag) : ''
            });
          } catch (e) {}
          return {
            close: function () {},
            addEventListener: function () {},
            removeEventListener: function () {},
            onclick: null,
            onshow: null,
            onerror: null,
            onclose: null
          };
        };
        window.Notification.permission = 'granted';
        window.Notification.requestPermission = function () {
          return Promise.resolve('granted');
        };
        if (NativeNotification) {
          window.Notification.maxActions = NativeNotification.maxActions;
        }
      }

      function watchToasts() {
        var root = document.querySelector('.toast-stack') || document.body;
        if (!root || typeof MutationObserver === 'undefined') return;
        var obs = new MutationObserver(function (mutations) {
          if (document.visibilityState === 'visible' && document.hasFocus && document.hasFocus()) {
            return;
          }
          for (var i = 0; i < mutations.length; i++) {
            if (mutations[i].addedNodes && mutations[i].addedNodes.length) {
              try { if (DesktopAttention) DesktopAttention(); } catch (e) {}
              try {
                if (DesktopNotify && document.visibilityState !== 'visible') {
                  var node = mutations[i].addedNodes[0];
                  var text = (node && node.textContent) ? String(node.textContent).trim() : '';
                  if (text) {
                    DesktopNotify({ title: 'Alfatek', body: text.slice(0, 180), tag: 'toast' });
                  }
                }
              } catch (e2) {}
              break;
            }
          }
        });
        obs.observe(root, { childList: true, subtree: true });
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', watchToasts);
      } else {
        watchToasts();
      }
    })();
  `;

  win.webContents
    .executeJavaScript(script, true)
    .catch((err) => console.warn('[desktop] page hooks failed', err?.message || err));
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow();
    return mainWindow;
  }

  const appIcon = resolveAppIcon();
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    ...(appIcon && !appIcon.isEmpty() ? { icon: appIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = win;

  win.once('ready-to-show', () => win.show());

  const startUrl = resolveStartUrl();
  win.loadURL(startUrl).catch((err) => {
    console.error('[desktop] failed to load', startUrl, err?.message || err);
  });

  win.webContents.on('did-finish-load', () => {
    installPageHooks(win);
  });

  win.on('focus', () => {
    stopTrayAttention();
  });

  win.on('show', () => {
    stopTrayAttention();
  });

  // X / taskbar close → hide to tray (keep process + page alive for sockets)
  win.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideToTray();
  });

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

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

  return win;
}

function registerIpc() {
  ipcMain.handle('desktop:get-auto-launch', () => readSettings().openAtLogin);

  ipcMain.handle('desktop:set-auto-launch', (_event, enabled) => {
    const next = applyAutoLaunch(enabled);
    if (tray) tray.setContextMenu(buildTrayMenu());
    return next;
  });

  ipcMain.on('desktop:notify', (_event, payload) => {
    showNativeNotification(payload || {});
  });

  ipcMain.on('desktop:attention', () => {
    startTrayAttention();
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });

  app.whenReady().then(() => {
    logStartup({ startUrl: resolveStartUrl() });

    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      if (permission === 'notifications') {
        callback(true);
        return;
      }
      callback(false);
    });

    registerIpc();
    syncAutoLaunchFromSettings();
    createTray();
    createWindow();

    app.on('activate', () => {
      showMainWindow();
    });
  });

  app.on('window-all-closed', () => {
    /* tray owns lifetime on Windows */
  });

  app.on('before-quit', () => {
    isQuitting = true;
    stopTrayAttention();
  });
}
