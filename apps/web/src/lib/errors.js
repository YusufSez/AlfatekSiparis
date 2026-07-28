const DEFAULT_MESSAGE = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';

const STATUS_MESSAGES = {
  400: 'Bu işlem şu anda gerçekleştirilemiyor.',
  401: 'Oturumunuz sona ermiş olabilir.',
  403: 'Bu işlem için yetkiniz yok.',
  404: 'İstenen kayıt bulunamadı.',
  408: 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.',
  409: 'Bu işlem çakışma nedeniyle tamamlanamadı.',
  422: 'Gönderilen bilgiler geçersiz.',
  429: 'Lütfen tekrar çağırmadan önce birkaç saniye bekleyin.',
  500: DEFAULT_MESSAGE,
  502: 'Sunucuya ulaşılamadı.',
  503: 'Servis şu anda kullanılamıyor. Lütfen tekrar deneyin.',
  504: 'Sunucu yanıt vermedi. Lütfen tekrar deneyin.',
};

const PATTERN_MESSAGES = [
  {
    test: /failed to fetch|network error|load failed|networkrequestfailed|err_network|econnrefused|enotfound|err_connection/i,
    message: 'Bağlantı kurulamadı.',
  },
  {
    test: /networkerror when attempting to fetch|the internet connection appears to be offline|offline/i,
    message: 'Sunucuya ulaşılamadı.',
  },
  {
    test: /timeout|timed out|aborted/i,
    message: 'İstek zaman aşımına uğradı. Lütfen tekrar deneyin.',
  },
  {
    test: /is not iterable|cannot read propert|undefined is not|null is not|unexpected token|json\.parse|syntaxerror/i,
    message: 'Hatalı veri alındı.',
  },
  {
    test: /invalid|unexpected/i,
    message: 'Gerekli bilgiler yüklenemedi.',
  },
  {
    test: /unauthorized|jwt|token/i,
    message: 'Oturumunuz sona ermiş olabilir.',
  },
  {
    test: /forbidden/i,
    message: 'Bu işlem için yetkiniz yok.',
  },
  {
    test: /not found/i,
    message: 'İstenen kayıt bulunamadı.',
  },
];

function looksLikeTurkishUserCopy(message) {
  if (!message || typeof message !== 'string') return false;
  const msg = message.trim();
  if (msg.length < 3 || msg.length > 220) return false;
  if (/^(TypeError|ReferenceError|SyntaxError|Error):/i.test(msg)) return false;
  if (msg.includes('\n') || /at\s+\S+\s+\(/.test(msg)) return false;
  if (/[çğıöşüÇĞİÖŞÜ]/.test(msg)) return true;
  if (
    /^(Geçersiz|Yetkisiz|Sipariş|Oturum|Menü|Kullanıcı|Ofis|Bu |Lütfen|Aktif|Sadece|Henüz|Diğer|Push|Bildirim|Bağlantı|Sunucu|İşlem|Veriler|Hatalı|Gerekli|Beklenmeyen)/i.test(
      msg
    )
  ) {
    return true;
  }
  return false;
}

function rawMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (typeof error?.message === 'string') return error.message;
  if (typeof error?.data?.error === 'string') return error.data.error;
  if (typeof error?.error === 'string') return error.error;
  return '';
}

function statusOf(error) {
  const n = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert any thrown/API/socket/network error into a short Turkish user message.
 * Technical details must never be shown to end users.
 */
export function getUserFriendlyError(error) {
  const status = statusOf(error);
  const raw = rawMessage(error).trim();

  if (looksLikeTurkishUserCopy(raw)) return raw;

  for (const rule of PATTERN_MESSAGES) {
    if (raw && rule.test.test(raw)) return rule.message;
  }

  if (status && STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];

  if (!raw) {
    if (status >= 500) return DEFAULT_MESSAGE;
    if (status) return STATUS_MESSAGES[status] || 'İşlem sırasında beklenmeyen bir hata oluştu.';
    return 'Veriler alınırken bir sorun oluştu.';
  }

  return DEFAULT_MESSAGE;
}

export { DEFAULT_MESSAGE as DEFAULT_USER_ERROR_MESSAGE };
