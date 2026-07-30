# Desktop (Electron shell)

İnce Electron kabuğu — mevcut web uygulamasını masaüstünde açar. API / React / PWA kaynak koduna dokunulmaz.

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

## Masaüstü özellikleri

### Tray
- **X** → pencere gizlenir, process + sayfa (Socket) canlı kalır
- Sağ tık: **Aç** / **Yenile** / **Windows açıldığında otomatik başlat** / **Çıkış**
- Çift tık → pencereyi göster
- İlk gizlemede bir kez balon: *“Alfatek arka planda çalışmaya devam ediyor.”*
- Yeni bildirimde tray ikonu yanıp söner; pencere açılınca/odaklanınca durur

### Otomatik başlatma
- Varsayılan: **açık** (`app.setLoginItemSettings`)
- Tercih: tray menü checkbox (userData: `desktop-settings.json`)
- Not: Profil sayfası UI’si `apps/web`’e dokunulmadığı için tray üzerinden yönetilir; ileride `window.desktop.getAutoLaunch/setAutoLaunch` ile Profile’a bağlanabilir

### Native bildirim
- Sayfa `Notification` API’si Electron `Notification`’a yönlendirilir (preload + inject)
- Tıklanınca pencere öne gelir
- Push / Socket / NotificationCenter kodu değişmez

### Tek instance
- İkinci açılış mevcut pencereyi öne getirir

### Tray ikonları (placeholder)

| Dosya | Kullanım |
|---|---|
| `apps/desktop/assets/tray-icon.png` | Normal (32×32) |
| `apps/desktop/assets/tray-icon-alert.png` | Uyarı / blink |

Üretimde aynı yolları gerçek marka ikonlarıyla değiştirin.

## Güvenlik

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- IPC yalnızca `preload.js` üzerinden
