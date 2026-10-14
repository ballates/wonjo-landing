import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Modal } from './Modal';

export type TypeContenu = 'avis' | 'annonce' | 'offre';

// Masquer / réafficher un contenu depuis le back-office. Remplace window.prompt
// et window.confirm : la boite native du navigateur peut etre bloquee (le clic ne
// faisait alors rien) et ne disait pas ce que le masquage change pour le membre.
const TEXTES: Record<TypeContenu, { objet: string; effet: string }> = {
  avis: { objet: 'cet avis', effet: 'Il disparaît de l\'application et ne compte plus dans la note du destinataire.' },
  annonce: { objet: 'ce trajet', effet: 'Il disparaît des recherches de l\'application. Les transactions déjà en cours ne sont pas touchées.' },
  offre: { objet: 'cette demande de colis', effet: 'Elle disparaît des recherches de l\'application. Les transactions déjà en cours ne sont pas touchées.' },
};

export function MasquageModal({ type, id, masquer, onClose, onDone }: {
  type: TypeContenu; id: string; masquer: boolean; onClose: () => void; onDone: () => void;
}) {
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = TEXTES[type];

  async function confirmer() {
    if (masquer && !motif.trim()) { setError('Le motif est obligatoire.'); return; }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_masquer_contenu', {
      p_type: type, p_id: id, p_masquer: masquer, p_motif: masquer ? motif.trim() : null,
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    onDone();
  }

  return (
    <Modal onClose={onClose} narrow>
      <h2 className="modal-title">{masquer ? `Masquer ${t.objet}` : `Réafficher ${t.objet}`}</h2>
      <div className="modal-body">
        <p className="hint">
          {masquer
            ? `${t.effet} Le contenu n'est pas supprimé : vous pourrez le réafficher.`
            : type === 'avis' ? 'Il redevient visible et compte à nouveau dans la note.' : 'Il redevient visible dans l\'application.'}
        </p>
        {masquer && (
          <div className="action-group motif-form">
            <label htmlFor="motif-masquage">Motif (obligatoire, conservé dans le journal d'audit)</label>
            <textarea id="motif-masquage" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. propos diffamatoires, coordonnées personnelles dans le commentaire." autoFocus />
          </div>
        )}
        {error && <p className="page-error">{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" disabled={busy} onClick={onClose}>Annuler</button>
          <button className={`btn ${masquer ? 'btn-danger' : 'btn-primary'}`} disabled={busy} onClick={confirmer}>
            {busy ? '…' : masquer ? 'Masquer' : 'Réafficher'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
