import { useState } from 'react';
import { consulterPhotos } from '../lib/ficheTransaction';
import type { PhotoConstat } from '../lib/types';

// [437] Photos de remise / livraison / restitution d'une transaction. Motif obligatoire, consultation inscrite au journal par la base
// (admin_consulter_photos), comme la conversation. Les photos apparaissent ensuite sur les etapes du suivi.
const MOTIFS_RAPIDES = ['Litige en cours', 'Instruction d\'un signalement', 'Suspicion de fraude', 'Verification avant paiement'];

export function PhotosTransaction({ demandeId, nb, onPhotos }: { demandeId: string; nb: number | null; onPhotos: (p: PhotoConstat[]) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function voir() {
    const m = motif.trim();
    if (m.length < 4) { setErreur('Le motif est obligatoire.'); return; }
    setBusy(true);
    setErreur(null);
    try {
      onPhotos(await consulterPhotos(demandeId, m));
      setOuvert(false);
      setMotif('');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible.');
    } finally {
      setBusy(false);
    }
  }

  if (nb !== null) {
    return (
      <div className="info-card info-card--compact">
        <div className="info-card-head">
          <p className="section-title">Photos <span className="hint">: consultation enregistrée dans le journal · {nb} photo{nb > 1 ? 's' : ''}</span></p>
        </div>
      </div>
    );
  }

  return (
    <div className={`info-card ${ouvert ? '' : 'info-card--compact'}`}>
      <div className={`info-card-head ${ouvert ? 'info-card-head--ouvert' : ''}`}>
        <p className="section-title">Photos de remise et de livraison</p>
        {!ouvert && <button className="btn btn-soft btn-sm" onClick={() => setOuvert(true)}>Voir les photos</button>}
      </div>
      {ouvert && (
        <div className="action-group motif-form">
          <label htmlFor="motif-photos">Motif de la consultation (enregistré dans le journal)</label>
          <div className="action-row">
            {MOTIFS_RAPIDES.map((r) => (
              <button key={r} type="button" className="btn btn-sm" onClick={() => setMotif(r)}>{r}</button>
            ))}
          </div>
          <textarea id="motif-photos" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. litige ouvert par l'expéditeur le 28/09." />
          {erreur && <p className="page-error">{erreur}</p>}
          <div className="action-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" disabled={busy} onClick={() => { setOuvert(false); setErreur(null); }}>Annuler</button>
            <button className="btn btn-primary" disabled={busy} onClick={voir}>{busy ? '…' : 'Voir'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
