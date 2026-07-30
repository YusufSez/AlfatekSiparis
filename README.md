<p align="center">
  <img src="images/alfatek.png" alt="Alfatek" width="120" />
</p>

# Alfatek Sipariş Sistemi

Alfatek Ofis Sipariş Sistemi; ofis çalışanlarının toplu içecek siparişlerini gerçek zamanlı oluşturmasını, mutfak personelinin siparişleri yönetmesini ve yöneticilerin sistemi izlemesini sağlayan React PWA + Express tabanlı kurumsal sipariş uygulamasıdır.

| | |
| --- | --- |
| **Web (prod)** | Nginx üzerinden domain / HTTPS |
| **API** | `:4000` (reverse proxy arkası) |
| **CI** | [![CI](https://github.com/YusufSez/AlfatekSiparis/actions/workflows/ci.yml/badge.svg)](https://github.com/YusufSez/AlfatekSiparis/actions/workflows/ci.yml) |

---

# Teknoloji Stack

### Frontend

- React
- Vite
- PWA (`vite-plugin-pwa`)
- Socket.io Client

### Backend

- Node.js
- Express
- Socket.io

### Database

- PostgreSQL
- Prisma

### Deployment

- Docker
- Docker Compose
- Nginx
- SSL (Certbot / Let’s Encrypt)

---

# Gereksinimler

Sunucuda (VPS) olması gerekenler:

- Ubuntu 22.04+
- Docker
- Docker Compose (v2: `docker compose`)
- Git
- Açık portlar: **80**, **443** (ve geçici kurulum için isteğe bağlı **4000**)
- Domain adı (HTTPS / PWA / Web Push için önerilir)

### Docker kurulumu (Ubuntu örneği)

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
# Docker Engine + Compose plugin: https://docs.docker.com/engine/install/ubuntu/
sudo usermod -aG docker $USER
# Oturumu kapatıp yeniden açın
docker --version
docker compose version
```

---

# Proje Kurulumu

## 1. Repo klonlama

```bash
git clone https://github.com/YusufSez/AlfatekSiparis.git
cd AlfatekSiparis
```

> Private repo ise SSH veya kişisel erişim tokeni kullanın.

## 2. Environment oluşturma

```bash
cp .env.example .env
nano .env   # veya vim / code
```

**Kurallar:**

- Gerçek secret değerleri **repoya koyulmamalı**.
- Production değerleri **yalnızca sunucuda** (veya gizli CI secret’larında) tanımlanmalı.
- `.env` dosyası `.gitignore` içinde tutulmalıdır.

Production için en azından şunları ayarlayın:

```bash
# Örnek — domainlerinizi yazın
export JWT_SECRET="$(openssl rand -hex 32)"
export CORS_ORIGIN="https://siparis.ornek.com"
export VITE_API_URL="https://api.siparis.ornek.com"
# veya tek domain + reverse proxy ile:
# CORS_ORIGIN="https://siparis.ornek.com"
# VITE_API_URL="https://siparis.ornek.com/api"  # proxy yolunuza göre
```

`docker compose -f docker-compose.prod.yml` bu değişkenleri host ortamından / `.env` dosyasından okur.

---

# Environment Değişkenleri

`.env.example` özetidir. Production’da boş/placeholder bırakmayın.

### API

| Değişken | Zorunlu | Açıklama |
| -------- | ------- | -------- |
| `DATABASE_URL` | evet | **PostgreSQL** connection string (`postgresql://…`). Render Postgres Internal/External URL; genelde `?sslmode=require` gerekir |
| `JWT_SECRET` | **evet (prod)** | JWT imza anahtarı; zayıf değer production boot’u reddeder. Güçlü rastgele üretin |
| `PORT` | hayır | API portu (varsayılan `4000`) |
| `NODE_ENV` | prod | `production` olmalı |
| `HOST` | hayır | Bind adresi (varsayılan `0.0.0.0`) |
| `CORS_ORIGIN` | önerilir | İzinli frontend origin(ler); virgülle çoklu |

### Frontend (build-time)

| Değişken | Zorunlu | Açıklama |
| -------- | ------- | -------- |
| `VITE_API_URL` | **prod build: evet** | Tarayıcının konuşacağı absolute API URL (örn. `https://api.siparis.ornek.com`) |
| `VITE_VAPID_PUBLIC_KEY` | push için | Web Push aboneliği; `VAPID_PUBLIC_KEY` ile aynı olmalı |
| `VITE_API_PORT` | hayır | Yalnızca development otomatik API portu |

> `VITE_*` değişkenleri **image build sırasında** gömülür. Değiştirdikten sonra web imajını yeniden build edin:  
> `docker compose -f docker-compose.prod.yml up -d --build`

### Push (VAPID)

| Değişken | Zorunlu | Açıklama |
| -------- | ------- | -------- |
| `VAPID_PUBLIC_KEY` | push için | `npx web-push generate-vapid-keys` ile üretin |
| `VAPID_PRIVATE_KEY` | push için | Gizli; yalnızca API tarafında |
| `VAPID_EMAIL` | önerilir | Örn. `mailto:admin@ornek.com` |

```bash
npx web-push generate-vapid-keys
```

Üretilen public key’i hem API (`VAPID_PUBLIC_KEY`) hem frontend build (`VITE_VAPID_PUBLIC_KEY`) için kullanın.  
**Not:** Mevcut `docker-compose.prod.yml` VAPID env’lerini henüz geçirmiyorsa, compose dosyasına veya API container environment’ına eklemeniz gerekir; anahtarları mutlaka sunucuda tutun.

---

# Docker ile Çalıştırma

### Production

```bash
cd AlfatekSiparis

# Ortam değişkenlerini export edin veya proje kökünde .env kullanın
export JWT_SECRET='uzun-rastgele-secret'
export CORS_ORIGIN='https://siparis.ornek.com'
export VITE_API_URL='https://api.siparis.ornek.com'
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require'

docker compose -f docker-compose.prod.yml up -d --build
```

| Servis | Açıklama |
| ------ | -------- |
| `api` | Node + Prisma (`migrate deploy`) + Express (`:4000`), **PostgreSQL** |
| `web` | Multi-stage Vite build → Nginx static (`:80`) |

**PostgreSQL:** `DATABASE_URL` host ortamından / `.env` üzerinden verilir (Render Postgres veya harici managed DB). SQLite dosya volume’u yoktur.

### Kontrol

```bash
docker ps
docker compose -f docker-compose.prod.yml ps
```

### Log

```bash
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
```

### Durdur / yeniden başlat

```bash
docker compose -f docker-compose.prod.yml restart
docker compose -f docker-compose.prod.yml down
# Volume silmeden down: veri kalır
# Volume dahil silme (DİKKAT — DB gider): docker compose -f docker-compose.prod.yml down -v
```

### Health

```bash
curl -s http://127.0.0.1:4000/health
curl -s http://127.0.0.1:4000/version
```

---

# Database İşlemleri

Production **PostgreSQL + Prisma** kullanır (`DATABASE_URL=postgresql://…`).

Container açılışında otomatik:

```text
prisma migrate deploy → node src/index.js
```

### Migration

Prisma migration’ları PostgreSQL şemasına uygulanır:

```bash
npm run db:migrate -w apps/api
# veya çalışan API container içinde:
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### Seed (yalnızca geliştirme / ilk kurulum)

```bash
npm run db:seed -w apps/api
```

> **Uyarı:** Seed ve demo hesaplar production için uygun değildir. Production’da seed çalıştırmayın.
> İlk admin için `ADMIN_NAME` / `ADMIN_USERNAME` / `ADMIN_PASSWORD` bootstrap’ını kullanın
> (`NODE_ENV=production`, ayrıntılar: [docs/RENDER_ENV.md](docs/RENDER_ENV.md)).
> Bootstrap sonrası bu env değişkenlerini kaldırın.

### Yedek (PostgreSQL)

`pg_dump` / `psql` PATH’te olmalıdır.

```bash
npm run backup
# → backups/backup-YYYY-MM-DD-HH-mm.sql
npm run restore -- backup-YYYY-MM-DD-HH-mm.sql
```

Production’da yedekleri Render Postgres snapshot / harici `pg_dump` ile de alın.  
`npm run db:setup` veya `db:seed` production’da **çalıştırılmamalıdır** (tüm veriyi siler).

---

# Kullanıcılar

İlk kurulum sonrası roller:

| Rol | Ekran / yetki |
| --- | ------------- |
| **admin** | Yönetim paneli (ofis, kullanıcı, menü, ayarlar, loglar, dashboard) |
| **office_user** | Ofis sipariş oluşturma, katılma, mutfağa gönderme |
| **kitchen** | Mutfak ekranı, ticket durumları, eksik ürün bildirimi |

Development seed demo hesapları (yalnızca local):

| Kullanıcı | Rol | Şifre |
| --------- | --- | ----- |
| `admin` | Admin | `123456` |
| `mutfak` | Kitchen | `123456` |
| `yusuf` | Office User | `123456` |

> Production’da demo şifreleri **asla** bırakmayın.

---

# Build Kontrolü

Sunucuda veya CI’da image dışında doğrulama:

### Frontend

```bash
npm install
npm run build -w apps/web
```

### API

```bash
npm run build -w apps/api
# veya test:
npm test
```

Production imajları `Dockerfile` multi-stage ile build edilir; ayrı `npm run build` zorunlu değildir ama teslim öncesi doğrulama için önerilir.

---

# Reverse Proxy / SSL

`docker-compose.prod.yml` web’i host **:80**’e, API’yi **:4000**’e map eder. Gerçek domain + HTTPS için sunucuda (veya ayrı container’da) Nginx / Caddy reverse proxy kullanın.

### Nginx hedefleri

- **Frontend:** static / SPA → `web:80` veya `127.0.0.1:80`
- **API proxy:** `/` veya `api.` subdomain → `127.0.0.1:4000`
- **WebSocket:** Socket.io için upgrade header’ları

Örnek (host Nginx — tek domain, API `/api` altında değil, ayrı subdomain önerilir):

```nginx
# Frontend — siparis.ornek.com
server {
  listen 80;
  server_name siparis.ornek.com;
  location / {
    proxy_pass http://127.0.0.1:80;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

# API + Socket.io — api.siparis.ornek.com
server {
  listen 80;
  server_name api.siparis.ornek.com;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400;
  }
}
```

> Not: Compose `web` zaten 80’i kullanıyorsa host Nginx’i **443/başka port**’ta dinletin veya compose port map’ini `127.0.0.1:8080:80` yapıp dışarıyı host Nginx’e verin.

### SSL (Certbot)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d siparis.ornek.com -d api.siparis.ornek.com
sudo certbot renew --dry-run
```

HTTPS sonrası:

- `CORS_ORIGIN=https://siparis.ornek.com`
- `VITE_API_URL=https://api.siparis.ornek.com`
- Web imajını yeniden build edin

---

# Push Bildirim Sistemi

- Web Push API kullanılır.
- **HTTPS zorunludur** (localhost hariç).
- VAPID anahtarları production ortamında tanımlanmalıdır.
- Kullanıcı cihazları abonelik (`PushSubscription`) olarak API’de kaydedilir.
- Profil / bildirim ayarlarından kullanıcı izin verir.
- Service Worker (`sw.js`) arka planda push gösterir; uygulama açıkken duplicate azaltma mantığı vardır.

Kurulum özeti:

1. `npx web-push generate-vapid-keys`
2. API’ye `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL`
3. Web build’e `VITE_VAPID_PUBLIC_KEY`
4. HTTPS doğrula → tarayıcıda bildirim izni → test siparişi

---

# Deployment Sonrası Kontrol Listesi

- [ ] Domain açılıyor
- [ ] HTTPS aktif
- [ ] Frontend çalışıyor
- [ ] API cevap veriyor (`/health`, `/version`)
- [ ] PostgreSQL bağlantısı var (`DATABASE_URL`, API boot logları temiz)
- [ ] Prisma migration tamam (`migrate deploy` hata vermiyor)
- [ ] Admin giriş yapabiliyor
- [ ] Ofis sipariş oluşturabiliyor
- [ ] Mutfak siparişi görebiliyor
- [ ] Push bildirim çalışıyor (HTTPS + VAPID)
- [ ] PWA kurulabiliyor (HTTPS + manifest)
- [ ] `JWT_SECRET` güçlü ve unique
- [ ] Demo / seed kullanıcıları production’da yok veya şifreleri değiştirildi
- [ ] `.env` git’te yok
- [ ] Yedekleme planı var

---

# Güvenlik Notları

- `.env` dosyaları repoya gönderilmemeli.
- Secret anahtarları (`JWT_SECRET`, `VAPID_PRIVATE_KEY`) değiştirilmeden / örnek değerlerle kullanılmamalı.
- Postgres credentials / `DATABASE_URL` sızdırılmamalı; DB yalnızca API’nin erişebildiği private network’te olsun.
- Production’da debug / Swagger (`/docs`) kapalıdır.
- `NODE_ENV=production` kullanın.
- Güvenlik duvarında yalnızca 80/443 (ve SSH) açık tutun; API’yi mümkünse localhost / private network’te tutup reverse proxy ile yayınlayın.
- Düzenli yedek alın; restore prosedürünü bir kez test edin.

---

# Yerel Geliştirme (özet)

PostgreSQL gerekir (`docker compose up -d db` veya yerel Postgres).

```bash
npm install
cp .env.example .env
# DATABASE_URL=postgresql://alfatek:alfatek@127.0.0.1:5432/alfatek
docker compose up -d db
npm run db:setup   # migrate + seed — yalnızca local; production’da YASAK
npm run dev:api   # :4000
npm run dev:web   # :5173
```

> `db:setup` / `db:seed` tüm veriyi siler. Production veya paylaşılan Render DB’de asla çalıştırmayın.
> Production ilk admin: `ADMIN_*` bootstrap ([docs/RENDER_ENV.md](docs/RENDER_ENV.md)).

Docker development:

```bash
docker compose up
```

Detaylı telefon/LAN testi, API tablosu, socket eventleri ve monitoring için aşağıdaki bölümlere bakın.

---

## Özellikler

- Gerçek zamanlı sipariş yönetimi (Socket.io)
- React PWA (mobil kurulabilir)
- Ofis / mutfak / admin rolleri
- Ofis başına tek aktif sipariş
- Kitchen paneli (new → preparing → delivered)
- Admin dashboard, arama, duyurular, loglar
- Notification Center + Web Push
- Session timeline, presence
- State machine (session + ticket)
- Backup / restore (`pg_dump` / `psql`)
- Prometheus metrics (`/metrics`)
- Health & version endpointleri

---

## Sistem Mimarisi

```mermaid
flowchart TD
  B[Browser / PWA] --> R[React Web]
  R -->|HTTP REST| E[Express API]
  R -->|WebSocket| S[Socket.io]
  S --> E
  E --> D[Domain / Services]
  D --> P[Prisma]
  P --> DB[(PostgreSQL)]
  D --> SM[State Machine]
  D --> SE[SessionEvent / AuditLog]
  D --> NS[NotificationService]
  D --> PS[PresenceService]
```

```text
Controller → Domain → Repository
```

---

## Proje Yapısı

```text
order/
├── apps/
│   ├── api/          # Express + Prisma + Socket.io
│   └── web/          # React Vite PWA + nginx.conf
├── docker-compose.yml
├── docker-compose.prod.yml
├── Dockerfile
├── .env.example
└── README.md
```

---

## Sipariş Akışı (özet)

```text
Sipariş Aç → Katılım → Onay / Timeout → Kitchen
  → Hazırlanıyor → Teslim
```

---

## API (özet)

| Grup | Örnek |
| ---- | ----- |
| Auth | `POST /auth/login`, `GET /auth/me` |
| Sessions | `POST /sessions`, lines, confirm, events |
| Kitchen | `GET /kitchen/tickets`, `PATCH /kitchen/tickets/:id` |
| Notifications | `GET /notifications`, push subscribe |
| Admin | dashboard, offices, users, menu, logs |
| System | `GET /health`, `GET /version`, `GET /metrics` |

---

## Roadmap

| Sürüm | Hedef |
| ----- | ----- |
| **v1.1** | Redis Presence + Socket.IO adapter (multi-instance) |
| **v1.2** | Mail / Teams / Slack notification adapter’ları |
| **v2.0** | Category, Stock, gelişmiş Analytics |

---

## Lisans

Bu proje Alfatek şirket içi kullanımı için geliştirilmiştir.

**All Rights Reserved.**
