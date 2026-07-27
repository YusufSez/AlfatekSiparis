import { useState } from 'react';
import Modal from './Modal';
import { Badge } from './Badge';
import { describeLog, formatLogTime } from '../lib/uxLabels';

export default function LogEntry({ log }) {
  const [open, setOpen] = useState(false);
  const desc = describeLog(log);
  const actor = log.actor?.name || 'Sistem';
  const office = log.actor?.office?.name;
  const hasPayload =
    log.payload &&
    typeof log.payload === 'object' &&
    Object.keys(log.payload).length > 0;

  return (
    <li className={`log-entry tone-${desc.tone}`}>
      <div className="log-icon" aria-hidden>
        {desc.icon}
      </div>
      <div className="log-main">
        <div className="log-meta">
          <strong>{actor}</strong>
          {office && <span className="muted"> · {office}</span>}
          <time className="muted">{formatLogTime(log.createdAt)}</time>
        </div>
        <p className="log-text">{desc.text}</p>
        <div className="log-tags">
          <Badge tone={desc.tone}>{log.action.split('.')[0]}</Badge>
          {hasPayload && (
            <button type="button" className="linkish" onClick={() => setOpen(true)}>
              Detay
            </button>
          )}
        </div>
      </div>
      <Modal
        open={open}
        title="Kayıt detayı"
        onClose={() => setOpen(false)}
        footer={
          <button type="button" className="btn primary" onClick={() => setOpen(false)}>
            Kapat
          </button>
        }
      >
        <dl className="detail-list">
          <div>
            <dt>İşlem</dt>
            <dd>{log.action}</dd>
          </div>
          <div>
            <dt>Kullanıcı</dt>
            <dd>{actor}</dd>
          </div>
          <div>
            <dt>Zaman</dt>
            <dd>{new Date(log.createdAt).toLocaleString('tr-TR')}</dd>
          </div>
          {log.requestId && (
            <div>
              <dt>İstek kodu</dt>
              <dd className="mono">{log.requestId}</dd>
            </div>
          )}
        </dl>
        <pre className="detail-pre">{JSON.stringify(log.payload, null, 2)}</pre>
      </Modal>
    </li>
  );
}
