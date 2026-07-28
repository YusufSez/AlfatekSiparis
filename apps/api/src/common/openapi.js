export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Ofis Sipariş API',
    version: '1.0.0',
    description: 'Ofis toplu sipariş ve mutfak paneli API',
  },
  servers: [{ url: 'http://localhost:4000' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        security: [],
        summary: 'Health check (API, DB, Socket)',
        responses: {
          200: { description: 'status ok' },
          503: { description: 'degraded' },
        },
      },
    },
    '/version': {
      get: {
        security: [],
        summary: 'Uygulama sürüm bilgisi',
        responses: { 200: { description: 'version meta' } },
      },
    },
    '/auth/login': {
      post: {
        security: [],
        summary: 'Giriş (remember: 7d / 1d)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' },
                  remember: { type: 'boolean', default: true },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'token + user + expiresIn' } },
      },
    },
    '/auth/me': { get: { summary: 'Mevcut kullanıcı', responses: { 200: { description: 'OK' } } } },
    '/sessions/active': {
      get: { summary: 'Aktif ofis siparişi', responses: { 200: { description: 'OK' } } },
    },
    '/sessions': {
      post: { summary: 'Sipariş oturumu aç', responses: { 201: { description: 'Created' } } },
    },
    '/sessions/{id}/lines': {
      post: { summary: 'Kalem ekle/güncelle', responses: { 200: { description: 'OK' } } },
    },
    '/sessions/{id}/leave': {
      post: { summary: 'Siparişten çık', responses: { 200: { description: 'OK' } } },
    },
    '/sessions/{id}/confirm': {
      post: { summary: 'Mutfağa gönder', responses: { 200: { description: 'OK' } } },
    },
    '/sessions/{id}/events': {
      get: { summary: 'Oturum zaman çizelgesi', responses: { 200: { description: 'OK' } } },
    },
    '/sessions/history': {
      get: {
        summary: 'Ofis geçmiş siparişleri (son ticketlar, max 20)',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 20, default: 20 },
          },
        ],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/kitchen/tickets': {
      get: { summary: 'Mutfak ticket listesi', responses: { 200: { description: 'OK' } } },
    },
    '/kitchen/tickets/{id}': {
      patch: { summary: 'Ticket durumu güncelle', responses: { 200: { description: 'OK' } } },
    },
    '/kitchen/tickets/{id}/unavailable': {
      post: {
        summary: 'Eksik ürün bildir (mutfak → ofis)',
        responses: { 200: { description: 'OK' } },
      },
    },
    '/notifications': {
      get: { summary: 'Bildirim merkezi', responses: { 200: { description: 'OK' } } },
    },
    '/announcements/active': {
      get: { summary: 'Aktif duyurular', responses: { 200: { description: 'OK' } } },
    },
    '/announcements': {
      get: { summary: 'Tüm duyurular (admin)', responses: { 200: { description: 'OK' } } },
      post: { summary: 'Duyuru oluştur (admin)', responses: { 201: { description: 'Created' } } },
    },
    '/admin/dashboard': {
      get: { summary: 'Admin dashboard istatistikleri', responses: { 200: { description: 'OK' } } },
    },
    '/admin/search': {
      get: {
        summary: 'Global arama',
        parameters: [{ name: 'q', in: 'query', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Kategori bazlı sonuçlar' } },
      },
    },
    '/menu': { get: { summary: 'Aktif menü', responses: { 200: { description: 'OK' } } } },
  },
};
