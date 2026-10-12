import { useEffect, useState } from 'react';
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
  if (typeof d.dispute_id === 'string') return `Contestation ${d.dispute_id}`;
  return null;
}

export function PaiementsATraiter({ onOuvrir }: { onOuvrir: (demandeId: string) => void }) {
  const [items, setItems] = useState<PaiementATraiter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_paiements_a_traiter').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as PaiementATraiter[]);
    });
  }, []);

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
      <div className="info-rows">
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
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
