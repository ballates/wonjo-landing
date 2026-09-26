import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { peutVoirRevenus } from '../../lib/permissions';
import { Kpi, VizTooltip, euros, pourcent } from '../../components/Kpi';

interface StatsMarche {
  annonces: Record<string, number>;
  offres: Record<string, number>;
  corridors: { corridor: string; trajets: number; colis: number }[];
  demandes: number;
  livrees: number;
  annulees: number;
  en_litige: number;
  delai_moyen_jours: number | null;
  poids_moyen_kg: number | null;
  panier_moyen: number | null;
  prix_kilo_trajets: number | null;
  budget_kilo_colis: number | null;
  kilos_offerts_actifs: number;
  kilos_demandes_actifs: number;
  messages_total: number;
  messages_30j: number;
  alertes_actives: number;
}

const LABELS_STATUT: Record<string, string> = {
  active: 'Actives', en_cours: 'En cours', expiree: 'Expirées', supprimee: 'Supprimées', inconnu: 'Inconnu',
};

export function MarcheTab() {
  const { role } = useAuth();
  const voitEuros = peutVoirRevenus(role);
  const [s, setS] = useState<StatsMarche | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_stats_marche').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setS(data as StatsMarche);
    });
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!s) return <p className="loading-state">Chargement…</p>;

  const tauxLivraison = s.demandes ? (s.livrees / s.demandes) * 100 : 0;
  const tauxAnnulation = s.demandes ? (s.annulees / s.demandes) * 100 : 0;
  const manque = Number(s.kilos_demandes_actifs) - Number(s.kilos_offerts_actifs);

  return (
    <section className="viz-root">
      <div className="cards">
        <Kpi index={0} label="Demandes de transport" value={s.demandes} />
        <Kpi index={1} label="Taux de livraison" value={tauxLivraison} format={pourcent} hint={`${s.livrees} livrées`} />
        <Kpi index={2} label="Taux d'annulation" value={tauxAnnulation} format={pourcent} hint={`${s.annulees} annulées`} />
        <Kpi index={3} label="Délai moyen" value={Number(s.delai_moyen_jours ?? 0)} format={(n) => `${n.toFixed(1)} j`} hint="création → livraison" />
        <Kpi index={4} label="Poids moyen" value={Number(s.poids_moyen_kg ?? 0)} format={(n) => `${n.toFixed(1)} kg`} />
        {voitEuros && <Kpi index={5} label="Panier moyen" value={Number(s.panier_moyen ?? 0)} format={euros} />}
      </div>

      <div className={`insight-banner ${manque > 0 ? 'warn' : ''}`}>
        <div>
          <strong>Offre et demande en ce moment</strong>
          <span>
            {Number(s.kilos_demandes_actifs)} kg de colis attendent un voyageur, pour {Number(s.kilos_offerts_actifs)} kg de capacité proposée par les trajets actifs.
            {manque > 0 ? ` Il manque ${manque} kg de capacité : c'est le moment de recruter des voyageurs.` : ' La capacité couvre la demande.'}
          </span>
        </div>
      </div>

      <div className="chart-card">
        <h3>Corridors les plus demandés</h3>
        <p className="chart-sub">Trajets proposés par les voyageurs face aux colis publiés par les expéditeurs, par ville.</p>
        <ResponsiveContainer width="100%" height={Math.max(220, s.corridors.length * 44)}>
          <BarChart data={s.corridors} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barGap={2}>
            <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis dataKey="corridor" type="category" tick={{ fontSize: 12, fill: 'var(--text)' }} axisLine={false} tickLine={false} width={170} />
            <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--hover)' }} />
            <Legend wrapperStyle={{ fontSize: 12.5 }} formatter={(v) => <span style={{ color: 'var(--muted)' }}>{v}</span>} />
            <Bar dataKey="trajets" name="Trajets proposés" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={14} />
            <Bar dataKey="colis" name="Colis à envoyer" fill="var(--series-2)" radius={[0, 4, 4, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <h3>Annonces et colis publiés</h3>
          <div className="stat-list">
            {Object.entries(s.annonces).map(([k, n]) => (
              <div key={`a-${k}`}><strong>{n}</strong><span>trajets {LABELS_STATUT[k]?.toLowerCase() ?? k}</span></div>
            ))}
            {Object.entries(s.offres).map(([k, n]) => (
              <div key={`o-${k}`}><strong>{n}</strong><span>colis {LABELS_STATUT[k]?.toLowerCase() ?? k}</span></div>
            ))}
          </div>
        </div>
        <div className="chart-card">
          <h3>Engagement</h3>
          <div className="stat-list">
            <div><strong>{s.messages_30j}</strong><span>messages échangés (30 jours)</span></div>
            <div><strong>{s.messages_total}</strong><span>messages au total</span></div>
            <div><strong>{s.en_litige}</strong><span>transport(s) en litige</span></div>
            <div><strong>{s.alertes_actives}</strong><span>alertes destination actives</span></div>
            {voitEuros && <div><strong>{s.prix_kilo_trajets ?? '-'} €</strong><span>prix moyen / kg proposé par les voyageurs</span></div>}
            {voitEuros && <div><strong>{s.budget_kilo_colis ?? '-'} €</strong><span>budget moyen / kg des expéditeurs</span></div>}
          </div>
        </div>
      </div>
    </section>
  );
}
