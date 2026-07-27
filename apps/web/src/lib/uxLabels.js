const ROLE_META = {
  admin: { label: 'Admin', hint: 'Tüm yetkiler' },
  kitchen: { label: 'Mutfak', hint: 'Mutfak ekranı' },
  office_user: { label: 'Ofis', hint: 'Ofis çalışanı' },
};

const ICON_META = {
  tea: { label: 'Çay', emoji: '☕' },
  soda: { label: 'Soda', emoji: '🥤' },
  coffee: { label: 'Kahve', emoji: '☕' },
  water: { label: 'Su', emoji: '💧' },
  juice: { label: 'Meyve Suyu', emoji: '🧃' },
  herbal: { label: 'Bitki Çayı', emoji: '🍵' },
  other: { label: 'Diğer', emoji: '📝' },
  cup: { label: 'Diğer', emoji: '🧋' },
};

const ACTION_MAP = [
  { test: /^auth\.password_change$/, tone: 'warning', icon: '🟠', text: () => 'şifresini değiştirdi.' },
  { test: /^auth\.login$/, tone: 'info', icon: '🔵', text: () => 'sisteme giriş yaptı.' },
  {
    test: /^admin\.office_create$/,
    tone: 'success',
    icon: '🟢',
    text: (p) => `yeni ofis oluşturdu${p?.name ? `: ${p.name}` : ''}.`,
  },
  { test: /^admin\.office_update$/, tone: 'info', icon: '🔵', text: () => 'ofis bilgisini güncelledi.' },
  { test: /^admin\.office_delete$/, tone: 'danger', icon: '🔴', text: () => 'ofisi sildi.' },
  {
    test: /^admin\.user_create$/,
    tone: 'success',
    icon: '🟢',
    text: (p) => `yeni kullanıcı ekledi${p?.username ? `: ${p.username}` : ''}.`,
  },
  { test: /^admin\.user_update$/, tone: 'warning', icon: '🟠', text: () => 'kullanıcı bilgisini güncelledi.' },
  { test: /^admin\.menu/, tone: 'info', icon: '🔵', text: () => 'menü ürününü güncelledi.' },
  { test: /^admin\.settings/, tone: 'warning', icon: '🟠', text: () => 'sistem ayarlarını kaydetti.' },
  { test: /^announcement\.create$/, tone: 'success', icon: '🟢', text: () => 'yeni duyuru yayınladı.' },
  { test: /^announcement\.update$/, tone: 'info', icon: '🔵', text: () => 'duyuruyu güncelledi.' },
  { test: /^announcement\.delete$/, tone: 'danger', icon: '🔴', text: () => 'duyuruyu sildi.' },
  { test: /^session\.opened$/, tone: 'success', icon: '🟢', text: () => 'yeni sipariş başlattı.' },
  {
    test: /^session\.line_upserted$/,
    tone: 'warning',
    icon: '🟠',
    text: (p) => {
      if (p?.menuItemName && p?.qty != null) {
        return p.note
          ? `${p.qty} ${p.menuItemName} ekledi (${p.note}).`
          : `${p.qty} ${p.menuItemName} ekledi.`;
      }
      return 'siparişe ürün ekledi.';
    },
  },
  {
    test: /^session\.line_removed$/,
    tone: 'warning',
    icon: '🟠',
    text: (p) => (p?.menuItemName ? `${p.menuItemName} ürününü kaldırdı.` : 'siparişten ürün kaldırdı.'),
  },
  { test: /^session\.left$/, tone: 'warning', icon: '🟠', text: () => 'siparişten çıktı.' },
  { test: /^session\.skipped$/, tone: 'warning', icon: '🟡', text: () => 'isteğinin olmadığını bildirdi.' },
  { test: /^session\.sent$/, tone: 'success', icon: '🟢', text: () => 'siparişi mutfağa gönderdi.' },
  {
    test: /^session\.closed$/,
    tone: 'secondary',
    icon: '⚪',
    text: (p) =>
      p?.reason === 'cancel' || p?.message
        ? 'siparişi iptal etti.'
        : 'sipariş oturumunu kapattı.',
  },
  { test: /^kitchen\.preparing$/, tone: 'info', icon: '🔵', text: () => 'siparişi hazırlamaya başladı.' },
  { test: /^kitchen\.delivered$/, tone: 'secondary', icon: '🟣', text: () => 'siparişi teslim etti.' },
  { test: /^ticket\.preparing$/, tone: 'info', icon: '🔵', text: () => 'Mutfak siparişi hazırlamaya başladı.' },
  { test: /^ticket\.ready$/, tone: 'secondary', icon: '⚪', text: () => 'Sipariş hazır (eski kayıt).' },
  { test: /^ticket\.delivered$/, tone: 'secondary', icon: '🟣', text: () => 'Sipariş teslim edildi.' },
];

export function roleLabel(role) {
  return ROLE_META[role]?.label || role;
}

export function roleHint(role) {
  return ROLE_META[role]?.hint || '';
}

export function iconMeta(icon) {
  return ICON_META[icon] || { label: icon || 'Diğer', emoji: '🧋' };
}

export function formatLogTime(iso) {
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function describeLog(log) {
  const payload = log.payload && typeof log.payload === 'object' ? log.payload : {};
  const match = ACTION_MAP.find((m) => m.test.test(log.action));
  if (match) {
    return {
      tone: match.tone,
      icon: match.icon,
      text: match.text(payload),
      sentence: true,
    };
  }
  return {
    tone: 'secondary',
    icon: '⚪',
    text: `${log.action.replace(/[._]/g, ' ')}.`,
    sentence: true,
  };
}

/** Human sentence: "Yusuf yeni sipariş başlattı." */
export function logSentence(log, { withIcon = true } = {}) {
  const desc = describeLog(log);
  const actor = log.actor?.name;
  let text;
  if (/^ticket\./.test(log.action) || !actor) {
    text = `${desc.text.charAt(0).toUpperCase()}${desc.text.slice(1)}`;
  } else {
    text = `${actor} ${desc.text}`;
  }
  return withIcon ? `${desc.icon} ${text}` : text;
}

export { ROLE_META, ICON_META };
