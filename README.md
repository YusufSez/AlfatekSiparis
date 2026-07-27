# Ofis Sipariş

Teknik / Operasyon ofisleri için toplu içecek siparişi + mutfak paneli.

**Stack:** React PWA (Vite) · Express (modüler) · Prisma/SQLite · Socket.io · State Machine

---

## Kurulum

```bash
npm install
cp .env.example .env   # JWT_SECRET, DATABASE_URL, CORS_ORIGIN
npm run db:setup       # migrate deploy + seed
npm run dev:api        # http://localhost:4000
npm run dev:web        # http://localhost:5173
```

Demo kullanıcılar (şifre `123456`): `admin`, `mutfak`, `yusuf`, `ahmet`, `mehmet`, `murat`, `veli`

Girişte **Beni hatırla** (varsayılan açık) → 7 gün JWT; kapalıysa `sessionStorage` + 1 gün token.

---

## Mimari

```
Controller → Domain → Repository
PresenceService → MemoryPresenceProvider
NotificationService → SocketAdapter (+ genişletilebilir)
State Machine → session / ticket transitions
SessionEvent + AuditLog + requestId
```

Mevcut mimari korunur: Express, React PWA, Prisma, Socket.io, State Machine, SessionEvent, NotificationService, PresenceService, Repository/Domain.

### Klasör yapısı

```
apps/
  api/
    prisma/           schema + migrations + seed
    scripts/          backup.js, restore.js
    src/
      common/         auth, db, metrics, stateMachine, openapi…
      modules/        auth, orders, kitchen, admin, menu, notifications, announcements, presence, system
      realtime/       socket.io
    tests/            Vitest + Supertest
  web/
    src/pages/        Office, Kitchen, Admin, Login
    src/components/   SearchResults, LoadStates, …
bruno/                API örnekleri
backups/              SQLite yedekleri
docker-compose.yml          development
docker-compose.prod.yml     production
Dockerfile                  multi-stage (api + web)
```

---

## API

| Endpoint | Açıklama |
| -------- | -------- |
| `GET /health` | DB + socket durumu, uptime |
| `GET /version` | sürüm, env, node, db tipi |
| `GET /metrics` | Prometheus metrikleri |
| `POST /auth/login` | `remember` opsiyonel |
| `GET /auth/me` | JWT doğrulama |
| Sessions | aç / line / leave / confirm / events / presence |
| Kitchen | tickets list + status patch |
| Admin | offices, users, menu, settings, logs, dashboard, search |
| Announcements | active + admin CRUD |
| Notifications | list + read-all |

Swagger UI: `GET /docs` — **yalnızca development** (`NODE_ENV !== production`).

Bruno: `bruno/health-login.bru`

---

## Socket eventleri

| Event | Kim yayınlar | Kim dinler |
| ----- | ------------ | ---------- |
| `session:opened` | API | Office |
| `session:updated` | API | Office |
| `session:sent` / `session:closed` | API | Office |
| `kitchen:new_ticket` | API | Kitchen / Admin |
| `kitchen:updated` | API | Kitchen / Office / Admin |
| `presence:update` | API | Office / Admin |
| `notification:new` | API | User |
| `announcement:updated` | API | Office / Kitchen / Admin |
| `connected` | API | Client |

---

## Environment Variables

| Değişken | Zorunlu | Açıklama |
| -------- | ------- | -------- |
| `JWT_SECRET` | Prod: **evet** | Güçlü secret; prod’da zayıf/varsayılan değerlerle boot reddedilir |
| `DATABASE_URL` | evet | Örn. `file:./dev.db` |
| `CORS_ORIGIN` | önerilir | Örn. `http://localhost:5173` |
| `PORT` | hayır | Varsayılan `4000` |
| `NODE_ENV` | prod | `production` |
| `GIT_COMMIT` / `BUILD_DATE` | hayır | `/version` için |
| `VITE_API_URL` | web build | Production API URL |

---

## Migration

`db push` kaldırıldı. Schema değişiklikleri migration ile ilerler.

**Development**

```bash
npm run db:migrate:dev -w apps/api
# veya
cd apps/api && npx prisma migrate dev
```

**Production / CI**

```bash
npm run db:migrate
# prisma migrate deploy && prisma generate
```

İlk kurulum + seed:

```bash
npm run db:setup
```

Mevcut `db push` ile oluşmuş bir SQLite için (bir kez):

```bash
cd apps/api
npx prisma migrate resolve --applied 20260727100000_init
```

---

## Docker

### Development

```bash
docker compose up
```

### Production

`.env` içinde güçlü `JWT_SECRET` tanımlayın:

```bash
export JWT_SECRET='uzun-rastgele-secret'
export CORS_ORIGIN='https://siparis.ornek.com'
export VITE_API_URL='https://api.siparis.ornek.com'

docker compose -f docker-compose.prod.yml up -d --build
```

- Multi-stage `Dockerfile`: `api` (Node) + `web` (nginx)
- Production image: `NODE_ENV=production`, migrate deploy on start
- Development compose seed kullanır; production compose seed çalıştırmaz

---

## Production Deployment

1. Güçlü `JWT_SECRET` (zorunlu)
2. `CORS_ORIGIN` gerçek origin
3. HTTPS (PWA)
4. `npm run db:migrate` veya compose start
5. Seed’i production’da çalıştırmayın (demo şifreler)
6. `/docs` kapalı (production)
7. `/health`, `/version`, `/metrics` izleme
8. Tek API instance veya ileride Redis presence/adapter

---

## Backup / Restore

```bash
npm run backup
# → backups/backup-YYYY-MM-DD-HH-mm.db

npm run restore -- backup-2026-07-27-10-00.db
# veya mutlak yol
npm run restore -- C:\path\to\backup.db
```

Provider arayüzü modülerdir:

- `SqliteBackupProvider` / `SqliteRestoreProvider`
- `PostgresBackupProvider` / `PostgresRestoreProvider` (stub — `pg_dump` / `pg_restore` ile genişletilir)

Restore öncesi mevcut DB `.pre-restore-<ts>` olarak yedeklenir.

---

## Monitoring

| Endpoint | Format |
| -------- | ------ |
| `/health` | JSON — database, socket, uptime |
| `/version` | JSON — version, env, node, db |
| `/metrics` | Prometheus text |

Metrikler: `app_uptime_seconds`, `app_active_sessions`, `app_online_users`, `app_today_orders`, `app_today_tickets`, memory, CPU, `nodejs_eventloop_delay_mean_ms`, `http_requests_total`, `http_response_time_avg_ms`.

---

## Testing

```bash
npm test
npm run test:coverage
```

Vitest + Supertest. Coverage: `apps/api/coverage/`.

Kapsanan alanlar: auth, state machine, session (açma/çift/line/confirm/timeout/race), kitchen + socket events, NotificationService, Presence (multi-tab).

---

## Roadmap

- Redis presence + Socket.IO adapter (multi-instance)
- PostgreSQL + pg backup/restore
- Category / stok
- Mail / Teams / Slack notification adapters
- NestJS (isteğe bağlı, mevcut mimariyi bozmadan)

---

## Production Checklist

- [ ] `JWT_SECRET` güçlü ve env’de
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGIN` doğru
- [ ] `prisma migrate deploy` çalıştı
- [ ] Seed production’da yok
- [ ] HTTPS + PWA
- [ ] `/docs` kapalı
- [ ] `/health` + `/metrics` izleniyor
- [ ] `npm run backup` cron
- [ ] `npm test` yeşil
- [ ] Tek process veya Redis planı
