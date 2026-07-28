export function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  Object.assign(err, extra);
  return err;
}

const DEFAULT_USER_MESSAGE = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';

const STATUS_USER_MESSAGE = {
  400: 'Bu işlem şu anda gerçekleştirilemiyor.',
  401: 'Oturumunuz sona ermiş olabilir.',
  403: 'Bu işlem için yetkiniz yok.',
  404: 'İstenen kayıt bulunamadı.',
  409: 'Bu işlem çakışma nedeniyle tamamlanamadı.',
  429: 'Lütfen tekrar çağırmadan önce birkaç saniye bekleyin.',
  500: DEFAULT_USER_MESSAGE,
  502: 'Sunucuya ulaşılamadı.',
  503: 'Servis şu anda kullanılamıyor. Lütfen tekrar deneyin.',
};

/** True when message looks like a safe, intentional Turkish user-facing string. */
function isSafeUserMessage(message) {
  if (!message || typeof message !== 'string') return false;
  const msg = message.trim();
  if (msg.length < 3 || msg.length > 220) return false;
  if (/^(TypeError|ReferenceError|SyntaxError|Error):/i.test(msg)) return false;
  if (/\b(is not iterable|Cannot read propert|Failed to fetch|Network Error|Unexpected|ECONNREFUSED|ENOTFOUND)\b/i.test(msg)) {
    return false;
  }
  if (/at\s+\S+\s+\(/.test(msg) || msg.includes('\n')) return false;
  // Prefer Turkish / existing product copy (includes ASCII Turkish messages we already use)
  if (/[çğıöşüÇĞİÖŞÜ]/.test(msg)) return true;
  if (
    /^(Geçersiz|Yetkisiz|Sipariş|Oturum|Menü|Kullanıcı|Ofis|Bu |Lütfen|Aktif|Sadece|Henüz|Diğer|Push|Bildirim)/i.test(
      msg
    )
  ) {
    return true;
  }
  return false;
}

/** Map internal/technical errors to a Turkish client message. Logs keep English. */
export function toUserFacingErrorMessage(err, status = 500) {
  const raw = typeof err === 'string' ? err : err?.message;
  if (status >= 500) return DEFAULT_USER_MESSAGE;
  if (isSafeUserMessage(raw)) return raw.trim();
  return STATUS_USER_MESSAGE[status] || DEFAULT_USER_MESSAGE;
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'error',
        message: err.message,
        requestId: req.requestId,
        stack: err.stack,
      })
    );
  } else if (process.env.NODE_ENV !== 'production' && !isSafeUserMessage(err.message)) {
    console.warn(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: 'warn',
        message: 'non_user_facing_client_error',
        detail: err.message,
        status,
        requestId: req.requestId,
      })
    );
  }

  res.status(status).json({
    error: toUserFacingErrorMessage(err, status),
    requestId: req.requestId,
    ...(err.session ? { session: err.session } : {}),
  });
}
