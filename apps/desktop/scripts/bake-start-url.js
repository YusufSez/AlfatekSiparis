const fs = require('fs');
const path = require('path');

/** Used when DESKTOP_START_URL is unset during desktop:build / desktop:dist. */
const DEFAULT_PRODUCTION_URL = 'https://alfateksiparis-1.onrender.com';

function usableHttpUrl(raw) {
  const url = String(raw || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return url;
  } catch {
    /* ignore */
  }
  return '';
}

const fromEnv = usableHttpUrl(process.env.DESKTOP_START_URL);
const url = fromEnv || DEFAULT_PRODUCTION_URL;
const out = path.join(__dirname, '..', 'start-url.json');

fs.writeFileSync(out, `${JSON.stringify({ url }, null, 2)}\n`);

if (!fromEnv) {
  console.warn(
    `[desktop] DESKTOP_START_URL unset — baking production default: ${DEFAULT_PRODUCTION_URL}`
  );
} else {
  console.log('[desktop] baked start URL:', url);
}
