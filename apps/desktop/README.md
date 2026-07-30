# Desktop (Electron shell)

İnce Electron kabuğu — mevcut web uygulamasını masaüstünde açar.  
Desteklenen platformlar: **Windows** ve **macOS**.

## Geliştirme

1. Repo kökünde API + Vite:

```bash
npm run dev
```

2. Başka bir terminalde:

```bash
npm run desktop:dev
```

Electron `http://127.0.0.1:5173` yükler (Vite hazır olana kadar bekler).

## Production paketleri

`desktop:dist` çalıştığı **host OS** için paket üretir.

### Windows (bu makine)

```powershell
$env:DESKTOP_START_URL="https://your-production-web-url"
npm run desktop:dist
# veya açık hedef:
npm run desktop:dist:win
```

Çıktı (`apps/desktop/dist/`):

- `Alfatek Ofis Sipariş Setup <version>.exe` (NSIS)
- `win-unpacked/` (portable dizin)

Unpackaged: `npm run desktop:build`

### macOS (Apple Silicon veya Intel Mac)

macOS üzerinde:

```bash
export DESKTOP_START_URL="https://your-production-web-url"
npm run desktop:dist
# veya:
npm run desktop:dist:mac
```

Çıktı (`apps/desktop/dist/`):

- `Alfatek Ofis Sipariş-<version>-arm64.dmg`
- `Alfatek Ofis Sipariş-<version>-x64.dmg`
- ilgili `.zip` arşivleri

> **Not:** Gerçek `.dmg` / `.app` üretimi **macOS host** gerektirir. Windows’tan macOS paketi çapraz derlenemez (electron-builder sınırlaması). Konfigürasyon hazırdır; aynı repo bir Mac’te `npm run desktop:dist` ile DMG üretir.

Notarization / Apple Developer imzası isteğe bağlıdır (Gatekeeper için Apple hesabı gerekir). İmzasız build kurulabilir ama ilk açılışta macOS uyarı gösterebilir.

## Ortak davranış (Windows + macOS)

- Tray / menu bar: Aç, Yenile, Otomatik başlat, Çıkış
- Pencere kapat (X) → tray’e gizle (process + Socket canlı)
- Tek instance
- Native bildirimler + tray dikkat (blink)
- Auto Launch (`app.setLoginItemSettings`)
- Crash logging → `userData/logs/YYYY-MM-DD.log`

## Profil — Masaüstü ayarları

Profildeki **"Masaüstü Uygulaması"** kartı **yalnızca Electron** içinde görünür (`window.desktop.isElectron`).

- Tarayıcı / PWA bu kartı görmez
- `getAutoLaunch()` / `setAutoLaunch()` — varsayılan açık

## İkonlar

| Kullanım | Kaynak |
|---|---|
| Pencere / tray (runtime) | `apps/web/public/favicon.ico` → `assets/app-icon.ico` |
| Builder (.ico / .icns) | `apps/web/public/pwa-512.png` → `build/icon.png` (≥256px) |
| Tray uyarı | `assets/tray-icon-alert.png` |

```bash
# Yenileme (her OS)
cp apps/web/public/favicon.ico apps/desktop/assets/app-icon.ico
cp apps/web/public/pwa-512.png apps/desktop/build/icon.png
```

## Güvenlik

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- IPC yalnızca `preload.js` üzerinden
