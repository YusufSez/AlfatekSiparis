import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { useAuth } from '../lib/auth';
import { isElectronDesktop } from '../lib/desktop';
import { APP_VERSION } from '../lib/format';

const WINDOWS_INSTALLER = 'Alfatek-Setup.exe';
const MAC_INSTALLER = 'Alfatek.dmg';

/**
 * Domain-agnostic installer URLs for the current host.
 * @param {string} [origin]
 */
export function getDesktopDownloadUrls(origin = typeof window !== 'undefined' ? window.location.origin : '') {
  const baseUrl = origin;
  return {
    windows: `${baseUrl}/downloads/${WINDOWS_INSTALLER}`,
    mac: `${baseUrl}/downloads/${MAC_INSTALLER}`,
  };
}

const WINDOWS_FEATURES = [
  'Otomatik bildirim',
  'Windows açılınca otomatik başlat',
  'Görev çubuğunda çalışır',
  'Arka planda aktif kalır',
];

const MAC_FEATURES = [
  'Bildirim desteği',
  'Dock desteği',
  'Arka planda çalışır',
  'Hızlı erişim',
];

/**
 * @returns {'windows' | 'mac' | 'linux' | 'other'}
 */
export function detectDesktopOs(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  const platform =
    typeof navigator !== 'undefined'
      ? `${navigator.platform || ''} ${navigator.userAgentData?.platform || ''}`
      : '';
  const hay = `${ua || ''} ${platform}`;

  if (/Windows/i.test(hay)) return 'windows';
  // Phones/tablets: don't force a Mac installer
  if (/Android|iPhone|iPad|iPod/i.test(hay)) return 'other';
  if (/Mac|macOS|Darwin|Macintosh/i.test(hay)) return 'mac';
  if (/Linux/i.test(hay)) return 'linux';
  return 'other';
}

function backPathForRole(role) {
  if (role === 'admin') return '/admin';
  if (role === 'office_user') return '/office';
  if (role === 'kitchen') return '/kitchen';
  return '/';
}

function FeatureList({ items }) {
  return (
    <ul className="desktop-download-features">
      {items.map((text) => (
        <li key={text}>
          <span aria-hidden>✔</span>
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}

function DownloadCard({ heading, ctaLabel, href, features }) {
  function onDownload() {
    window.location.href = href;
  }

  return (
    <section className="card-surface desktop-download-card">
      <h2 className="form-title">{heading}</h2>
      <Button type="button" variant="primary" className="desktop-download-cta" onClick={onDownload}>
        {ctaLabel}
      </Button>
      <FeatureList items={features} />
    </section>
  );
}

export default function DesktopDownloadPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const inElectron = isElectronDesktop();
  const os = detectDesktopOs();
  const { windows: windowsDownloadUrl, mac: macDownloadUrl } = getDesktopDownloadUrls();

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate(backPathForRole(user?.role), { replace: true });
  }

  return (
    <div className="page desktop-download-shell">
      <button type="button" className="btn ghost desktop-download-back" onClick={goBack}>
        ← Uygulamaya Dön
      </button>

      <header className="desktop-download-hero">
        <img src="/alfatek.png" alt="" width={56} height={56} className="desktop-download-logo" />
        <p className="brand">Alfatek</p>
        <h1>Masaüstü Uygulaması</h1>
        <p className="muted desktop-download-lead">
          Bildirimleri kaçırmamak ve uygulamayı daha hızlı kullanmak için masaüstü sürümünü
          yükleyebilirsiniz.
        </p>
      </header>

      <main className="content desktop-download-page">
        {inElectron ? (
          <section className="card-surface desktop-download-card desktop-download-active">
            <h2 className="form-title">Masaüstü uygulaması kullanılıyor</h2>
            <p className="muted">
              Alfatek masaüstü uygulamasındasınız. İndirme gerekmez — bildirimler ve arka plan
              özellikleri zaten aktif.
            </p>
          </section>
        ) : (
          <>
            {os === 'windows' && (
              <DownloadCard
                heading="Windows"
                ctaLabel="Windows için indir"
                href={windowsDownloadUrl}
                features={WINDOWS_FEATURES}
              />
            )}
            {os === 'mac' && (
              <DownloadCard
                heading="macOS"
                ctaLabel="macOS için indir"
                href={macDownloadUrl}
                features={MAC_FEATURES}
              />
            )}
            {os === 'linux' && (
              <section className="card-surface desktop-download-card">
                <h2 className="form-title">Linux</h2>
                <p className="muted">Linux sürümü yakında.</p>
              </section>
            )}
            {os === 'other' && (
              <div className="desktop-download-grid">
                <DownloadCard
                  heading="Windows"
                  ctaLabel="Windows için indir"
                  href={windowsDownloadUrl}
                  features={WINDOWS_FEATURES}
                />
                <DownloadCard
                  heading="macOS"
                  ctaLabel="macOS için indir"
                  href={macDownloadUrl}
                  features={MAC_FEATURES}
                />
              </div>
            )}
          </>
        )}
      </main>

      <p className="desktop-download-version muted">Versiyon {APP_VERSION}</p>
    </div>
  );
}
