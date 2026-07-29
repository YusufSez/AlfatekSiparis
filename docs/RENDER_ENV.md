# Render Deploy — Environment Variables

Bu belge Render’da **ayrı API** ve **Web** servisleri için örnek env listesidir.
Uygulama kodu / Docker Compose davranışını değiştirmez.

Docker dosyaları:
- API: `Dockerfile.api` (context = repo root)
- Web: `Dockerfile.web` (context = repo root)

---

## 1) API servisi (Runtime)

Render → API Web Service → Environment

```bash
NODE_ENV=production

# JWT — güçlü rastgele (ör. openssl rand -hex 32)
JWT_SECRET=

# SQLite kalıcı disk yolu (Render Disk mount ile uyumlu tutun)
DATABASE_URL=file:./data/prod.db

# Frontend origin (trailing slash yok). Virgülle çoklu olabilir.
CORS_ORIGIN=https://YOUR-WEB.onrender.com

# Web Push — npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_EMAIL=mailto:admin@YOUR-DOMAIN

# Metrics scrape token (uzun, tahmin edilemez)
METRICS_TOKEN=

# Render reverse proxy arkasında önerilir
TRUST_PROXY=1
TRUST_PROXY_HOPS=1

# Tek kullanıcı / kendi telefonuna push testi: opener da bildirim alır
# (false = yalnız ofis peer’ları — varsayılan)
# NOTIFY_SELF_ON_OPEN=true

# Opsiyonel metadata
# GIT_COMMIT=
# BUILD_DATE=

# PORT Render tarafından verilir; elle set etmeyin (gerekmez)
```

### İlk admin bootstrap (tek seferlik)

Yalnızca `NODE_ENV=production` iken ve üç değişken **birlikte** tanımlıysa çalışır.
Mevcut bir admin varsa veya kullanıcı adı doluysa **yeniden oluşturmaz**.
Şifre loglara yazılmaz.

```bash
ADMIN_NAME=Sistem Yöneticisi
ADMIN_USERNAME=admin
ADMIN_PASSWORD=
```

Önerilen akış:

1. İlk deploy’da üç `ADMIN_*` değişkenini ekleyin (şifre ≥ 8 karakter, güçlü).
2. Servis ayağa kalkınca logda `admin.bootstrap_created` görünmeli.
3. Admin paneline giriş yapıp doğrulayın.
4. **`ADMIN_PASSWORD` (ve tercihen üç `ADMIN_*`) değerlerini Render’dan silin** — bir daha gerekmez; tekrar deploy güvenlidir.

Kısmi tanımlama (yalnızca biri set) production boot’u hata ile durdurur.

---

## 2) Web servisi (Build-time)

`VITE_*` değerleri **build sırasında** gömülür. Değişince Web servisini yeniden build edin.

Dockerfile Path: `Dockerfile.web`  
Build args / Environment:

```bash
VITE_API_URL=https://YOUR-API.onrender.com
VITE_VAPID_PUBLIC_KEY=
```

`VITE_VAPID_PUBLIC_KEY`, API’deki `VAPID_PUBLIC_KEY` ile **aynı** olmalıdır.

Opsiyonel:

```bash
# VITE_BUILD_ID=2026-07-29
```

---

## 3) Render’a eklemeyin

| Variable | Neden |
| -------- | ----- |
| `VITE_API_PORT` | Yalnızca local Vite DEV |
| `SESSION_DURATION_SEC` | Kullanılmıyor (süre DB ayarında) |
| `DOTENV_CONFIG_PATH` | Prod’da `.env.development` engeli; set etmeyin |
| Local `JWT_SECRET` / demo şifreler | Prod boot reddeder veya güvensiz |

---

## 4) Disk (SQLite)

API container’da `DATABASE_URL=file:./data/prod.db` kullanıyorsanız:

- Render **Persistent Disk** bağlayın (ör. mount: `/app/apps/api/prisma/data`)
- Dockerfile.api `WORKDIR` `/app/apps/api` ve `mkdir -p prisma/data` ile uyumludur
- Disk yoksa restart’ta veri kaybolur

---

## 5) Hızlı kontrol listesi

- [ ] API: `JWT_SECRET`, `CORS_ORIGIN`, VAPID pair, `METRICS_TOKEN`
- [ ] API: `TRUST_PROXY=1`
- [ ] API: kalıcı `DATABASE_URL` + disk
- [ ] İlk açılış: `ADMIN_NAME` / `ADMIN_USERNAME` / `ADMIN_PASSWORD`
- [ ] Giriş sonrası `ADMIN_*` kaldırıldı
- [ ] Web build: `VITE_API_URL` + `VITE_VAPID_PUBLIC_KEY`
- [ ] `CORS_ORIGIN` web URL’si ile eşleşiyor
