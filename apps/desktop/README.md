# Desktop (Electron shell)

İnce Electron kabuğu — mevcut web uygulamasını masaüstünde açar.

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

## Production installer

```powershell
$env:DESKTOP_START_URL="https://your-production-web-url"
npm run desktop:dist
```

Çıktı: `apps/desktop/dist/`

Unpackaged: `npm run desktop:build`

## Profil — Masaüstü ayarları

Profil sayfasındaki **"Masaüstü Uygulaması"** kartı **yalnızca Electron** içinde görünür.

- Tespit: `window.desktop.isElectron` (preload contextBridge) — userAgent kullanılmaz
- Tarayıcı / Chrome / Edge / Safari / Android PWA / iOS PWA bu kartı **görmez**
- Ayar: **Windows açıldığında otomatik başlat** → `getAutoLaunch()` / `setAutoLaunch()`
- Varsayılan: **açık**
- Aynı tercih tray menü checkbox ile de yönetilebilir

## Tray

- **X** → gizle (process + Socket canlı)
- Sağ tık: Aç / Yenile / Otomatik başlat / Çıkış
- Çift tık → pencereyi göster
- İlk gizlemede bir kez balon ipucu
- Yeni bildirimde tray ikonu yanıp söner

## İkonlar

Yeni tasarım üretilmez; projedeki mevcut asset’ler kullanılır.

| Kullanım | Kaynak |
|---|---|
| Pencere / görev çubuğu / tray (runtime) | `apps/web/public/favicon.ico` → `apps/desktop/assets/app-icon.ico` |
| NSIS / exe / masaüstü & başlat kısayolları | `apps/web/public/pwa-512.png` → `apps/desktop/build/icon.png` (≥256px zorunlu; favicon 48×48) |
| Tray uyarı blink | `apps/desktop/assets/tray-icon-alert.png` |

Yenileme:

```powershell
Copy-Item -Force apps\web\public\favicon.ico apps\desktop\assets\app-icon.ico
Copy-Item -Force apps\web\public\pwa-512.png apps\desktop\build\icon.png
```

## Güvenlik

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- IPC yalnızca `preload.js` üzerinden
