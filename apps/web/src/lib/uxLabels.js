const ROLE_META = {
  admin: { label: 'Admin', hint: 'Tüm yetkiler' },
  kitchen: { label: 'Kitchen', hint: 'Mutfak ekranı' },
  office_user: { label: 'Office User', hint: 'Ofis çalışanı' },
};

const ICON_META = {
  tea: { label: 'Çay', emoji: '🍵' },
  soda: { label: 'Soda', emoji: '🥤' },
  coffee: { label: 'Kahve', emoji: '☕' },
  water: { label: 'Su', emoji: '💧' },
  cup: { label: 'Genel', emoji: '🧁' },
};

const ACTION_MAP = [
  { test: /^auth\.login$/, tone: 'info', icon: '🔑', text: () => 'Sisteme giriş yaptı' },
  { test: /^admin\.office_create$/, tone: 'success', icon: '🏢', text: (p) => `Yeni ofis oluşturdu${p?.name ? `: ${p.name}` : ''}` },
  { test: /^admin\.office_update$/, tone: 'info', icon: '🏢', text: () => 'Ofis bilgisini güncelledi' },
  { test: /^admin\.office_delete$/, tone: 'danger', icon: '🗑️', text: () => 'Ofisi sildi' },
  { test: /^admin\.user_create$/, tone: 'success', icon: '👤', text: (p) => `Yeni kullanıcı oluşturdu${p?.username ? `: @${p.username}` : ''}` },
  { test: /^admin\.user_update$/, tone: 'warning', icon: '👤', text: () => 'Kullanıcı bilgisini güncelledi' },
  { test: /^admin\.menu/, tone: 'info', icon: '🍽️', text: () => 'Menü ürününü güncelledi' },
  { test: /^admin\.settings/, tone: 'warning', icon: '⚙️', text: () => 'Sistem ayarlarını kaydetti' },
  { test: /^announcement\.create$/, tone: 'success', icon: '📢', text: () => 'Yeni duyuru yayınladı' },
  { test: /^announcement\.update$/, tone: 'info', icon: '📢', text: () => 'Duyuruyu güncelledi' },
  { test: /^announcement\.delete$/, tone: 'danger', icon: '📢', text: () => 'Duyuruyu sildi' },
  { test: /^session\.opened$/, tone: 'success', icon: '🧾', text: () => 'Yeni sipariş oturumu açtı' },
  {
    test: /^session\.line_upserted$/,
    tone: 'info',
    icon: '➕',
    text: (p) => {
      if (p?.menuItemName && p?.qty != null) return `${p.qty}× ${p.menuItemName} siparişine ekledi`;
      return 'Sipariş kalemi güncelledi';
    },
  },
  {
    test: /^session\.line_removed$/,
    tone: 'warning',
    icon: '➖',
    text: (p) => (p?.menuItemName ? `${p.menuItemName} kalemini kaldırdı` : 'Sipariş kalemini kaldırdı'),
  },
  { test: /^session\.left$/, tone: 'warning', icon: '🚪', text: () => 'Siparişten çıktı' },
  { test: /^session\.sent$/, tone: 'success', icon: '📤', text: () => 'Siparişi mutfağa gönderdi' },
  { test: /^session\.closed$/, tone: 'secondary', icon: '🔒', text: () => 'Sipariş oturumunu kapattı' },
  { test: /^kitchen\.preparing$/, tone: 'warning', icon: '👨‍🍳', text: () => 'Siparişi hazırlamaya başladı' },
  { test: /^kitchen\.ready$/, tone: 'success', icon: '✅', text: () => 'Siparişi hazır olarak işaretledi' },
  { test: /^kitchen\.delivered$/, tone: 'success', icon: '🚚', text: () => 'Siparişi teslim etti' },
  { test: /^ticket\.preparing$/, tone: 'warning', icon: '👨‍🍳', text: () => 'Sipariş hazırlanıyor' },
  { test: /^ticket\.ready$/, tone: 'success', icon: '✅', text: () => 'Sipariş hazır' },
  { test: /^ticket\.delivered$/, tone: 'success', icon: '🚚', text: () => 'Sipariş teslim edildi' },
];

export function roleLabel(role) {
  return ROLE_META[role]?.label || role;
}

export function roleHint(role) {
  return ROLE_META[role]?.hint || '';
}

export function iconMeta(icon) {
  return ICON_META[icon] || { label: icon, emoji: '🧁' };
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
    };
  }
  return {
    tone: 'secondary',
    icon: '📝',
    text: log.action.replace(/[._]/g, ' '),
  };
}

export { ROLE_META, ICON_META };
