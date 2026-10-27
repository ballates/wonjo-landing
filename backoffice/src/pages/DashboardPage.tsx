import { decimales } from '../lib/nombre';
import { useEffect, useRef, useState } from 'react';
import { Select } from '../components/Select';
import { FiltrePeriode } from '../components/FiltrePeriode';
import { libellePlage, plageDuRaccourci, type Plage } from '../lib/periode';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, LabelList, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutModerer, peutVoirActivite, peutVoirAlertes, peutVoirColis, peutVoirRevenus } from '../lib/permissions';
import { DataTable, type Column } from '../components/DataTable';
import { useFicheCompte, VoirFicheButton } from '../components/FicheCompte';
import { LABELS_TYPE_ENVOI, casserNom, casserPrenom, nomComplet, versDate } from '../lib/labels';
import { Avatar } from '../components/Avatar';
import { AnimatedNumber, Kpi, VizTooltip, euros, pourcent } from '../components/Kpi';
import { useLocation } from 'react-router-dom';
import { CommunauteTab } from './dashboard/CommunauteTab';
import { MarcheTab } from './dashboard/MarcheTab';
import { ServicesTab } from './dashboard/ServicesTab';
import { ListeAFaire } from './AFairePage';
import { RapprochementFinance } from '../components/RapprochementFinance';
import { nbActions, useAFaire } from '../lib/aFaire';
import type {
  CompteActif, StatsRevenusJour, StatsColisJour,
  RepartitionTransaction, RepartitionTypeEnvoi, RepartitionCommissionTypeEnvoi,
  RepartitionAnnulations, TopAnnulateur,
} from '../lib/types';

type Tab = 'activite' | 'communaute' | 'marche' | 'colis' | 'finance' | 'services' | 'afaire';

const TAB_LABELS: Record<Tab, string> = {
  activite: 'Activité',
  communaute: 'Communauté',
  marche: 'Marché',
  colis: 'Colis',
  finance: 'Finance',
  services: 'Services',
  afaire: 'Alertes',
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
  const { roles, profil, email } = useAuth();
  const location = useLocation();
  const ongletDemande = (location.state as { tab?: Tab } | null)?.tab ?? null;
  const voitActivite = peutVoirActivite(roles);
  const voitRevenus = peutVoirRevenus(roles);
  const voitAlertes = peutVoirAlertes(roles);
  const onglets: Tab[] = [
    ...(voitActivite ? (['activite', 'communaute', 'marche'] as Tab[]) : []),
    ...(peutVoirColis(roles) ? (['colis'] as Tab[]) : []),
    ...(voitRevenus ? (['finance', 'services'] as Tab[]) : []),
    ...(voitAlertes ? (['afaire'] as Tab[]) : []),
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
  const { items: aFaire, error: erreurAFaire } = useAFaire(activeTab, voitAlertes);
  const nbAFaire = nbActions(aFaire);

  return (
    <div>
      <div className="greeting">
        <h1>{salutation()} {profil?.nom_affiche || premierMot(profil?.nom ?? email)}</h1>
      </div>

      {onglets.length === 0 && (
        <p className="hint">Aucun indicateur n'est ouvert à vos rôles. Utilisez le menu pour accéder à vos pages.</p>
      )}
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
          {t === 'services' && <ServicesTab />}
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
  const { roles } = useAuth();
  const [u, setU] = useState<StatsUtilisation | null>(null);
  const [actifs, setActifs] = useState<CompteActif[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [joursSerie, setJoursSerie] = useState(7);
  const { ouvrir, modal } = useFicheCompte();

  useEffect(() => {
    supabase.rpc('admin_stats_utilisation', { p_jours: 30 }).then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setU(data as StatsUtilisation);
    });
    // Liste secondaire : refusee par le serveur aux roles data/stagiaire, qui
    // voient pourtant cet onglet - l'erreur ne doit pas masquer les stats.
    supabase.rpc('admin_comptes_plus_actifs', { p_limite: 200 }).then(({ data, error: e }) => { if (e) { setActifs([]); return; } setActifs((data ?? []) as CompteActif[]); });
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!u) return <p className="loading-state">Chargement…</p>;

  const tauxUtilisation = u.membres ? (u.mois / u.membres) * 100 : 0;
  const fidelite = u.mois ? (Number(u.dau_moyen ?? 0) / u.mois) * 100 : 0;
  const serieAffichee = u.serie.slice(-joursSerie);

  const columns: Column<CompteActif>[] = [
    { key: 'avatar', label: 'Avatar', render: (c) => <Avatar src={c.photo_url} nom={nomComplet(c.prenom, c.nom)} size={36} />, width: 70 },
    { key: 'prenom', label: 'Prénom', value: (c) => c.prenom, render: (c) => <strong>{casserPrenom(c.prenom)}</strong> },
    { key: 'nom', label: 'Nom', value: (c) => c.nom, render: (c) => casserNom(c.nom) },
    { key: 'livraisons', label: 'Livraisons', value: (c) => c.nombre_livraisons ?? 0 },
    { key: 'colis', label: 'Colis expédiés', value: (c) => c.nombre_colis_confies ?? 0 },
    { key: 'total', label: 'Total', value: (c) => (c.nombre_livraisons ?? 0) + (c.nombre_colis_confies ?? 0) },
    ...(peutModerer(roles) ? [{ key: 'actions', label: '', render: (c: CompteActif) => <VoirFicheButton onClick={() => ouvrir(c.id)} />, width: 100 }] : []),
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
        <div className="chart-head">
          <div>
            <h3>Membres actifs par jour</h3>
            <p className="chart-sub">Un membre est compté actif un jour s'il a ouvert l'app ce jour-là.</p>
          </div>
          <Select
            ariaLabel="Période"
            size="sm"
            value={String(joursSerie)}
            onChange={(v) => setJoursSerie(Number(v))}
            minWidth={170}
            options={[
              { value: '7', label: '7 derniers jours' },
              { value: '30', label: '30 derniers jours' },
            ]}
          />
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={serieAffichee} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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

      <div className="chart-card comptes-actifs-table">
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
    supabase.rpc('admin_stats_marche').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
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
              <BarChart data={typeEnvoi.map((t) => ({ ...t, label: LABELS_TYPE_ENVOI[t.type_envoi] ?? t.type_envoi }))} layout="vertical" margin={{ top: 0, right: 40, left: 8, bottom: 0 }}>
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
  { statut: 'rembourse', label: 'Remboursé', sens: 'Argent rendu à l\'expéditeur, aucune commission gagnée (les frais Stripe, eux, sont perdus).', couleur: 'var(--series-4)', commissionAcquise: false },
];

const COULEURS_TYPE_ENVOI: Record<string, string> = { colis: 'var(--teal)', document: 'var(--brown)', inconnu: 'var(--muted)' };

// [344] Marge nette : commission + protection - frais Stripe (reels, sinon estimes).
interface StatsMarge {
  commission_acquise: number; commission_a_venir: number;
  protection_acquise: number; protection_a_venir: number;
  renforcee_acquise: number; renforcee_a_venir: number;
  stripe_acquis: number; stripe_a_venir: number; stripe_perdu: number;
  nb_reel: number; nb_estime: number; nb_livrees: number;
  marge_nette_acquise: number; marge_nette_a_venir: number;
  estimation_fixe: number; estimation_pct: number; frais_confirmes: boolean;
}

// [345] Les memes series que la commission brute, avec la marge nette a cote.
interface RevenuJourMarge extends StatsRevenusJour { marge_nette: number }
interface RepartitionTypeMarge extends RepartitionCommissionTypeEnvoi { marge_nette: number }
interface RepartitionEtapeMarge { statut_paiement: string; nb: number; commission: number; marge_nette: number }
type ModeFinance = 'nette' | 'brute';
const CLE_MODE_FINANCE = 'bo.finance.mode';

function modeFinanceMemorise(): ModeFinance {
  try { return localStorage.getItem(CLE_MODE_FINANCE) === 'brute' ? 'brute' : 'nette'; } catch { return 'nette'; }
}

function FinanceTab() {
  const { roles } = useAuth();
  const [marge, setMarge] = useState<StatsMarge | null>(null);
  const [marge30, setMarge30] = useState<StatsMarge | null>(null);
  const [revenus, setRevenus] = useState<RevenuJourMarge[]>([]);
  const [repartition, setRepartition] = useState<RepartitionTransaction[] | null>(null);
  const [margesEtapes, setMargesEtapes] = useState<RepartitionEtapeMarge[]>([]);
  const [repartitionType, setRepartitionType] = useState<RepartitionTypeMarge[]>([]);
  const [mode, setMode] = useState<ModeFinance>(modeFinanceMemorise);
  const [fraisFixeSaisi, setFraisFixeSaisi] = useState('');
  const [fraisPctSaisi, setFraisPctSaisi] = useState('');
  const [fraisConfirmes, setFraisConfirmes] = useState(false);
  const [busyFrais, setBusyFrais] = useState(false);
  const [erreurFrais, setErreurFrais] = useState<string | null>(null);
  const [annulations, setAnnulations] = useState<RepartitionAnnulations | null>(null);
  const [topAnnulateurs, setTopAnnulateurs] = useState<TopAnnulateur[]>([]);
  const [plage, setPlage] = useState<Plage>(() => plageDuRaccourci('30d'));
  const [tauxTaxe, setTauxTaxe] = useState(0);
  const [tauxTaxeSaisi, setTauxTaxeSaisi] = useState('');
  const [busyTaxe, setBusyTaxe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reglagesOuverts, setReglagesOuverts] = useState(false);
  const reglagesRef = useRef<HTMLDivElement>(null);
  const { ouvrir, modal } = useFicheCompte();

  // Panneau des réglages : se ferme en cliquant ailleurs ou avec Échap.
  useEffect(() => {
    if (!reglagesOuverts) return;
    const dehors = (e: MouseEvent) => { if (!reglagesRef.current?.contains(e.target as Node)) setReglagesOuverts(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setReglagesOuverts(false); };
    document.addEventListener('mousedown', dehors);
    window.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', dehors); window.removeEventListener('keydown', echap); };
  }, [reglagesOuverts]);

  function chargerTaxe() {
    supabase.rpc('admin_taux_taxe').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      const t = Number(data ?? 0);
      setTauxTaxe(t);
      setTauxTaxeSaisi(String(Math.round(t * 10000) / 100));
    });
  }

  // Ce qui suit la plage de dates : transports termines jour par jour et marge acquise sur la plage (migration 456).
  function chargerPeriode(p: Plage) {
    const plageRpc = { p_debut: p.from.toISOString(), p_fin: p.to.toISOString() };
    supabase.rpc('admin_stats_revenus_marge', { p_jours: null, ...plageRpc }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setRevenus((data ?? []) as RevenuJourMarge[]);
    });
    supabase.rpc('admin_stats_marge', { p_jours: null, ...plageRpc }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setMarge30(data as StatsMarge);
    });
  }

  function chargerMarges() {
    supabase.rpc('admin_stats_marge', { p_jours: null }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      const m = data as StatsMarge;
      setMarge(m);
      setFraisFixeSaisi(String(m.estimation_fixe));
      setFraisPctSaisi(String(Math.round(m.estimation_pct * 100000) / 1000));
      setFraisConfirmes(m.frais_confirmes);
    });
    supabase.rpc('admin_repartition_marge').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setMargesEtapes((data ?? []) as RepartitionEtapeMarge[]);
    });
    supabase.rpc('admin_repartition_marge_type_envoi').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setRepartitionType((data ?? []) as RepartitionTypeMarge[]);
    });
  }

  function choisirMode(m: ModeFinance) {
    setMode(m);
    try { localStorage.setItem(CLE_MODE_FINANCE, m); } catch { /* preference de confort seulement */ }
  }

  async function enregistrerFraisStripe() {
    const fixe = Number(fraisFixeSaisi.replace(',', '.'));
    const pct = Number(fraisPctSaisi.replace(',', '.'));
    if (!Number.isFinite(fixe) || fixe < 0 || fixe > 2) { setErreurFrais('La part fixe doit être comprise entre 0 et 2 €.'); return; }
    if (!Number.isFinite(pct) || pct < 0 || pct > 10) { setErreurFrais('Le pourcentage doit être compris entre 0 et 10 %.'); return; }
    setBusyFrais(true);
    setErreurFrais(null);
    const { error: rpcError } = await supabase.rpc('admin_definir_frais_stripe', { p_fixe: fixe, p_pct: pct / 100, p_confirme: fraisConfirmes });
    setBusyFrais(false);
    if (rpcError) { setErreurFrais(rpcError.message); return; }
    chargerMarges();
    chargerPeriode(plage);
  }

  useEffect(() => { chargerPeriode(plage); }, [plage]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chargerMarges();
    supabase.rpc('admin_repartition_transactions').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setRepartition((data ?? []) as RepartitionTransaction[]);
    });
    supabase.rpc('admin_repartition_annulations').single().then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setAnnulations(data as RepartitionAnnulations);
    });
    supabase.rpc('admin_top_annulateurs', { p_limite: 8 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setTopAnnulateurs((data ?? []) as TopAnnulateur[]);
    });
    chargerTaxe();
  }, []);

  async function enregistrerTaxe() {
    const v = Number(tauxTaxeSaisi.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 100) { setError('Le taux de taxe doit être compris entre 0 et 100 %.'); return; }
    setBusyTaxe(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_definir_taux_taxe', { p_taux: v / 100 });
    setBusyTaxe(false);
    if (rpcError) { setError(rpcError.message); return; }
    chargerTaxe();
  }

  if (error) return <p className="page-error">{error}</p>;
  // Les chiffres du haut attendent les trois lectures principales (plus de « 0,00 € » qui clignote avant l'arrivée des vrais chiffres). La carte de rapprochement,
  // la plus lente (elle lit Stripe), démarre tout de suite : même clé que plus bas, React garde la même carte au lieu de la recréer.
  if (!repartition || !marge || !marge30) {
    return (
      <section className="viz-root">
        <p className="loading-state">Chargement…</p>
        <RapprochementFinance key="rapprochement" />
      </section>
    );
  }

  const ligne = (statut: string) => repartition.find((r) => r.statut_paiement === statut);
  const val = (statut: string, champ: 'nb' | 'montant' | 'commission' | 'montant_paye' | 'frais_retenus') => Number(ligne(statut)?.[champ] ?? 0);
  // Frais de protection (valeur déclarée, protection renforcée) d'une étape : ce que les expéditeurs ont payé, moins la part du voyageur et la commission.
  const protectionEtape = (statut: string) => val(statut, 'montant_paye') - val(statut, 'montant') - val(statut, 'commission');
  // Un remboursement rend au client tout ce qu'il a payé, moins les frais retenus : pas seulement la part du voyageur.
  const rembourse = val('rembourse', 'montant_paye') - val('rembourse', 'frais_retenus');
  const commissionEncaissee = val('libere', 'commission');
  const commissionAVenir = val('escrow', 'commission');
  const commission30j = revenus.reduce((s, r) => s + Number(r.commission), 0);
  const net = mode === 'nette';
  const periode = libellePlage(plage);
  const margeEtape = (statut: string) => Number(margesEtapes.find((r) => r.statut_paiement === statut)?.marge_nette ?? 0);
  const typesPositifs = repartitionType.map((r) => ({ ...r, valeur: Math.max(0, Number(net ? r.marge_nette : r.commission)) }));
  const totalTransactions = repartition.reduce((s, r) => s + Number(r.nb), 0);
  const payees = val('libere', 'nb') + val('escrow', 'nb');
  const totalMontant = repartition.reduce((s, r) => s + Number(r.montant), 0);
  const autres = repartition.filter((r) => !ETAPES_PAIEMENT.some((e) => e.statut === r.statut_paiement));
  const commissionBrute = commissionEncaissee + commissionAVenir;
  const montantTaxe = commissionBrute * tauxTaxe;
  const commissionNette = commissionBrute - montantTaxe;
  const totalCommissionType = typesPositifs.reduce((s, r) => s + r.valeur, 0);
  const serieJours = [...revenus].reverse().map((r) => ({
    jour: r.jour, valeur: Number(net ? r.marge_nette : r.commission),
  }));

  return (
    <section className="viz-root">
      <div className="chart-head finance-mode">
        <FiltrePeriode valeur={plage} onChange={setPlage} />
        <div className="action-row" role="group" aria-label="Base de calcul des chiffres">
          <button type="button" className={`chip-filter ${net ? 'on' : ''}`} aria-pressed={net} onClick={() => choisirMode('nette')}>Marge nette</button>
          <button type="button" className={`chip-filter ${!net ? 'on' : ''}`} aria-pressed={!net} onClick={() => choisirMode('brute')}>Commission brute</button>
        </div>
        {roles.includes('super_admin') && (
          <div className="reglages-fin" ref={reglagesRef}>
            <button type="button" className={`chip-filter ${reglagesOuverts ? 'on' : ''}`} aria-expanded={reglagesOuverts} onClick={() => setReglagesOuverts((o) => !o)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: '-2px' }}>
                <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </svg>
              Réglages
            </button>
            {reglagesOuverts && (
              <div className="reglages-pop" role="dialog" aria-label="Réglages des frais Stripe estimés et de la taxe">
                <div className="reglages-section">
                  <p className="reglages-titre">Frais Stripe estimés</p>
                  <div className="reglages-ligne">
                    <label>
                      <span>Part fixe</span>
                      <div className="suffix-input"><input type="text" inputMode="decimal" value={fraisFixeSaisi} onChange={(e) => setFraisFixeSaisi(e.target.value)} /><span>€</span></div>
                    </label>
                    <label>
                      <span>Pourcentage débité</span>
                      <div className="suffix-input"><input type="text" inputMode="decimal" value={fraisPctSaisi} onChange={(e) => setFraisPctSaisi(e.target.value)} /><span>%</span></div>
                    </label>
                    <button className="btn btn-primary btn-sm" disabled={busyFrais} onClick={enregistrerFraisStripe}>Enregistrer</button>
                  </div>
                  <label className="check-inline reglages-case">
                    <input type="checkbox" checked={fraisConfirmes} onChange={(e) => setFraisConfirmes(e.target.checked)} />
                    Ce sont les frais de mon contrat
                  </label>
                  {erreurFrais && <p className="page-error" style={{ margin: '6px 0 0' }}>{erreurFrais}</p>}
                </div>
                <div className="reglages-section">
                  <p className="reglages-titre">Taxe sur la commission</p>
                  <div className="reglages-ligne">
                    <label>
                      <span>Taux de taxe</span>
                      <div className="suffix-input"><input type="text" inputMode="decimal" value={tauxTaxeSaisi} onChange={(e) => setTauxTaxeSaisi(e.target.value)} aria-label="Taux de taxe" /><span>%</span></div>
                    </label>
                    <button className="btn btn-primary btn-sm" disabled={busyTaxe} onClick={enregistrerTaxe}>Enregistrer</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="cards">
        <Kpi index={0} label={net ? 'Marge nette encaissée' : 'Commission encaissée'}
          value={net ? (marge?.marge_nette_acquise ?? 0) : commissionEncaissee} format={euros}
          hint={net ? 'Remboursements déduits' : 'Transports terminés'} />
        <Kpi index={1} label={net ? 'Marge nette à venir' : 'Commission à venir'}
          value={net ? (marge?.marge_nette_a_venir ?? 0) : commissionAVenir} format={euros}
          hint={net ? 'Payé, retenu en séquestre' : 'Encaissée à la livraison'} />
        <Kpi index={2} label={net ? 'Marge nette de la période' : 'Commission de la période'}
          value={net ? (marge30?.marge_nette_acquise ?? 0) : commission30j} format={euros} hint={`Transports terminés : ${periode.toLowerCase()}`} />
        <Kpi index={3} label="Transactions payées" value={payees} hint={`sur ${totalTransactions} demandes`} />
        <Kpi index={4} label="Remboursements" value={rembourse} format={(n) => (n > 0 ? `\u2212${euros(n)}` : euros(n))} hint={`${val('rembourse', 'nb')} transaction(s)`} />
        {marge && <Kpi index={5} label="Marge par transport" value={marge.nb_livrees > 0 ? marge.marge_nette_acquise / marge.nb_livrees : 0} format={euros} hint="Moyenne, transports terminés" />}
      </div>

      <RapprochementFinance key="rapprochement" />

      <div className="grid-2">
      {marge && (
        <div className="chart-card marge-carte">
          <h3>Marge nette : ce que Wonjo garde vraiment</h3>
          <div className="marge-table-cadre">
            <table className="marge-table">
              <thead><tr><th>Poste</th><th>Acquis</th><th>À venir</th></tr></thead>
              <tbody>
                <tr>
                  <td><span className="marge-pastille marge-pastille--plus" aria-hidden="true">+</span>Commission</td>
                  <td>{euros(marge.commission_acquise)}</td><td>{euros(marge.commission_a_venir)}</td>
                </tr>
                <tr>
                  <td>
                    <span className="marge-pastille marge-pastille--plus" aria-hidden="true">+</span>Frais liés à la valeur déclarée
                    {(marge.renforcee_acquise > 0 || marge.renforcee_a_venir > 0) && (
                      <small>dont protection renforcée {euros(marge.renforcee_acquise)} · {euros(marge.renforcee_a_venir)} à venir (à garder en réserve pour les casses)</small>
                    )}
                  </td>
                  <td>{euros(marge.protection_acquise)}</td><td>{euros(marge.protection_a_venir)}</td>
                </tr>
                <tr>
                  <td>
                    <span className="marge-pastille marge-pastille--moins" aria-hidden="true">−</span>Frais de paiement Stripe
                    <span className="rapp-tip rapp-tip--bas marge-puce" tabIndex={0}
                      data-tip={`${marge.nb_reel} frais réels, ${marge.nb_estime} ${marge.frais_confirmes ? 'au taux du contrat' : 'estimés'} (${decimales(marge.estimation_fixe, 2)} € + ${decimales(marge.estimation_pct * 100, 2)} %). Hors virements aux voyageurs et hors taxe.`}>
                      {marge.nb_reel} réels · {marge.nb_estime} {marge.frais_confirmes ? 'au contrat' : 'estimés'}
                    </span>
                  </td>
                  <td>{euros(marge.stripe_acquis)}</td><td>{euros(marge.stripe_a_venir)}</td>
                </tr>
                <tr>
                  <td><span className="marge-pastille marge-pastille--moins" aria-hidden="true">−</span>Frais Stripe perdus sur les remboursements</td>
                  <td>{euros(marge.stripe_perdu)}</td><td className="hint">-</td>
                </tr>
              </tbody>
              <tfoot>
                <tr><td>Marge nette</td><td>{euros(marge.marge_nette_acquise)}</td><td>{euros(marge.marge_nette_a_venir)}</td></tr>
              </tfoot>
            </table>
          </div>
          <div className="marge-taxe rapp-tip rapp-tip--bas" tabIndex={0} data-tip="Taxe calculée sur la commission seule. Taux à 0 % tant que la société n'est pas créée.">
            <span>Commission brute <b>{euros(commissionBrute)}</b></span>
            <span aria-hidden="true">→</span>
            <span>Taxe {decimales(tauxTaxe * 100, 1)} % <b>{euros(montantTaxe)}</b></span>
            <span aria-hidden="true">→</span>
            <span>Net de taxe <b>{euros(commissionNette)}</b></span>
          </div>
        </div>
      )}

        <div className="chart-card">
          <h3>{net ? 'D\'où vient la marge nette' : 'D\'où vient la commission'}</h3>
          <p className="chart-sub">{net ? 'Marge nette' : 'Commission'} par type d'envoi : colis ou enveloppe.</p>
          {totalCommissionType > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={typesPositifs}
                  dataKey="valeur"
                  nameKey="type_envoi"
                  cx="38%"
                  outerRadius={90}
                  isAnimationActive={false}
                  label={({ percent }) => `${Math.round((percent ?? 0) * 100)} %`}
                  labelLine={false}
                >
                  {typesPositifs.map((r) => (
                    <Cell key={r.type_envoi} fill={COULEURS_TYPE_ENVOI[r.type_envoi] ?? 'var(--muted)'} />
                  ))}
                </Pie>
                <Legend layout="vertical" verticalAlign="middle" align="right" formatter={(v: string) => LABELS_TYPE_ENVOI[v] ?? v} />
                <Tooltip content={<VizTooltip />} formatter={(v, n) => [euros(Number(v)), LABELS_TYPE_ENVOI[String(n)] ?? String(n)]} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="hint">{net ? 'Pas encore de marge nette à répartir.' : 'Pas encore de commission acquise à répartir.'}</p>}
          <p className="insight">
            {typesPositifs.map((r) => `${LABELS_TYPE_ENVOI[r.type_envoi] ?? r.type_envoi} : ${euros(Number(net ? r.marge_nette : r.commission))} (${totalCommissionType ? Math.round((r.valeur / totalCommissionType) * 100) : 0} %)`).join(' · ')}
          </p>
        </div>
      </div>

      <div className="chart-card">
        <h3>Annulations après acceptation</h3>
        <p className="chart-sub">Argent prélevé puis remboursé : Stripe garde ses frais. Avant prélèvement, une annulation ne coûte rien.</p>
        {annulations && (
          <div className="stat-list stat-list--nowrap">
            <div><strong>{annulations.nb_avant_charge}</strong><span>avant prélèvement</span></div>
            <div><strong>{annulations.nb_apres_charge}</strong><span>après prélèvement</span></div>
            <div><strong>{euros(annulations.montant_apres_charge)}</strong><span>montant remboursé</span></div>
            <div><strong>{euros(annulations.commission_perdue)}</strong><span>commission perdue</span></div>
          </div>
        )}

        {topAnnulateurs.length > 0 && (
          <div className="dt-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr><th>Compte</th><th>Annulations après charge</th><th>Montant concerné</th>{peutModerer(roles) && <th></th>}</tr>
              </thead>
              <tbody>
                {topAnnulateurs.map((a) => (
                  <tr key={a.user_id}>
                    <td>{nomComplet(a.prenom, a.nom) || a.email || 'Compte supprimé'}</td>
                    <td>{a.nb}</td>
                    <td>{euros(a.montant)}</td>
                    {peutModerer(roles) && <td><VoirFicheButton onClick={() => ouvrir(a.user_id)} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {modal}
      </div>

      <div className="chart-card">
        <h3>Où en est l'argent des transports</h3>
        <p className="chart-sub">Le <b>montant du transport</b> va au voyageur ; la <b>commission</b> et les <b>frais de protection</b> sont à Wonjo.</p>
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
              <tr><th>Étape</th><th>Ce que ça veut dire</th><th>Transactions</th><th>Montant du transport</th><th>Commission brute</th><th>Frais de protection</th><th>Marge nette</th></tr>
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
                  <td>
                    {e.statut === 'rembourse' || e.statut === 'en_attente' ? <span className="hint">-</span> : euros(protectionEtape(e.statut))}
                  </td>
                  <td>
                    {e.statut === 'en_attente' ? <span className="hint">-</span> : <strong>{euros(margeEtape(e.statut))}</strong>}
                  </td>
                </tr>
              ))}
              {autres.map((r) => (
                <tr key={r.statut_paiement}>
                  <td>{r.statut_paiement}</td><td className="hint">-</td><td>{r.nb}</td><td>{euros(Number(r.montant))}</td><td>{euros(Number(r.commission))}</td><td className="hint">-</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="chart-card">
        <h3>Transports terminés, jour par jour ({periode.toLowerCase()})</h3>
        <p className="chart-sub">Colis livrés et voyageurs payés. Les frais Stripe des remboursements sont dans le bloc Marge nette.</p>
        {serieJours.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={serieJours} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--grid-line)" vertical={false} />
              <XAxis dataKey="jour" tickFormatter={(v) => versDate(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={{ stroke: 'var(--axis-line)' }} tickLine={false} minTickGap={24} />
              <YAxis tickFormatter={(v) => euros(Number(v))} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<VizTooltip formatter={(v) => euros(Number(v))} />} cursor={{ fill: 'var(--hover)' }} labelFormatter={(v) => versDate(v as string).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })} />
              <Bar dataKey="valeur" name={net ? 'Marge nette' : 'Commission brute'} fill={net ? 'var(--teal)' : 'var(--brown)'} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
        <DataTable
          rows={revenus}
          rowKey={(r) => r.jour}
          initialSort={{ key: 'jour', dir: 'desc' }}
          emptyText="Aucun transport terminé sur la période."
          columns={[
            { key: 'jour', label: 'Jour', value: (r) => r.jour, filter: 'date', render: (r) => versDate(r.jour).toLocaleDateString('fr-FR') },
            { key: 'volume', label: 'Montant des transports', value: (r) => Number(r.volume_total), render: (r) => euros(Number(r.volume_total)) },
            { key: 'commission', label: 'Commission brute', value: (r) => Number(r.commission), render: (r) => (net ? euros(Number(r.commission)) : <strong>{euros(Number(r.commission))}</strong>) },
            { key: 'marge', label: 'Marge nette', value: (r) => Number(r.marge_nette), render: (r) => (net ? <strong>{euros(Number(r.marge_nette))}</strong> : euros(Number(r.marge_nette))) },
            { key: 'nb', label: 'Transactions', value: (r) => Number(r.nb_transactions) },
          ]}
        />
      </div>
    </section>
  );
}
