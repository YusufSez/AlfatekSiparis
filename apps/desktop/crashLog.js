const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

let logsDir = null;
let initialized = false;

function pad(n) {
  return String(n).padStart(2, '0');
}

function todayFileName() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`;
}

function ensureLogsDir() {
  if (logsDir) return logsDir;
  // %APPDATA%/<productName>/logs on Windows (userData)
  logsDir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  return logsDir;
}

function runtimeMeta() {
  return {
    electronVersion: process.versions.electron || '',
    chromeVersion: process.versions.chrome || '',
    nodeVersion: process.versions.node || '',
    platform: `${process.platform} ${os.release()}`,
    appVersion: app.getVersion() || '',
  };
}

function formatLine(event, message, stack) {
  const meta = runtimeMeta();
  const payload = {
    timestamp: new Date().toISOString(),
    event: String(event || 'unknown'),
    message: String(message || ''),
    stack: stack ? String(stack) : '',
    electronVersion: meta.electronVersion,
    chromeVersion: meta.chromeVersion,
    nodeVersion: meta.nodeVersion,
    platform: meta.platform,
    appVersion: meta.appVersion,
  };
  return `${JSON.stringify(payload)}\n`;
}

function appendLog(event, message, stack) {
  try {
    const dir = ensureLogsDir();
    const file = path.join(dir, todayFileName());
    fs.appendFileSync(file, formatLine(event, message, stack), 'utf8');
  } catch (err) {
    // Never throw from logger — keep console behavior unchanged
    try {
      console.warn('[desktop][crash-log] write failed', err?.message || err);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Register crash / gone handlers. Log only — do not quit or alter exit behavior.
 */
function initCrashLogging() {
  if (initialized) return;
  initialized = true;

  try {
    ensureLogsDir();
  } catch (err) {
    console.warn('[desktop][crash-log] mkdir failed', err?.message || err);
  }

  process.on('uncaughtException', (err) => {
    appendLog(
      'uncaughtException',
      err?.message || String(err),
      err?.stack || ''
    );
  });

  process.on('unhandledRejection', (reason) => {
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : JSON.stringify(reason);
    const stack = reason instanceof Error ? reason.stack || '' : '';
    appendLog('unhandledRejection', message, stack);
  });

  app.on('render-process-gone', (_event, _webContents, details) => {
    appendLog(
      'render-process-gone',
      details ? JSON.stringify(details) : 'render process gone',
      ''
    );
  });

  app.on('child-process-gone', (_event, details) => {
    appendLog(
      'child-process-gone',
      details ? JSON.stringify(details) : 'child process gone',
      ''
    );
  });

  // Legacy alias still emitted on some Electron builds
  app.on('gpu-process-crashed', (_event, killed) => {
    appendLog(
      'gpu-process-crashed',
      killed ? 'GPU process crashed (killed=true)' : 'GPU process crashed',
      ''
    );
  });
}

function logStartup({ startUrl } = {}) {
  const meta = runtimeMeta();
  appendLog(
    'startup',
    JSON.stringify({
      desktopStartUrl: startUrl || '',
      electronVersion: meta.electronVersion,
      windowsVersion: `${os.type()} ${os.release()}`,
      appVersion: meta.appVersion,
      platform: meta.platform,
      chromeVersion: meta.chromeVersion,
      nodeVersion: meta.nodeVersion,
    }),
    ''
  );
}

module.exports = {
  initCrashLogging,
  logStartup,
  ensureLogsDir,
  appendLog,
};
