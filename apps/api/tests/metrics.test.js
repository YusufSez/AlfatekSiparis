import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import request from 'supertest';
import { getApp, resetDb } from './helpers.js';

describe('METRICS', () => {
  let app;

  beforeAll(() => {
    app = getApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  it('GET /metrics prometheus format', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('app_uptime_seconds');
    expect(res.text).toContain('app_active_sessions');
    expect(res.text).toContain('app_online_users');
    expect(res.text).toContain('app_today_orders');
    expect(res.text).toContain('app_today_tickets');
    expect(res.text).toContain('http_requests_total');
    expect(res.text).toContain('nodejs_eventloop_delay_mean_ms');
  });
});
