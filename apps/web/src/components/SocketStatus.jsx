import { OfflineBanner } from './LoadStates';
import { useOnline } from '../lib/useOnline';
import { useSocketConnected } from '../lib/socket';

/** Isolates connected-driven subtitle so parent pages do not re-render on connect flips. */
export function SocketConnectionLabel({ online = 'Canlı', offline = 'Yeniden bağlanıyor…' }) {
  const connected = useSocketConnected();
  return connected ? online : offline;
}

/** Isolates OfflineBanner socket subscription from the parent page tree. */
export function SocketOfflineBanner({ onRetry }) {
  const connected = useSocketConnected();
  const online = useOnline(connected);
  return <OfflineBanner online={online} onRetry={onRetry} />;
}
