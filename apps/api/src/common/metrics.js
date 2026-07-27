import { monitorEventLoopDelay } from 'node:perf_hooks';
import { prisma } from './db.js';
import { presenceService } from '../modules/presence/presence.service.js';
import { startedAt } from './runtime.js';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

const stats = {
  requestCount: 0,
  responseTimeSumMs: 0,
  responseTimeCount: 0,
};

export function metricsMiddleware(req, res, next) {
  if (req.path === '/metrics') return next();
  const start = process.hrtime.bigint();
  stats.requestCount += 1;
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    stats.responseTimeSumMs += ms;
    stats.responseTimeCount += 1;
  });
  next();
}

function gauge(name, value, help) {
  return `# HELP ${name} ${help}\n# TYPE ${name} gauge\n${name} ${value}\n`;
}

function counter(name, value, help) {
  return `# HELP ${name} ${help}\n# TYPE ${name} counter\n${name} ${value}\n`;
}

export async function renderPrometheusMetrics() {
  const mem = process.memoryUsage();
  const cpu = process.cpuUsage();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [activeSessions, todayOrders, todayTickets, offices] = await Promise.all([
    prisma.orderSession.count({ where: { status: 'collecting' } }),
    prisma.orderSession.count({
      where: { createdAt: { gte: today }, status: { in: ['sent', 'closed'] } },
    }),
    prisma.kitchenTicket.count({ where: { createdAt: { gte: today } } }),
    prisma.office.findMany({ select: { id: true } }),
  ]);

  let onlineUsers = 0;
  for (const o of offices) {
    onlineUsers += (await presenceService.listOnline(o.id)).length;
  }

  const avgResponse =
    stats.responseTimeCount === 0
      ? 0
      : stats.responseTimeSumMs / stats.responseTimeCount;

  const eventLoopDelayMs = histogram.mean / 1e6;
  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);

  return [
    gauge('app_uptime_seconds', uptimeSec, 'Process uptime in seconds'),
    gauge('app_active_sessions', activeSessions, 'Collecting order sessions'),
    gauge('app_online_users', onlineUsers, 'Users currently online via socket'),
    gauge('app_today_orders', todayOrders, 'Orders created today (sent/closed)'),
    gauge('app_today_tickets', todayTickets, 'Kitchen tickets created today'),
    gauge('process_resident_memory_bytes', mem.rss, 'Resident set size'),
    gauge('process_heap_used_bytes', mem.heapUsed, 'Heap used bytes'),
    gauge('process_cpu_user_seconds_total', cpu.user / 1e6, 'CPU user time seconds'),
    gauge('process_cpu_system_seconds_total', cpu.system / 1e6, 'CPU system time seconds'),
    gauge('nodejs_eventloop_delay_mean_ms', eventLoopDelayMs, 'Mean event loop delay ms'),
    counter('http_requests_total', stats.requestCount, 'Total HTTP requests'),
    gauge('http_response_time_avg_ms', avgResponse, 'Average HTTP response time ms'),
  ].join('\n');
}
