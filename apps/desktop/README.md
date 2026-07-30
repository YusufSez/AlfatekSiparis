# Desktop (Electron shell)

İnce Electron kabuğu — mevcut web uygulamasını masaüstünde açar. API / React / PWA değiştirilmez.

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

1. Deploy edilmiş SPA adresini ayarlayın (build sırasında `start-url.json` içine yazılır):

```bash
# Windows PowerShell
$env:DESKTOP_START_URL="https://your-production-web-url"
npm run desktop:dist
```

2. Çıktı: `apps/desktop/dist/`

Unpackaged dizin için: `npm run desktop:build` (aynı env gerekir).

## Notlar

- Tray, autostart, native bildirim, auto-update yok.
- Web `dist` pakete gömülmez; production URL kullanılır.
