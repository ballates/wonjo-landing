import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { StatutBadge } from './Badge';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { LABELS_NIVEAU, LABELS_STATUT_KYC, dateHeure, depuis, libelleAction, libelleMotif, nomComplet, niveauReputation } from '../lib/labels';
import type { ActionHistorique, FicheCompte } from '../lib/types';

type Saisie = 'bloquer' | 'debloquer' | 'approuver_kyc' | 'rejeter_kyc' | null;

const SAISIES: Record<Exclude<Saisie, null>, { titre: string; obligatoire: boolean; bouton: string; classe: string }> = {
  bloquer: { titre: 'Motif du blocage', obligatoire: true, bouton: 'Confirmer le blocage', classe: 'btn-danger' },
  debloquer: { titre: 'Motif du déblocage (facultatif)', obligatoire: false, bouton: 'Confirmer le déblocage', classe: 'btn-success' },
  approuver_kyc: { titre: 'Motif de l\'approbation (facultatif)', obligatoire: false, bouton: 'Confirmer l\'approbation', classe: 'btn-success' },
  rejeter_kyc: { titre: 'Motif du rejet de la vérification', obligatoire: true, bouton: 'Confirmer le rejet', classe: 'btn-danger' },
};

export function CompteModal({ fiche, onClose, onChanged }: { fiche: FicheCompte; onClose: () => void; onChanged: () => void }) {
  const [saisie, setSaisie] = useState<Saisie>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historique, setHistorique] = useState<ActionHistorique[] | null>(null);

  function chargerHistorique() {
    supabase.rpc('admin_historique_compte', { p_user_id: fiche.id }).then(({ data }) => {
      setHistorique((data ?? []) as ActionHistorique[]);
    });
  }

  useEffect(chargerHistorique, [fiche.id]);

  async function executer(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    try {
      const { error: rpcError } = await action();
      if (rpcError) { setError(rpcError.message); return; }
      setSaisie(null);
      setMotif('');
      onChanged();
      chargerHistorique();
    } finally {
      setBusy(false);
    }
  }

  function confirmerSaisie() {
    if (!saisie) return;
    const m = motif.trim();
    if (SAISIES[saisie].obligatoire && !m) { setError('Le motif est obligatoire.'); return; }
    if (saisie === 'bloquer') executer(() => supabase.rpc('admin_bloquer_compte', { p_user_id: fiche.id, p_motif: m }));
    if (saisie === 'debloquer') executer(() => supabase.rpc('admin_debloquer_compte', { p_user_id: fiche.id, p_motif: m || null }));
    if (saisie === 'approuver_kyc') executer(() => supabase.rpc('admin_valider_kyc', { p_user_id: fiche.id, p_motif: m || null }));
    if (saisie === 'rejeter_kyc') executer(() => supabase.rpc('admin_rejeter_kyc', { p_user_id: fiche.id, p_motif: m }));
  }

  function ouvrirSaisie(s: Saisie) {
    setSaisie(s);
    setMotif('');
    setError(null);
  }

  const nom = nomComplet(fiche.prenom, fiche.nom) || '(sans nom)';
  const kyc = fiche.kyc_status ?? 'none';
  const niveau = niveauReputation(fiche.nombre_livraisons, fiche.nombre_colis_confies);

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-hero">
        <Avatar src={fiche.photo_url} nom={nom} size={72} />
        <div style={{ minWidth: 0 }}>
          <h2>{nom}</h2>
          <p className="modal-email">{fiche.email ?? ''} · inscrit le {new Date(fiche.created_at).toLocaleDateString('fr-FR')}</p>
          <div className="badges">
            {fiche.bloque ? <span className="badge badge-danger">Compte bloqué</span> : <span className="badge badge-green">Compte actif</span>}
            <StatutBadge statut={kyc} label={`KYC : ${LABELS_STATUT_KYC[kyc] ?? kyc}`} />
            <span className={`badge ${niveau === 'debutant' ? 'badge-muted' : `badge-niveau-${niveau}`}`}>{LABELS_NIVEAU[niveau]}</span>
          </div>
        </div>
      </div>

      <div className="modal-body">
        <div className="stats-row">
          <div className="stat"><strong>{fiche.nombre_livraisons ?? 0}</strong><span>Livraisons</span></div>
          <div className="stat"><strong>{fiche.nombre_colis_confies ?? 0}</strong><span>Colis expédiés</span></div>
          <div className="stat"><strong>{fiche.note_moyenne != null ? `${Number(fiche.note_moyenne).toFixed(1)} / 5` : '-'}</strong><span>Note moyenne</span></div>
          <div className="stat" title={`${fiche.signalements} signalement(s) par ${fiche.signaleurs_distincts} personne(s)`}><strong>{fiche.signalements}</strong><span>Signalements</span></div>
        </div>

        <div className="modal-columns">
          <div className="modal-col">
            <div>
              <p className="section-title">Profil</p>
              <div className="chips">
                <span className="chip">Téléphone : <span className={fiche.telephone_verifie ? 'check-yes' : 'check-no'}>{fiche.telephone_verifie ? 'vérifié' : 'non vérifié'}</span></span>
                <span className="chip">Identité : <span className={fiche.id_verifie ? 'check-yes' : 'check-no'}>{fiche.id_verifie ? 'vérifiée' : 'non vérifiée'}</span></span>
                <span className="chip">Dernière connexion : {depuis(fiche.derniere_connexion)}</span>
              </div>
              {fiche.raisons && fiche.raisons.filter(Boolean).length > 0 && (
                <p className="hint" style={{ marginTop: 8 }}>Motifs des signalements : {fiche.raisons.filter(Boolean).join(', ')}</p>
              )}
            </div>

            <div>
              <p className="section-title">Dernière action</p>
              {historique === null && <p className="hint">Chargement…</p>}
              {historique !== null && historique.length === 0 && <p className="hint">Aucune action d'administration sur ce compte.</p>}
              {historique !== null && historique.length > 0 && (
                <ul className="timeline">
                  {historique.slice(0, 1).map((h) => (
                    <li key={h.id}>
                      <Avatar src={h.admin_avatar} nom={h.admin_nom} size={30} />
                      <div className="timeline-body">
                        <span><b>{h.admin_nom ?? 'Admin inconnu'}</b> {libelleAction(h.action)}</span>
                        {h.motif && <span className="timeline-motif">« {libelleMotif(h.action, h.motif)} »</span>}
                        <span className="timeline-meta">{dateHeure(h.created_at)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {historique !== null && historique.length > 1 && (
                <p className="hint">Historique complet dans Journal des actions.</p>
              )}
            </div>
          </div>

          <div className="modal-col">
            <p className="section-title">Actions</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="action-group">
                <div className="action-group-head">
                  <strong>Accès au compte</strong>
                  {fiche.bloque
                    ? <button className="btn btn-success btn-sm" disabled={busy} onClick={() => ouvrirSaisie('debloquer')}>Débloquer</button>
                    : <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => ouvrirSaisie('bloquer')}>Bloquer</button>}
                </div>
              </div>

              <div className="action-group">
                <div className="action-group-head">
                  <strong>Vérification d'identité</strong>
                  <div className="action-row">
                    {kyc !== 'approved' && (
                      <button className="btn btn-success btn-sm" disabled={busy} onClick={() => ouvrirSaisie('approuver_kyc')}>
                        Approuver
                      </button>
                    )}
                    {kyc !== 'rejected' && (
                      <button className="btn btn-danger-outline btn-sm" disabled={busy} onClick={() => ouvrirSaisie('rejeter_kyc')}>Rejeter</button>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>

        {saisie && (
          <div className="action-group motif-form motif-form-wide">
            <label htmlFor="motif">{SAISIES[saisie].titre}</label>
            <textarea id="motif" autoFocus value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Précisez la raison, elle sera enregistrée dans l'historique." />
            <div className="action-row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" disabled={busy} onClick={() => ouvrirSaisie(null)}>Annuler</button>
              <button className={`btn ${SAISIES[saisie].classe}`} disabled={busy} onClick={confirmerSaisie}>{SAISIES[saisie].bouton}</button>
            </div>
          </div>
        )}
        {error && <p className="page-error">{error}</p>}
      </div>
    </Modal>
  );
}
