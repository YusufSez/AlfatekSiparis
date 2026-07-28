import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../lib/toast';
import { Avatar } from './Avatar';
import Button from './ui/Button';

const ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Profile avatar editor — upload / replace / remove.
 * Calls onUpdated(user) with public user payload from API.
 */
export default function AvatarEditor({ user, onUpdated }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function uploadFile(file) {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type) && !/^image\/(jpeg|jpg|png|webp)$/i.test(file.type)) {
      toast.error('Sadece JPG, PNG veya WEBP yükleyebilirsiniz.');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('Dosya boyutu 5 MB sınırını aşıyor.');
      return;
    }

    setBusy(true);
    try {
      const body = new FormData();
      body.append('avatar', file);
      const data = await api('/auth/avatar', { method: 'POST', body });
      onUpdated?.(data.user);
      toast.success('Profil fotoğrafınız güncellendi.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function removeAvatar() {
    setBusy(true);
    try {
      const data = await api('/auth/avatar', { method: 'DELETE' });
      onUpdated?.(data.user);
      toast.success('Profil fotoğrafı kaldırıldı.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="avatar-editor">
      <div className={`avatar-editor-preview ${busy ? 'is-loading' : ''}`}>
        <Avatar name={user?.name} avatarUrl={user?.avatarUrl} size="xl" />
        {busy && (
          <span className="avatar-editor-spinner" aria-live="polite">
            Yükleniyor…
          </span>
        )}
      </div>
      <div className="avatar-editor-actions">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          id="avatar-file-input"
          disabled={busy}
          onChange={(e) => uploadFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Profil Fotoğrafını Değiştir
        </Button>
        {user?.avatarUrl ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={removeAvatar}>
            Kaldır
          </Button>
        ) : null}
        <p className="muted tiny">JPG, PNG veya WEBP · en fazla 5 MB</p>
      </div>
    </div>
  );
}
