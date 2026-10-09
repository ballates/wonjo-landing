import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';

// [348] Frais Stripe retenus quand l'EXPÉDITEUR annule après avoir payé. Stripe ne rend pas ses
// frais sur un remboursement. La CGU prévoit déjà « déduction faite des éventuels frais de
// traitement bancaire non récupérables ». Montant = frais réels du paiement (plafond 5 €), annoncé
// à l'expéditeur avant de confirmer. L'annulation par le VOYAGEUR reste remboursée en entier.
// LIVRÉ ÉTEINT : l'app actuelle annonce un remboursement intégral. À allumer une fois l'OTA adoptée.
export function AnnulationFraisCard() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [actif, setActif] = useState<boolean | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function charger() {
    supabase.rpc('admin_annulation_frais').then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      setActif(data === true);
    });
  }
  useEffect(charger, []);

  async function basculer() {
    if (actif === null) return;
    if (!motif.trim()) { setErreur('Le motif est obligatoire (il est inscrit au journal).'); return; }
    setBusy(true);
    setErreur(null);
    const { error } = await supabase.rpc('admin_definir_annulation_frais', { p_actif: !actif, p_motif: motif.trim() });
    setBusy(false);
    if (error) { setErreur(error.message); return; }
    setMotif('');
    setMessage(!actif ? 'Frais retenus allumés : ils s\'appliquent aux prochaines annulations par l\'expéditeur.' : 'Frais retenus éteints : remboursement intégral.');
    charger();
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div className="chart-head-titre">
          <h3>Frais retenus quand l'expéditeur annule</h3>
          {actif !== null && <span className={`badge ${actif ? 'badge-teal' : 'badge-muted'}`}>{actif ? 'Allumés' : 'Éteints'}</span>}
        </div>
      </div>
      <p className="chart-sub">
        Stripe ne rend pas ses frais sur un remboursement. Quand l'expéditeur annule un transport accepté et déjà payé, il est remboursé
        du paiement moins les frais de paiement réels (5 € au plus), annoncés avant qu'il confirme. Si c'est le voyageur qui annule,
        l'expéditeur est remboursé en entier.
      </p>
      {actif === false && (
        <div className="insight-banner warn" style={{ marginBottom: 14 }}>
          <div>
            <p className="insight-oneline">
              <strong>Éteints : </strong>à allumer une fois la mise à jour de l'app publiée. L'ancienne version annonce un remboursement intégral.
            </p>
          </div>
        </div>
      )}
      {modifiable && actif !== null && (
        <div className="action-group motif-form">
          <textarea value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (journal)" />
          <div className="action-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy || !motif.trim()} onClick={basculer}>
              {busy ? '…' : actif ? 'Éteindre' : 'Allumer'}
            </button>
          </div>
        </div>
      )}
      {!modifiable && <p className="hint">Modifiable par un super admin.</p>}
      {message && <p className="hint">{message}</p>}
      {erreur && <p className="page-error">{erreur}</p>}
    </div>
  );
}
