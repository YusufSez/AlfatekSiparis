import 'dotenv/config';
import http from 'http';
import os from 'os';
import { createApp } from './app.js';
import { createSocketServer } from './realtime/socket.js';
import { restoreSessionTimers } from './modules/orders/orders.domain.js';
import { logger } from './common/logger.js';
import { setSocketRuntime } from './common/runtime.js';

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || '0.0.0.0';
const jwtSecret = process.env.JWT_SECRET || 'local-dev-secret';

if (process.env.NODE_ENV === 'production') {
  if (
    !process.env.JWT_SECRET ||
    jwtSecret === 'local-dev-secret' ||
    jwtSecret === 'docker-dev-secret' ||
    jwtSecret === 'change-me-in-production'
  ) {
    logger.error('JWT_SECRET production için zorunlu ve güvenli olmalıdır');
    process.exit(1);
  }
} else if (!process.env.JWT_SECRET) {
  logger.warn('JWT_SECRET tanımlı değil; local-dev-secret kullanılıyor');
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family !== 'IPv4' || net.internal) continue;
      out.push(net.address);
    }
  }
  return out;
}

const app = createApp(corsOrigin);
const server = http.createServer(app);
const io = createSocketServer(server, corsOrigin);
setSocketRuntime(io);

async function start() {
  await restoreSessionTimers();
  server.listen(port, host, () => {
    logger.info(`API listening on ${host}:${port}`);
    logger.info(`Local   http://localhost:${port}`);
    for (const ip of lanAddresses()) {
      logger.info(`Network http://${ip}:${port}`);
    }
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`Swagger http://localhost:${port}/docs`);
    }
    logger.info(`Metrics http://localhost:${port}/metrics`);
  });
}

start().catch((err) => {
  logger.error(err.message, { stack: err.stack });
  process.exit(1);
});
