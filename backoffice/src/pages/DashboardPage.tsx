import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutVoirActivite, peutVoirRevenus } from '../lib/permissions';
import type { CompteActif, StatsActivite, StatsRevenusJour } from '../lib/types';

export function DashboardPage() {
  const { role } = useAuth();
  return (
    <div>
      <h1>Tableau de bord</h1>
      {peutVoirActivite(role) && <ActiviteSection />}
      {peutVoirRevenus(role) && <RevenusSection />}
      {!peutVoirActivite(role) && !peutVoirRevenus(role) && (
        <p>Aucune donnée à afficher pour votre rôle.</p>
      )}
    </div>
  );
}

function ActiviteSection() {
  const [stats, setStats] = useState<StatsActivite | null>(null);
  const [actifs, setActifs] = useState<CompteActif[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [statsRes, actifsRes] = await Promise.all([
        supabase.rpc('admin_stats_activite').single(),
        supabase.rpc('admin_comptes_plus_actifs', { p_limite: 10 }),
      ]);
      if (statsRes.error) { setError(statsRes.error.message); return; }
      setStats(statsRes.data as StatsActivite);
      setActifs((actifsRes.data ?? []) as CompteActif[]);
    }
    load();
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!stats) return <p>Chargement…</p>;

  return (
    <section>
      <h2>Activité</h2>
      <div className="cards">
        <Card label="Inscriptions (7j)" value={stats.inscriptions_7j} />
        <Card label="Inscriptions (30j)" value={stats.inscriptions_30j} />
        <Card label="Comptes bloqués" value={stats.comptes_bloques} />
        <Card label="KYC en attente" value={stats.kyc_en_attente} />
        <Card label="Litiges ouverts" value={stats.litiges_ouverts} />
        <Card label="Signalements nouveaux" value={stats.signalements_nouveaux} />
      </div>

      <h3>Comptes les plus actifs</h3>
      <table>
        <thead><tr><th>Nom</th><th>Livraisons</th><th>Colis confiés</th></tr></thead>
        <tbody>
          {actifs.map((c) => (
            <tr key={c.id}>
              <td>{c.prenom} {c.nom}</td>
              <td>{c.nombre_livraisons ?? 0}</td>
              <td>{c.nombre_colis_confies ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RevenusSection() {
  const [revenus, setRevenus] = useState<StatsRevenusJour[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_stats_revenus', { p_jours: 30 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setRevenus((data ?? []) as StatsRevenusJour[]);
    });
  }, []);

  if (error) return <p className="page-error">{error}</p>;

  const volume30j = revenus.reduce((s, r) => s + Number(r.volume_total), 0);
  const commission30j = revenus.reduce((s, r) => s + Number(r.commission), 0);

  return (
    <section>
      <h2>Revenus (30 derniers jours)</h2>
      <div className="cards">
        <Card label="Volume (30j)" value={`${volume30j.toFixed(2)} €`} />
        <Card label="Commission (30j)" value={`${commission30j.toFixed(2)} €`} />
      </div>
      <table>
        <thead><tr><th>Jour</th><th>Volume</th><th>Commission</th><th>Transactions</th></tr></thead>
        <tbody>
          {revenus.map((r) => (
            <tr key={r.jour}>
              <td>{new Date(r.jour).toLocaleDateString('fr-FR')}</td>
              <td>{Number(r.volume_total).toFixed(2)} €</td>
              <td>{Number(r.commission).toFixed(2)} €</td>
              <td>{r.nb_transactions}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <span className="card-value">{value}</span>
      <span className="card-label">{label}</span>
    </div>
  );
}
