import { useEffect, useState } from 'react';
import { Select } from '../components/Select';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LabelList,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutModerer, peutVoirActivite, peutVoirRevenus } from '../lib/permissions';
import { DataTable, type Column } from '../components/DataTable';
import { useFicheCompte, VoirFicheButton } from '../components/FicheCompte';
import { nomComplet } from '../lib/labels';
import { Avatar } from '../components/Avatar';
import { AnimatedNumber, Kpi, VizTooltip, euros, pourcent } from '../components/Kpi';
import { useLocation } from 'react-router-dom';
import { CommunauteTab } from './dashboard/CommunauteTab';
import { MarcheTab } from './dashboard/MarcheTab';
import { ListeAFaire } from './AFairePage';
import { nbActions, useAFaire } from '../lib/aFaire';
import type {
  CompteActif, StatsRevenusJour, StatsColisJour,
  RepartitionTransaction, RepartitionTypeEnvoi,
} from '../lib/types';

type Tab = 'activite' | 'communaute' | 'marche' | 'colis' | 'finance' | 'afaire';

const TAB_LABELS: Record<Tab, string> = {
  activite: 'Activité',
  communaute: 'Communauté',
  marche: 'Marché',
  colis: 'Colis',
  finance: 'Finance',
  afaire: 'À faire',
};

function premierMot(v?: string | null): string {
  const m = (v ?? '').trim().split(/[\s@]+/)[0] ?? '';
  return m ? m[0].toUpperCase() + m.slice(1).toLowerCase() : '';
}

function salutation(): string {
  const h = new Date().getHours();
  return h >= 18 || h < 5 ? 'Bonsoir' : 'Bonjour';
}

export function DashboardPage() {
  const { role, profil, email } = useAuth();
  const location = useLocation();
  const ongletDemande = (location.state as { tab?: Tab } | null)?.tab ?? null;
  const voitActivite = peutVoirActivite(role);
  const voitRevenus = peutVoirRevenus(role);
  const onglets: Tab[] = [
    ...(voitActivite ? (['activite', 'communaute', 'marche', 'colis'] as Tab[]) : []),
    ...(voitRevenus ? (['finance'] as Tab[]) : []),
    'afaire',
  ];
  const [tab, setTab] = useState<Tab | null>(ongletDemande);
  useEffect(() => { if (ongletDemande) setTab(ongletDemande); }, [ongletDemande, location.key]);
  const activeTab = tab && onglets.includes(tab) ? tab : onglets[0] ?? null;
  // Un onglet deja visite reste monte (juste masque) : ses graphiques ne
  // rejouent pas leur animation d'entree et ses donnees ne sont pas
  // rechargees a chaque retour dessus.
  const [visites, setVisites] = useState<Set<Tab>>(() => (activeTab ? new Set([activeTab]) : new Set()));
  useEffect(() => {
    if (activeTab && !visites.has(activeTab)) setVisites((v) => new Set(v).add(activeTab));
  }, [activeTab, visites]);
  const { items: aFaire, error: erreurAFaire } = useAFaire(activeTab);
  const nbAFaire = nbActions(aFaire);

  return (
    <div>
      <div className="greeting">
        <h1>{salutation()} {premierMot(profil?.nom ?? email)}</h1>
      </div>

      <div className="tabs">
        {onglets.map((t) => (
          <button key={t} className={activeTab === t ? 'active' : ''} onClick={() => setTab(t)}>
            {TAB_LABELS[t]}
            {t === 'afaire' && nbAFaire > 0 && <span className="tab-badge">{nbAFaire}</span>}
          </button>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
      {[...visites].map((t) => (
        <div
          key={t}
          style={activeTab === t
            ? { position: 'static', visibility: 'visible' }
            : { position: 'absolute', inset: 0, visibility: 'hidden', pointerEvents: 'none' }}
        >
          {t === 'activite' && <ActiviteTab />}
          {t === 'communaute' && <CommunauteTab />}
          {t === 'marche' && <MarcheTab />}
          {t === 'colis' && <ColisTab />}
          {t === 'finance' && <FinanceTab />}
          {t === 'afaire' && <ListeAFaire items={aFaire} error={erreurAFaire} />}
        </div>
      ))}
      </div>
    </div>
  );
}

interface StatsUtilisation {
  membres: number;
  maintenant: number;
  aujourdhui: number;
  semaine: number;
  mois: number;
  dau_moyen: number | null;
  serie: { jour: string; actifs: number }[];
}

function ActiviteTab() {
  const { role } = useAuth();
  const [u, setU] = useState<StatsUtilisation | null>(null);
  const [actifs, setActifs] = useState<CompteActif[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { ouvrir, modal } = useFicheCompte();

  useEffect(() => {
    supabase.rpc('admin_stats_utilisation', { p_jours: 30 }).then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setU(data as StatsUtilisation);
    });
    supabase.rpc('admin_comptes_plus_actifs', { p_limite: 5000 }).then(({ data }) => setActifs((data ?? []) as CompteActif[]));
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!u) return <p className="loading-state">Chargement…</p>;

  const tauxUtilisation = u.membres ? (u.mois / u.membres) * 100 : 0;
  const fidelite = u.mois ? (Number(u.dau_moyen ?? 0) / u.mois) * 100 : 0;

  const columns: Column<CompteActif>[] = [
    { key: 'avatar', label: 'Avatar', render: (c) => <Avatar src={c.photo_url} nom={nomComplet(c.prenom, c.nom)} size={36} />, width: 70 },
    { key: 'prenom', label: 'Prénom', value: (c) => c.prenom, render: (c) => <strong>{c.prenom || '-'}</strong> },
    { key: 'nom', label: 'Nom', value: (c) => c.nom },
    { key: 'livraisons', label: 'Livraisons', value: (c) => c.nombre_livraisons ?? 0 },
    { key: 'colis', label: 'Colis expédiés', value: (c) => c.nombre_colis_confies ?? 0 },
    { key: 'total', label: 'Total', value: (c) => (c.nombre_livraisons ?? 0) + (c.nombre_colis_confies ?? 0) },
    ...(peutModerer(role) ? [{ key: 'actions', label: '', render: (c: CompteActif) => <VoirFicheButton onClick={() => ouvrir(c.id)} />, width: 100 }] : []),
  ];

  return (
    <section className="viz-root">
      <div className="cards">
        <Kpi index={0} label="En ce moment" value={u.maintenant} hint="Actifs dans la dernière heure" />
        <Kpi index={1} label="Aujourd'hui" value={u.aujourdhui} hint="Dernières 24 heures" />
        <Kpi index={2} label="Cette semaine" value={u.semaine} hint="7 derniers jours" />
        <Kpi index={3} label="Ce mois (MAU)" value={u.mois} hint="30 derniers jours" />
        <Kpi index={4} label="Taux d'utilisation" value={tauxUtilisation} format={pourcent} hint={`${u.mois} membres actifs sur ${u.membres}`} />
        <Kpi index={5} label="Fidélité" value={fidelite} format={pourcent} hint="Reviennent chaque jour" />
      </div>

      <div className="chart-card">
        <h3>Membres actifs par jour</h3>
        <p className="chart-sub">Un membre est compté actif un jour s'il a ouvert l'app ce jour-là.</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={u.serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradActifs" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--teal)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--grid-line)" vertical={false} />
            <XAxis dataKey="jour" tickFormatter={(v) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={{ stroke: 'var(--axis-line)' }} tickLine={false} minTickGap={24} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<VizTooltip />} labelFormatter={(v) => new Date(v as string).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} />
            <Area type="monotone" dataKey="actifs" name="Membres actifs" stroke="var(--teal)" strokeWidth={2} fill="url(#gradActifs)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-card">
        <DataTable title="Comptes les plus actifs" rows={actifs} columns={columns} rowKey={(c) => c.id} initialSort={{ key: 'total', dir: 'desc' }} searchPlaceholder="Rechercher un compte…" limiteSansRecherche={10} pageSize={1000} />
      </div>
      {modal}
    </section>
  );
}

function ColisTab() {
  const [jours, setJours] = useState(30);
  const [temporel, setTemporel] = useState<StatsColisJour[] | null>(null);
  const [typeEnvoi, setTypeEnvoi] = useState<RepartitionTypeEnvoi[] | null>(null);
  const [statuts, setStatuts] = useState<{ label: string; nb: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTemporel(null);
    supabase.rpc('admin_stats_colis_temporel', { p_jours: jours }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setTemporel((data ?? []) as StatsColisJour[]);
    });
  }, [jours]);

  useEffect(() => {
    supabase.rpc('admin_repartition_type_envoi').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setTypeEnvoi((data ?? []) as RepartitionTypeEnvoi[]);
    });
    supabase.rpc('admin_stats_marche').then(({ data }) => {
      const m = data as { demandes: number; livrees: number; annulees: number; en_litige: number } | null;
      if (!m) return;
      const enCours = Math.max(0, m.demandes - m.livrees - m.annulees - m.en_litige);
      setStatuts([
        { label: 'Livrés', nb: m.livrees },
        { label: 'En cours', nb: enCours },
        { label: 'Annulés', nb: m.annulees },
        { label: 'En litige', nb: m.en_litige },
      ]);
    });
  }, []);

  if (error) return <p className="page-error">{error}</p>;

  const totalCrees = temporel?.reduce((s, d) => s + d.colis_crees, 0) ?? 0;
  const totalLivres = temporel?.reduce((s, d) => s + d.colis_livres, 0) ?? 0;
  const tauxLivraison = totalCrees ? Math.round((totalLivres / totalCrees) * 100) : null;
  const typeLabels: Record<string, string> = { colis: 'Colis', document: 'Documents' };

  return (
    <section className="viz-root">
      <div className="chart-card">
        <div className="chart-head">
          <div>
            <h3>Colis créés et livrés</h3>
            <p className="chart-sub">Évolution quotidienne sur {jours} jours</p>
          </div>
          <Select
            ariaLabel="Période"
            size="sm"
            value={String(jours)}
            onChange={(v) => setJours(Number(v))}
            minWidth={170}
            options={[
              { value: '7', label: '7 derniers jours' },
              { value: '30', label: '30 derniers jours' },
              { value: '90', label: '90 derniers jours' },
            ]}
          />
        </div>
        <div className="stat-strip">
          <div><span className="dot" style={{ background: 'var(--teal)' }} /><strong><AnimatedNumber value={totalCrees} /></strong> créés</div>
          <div><span className="dot" style={{ background: 'var(--brown)' }} /><strong><AnimatedNumber value={totalLivres} /></strong> livrés</div>
          <div><strong>{tauxLivraison === null ? '-' : `${tauxLivraison} %`}</strong> livrés / créés sur la période</div>
        </div>
        {!temporel ? <p className="loading-state">Chargement…</p> : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={temporel} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradCrees" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--teal)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradLivres" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brown)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--brown)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--grid-line)" vertical={false} />
              <XAxis dataKey="jour" tickFormatter={(v) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={{ stroke: 'var(--axis-line)' }} tickLine={false} minTickGap={24} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={40} />
              <Tooltip content={<VizTooltip />} labelFormatter={(v) => new Date(v as string).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} />
              <Area type="monotone" dataKey="colis_crees" name="Créés" stroke="var(--teal)" strokeWidth={2} fill="url(#gradCrees)" isAnimationActive={false} />
              <Area type="monotone" dataKey="colis_livres" name="Livrés" stroke="var(--brown)" strokeWidth={2} fill="url(#gradLivres)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <h3>Type d'envoi</h3>
          <p className="chart-sub">Toutes périodes confondues</p>
          {!typeEnvoi ? <p className="hint">Chargement…</p> : (
            <ResponsiveContainer width="100%" height={Math.max(120, typeEnvoi.length * 48)}>
              <BarChart data={typeEnvoi.map((t) => ({ ...t, label: typeLabels[t.type_envoi] ?? t.type_envoi }))} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 12.5, fill: 'var(--text)' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--hover)' }} />
                <Bar dataKey="nb" name="Envois" fill="var(--teal)" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                  <LabelList dataKey="nb" position="right" style={{ fill: 'var(--text)', fontSize: 12, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="chart-card">
          <h3>Statut des transports</h3>
          <p className="chart-sub">Toutes les demandes, toutes périodes</p>
          {!statuts ? <p className="hint">Chargement…</p> : (
            <ResponsiveContainer width="100%" height={Math.max(120, statuts.length * 40)}>
              <BarChart data={statuts} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
                <XAxis type="number" hide allowDecimals={false} />
                <YAxis dataKey="label" type="category" tick={{ fontSize: 12.5, fill: 'var(--text)' }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--hover)' }} />
                <Bar dataKey="nb" name="Transports" fill="var(--teal)" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                  <LabelList dataKey="nb" position="right" style={{ fill: 'var(--text)', fontSize: 12, fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

// Etapes de l'argent d'un transport, dans l'ordre du parcours. Couleurs :
// palette categorielle validee (slots 1-4), le libelle et le texte portent le sens.
const ETAPES_PAIEMENT: { statut: string; label: string; sens: string; couleur: string; commissionAcquise: boolean }[] = [
  { statut: 'libere', label: 'Libéré', sens: 'Colis livré, voyageur payé : transaction terminée.', couleur: 'var(--series-1)', commissionAcquise: true },
  { statut: 'escrow', label: 'En séquestre', sens: 'Payé par l\'expéditeur, retenu par Wonjo jusqu\'à la livraison.', couleur: 'var(--series-2)', commissionAcquise: true },
  { statut: 'en_attente', label: 'En attente de paiement', sens: 'Demande créée, l\'expéditeur n\'a pas encore payé.', couleur: 'var(--series-3)', commissionAcquise: false },
  { statut: 'rembourse', label: 'Remboursé', sens: 'Argent rendu à l\'expéditeur, aucune commission gagnée.', couleur: 'var(--series-4)', commissionAcquise: false },
];

function FinanceTab() {
  const [revenus, setRevenus] = useState<StatsRevenusJour[]>([]);
  const [repartition, setRepartition] = useState<RepartitionTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_stats_revenus', { p_jours: 30 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setRevenus((data ?? []) as StatsRevenusJour[]);
    });
    supabase.rpc('admin_repartition_transactions').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setRepartition((data ?? []) as RepartitionTransaction[]);
    });
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!repartition) return <p className="loading-state">Chargement…</p>;

  const ligne = (statut: string) => repartition.find((r) => r.statut_paiement === statut);
  const val = (statut: string, champ: 'nb' | 'montant' | 'commission') => Number(ligne(statut)?.[champ] ?? 0);
  const commissionEncaissee = val('libere', 'commission');
  const commissionAVenir = val('escrow', 'commission');
  const commission30j = revenus.reduce((s, r) => s + Number(r.commission), 0);
  const totalTransactions = repartition.reduce((s, r) => s + Number(r.nb), 0);
  const payees = val('libere', 'nb') + val('escrow', 'nb');
  const totalMontant = repartition.reduce((s, r) => s + Number(r.montant), 0);
  const autres = repartition.filter((r) => !ETAPES_PAIEMENT.some((e) => e.statut === r.statut_paiement));

  return (
    <section className="viz-root">
      <div className="cards">
        <Kpi index={0} label="Commission encaissée" value={commissionEncaissee} format={euros} hint="Gagnée sur les transports terminés" />
        <Kpi index={1} label="Commission à venir" value={commissionAVenir} format={euros} hint="Encaissée à la livraison" />
        <Kpi index={2} label="Commission (30 jours)" value={commission30j} format={euros} hint="Transports terminés ce mois-ci" />
        <Kpi index={3} label="Transactions payées" value={payees} hint={`sur ${totalTransactions} demandes`} />
        <Kpi index={4} label="Remboursements" value={val('rembourse', 'montant')} format={euros} hint={`${val('rembourse', 'nb')} transaction(s)`} />
      </div>

      <div className="chart-card">
        <h3>Où en est l'argent des transports</h3>
        <p className="chart-sub">
          Le <b>montant du transport</b> revient au voyageur ; la <b>commission</b> est ce que gagne Wonjo en plus, payée par l'expéditeur.
        </p>
        {totalMontant > 0 && (
          <div className="money-bar" role="img" aria-label="Répartition des montants par étape de paiement">
            {ETAPES_PAIEMENT.map((e) => {
              const m = val(e.statut, 'montant');
              return m > 0 ? <span key={e.statut} style={{ flexGrow: m, background: e.couleur }} title={`${e.label} : ${euros(m)}`} /> : null;
            })}
          </div>
        )}
        <div className="dt-wrap" style={{ marginTop: 14 }}>
          <table>
            <thead>
              <tr><th>Étape</th><th>Ce que ça veut dire</th><th>Transactions</th><th>Montant du transport</th><th>Commission Wonjo</th></tr>
            </thead>
            <tbody>
              {ETAPES_PAIEMENT.map((e) => (
                <tr key={e.statut}>
                  <td><span className="etape"><span className="dot" style={{ background: e.couleur }} />{e.label}</span></td>
                  <td className="hint">{e.sens}</td>
                  <td>{val(e.statut, 'nb')}</td>
                  <td>{euros(val(e.statut, 'montant'))}</td>
                  <td>
                    {e.statut === 'rembourse' ? <span className="hint">-</span>
                      : e.commissionAcquise ? <strong>{euros(val(e.statut, 'commission'))}</strong>
                        : <span className="hint">{euros(val(e.statut, 'commission'))} si payé</span>}
                  </td>
                </tr>
              ))}
              {autres.map((r) => (
                <tr key={r.statut_paiement}>
                  <td>{r.statut_paiement}</td><td className="hint">-</td><td>{r.nb}</td><td>{euros(Number(r.montant))}</td><td>{euros(Number(r.commission))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-card">
        <h3>Transports terminés, jour par jour (30 derniers jours)</h3>
        <p className="chart-sub">Seulement les transactions libérées : colis livré et voyageur payé.</p>
        <DataTable
          rows={revenus}
          rowKey={(r) => r.jour}
          initialSort={{ key: 'jour', dir: 'desc' }}
          emptyText="Aucun transport terminé sur la période."
          columns={[
            { key: 'jour', label: 'Jour', value: (r) => r.jour, render: (r) => new Date(r.jour).toLocaleDateString('fr-FR') },
            { key: 'volume', label: 'Montant des transports', value: (r) => Number(r.volume_total), render: (r) => euros(Number(r.volume_total)) },
            { key: 'commission', label: 'Commission Wonjo', value: (r) => Number(r.commission), render: (r) => <strong>{euros(Number(r.commission))}</strong> },
            { key: 'nb', label: 'Transactions', value: (r) => Number(r.nb_transactions) },
          ]}
        />
      </div>
    </section>
  );
}
