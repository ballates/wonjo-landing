import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../auth/AuthContext';
import { peutVoirRevenus } from '../../lib/permissions';
import { continentDe } from '../../lib/continents';
import { Kpi, VizTooltip, euros, pourcent } from '../../components/Kpi';

interface StatsMarche {
  annonces: Record<string, number>;
  offres: Record<string, number>;
  corridors: { corridor: string; pays_arrivee_code: string | null; trajets: number; colis: number }[];
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
  const [continent, setContinent] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_stats_marche').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setS(data as StatsMarche);
    });
  }, []);

  const continents = useMemo(() => {
    const vus = new Set((s?.corridors ?? []).map((c) => continentDe(c.pays_arrivee_code)));
    return [...vus].filter((c) => c !== 'Autre').sort((a, b) => a.localeCompare(b, 'fr'));
  }, [s]);

  const itineraires = useMemo(() => {
    const tous = s?.corridors ?? [];
    const filtres = continent ? tous.filter((c) => continentDe(c.pays_arrivee_code) === continent) : tous;
    return filtres.slice(0, 5);
  }, [s, continent]);

  if (error) return <p className="page-error">{error}</p>;
  if (!s) return <p className="loading-state">Chargement…</p>;

  const tauxLivraison = s.demandes ? (s.livrees / s.demandes) * 100 : 0;
  const tauxAnnulation = s.demandes ? (s.annulees / s.demandes) * 100 : 0;
  const kilosOfferts = Number(s.kilos_offerts_actifs);
  const kilosDemandes = Number(s.kilos_demandes_actifs);
  const manque = kilosDemandes - kilosOfferts;
  const capaciteCouverte = kilosDemandes ? Math.min(100, (kilosOfferts / kilosDemandes) * 100) : 100;

  return (
    <section className="viz-root">
      <div className="cards">
        <Kpi index={0} label="Demandes" value={s.demandes} hint="de transport" />
        <Kpi index={1} label="Taux de livraison" value={tauxLivraison} format={pourcent} hint={`${s.livrees} livrées`} />
        <Kpi index={2} label="Taux d'annulation" value={tauxAnnulation} format={pourcent} hint={`${s.annulees} annulées`} />
        <Kpi index={3} label="Délai moyen" value={Number(s.delai_moyen_jours ?? 0)} format={(n) => `${n.toFixed(1)} j`} hint="création → livraison" />
        <Kpi index={4} label="Capacité couverte" value={capaciteCouverte} format={pourcent} hint={manque > 0 ? `Il manque ${manque} kg de capacité` : 'La demande est couverte'} />
        {voitEuros && <Kpi index={5} label="Panier moyen" value={Number(s.panier_moyen ?? 0)} format={euros} />}
      </div>

      <div className={`insight-banner ${manque > 0 ? 'warn' : ''}`}>
        <div>
          <p className="insight-oneline">
            <strong>Offre et demande : </strong>
            {Number(s.kilos_demandes_actifs)} kg demandés · {Number(s.kilos_offerts_actifs)} kg proposés
            {manque > 0 ? ` · manque ${manque} kg, recrutez des voyageurs` : ' · capacité suffisante'}
          </p>
        </div>
      </div>

      <div className="chart-card">
        <h3>Itinéraires les plus demandés</h3>
        <p className="chart-sub">Trajets proposés par les voyageurs face aux colis publiés par les expéditeurs, par ville. Les 5 plus demandés{continent ? ` en arrivée en ${continent}` : ''}.</p>
        <div className="chart-with-side">
          <ResponsiveContainer width="100%" height={Math.max(220, itineraires.length * 44)}>
            <BarChart data={itineraires} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }} barGap={2}>
              <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="corridor" type="category" tick={{ fontSize: 12, fill: 'var(--text)' }} axisLine={false} tickLine={false} width={170} />
              <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--hover)' }} />
              <Legend wrapperStyle={{ fontSize: 12.5 }} formatter={(v) => <span style={{ color: 'var(--muted)' }}>{v}</span>} />
              <Bar dataKey="trajets" name="Trajets proposés" fill="var(--teal)" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} />
              <Bar dataKey="colis" name="Colis à expédier" fill="var(--brown)" radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          {continents.length > 0 && (
            <div className="chart-side-filters">
              <button type="button" className={`chip-filter ${!continent ? 'on' : ''}`} onClick={() => setContinent(null)}>Tous</button>
              {continents.map((c) => (
                <button key={c} type="button" className={`chip-filter ${continent === c ? 'on' : ''}`} onClick={() => setContinent(c)}>{c}</button>
              ))}
            </div>
          )}
        </div>
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
