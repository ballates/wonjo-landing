import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { decimales } from '../lib/nombre';
import { dateHeure, premierMot } from '../lib/labels';
import { prechargementFiche } from '../lib/ficheTransaction';
import { LIBELLES_CAS_PAIEMENT, lienStripe } from './PaiementStripe';
import type { PaiementATraiter } from '../lib/types';

// [387] Les paiements qui attendent une action : la meme liste que les compteurs « A faire »
// (fn_paiements_a_traiter), ouverte depuis leurs boutons. Finance et super_admin.

function precision(p: PaiementATraiter): string | null {
  const d = p.detail ?? {};
  if (typeof d.erreur === 'string' && d.erreur) return d.erreur;
  if (typeof d.essais === 'number' && d.essais > 0) return `${d.essais} refus de Stripe`;
  if (typeof d.montant_rembourse === 'number') return `${decimales(d.montant_rembourse, 2)} € remboursés dans Stripe${d.vire ? ', voyageur déjà payé' : ''}`;
  if (typeof d.dispute_id === 'string') return `Contestation ${d.dispute_id}`;
  return null;
}

export function PaiementsATraiter({ onOuvrir }: { onOuvrir: (demandeId: string) => void }) {
  const [items, setItems] = useState<PaiementATraiter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const charger = useCallback(() => {
    supabase.rpc('admin_paiements_a_traiter').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as PaiementATraiter[]);
    });
  }, []);
  useEffect(() => { charger(); }, [charger]);

  if (error) return <p className="page-error">{error}</p>;
  if (!items) return <p className="loading-state">Chargement…</p>;
  if (items.length === 0) {
    return (
      <div className="empty-state todo-empty">
        <strong>Aucun paiement à traiter</strong>
        <span>Tout l'argent suit son cours.</span>
      </div>
    );
  }
  return (
    <div className="info-card" style={{ marginBottom: 16 }}>
      <p className="section-title">Paiements à traiter ({items.length})</p>
      <div className="info-rows info-rows--paiements">
        {items.map((p, i) => {
          const lien = lienStripe(p.payment_intent, null);
          const extra = precision(p);
          return (
            <div className="info-row" key={`${p.demande_id ?? p.payment_intent}-${p.cas}-${i}`}>
              <span className="info-row-label">{LIBELLES_CAS_PAIEMENT[p.cas] ?? p.cas}</span>
              <span className="info-row-value" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span>
                  {p.expediteur_prenom || p.porteur_prenom ? `${premierMot(p.expediteur_prenom ?? '?')} → ${premierMot(p.porteur_prenom ?? '?')}` : 'Paiement sans demande'}
                  {p.montant_total != null && ` · ${decimales(Number(p.montant_total), 2)} €`}
                  {p.depuis && ` · depuis le ${dateHeure(p.depuis)}`}
                  {extra && <span className="hint"> · {extra}</span>}
                </span>
                {p.demande_id
                  ? <button className="btn btn-soft btn-sm" onClick={() => onOuvrir(p.demande_id!)} {...prechargementFiche(p.demande_id)}>Fiche</button>
                  : lien && <a className="btn btn-soft btn-sm" href={lien} target="_blank" rel="noopener noreferrer">Ouvrir dans Stripe</a>}
                {p.cas === 'remboursement_hors_application' && p.demande_id && <Cloturer demandeId={p.demande_id} onFait={charger} />}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// [468] Clôturer l'alerte d'un remboursement fait dans Stripe, hors application, après vérification (pas de double paiement). Motif obligatoire, tracé.
function Cloturer({ demandeId, onFait }: { demandeId: string; onFait: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function valider() {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_traiter_remboursement_hors_app', { p_demande_id: demandeId, p_motif: motif.trim() });
    setBusy(false);
    if (e) { setError(e.message); return; }
    onFait();
  }

  if (!ouvert) return <button type="button" className="btn btn-soft btn-sm" onClick={() => setOuvert(true)}>Clôturer</button>;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif (ex. vérifié, pas de double paiement)" maxLength={300} aria-label="Motif" autoFocus
        style={{ minWidth: 260, height: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', font: 'inherit', fontSize: 13 }} />
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void valider()} disabled={busy || motif.trim().length < 10}>{busy ? '…' : 'Confirmer'}</button>
      <button type="button" className="btn btn-soft btn-sm" onClick={() => { setOuvert(false); setMotif(''); setError(null); }}>Annuler</button>
      {error && <span className="hint" style={{ color: 'var(--danger)' }}>{error}</span>}
    </span>
  );
}
