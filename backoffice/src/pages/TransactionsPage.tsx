import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { StatutBadge } from '../components/Badge';
import { Avatar } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import { TransactionModal } from '../components/TransactionModal';
import { LABELS_PAIEMENT, LABELS_STATUT_COLIS, LABELS_TYPE_ENVOI, dateHeure } from '../lib/labels';
import type { TransactionListe } from '../lib/types';

type FiltreRapide = 'tout' | 'livre' | 'en_cours' | 'en_attente' | 'annule';

const FILTRES: { cle: FiltreRapide; label: string; test: (t: TransactionListe) => boolean }[] = [
  { cle: 'tout', label: 'Tout', test: () => true },
  { cle: 'livre', label: 'Livré', test: (t) => t.statut_colis === 'livre' },
  { cle: 'en_cours', label: 'En cours', test: (t) => ['accepte', 'en_transit', 'arrive', 'remis_porteur', 'restitution_en_cours', 'litige'].includes(t.statut_colis) },
  { cle: 'en_attente', label: 'En attente', test: (t) => t.statut_colis === 'en_attente' },
  { cle: 'annule', label: 'Annulé', test: (t) => t.statut_colis === 'annule' },
];

export function TransactionsPage() {
  const [items, setItems] = useState<TransactionListe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<FiltreRapide>('tout');

  function load() {
    supabase.rpc('admin_lister_transactions', { p_statut_colis: null, p_limite: 500, p_offset: 0 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as TransactionListe[]);
    });
  }
  useEffect(load, []);

  const filtreActif = FILTRES.find((f) => f.cle === filtre) ?? FILTRES[0];
  const filtrees = useMemo(() => (items ?? []).filter(filtreActif.test), [items, filtreActif]);

  const columns: Column<TransactionListe>[] = [
    { key: 'type', filter: 'options', label: 'Type', value: (t) => LABELS_TYPE_ENVOI[t.type_envoi ?? ''] ?? t.type_envoi ?? '-' },
    { key: 'montant', label: 'Montant', value: (t) => Number(t.montant_total), render: (t) => `${Number(t.montant_total).toFixed(2)} €` },
    { key: 'statut_colis', filter: 'options', label: 'Statut', value: (t) => LABELS_STATUT_COLIS[t.statut_colis] ?? t.statut_colis, render: (t) => <StatutBadge statut={t.statut_colis} label={LABELS_STATUT_COLIS[t.statut_colis] ?? t.statut_colis} /> },
    { key: 'statut_paiement', filter: 'options', label: 'Paiement', value: (t) => LABELS_PAIEMENT[t.statut_paiement] ?? t.statut_paiement, render: (t) => <StatutBadge statut={t.statut_paiement} label={LABELS_PAIEMENT[t.statut_paiement] ?? t.statut_paiement} /> },
    {
      key: 'expediteur', label: 'Expéditeur', value: (t) => t.expediteur_nom ?? '', render: (t) => (
        <span className="chip"><Avatar src={t.expediteur_photo} nom={t.expediteur_nom ?? ''} size={22} /> {t.expediteur_prenom ?? '-'}</span>
      ),
    },
    {
      key: 'porteur', label: 'Porteur', value: (t) => t.porteur_nom ?? '', render: (t) => (
        <span className="chip"><Avatar src={t.porteur_photo} nom={t.porteur_nom ?? ''} size={22} /> {t.porteur_prenom ?? '-'}</span>
      ),
    },
    { key: 'code', filter: 'options', label: 'Code', value: (t) => (t.code_genere ? 'Généré' : 'Non généré') },
    { key: 'creee', label: 'Créée le', value: (t) => t.created_at, render: (t) => dateHeure(t.created_at) },
    { key: 'actions', label: '', render: (t) => <button className="btn btn-soft btn-sm" onClick={() => setOuverte(t.id)}>Fiche</button>, width: 100 },
  ];

  if (error) return <p className="page-error">{error}</p>;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p className="page-sub">Suivi individuel : qui doit rencontrer qui, où en est la remise, le code de livraison.</p>
        </div>
      </div>
      {!items ? <p className="loading-state">Chargement…</p> : (
        <DataTable
          rows={filtrees}
          columns={columns}
          rowKey={(t) => t.id}
          initialSort={{ key: 'creee', dir: 'desc' }}
          emptyText="Aucune transaction pour ce filtre."
          toolbar={(
            <div className="action-row">
              {FILTRES.map((f) => (
                <button
                  key={f.cle}
                  type="button"
                  className={`chip-filter ${filtre === f.cle ? 'on' : ''}`}
                  onClick={() => setFiltre(f.cle)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        />
      )}
      {ouverte && <TransactionModal demandeId={ouverte} onClose={() => setOuverte(null)} />}
    </div>
  );
}
