import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { httpError } from './errors.js';
import { logger } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** apps/api/uploads/avatars — independent of process.cwd() */
export const AVATARS_DIR = path.resolve(__dirname, '../../uploads/avatars');
export const AVATAR_PUBLIC_PREFIX = '/uploads/avatars';
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_BY_MAGIC = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const ALLOWED_UPLOAD_MIMES = new Set(Object.keys(ALLOWED_BY_MAGIC));

export function ensureAvatarsDir() {
  fs.mkdirSync(AVATARS_DIR, { recursive: true });
}

/** Detect image type from magic bytes — do not trust client MIME alone. */
export function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // PNG
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function isAllowedUploadMime(mime) {
  return ALLOWED_UPLOAD_MIMES.has(String(mime || '').toLowerCase());
}

/** Only delete files that live under our avatars directory. */
export function resolveAvatarDiskPath(avatarUrl) {
  if (!avatarUrl || typeof avatarUrl !== 'string') return null;
  if (!avatarUrl.startsWith(`${AVATAR_PUBLIC_PREFIX}/`)) return null;
  const name = path.basename(avatarUrl);
  if (!name || name !== avatarUrl.slice(AVATAR_PUBLIC_PREFIX.length + 1)) return null;
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return null;
  const full = path.resolve(AVATARS_DIR, name);
  if (!full.startsWith(AVATARS_DIR + path.sep) && full !== AVATARS_DIR) return null;
  return full;
}

export function deleteAvatarFile(avatarUrl) {
  const full = resolveAvatarDiskPath(avatarUrl);
  if (!full) return false;
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      return true;
    }
  } catch (err) {
    logger.warn('avatar.delete_failed', { path: full, message: err?.message });
  }
  return false;
}

/**
 * Validate buffer + declared mime, write unique file, return public URL.
 * @returns {{ avatarUrl: string, mime: string }}
 */
export function saveAvatarBuffer(userId, buffer, declaredMime) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw httpError(400, 'Geçersiz dosya.');
  }
  if (buffer.length > AVATAR_MAX_BYTES) {
    throw httpError(400, 'Dosya boyutu 5 MB sınırını aşıyor.');
  }

  const declared = String(declaredMime || '').toLowerCase();
  const normalizedDeclared = declared === 'image/jpg' ? 'image/jpeg' : declared;
  if (!isAllowedUploadMime(normalizedDeclared)) {
    throw httpError(400, 'Sadece JPG, PNG veya WEBP yükleyebilirsiniz.');
  }

  const detected = detectImageMime(buffer);
  if (!detected || !ALLOWED_BY_MAGIC[detected]) {
    throw httpError(400, 'Dosya geçerli bir görsel değil.');
  }
  if (detected !== normalizedDeclared) {
    throw httpError(400, 'Dosya türü doğrulanamadı.');
  }

  const ext = ALLOWED_BY_MAGIC[detected];
  const safeUser = String(userId || 'user').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'user';
  const filename = `avatar_${safeUser}_${crypto.randomBytes(12).toString('hex')}.${ext}`;
  ensureAvatarsDir();
  const full = path.join(AVATARS_DIR, filename);
  fs.writeFileSync(full, buffer);
  return {
    avatarUrl: `${AVATAR_PUBLIC_PREFIX}/${filename}`,
    mime: detected,
  };
}
