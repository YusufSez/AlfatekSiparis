import { useState } from 'react';
import Modal from './Modal';
import { describeLog, formatLogTime, logSentence } from '../lib/uxLabels';

function payloadRows(payload) {
  if (!payload || typeof payload !== 'object') return [];
  return Object.entries(payload).map(([k, v]) => ({
    key: k,
    label: ({
      menuItemName: 'Ürün',
      qty: 'Adet',
      name: 'Ad',
      username: 'Kullanıcı adı',
      officeId: 'Ofis',
      sessionId: 'Sipariş',
      ticketId: 'Mutfak fişi',
    }[k] || k),
    value: typeof v === 'object' ? JSON.stringify(v) : String(v),
  }));
}

export default function LogEntry({ log }) {
  const [open, setOpen] = useState(false);
  const desc = describeLog(log);
  const actor = log.actor?.name || 'Sistem';
  const office = log.actor?.office?.name;
  const rows = payloadRows(log.payload);

  return (
    <li className={`log-entry tone-${desc.tone}`}>
      <div className="log-icon" aria-hidden>
        {desc.icon}
      </div>
      <div className="log-main">
        <p className="log-sentence">{logSentence(log)}</p>
        <div className="log-meta">
          {office && <span className="muted">{office}</span>}
          <time className="muted">{formatLogTime(log.createdAt)}</time>
          <button type="button" className="linkish" onClick={() => setOpen(true)}>
            Detay
          </button>
        </div>
      </div>
      <Modal
        open={open}
        title="Hareket detayı"
        onClose={() => setOpen(false)}
        footer={
          <button type="button" className="btn primary" onClick={() => setOpen(false)}>
            Kapat
          </button>
        }
      >
        <p className="log-sentence detail-sentence">{logSentence(log)}</p>
        <dl className="detail-list">
          <div>
            <dt>Kim</dt>
            <dd>{actor}</dd>
          </div>
          {office && (
            <div>
              <dt>Ofis</dt>
              <dd>{office}</dd>
            </div>
          )}
          <div>
            <dt>Zaman</dt>
            <dd>{new Date(log.createdAt).toLocaleString('tr-TR')}</dd>
          </div>
          {rows.map((r) => (
            <div key={r.key}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </li>
  );
}
