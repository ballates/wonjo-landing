import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { decimales } from '../lib/nombre';
import { dateHeure, LABELS_PAIEMENT } from '../lib/labels';
import { Modal } from './Modal';
import type { PaiementTransaction } from '../lib/types';

// [387] Bloc « Paiement » de la fiche transaction : ou en est l'argent chez Stripe, etape par etape,
// et la decision de Wonjo sur une contestation bancaire perdue. Finance et super_admin seulement
// (admin_paiement_transaction), comme la marge.

export const LIBELLES_CAS_PAIEMENT: Record<string, string> = {
  voyageur_sans_compte: 'Voyageur sans compte de paiement',
  virement_non_parti: 'Virement au voyageur qui ne part pas',
  virement_a_refaire: 'Virement à refaire en attente',
  remboursement_bloque: 'Remboursement refusé par Stripe',
  paiement_non_suivi: 'Paiement reçu, transaction bloquée',
  contestation_ouverte: 'Contestation bancaire en cours',
  contestation_perdue: 'Contestation bancaire perdue à trancher',
};

const ISSUES: Record<string, string> = {
  won: 'gagnée par Wonjo',
  warning_closed: 'demande d\'information close sans suite',
  lost: 'perdue : la banque a donné raison au payeur',
  prevented: 'évitée : le payeur a été remboursé',
};

export function lienStripe(pi: string | null, livemode: boolean | null): string | null {
  if (!pi) return null;
  return `https://dashboard.stripe.com/${livemode === false ? 'test/' : ''}payments/${encodeURIComponent(pi)}`;
}

// Une ligne par information, jamais repliee : le texte trop long est coupe et lu en entier au survol.
function Ligne({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className="info-row-value" onMouseEnter={(e) => { e.currentTarget.title = e.currentTarget.textContent ?? ''; }}>{children}</span>
    </div>
  );
}

function IconeSortie() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17 17 7" /><path d="M8 7h9v9" />
    </svg>
  );
}

function etatVirement(p: PaiementTransaction): string {
  if (p.retransfert_id) return `Refait après contestation (${p.retransfert_motif === 'decision_wonjo' ? 'décision de Wonjo' : 'contestation gagnée'})`;
  if (p.retransfert_requis_at) return `À refaire depuis le ${dateHeure(p.retransfert_requis_at)}${p.transfer_essais > 0 ? ` · ${p.transfer_essais} refus de Stripe` : ''}`;
  if (p.transfer_id) return p.contestations.some((c) => c.virement_repris) ? 'Envoyé, puis repris par la contestation' : 'Envoyé au voyageur';
  if (p.statut_paiement !== 'libere') return p.statut_paiement === 'escrow' ? 'Pas encore : fonds en séquestre' : 'Aucun';
  if (!p.voyageur_compte) return 'Bloqué : le voyageur n\'a pas de compte de paiement';
  return p.transfer_essais > 0 ? `En échec : ${p.transfer_essais} refus de Stripe, nouvel essai chaque heure` : 'En cours (chaque heure)';
}

function etatRemboursement(p: PaiementTransaction): string | null {
  if (p.refund_id) return `Fait${p.frais_retenus ? `, ${decimales(Number(p.frais_retenus), 2)} € de frais retenus` : ''}`;
  if (p.statut_paiement !== 'rembourse') return null;
  if (p.contestations.some((c) => !c.issue || c.issue === 'lost' || c.issue === 'prevented')) return 'Suspendu : la banque rembourse le payeur (contestation)';
  if (p.refund_essais > 0) return `Refusé ${p.refund_essais} fois par Stripe${p.refund_erreur ? ` : ${p.refund_erreur}` : ''}`;
  return 'En cours (chaque heure)';
}

export function PaiementStripe({ demandeId }: { demandeId: string }) {
  const [p, setP] = useState<PaiementTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decider, setDecider] = useState(false);

  function charger() {
    supabase.rpc('admin_paiement_transaction', { p_demande_id: demandeId }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setP(data as PaiementTransaction);
    });
  }
  useEffect(charger, [demandeId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="page-error">{error}</p>;
  if (!p) return <p className="loading-state">Chargement du paiement…</p>;

  const lien = lienStripe(p.payment_intent, p.livemode);
  const remboursement = etatRemboursement(p);

  return (
    <div className="info-card">
      <div className="info-card-head">
        <p className="section-title">Paiement {p.gele && <span className="tag-chip">fonds gelés</span>}</p>
        {lien && (
          <a className="btn-stripe" href={lien} target="_blank" rel="noopener noreferrer">
            <span className="btn-stripe-pastille" aria-hidden="true">S</span>
            Ouvrir dans Stripe
            <span className="btn-stripe-fleche"><IconeSortie /></span>
          </a>
        )}
      </div>
      <div className="info-rows info-rows--une-ligne">
        <Ligne label="Statut">{LABELS_PAIEMENT[p.statut_paiement] ?? p.statut_paiement}{p.montant_total != null && ` · ${decimales(Number(p.montant_total), 2)} € pour le voyageur`}</Ligne>
        <Ligne label="Paiement Stripe">{p.payment_intent ? <code>{p.payment_intent}</code> : 'Aucun'}{p.livemode === false && ' (mode test)'}</Ligne>
        {p.autorise_at && (
          <Ligne label="Empreinte">
            Posée le {dateHeure(p.autorise_at)}{p.statut_paiement === 'autorise' && p.autorisation_expire_at && `, relâchée si personne n'accepte avant le ${dateHeure(p.autorisation_expire_at)}`}
          </Ligne>
        )}
        <Ligne label="Virement au voyageur">{etatVirement(p)}{p.voyageur_compte && p.voyageur_virements_actifs === false && ' · compte restreint par Stripe'}</Ligne>
        {remboursement && <Ligne label="Remboursement">{remboursement}</Ligne>}
        {p.contestations.map((c) => (
          <Ligne key={c.dispute_id} label="Contestation bancaire">
            Ouverte le {dateHeure(c.ouverte_at)}{c.raison && ` (${c.raison})`}
            {c.issue ? `, close le ${dateHeure(c.close_at ?? c.ouverte_at)} : ${ISSUES[c.issue] ?? c.issue}` : ', en attente de la banque'}
            {c.virement_repris && ' · virement du voyageur repris'}
          </Ligne>
        ))}
        {p.decision && (
          <Ligne label="Décision de Wonjo">
            {p.decision.decision === 'payer' ? 'Payer le voyageur malgré la contestation' : 'Ne pas payer le voyageur'} · le {dateHeure(p.decision.at)} · « {p.decision.motif} »
          </Ligne>
        )}
      </div>
      {p.peut_decider && (
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setDecider(true)}>Trancher la contestation perdue</button>
        </div>
      )}
      {p.evenements.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="hint">Événements reçus de Stripe ({p.evenements.length})</summary>
          <ul className="liste-simple">
            {p.evenements.map((e, i) => (
              <li key={i}>
                <code>{e.type}</code> · {dateHeure(e.at)} · {e.erreur ? <span className="texte-perte">en échec : {e.erreur}</span> : e.traite_at ? 'traité' : 'non traité'}
              </li>
            ))}
          </ul>
        </details>
      )}
      {decider && <DecisionContestation demandeId={demandeId} paiement={p} onClose={() => setDecider(false)} onDone={() => { setDecider(false); charger(); }} />}
    </div>
  );
}

function DecisionContestation({ demandeId, paiement, onClose, onDone }: {
  demandeId: string; paiement: PaiementTransaction; onClose: () => void; onDone: () => void;
}) {
  const [decision, setDecision] = useState<'payer' | 'ne_pas_payer' | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montant = paiement.montant_total != null ? `${decimales(Number(paiement.montant_total), 2)} €` : 'le montant';
  const livre = !!paiement.livre_at;

  async function confirmer() {
    const m = motif.trim();
    if (!decision) { setError('Choisissez une décision.'); return; }
    if (!m) { setError('Le motif est obligatoire.'); return; }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_decider_contestation_bancaire', {
      p_demande_id: demandeId, p_decision: decision, p_motif: m,
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    onDone();
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Trancher la contestation perdue</h2>
      <div className="modal-body">
        <p className="hint">La banque a donné raison au payeur : l'argent lui est revenu et Wonjo a payé les frais de contestation. Reste à décider si Wonjo paie quand même le voyageur. Décision définitive, tracée dans le journal des actions.</p>
        <div className="segmented" role="radiogroup" aria-label="Décision">
          <button role="radio" aria-checked={decision === 'payer'} className={decision === 'payer' ? 'on' : ''} disabled={!livre} onClick={() => setDecision('payer')}>
            <b>Payer le voyageur</b>
            <span>{livre ? `Wonjo verse ${montant} au voyageur sur ses fonds, dans l'heure.` : 'Impossible : le colis n\'a pas été livré.'}</span>
          </button>
          <button role="radio" aria-checked={decision === 'ne_pas_payer'} className={decision === 'ne_pas_payer' ? 'on' : ''} onClick={() => setDecision('ne_pas_payer')}>
            <b>Ne pas payer</b>
            <span>Rien n'est versé. À choisir si la livraison n'est pas prouvée.</span>
          </button>
        </div>
        <div className="action-group motif-form">
          <label htmlFor="motif-contestation">Motif de la décision (interne, non envoyé aux membres)</label>
          <textarea id="motif-contestation" value={motif} onChange={(e) => setMotif(e.target.value)}
            placeholder={decision === 'ne_pas_payer' ? 'Ex. aucune photo de livraison, code jamais saisi.' : 'Ex. code de livraison saisi par l\'expéditeur, photos de livraison des deux côtés.'} />
        </div>
        {error && <p className="page-error">{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" disabled={busy} onClick={onClose}>Annuler</button>
          <button className={`btn ${decision === 'payer' ? 'btn-primary' : 'btn-danger'}`} disabled={busy || !decision} onClick={confirmer}>
            {busy ? '…' : decision === 'payer' ? `Verser ${montant} au voyageur` : 'Confirmer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
