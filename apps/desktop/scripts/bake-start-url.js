const fs = require('fs');
const path = require('path');

const url = String(process.env.DESKTOP_START_URL || '').trim();
const out = path.join(__dirname, '..', 'start-url.json');

fs.writeFileSync(out, `${JSON.stringify({ url }, null, 2)}\n`);

if (!url) {
  console.warn(
    '[desktop] DESKTOP_START_URL is empty — packaged app will fall back to http://127.0.0.1:5173. Set DESKTOP_START_URL before desktop:build / desktop:dist.'
  );
} else {
  console.log('[desktop] baked start URL:', url);
}
