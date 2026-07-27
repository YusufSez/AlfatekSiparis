import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import { httpError } from './errors.js';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret';

export function signToken(user, { remember = true } = {}) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      officeId: user.officeId ?? null,
      name: user.name,
      username: user.username,
    },
    JWT_SECRET,
    { expiresIn: remember ? '7d' : '1d' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function authMiddleware(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(httpError(401, 'Yetkisiz'));
  }
  try {
    const payload = verifyToken(header.slice(7));
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { office: true },
    });
    if (!user || !user.active) {
      return next(httpError(401, 'Kullanıcı bulunamadı veya pasif'));
    }
    req.user = user;
    next();
  } catch {
    next(httpError(401, 'Geçersiz token'));
  }
}

export function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(httpError(403, 'Bu işlem için yetkiniz yok'));
    }
    next();
  };
}

export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    officeId: user.officeId,
    office: user.office
      ? { id: user.office.id, name: user.office.name, color: user.office.color }
      : null,
    active: user.active,
    createdAt: user.createdAt || null,
  };
}

export function clientMeta(req) {
  return {
    ip: req.ip || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
    requestId: req.requestId || null,
  };
}
