/**
 * Electron desktop bridge helpers.
 * Only trust window.desktop from preload contextBridge — never userAgent.
 */

export function getDesktopBridge() {
  if (typeof window === 'undefined') return null;
  const bridge = window.desktop;
  if (!bridge || bridge.isElectron !== true) return null;
  return bridge;
}

export function isElectronDesktop() {
  return Boolean(getDesktopBridge());
}
