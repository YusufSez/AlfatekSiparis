import jwt from 'jsonwebtoken';
import { prisma } from './db.js';
import { httpError } from './errors.js';
import {
  DEV_JWT_FALLBACK,
  WEAK_JWT_SECRETS,
  assessJwtSecretStrength,
} from './jwtSecret.js';

export function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const assessment = assessJwtSecretStrength(secret);
    if (!assessment.ok) {
      throw new Error(
        assessment.reason || 'JWT_SECRET production için zorunlu ve güvenli olmalıdır'
      );
    }
    return secret;
  }

  if (!secret) return DEV_JWT_FALLBACK;
  return secret;
}

export function signToken(user, { remember = true } = {}) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      officeId: user.officeId ?? null,
      name: user.name,
      username: user.username,
      tv: user.tokenVersion ?? 0,
    },
    resolveJwtSecret(),
    { expiresIn: remember ? '7d' : '1d', algorithm: 'HS256' }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, resolveJwtSecret(), { algorithms: ['HS256'] });
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
    if (!user || !user.active || user.deletedAt) {
      return next(httpError(401, 'Kullanıcı bulunamadı veya pasif'));
    }
    const tokenTv = payload.tv ?? 0;
    if (tokenTv !== (user.tokenVersion ?? 0)) {
      return next(httpError(401, 'Oturum geçersiz — tekrar giriş yapın'));
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

/** Block app APIs until the user completes a required password change. */
export function requirePasswordChanged(req, _res, next) {
  if (req.user?.mustChangePassword) {
    return next(httpError(403, 'Önce şifrenizi değiştirmelisiniz'));
  }
  next();
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
    avatarUrl: user.avatarUrl || null,
    active: user.active,
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt || null,
  };
}

export function clientMeta(req) {
  return {
    ip: req.ip || null,
    userAgent: req.headers['user-agent'] || null,
    requestId: req.requestId || null,
  };
}

export { WEAK_JWT_SECRETS, assessJwtSecretStrength };
