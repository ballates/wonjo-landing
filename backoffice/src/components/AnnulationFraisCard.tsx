import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';
import { ReglageTete } from './ReglageTete';

// [348] Frais Stripe retenus quand l'EXPÉDITEUR annule après avoir payé. Stripe ne rend pas ses
// frais sur un remboursement. La CGU prévoit déjà « déduction faite des éventuels frais de
// traitement bancaire non récupérables ». Montant = frais réels du paiement (plafond 5 €), annoncé
// à l'expéditeur avant de confirmer. L'annulation par le VOYAGEUR reste remboursée en entier.
// LIVRÉ ÉTEINT : l'app actuelle annonce un remboursement intégral. À allumer une fois l'OTA adoptée.
export function AnnulationFraisCard() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [actif, setActif] = useState<boolean | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function charger() {
    supabase.rpc('admin_annulation_frais').then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      setActif(data === true);
    });
  }
  useEffect(charger, []);

  async function basculer(allumer: boolean, motif: string): Promise<string | null> {
    const { error } = await supabase.rpc('admin_definir_annulation_frais', { p_actif: allumer, p_motif: motif });
    if (error) return error.message;
    setMessage(allumer ? 'Frais retenus allumés : ils s\'appliquent aux prochaines annulations par l\'expéditeur.' : 'Frais retenus éteints : remboursement intégral.');
    charger();
    return null;
  }

  return (
    <div className="chart-card rg-carte">
      <ReglageTete
        titre="Frais retenus quand l'expéditeur annule"
        sousTitre="Stripe ne rend pas ses frais sur un remboursement."
        actif={actif}
        etatOn="Allumés"
        etatOff="Éteints · remboursement intégral"
        questionAllumer="Retenir les frais Stripe quand l'expéditeur annule ?"
        questionEteindre="Rembourser l'expéditeur en entier, frais compris ?"
        modifiable={modifiable}
        onConfirmer={basculer}
      />
      {actif !== null && (
        <div className="rg-scenarios">
          <div className={`rg-scenario ${actif ? 'is-retenue' : 'is-entier'}`}>
            <span className="rg-scenario-icone" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
            </span>
            <div>
              <span className="rg-scenario-qui">L'expéditeur annule</span>
              <strong>{actif ? 'Remboursé moins les frais Stripe' : 'Remboursé en entier'}</strong>
              <span className="rg-scenario-detail">{actif ? 'Frais réels, 5 € au plus, annoncés avant qu\'il confirme' : 'Wonjo perd les frais Stripe du paiement'}</span>
            </div>
          </div>
          <div className="rg-scenario is-entier">
            <span className="rg-scenario-icone" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="7" width="12" height="13" rx="2" /><path d="M9 7V4h6v3" /><path d="M10 20v1M14 20v1" /></svg>
            </span>
            <div>
              <span className="rg-scenario-qui">Le voyageur annule</span>
              <strong>Expéditeur remboursé en entier</strong>
              <span className="rg-scenario-detail">Toujours, quel que soit ce réglage</span>
            </div>
          </div>
        </div>
      )}
      {actif === false && (
        <p className="rg-note" style={{ marginTop: 12 }}>À allumer une fois la mise à jour de l'app publiée : l'ancienne version annonce un remboursement intégral.</p>
      )}
      {!modifiable && <p className="hint" style={{ marginTop: 10 }}>Modifiable par un super admin.</p>}
      {message && <p className="success-text" style={{ marginTop: 10 }}>{message}</p>}
      {erreur && <p className="page-error" style={{ marginTop: 10 }}>{erreur}</p>}
    </div>
  );
}
