import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { LABELS_ROLES } from '../lib/permissions';
import { Avatar } from './Avatar';
import { Modal } from './Modal';

// Recadre en carre 256px et reencode en JPEG : le nom de fichier impose par
// la policy storage est admin_avatar_<uid>.jpg.
async function versJpegCarre(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const cote = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.drawImage(bitmap, (bitmap.width - cote) / 2, (bitmap.height - cote) / 2, cote, cote, 0, 0, 256, 256);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion impossible'))), 'image/jpeg', 0.88);
  });
}

export function ProfilModal({ onClose }: { onClose: () => void }) {
  const { profil, role, email, refreshProfil } = useAuth();
  const [nomAffiche, setNomAffiche] = useState(profil?.nom_affiche ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profil?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    if (!profil) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await versJpegCarre(file);
      const path = `admin_avatar_${profil.user_id}.jpg`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatarUrl(`${data.publicUrl}?v=${Date.now()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi de la photo impossible');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const { error: rpcError } = await supabase.rpc('admin_maj_mon_profil', { p_nom_affiche: nomAffiche, p_avatar_url: avatarUrl });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    await refreshProfil();
    setSaved(true);
  }

  return (
    <Modal onClose={onClose} closeOnSurface>
      <h2 className="modal-title">Mon profil</h2>
      <div className="modal-body">
        <div className="avatar-edit">
          <Avatar src={avatarUrl} nom={nomAffiche || profil?.nom || email} size={84} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="action-row">
              <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
                {avatarUrl ? 'Changer la photo' : 'Ajouter une photo'}
              </button>
              {avatarUrl && <button className="btn btn-sm" disabled={busy} onClick={() => setAvatarUrl(null)}>Retirer</button>}
            </div>
            <p className="hint">JPEG, PNG ou WebP. Recadrée automatiquement en carré.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
          />
        </div>

        <div className="form-grid">
          <label>
            Nom affiché
            <input type="text" value={nomAffiche} placeholder={profil?.nom ?? 'Ex. Ben'} onChange={(e) => setNomAffiche(e.target.value)} />
          </label>
          <p className="hint">Email : {email} · Rôle : {role ? LABELS_ROLES[role] : ''}</p>
        </div>

        {error && <p className="page-error">{error}</p>}
        {saved && <p className="success-text">Profil enregistré.</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}
