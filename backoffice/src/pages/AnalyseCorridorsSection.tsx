import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DataTable, type Column } from '../components/DataTable';
import { euros } from '../components/Kpi';

interface AnalyseCorridor {
  corridor_id: string;
  nom: string;
  actif: boolean;
  nb_demandes: number;
  nb_payantes: number;
  nb_remboursees: number;
  revenu_commission: number;
  commission_remboursee: number;
  frais_stripe_perdus: number;
  nb_frais_stripe_connu: number;
  derniere_activite: string | null;
}

type Statut = 'ferme' | 'jamais_utilise' | 'dormant' | 'actif';

const JOURS_DORMANCE = 30;

const LABELS_STATUT: Record<Statut, string> = {
  ferme: 'Fermé',
  jamais_utilise: 'Jamais utilisé',
  dormant: `Dormant (${JOURS_DORMANCE}j+)`,
  actif: 'Actif',
};

const BADGE_STATUT: Record<Statut, string> = {
  ferme: 'badge-muted',
  jamais_utilise: 'badge-amber',
  dormant: 'badge-amber',
  actif: 'badge-green',
};

function calculerStatut(l: AnalyseCorridor, seuilDormance: number): Statut {
  if (!l.actif) return 'ferme';
  if (l.nb_demandes === 0) return 'jamais_utilise';
  if (!l.derniere_activite || new Date(l.derniere_activite).getTime() < seuilDormance) return 'dormant';
  return 'actif';
}

export function AnalyseCorridorsSection() {
  const [lignes, setLignes] = useState<AnalyseCorridor[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.rpc('admin_analyse_corridors').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setLignes((data as AnalyseCorridor[]) ?? []);
    });
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!lignes) return <p className="loading-state">Chargement…</p>;

  const seuilDormance = Date.now() - JOURS_DORMANCE * 24 * 60 * 60 * 1000;
  const avecStatut = lignes.map((l) => ({ ...l, statut: calculerStatut(l, seuilDormance) }));

  const compte = (s: Statut) => avecStatut.filter((l) => l.statut === s).length;

  const columns: Column<typeof avecStatut[number]>[] = [
    { key: 'nom', label: 'Corridor', value: (l) => l.nom, filter: 'options' },
    {
      key: 'statut', label: 'Statut', filter: 'options', value: (l) => LABELS_STATUT[l.statut],
      render: (l) => <span className={`badge ${BADGE_STATUT[l.statut]}`}>{LABELS_STATUT[l.statut]}</span>,
    },
    { key: 'nb_demandes', label: 'Demandes (total)', value: (l) => l.nb_demandes, render: (l) => l.nb_demandes },
    {
      key: 'revenu_commission', label: 'Commission encaissée', value: (l) => Number(l.revenu_commission),
      render: (l) => (
        <span title="Somme sur les demandes payantes uniquement (colonne suivante) - les demandes en attente de paiement n'ont pas encore de commission connue.">
          <strong>{euros(Number(l.revenu_commission))}</strong> <span className="hint">sur {l.nb_payantes}</span>
        </span>
      ),
    },
    {
      key: 'commission_remboursee', label: 'Commission rendue', value: (l) => Number(l.commission_remboursee),
      render: (l) => Number(l.commission_remboursee) > 0
        ? <span className="badge badge-amber">{euros(Number(l.commission_remboursee))}</span>
        : euros(0),
    },
    {
      key: 'frais_stripe_perdus', label: 'Frais Stripe jamais récupérés', value: (l) => Number(l.frais_stripe_perdus),
      render: (l) => {
        const manquant = l.nb_remboursees > 0 && l.nb_frais_stripe_connu < l.nb_remboursees;
        return (
          <span title={manquant ? `${l.nb_remboursees - l.nb_frais_stripe_connu} remboursement(s) antérieur(s) au suivi Stripe, non inclus` : undefined}>
            {Number(l.frais_stripe_perdus) > 0
              ? <span className="badge badge-danger">{euros(Number(l.frais_stripe_perdus))}</span>
              : euros(0)}
            {manquant && <span className="hint"> incomplet*</span>}
          </span>
        );
      },
    },
    { key: 'nb_remboursees', label: 'Dont remboursées', value: (l) => l.nb_remboursees, render: (l) => l.nb_remboursees },
    {
      key: 'derniere_activite', label: 'Dernière activité', filter: 'date',
      value: (l) => l.derniere_activite ?? '',
      render: (l) => l.derniere_activite ? new Date(l.derniere_activite).toLocaleDateString('fr-FR') : 'Jamais',
    },
  ];

  return (
    <div className="corridors-section">
      <div className="chart-card">
        <div className="chart-head">
          <div>
            <h3>Revenu et activité par corridor</h3>
            <p className="chart-sub">
              Sur un remboursement : Wonjo rend sa commission (« Commission rendue ») et perd en plus les frais que Stripe a pris à l'encaissement et ne rend jamais (« Frais Stripe jamais récupérés »).
            </p>
          </div>
        </div>
        <p className="chart-sub">
          {compte('actif')} actif{compte('actif') > 1 ? 's' : ''} · {compte('dormant')} dormant{compte('dormant') > 1 ? 's' : ''} · {compte('jamais_utilise')} jamais utilisé{compte('jamais_utilise') > 1 ? 's' : ''} · {compte('ferme')} fermé{compte('ferme') > 1 ? 's' : ''}
        </p>
        <DataTable
          rows={avecStatut}
          rowKey={(l) => l.corridor_id}
          initialSort={{ key: 'revenu_commission', dir: 'desc' }}
          emptyText="Aucune donnée."
          columns={columns}
        />
        {avecStatut.some((l) => l.nb_remboursees > 0 && l.nb_frais_stripe_connu < l.nb_remboursees) && (
          <p className="hint">* Frais Stripe non mesuré pour les remboursements antérieurs à la mise en place du suivi - total sous-estimé pour ces lignes.</p>
        )}
      </div>
    </div>
  );
}
