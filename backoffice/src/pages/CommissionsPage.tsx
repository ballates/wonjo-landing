import { MinimumsZonesCard } from '../components/MinimumsZonesCard';
import { AnnulationFraisCard } from '../components/AnnulationFraisCard';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Select, type Option } from '../components/Select';
import { Avatar } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import { aujourdhuiParis, dateHeure, nomComplet } from '../lib/labels';
import { Kpi } from '../components/Kpi';
import type { CompteRecherche } from '../lib/types';
import { useDebounce } from '../lib/useDebounce';

interface Parametres { actif: boolean; defaut: number; plafond: number; plancher: number; nb_super_admins: number; moi: string }
interface Changement { id: string; type: 'defaut' | 'activation'; valeur: string; demande_par: string; demande_par_nom: string | null; created_at: string }
interface Regle {
  id: string;
  nom: string;
  taux: number;
  cible: 'tous' | 'selection';
  nb_membres: number;
  membres: string[] | null;
  membre_ids: string[] | null;
  depart_ville: string | null;
  depart_pays: string | null;
  arrivee_ville: string | null;
  arrivee_pays: string | null;
  date_debut: string | null;
  date_fin: string | null;
  actif: boolean;
  statut: 'en_attente' | 'approuvee' | 'rejetee' | 'annulee';
  created_at: string;
  cree_par: string | null;
  cree_par_nom: string | null;
  traitee_par_nom: string | null;
  motif_rejet: string | null;
  desactivee_at: string | null;
  desactivee_par_nom: string | null;
}
interface Lieu { ville: string; pays_code: string | null; nb: number }

const pct = (t: number) => `${(Number(t) * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

let nomsPays: Intl.DisplayNames | null = null;
function nomPays(code: string | null): string {
  if (!code) return '';
  try {
    nomsPays ??= new Intl.DisplayNames(['fr'], { type: 'region' });
    return nomsPays.of(code) ?? code;
  } catch {
    return code;
  }
}

function lieuTexte(ville: string | null, pays: string | null): string {
  if (ville && pays) return `${ville} (${nomPays(pays)})`;
  if (ville) return ville;
  if (pays) return nomPays(pays);
  return 'partout';
}

function corridorTexte(r: Pick<Regle, 'depart_ville' | 'depart_pays' | 'arrivee_ville' | 'arrivee_pays'>): string {
  if (!r.depart_ville && !r.depart_pays && !r.arrivee_ville && !r.arrivee_pays) return 'Tous les trajets';
  return `${lieuTexte(r.depart_ville, r.depart_pays)} → ${lieuTexte(r.arrivee_ville, r.arrivee_pays)}`;
}

function etatRegle(r: Regle): { label: string; tone: string } {
  const aujourdHui = aujourdhuiParis();
  if (r.statut === 'en_attente') return { label: 'À valider', tone: 'badge-amber' };
  if (r.statut === 'rejetee') return { label: 'Rejetée', tone: 'badge-danger' };
  if (r.statut === 'annulee') return { label: 'Annulée', tone: 'badge-muted' };
  if (!r.actif) return { label: 'Désactivée', tone: 'badge-muted' };
  if (r.date_debut && r.date_debut > aujourdHui) return { label: 'Programmée', tone: 'badge-amber' };
  if (r.date_fin && r.date_fin < aujourdHui) return { label: 'Expirée', tone: 'badge-muted' };
  return { label: 'En vigueur', tone: 'badge-green' };
}

function periodeTexte(debut: string | null, fin: string | null): string {
  const f = (d: string) => new Date(d).toLocaleDateString('fr-FR');
  if (debut && fin) return `du ${f(debut)} au ${f(fin)}`;
  if (debut) return `à partir du ${f(debut)}`;
  if (fin) return `jusqu'au ${f(fin)}`;
  return 'sans limite';
}

export function CommissionsSection() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectionInitiale = (location.state ?? null) as { ids: string[]; noms: string[] } | null;

  const [params, setParams] = useState<Parametres | null>(null);
  const [regles, setRegles] = useState<Regle[] | null>(null);
  const [changements, setChangements] = useState<Changement[]>([]);
  const [comptes, setComptes] = useState<CompteRecherche[]>([]);
  const [lieux, setLieux] = useState<Lieu[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'aValider' | 'reglages' | 'regles' | 'simulateur'>('reglages');

  const [defautSaisi, setDefautSaisi] = useState('');

  // Formulaire de regle
  const [nom, setNom] = useState('');
  const [taux, setTaux] = useState('');
  const [cible, setCible] = useState<'tous' | 'selection'>(selectionInitiale ? 'selection' : 'tous');
  const [membres, setMembres] = useState<Set<string>>(new Set(selectionInitiale?.ids ?? []));
  const [rechercheMembre, setRechercheMembre] = useState('');
  const [depVille, setDepVille] = useState('');
  const [depPays, setDepPays] = useState('');
  const [arrVille, setArrVille] = useState('');
  const [arrPays, setArrPays] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  // Simulateur
  const [simUser, setSimUser] = useState('');
  const [simDepVille, setSimDepVille] = useState('');
  const [simDepPays, setSimDepPays] = useState('');
  const [simArrVille, setSimArrVille] = useState('');
  const [simArrPays, setSimArrPays] = useState('');
  const [simResultat, setSimResultat] = useState<number | null>(null);
  const [simRecherche, setSimRecherche] = useState('');
  const [simErreur, setSimErreur] = useState<string | null>(null);
  const [simCharge, setSimCharge] = useState(false);

  function charger() {
    supabase.rpc('admin_commission_parametres').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      const p = data as Parametres;
      setParams(p);
      setDefautSaisi(String(Math.round(Number(p.defaut) * 10000) / 100));
    });
    supabase.rpc('admin_commission_lister_regles').then(({ data, error: e }) => { if (e) { setError(e.message); return; } setRegles((data ?? []) as Regle[]); });
    supabase.rpc('admin_commission_lister_changements').then(({ data, error: e }) => { if (e) { setError(e.message); return; } setChangements((data ?? []) as Changement[]); });
  }

  useEffect(() => {
    charger();
    supabase.rpc('admin_rechercher_comptes', { p_recherche: '', p_limite: 2000 }).then(({ data, error: e }) => { if (e) { setError(e.message); return; } setComptes((data ?? []) as CompteRecherche[]); });
    supabase.rpc('admin_commission_lieux').then(({ data, error: e }) => { if (e) { setError(e.message); return; } setLieux((data ?? []) as Lieu[]); });
  }, []);

  const paysOptions: Option<string>[] = useMemo(() => {
    const codes = [...new Set(lieux.map((l) => l.pays_code).filter(Boolean) as string[])];
    return [{ value: '', label: 'Tous les pays' }, ...codes.map((c) => ({ value: c, label: nomPays(c) })).sort((a, b) => a.label.localeCompare(b.label, 'fr'))];
  }, [lieux]);

  const villesPour = (pays: string) => lieux.filter((l) => !pays || l.pays_code === pays).map((l) => l.ville);

  async function executer(
    action: () => PromiseLike<{ data?: unknown; error: { message: string } | null }>,
    succes: string,
    siEnAttente?: string,
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: e } = await action();
    setBusy(false);
    if (e) { setError(e.message); return false; }
    setMessage(data === 'en_attente' && siEnAttente ? siEnAttente : succes);
    charger();
    return true;
  }

  function decider(type: 'regle' | 'changement', id: string, approuver: boolean) {
    let motif: string | null = null;
    if (!approuver) {
      motif = window.prompt('Motif du rejet (facultatif) :');
      if (motif === null) return;
    } else if (!window.confirm('Approuver ce changement ? Il s\'appliquera immédiatement aux nouvelles demandes.')) return;
    executer(() => supabase.rpc('admin_commission_decider', { p_type: type, p_id: id, p_approuver: approuver, p_motif: motif || null }), approuver ? 'Changement approuvé.' : 'Changement rejeté.');
  }

  function basculer() {
    if (!params) return;
    const texte = params.actif
      ? 'Désactiver les commissions personnalisées ? Toutes les nouvelles demandes repasseront à 10 %.'
      : 'Activer les commissions personnalisées ?\n\nL\'app récupère le taux réel auprès du serveur : dès l\'enregistrement, le nouveau taux s\'affiche instantanément dans l\'app, sans reconnexion ni rechargement. Le montant débité est toujours celui affiché à l\'écran de paiement.';
    if (!window.confirm(texte)) return;
    executer(
      () => supabase.rpc('admin_commission_activer', { p_actif: !params.actif }),
      params.actif ? 'Commissions personnalisées désactivées.' : 'Commissions personnalisées activées.',
      'Demande d\'activation envoyée : un autre super admin doit la valider.',
    );
  }

  function enregistrerDefaut() {
    const v = Number(defautSaisi.replace(',', '.'));
    const min = Number(params?.plancher ?? 0) * 100;
    if (!Number.isFinite(v) || v < min || v > 10) { setError(`Le taux par défaut doit être compris entre ${min} et 10 %.`); return; }
    executer(
      () => supabase.rpc('admin_commission_definir_defaut', { p_taux: v / 100 }),
      `Taux par défaut : ${v} %.`,
      `Baisse à ${v} % demandée : un autre super admin doit la valider.`,
    );
  }

  async function creerRegle() {
    const v = Number(taux.replace(',', '.'));
    if (!nom.trim()) { setError('Donnez un nom à la règle.'); return; }
    const min = Number(params?.plancher ?? 0) * 100;
    if (!Number.isFinite(v) || v < min || v > 10) { setError(`Le taux doit être compris entre ${min} et 10 % (plancher et plafond).`); return; }
    if (cible === 'selection' && membres.size === 0) { setError('Choisissez au moins un membre.'); return; }
    const ok = await executer(() => supabase.rpc('admin_commission_creer_regle', {
      p_nom: nom.trim(),
      p_taux: v / 100,
      p_cible: cible,
      p_membres: cible === 'selection' ? [...membres] : null,
      p_depart_ville: depVille.trim() || null,
      p_depart_pays: depPays || null,
      p_arrivee_ville: arrVille.trim() || null,
      p_arrivee_pays: arrPays || null,
      p_date_debut: dateDebut || null,
      p_date_fin: dateFin || null,
    }), `Règle « ${nom.trim()} » proposée : elle s'appliquera une fois validée par un autre super admin.`);
    if (ok) {
      setNom(''); setTaux(''); setDepVille(''); setDepPays(''); setArrVille(''); setArrPays(''); setDateDebut(''); setDateFin('');
    }
  }

  function desactiver(r: Regle) {
    const enAttente = r.statut === 'en_attente';
    const texte = enAttente
      ? `Annuler la proposition « ${r.nom} » ? Elle ne pourra plus être validée.`
      : `Désactiver la règle « ${r.nom} » ? Les nouvelles demandes repassent au taux normal ; celles déjà créées gardent leur taux.`;
    if (!window.confirm(texte)) return;
    executer(() => supabase.rpc('admin_commission_desactiver_regle', { p_id: r.id }), enAttente ? `Proposition « ${r.nom} » annulée.` : `Règle « ${r.nom} » désactivée.`);
  }

  function prevenir(r: Regle) {
    const texteTrajet = corridorTexte(r) === 'Tous les trajets' ? 'sur tous vos envois' : `sur vos envois ${corridorTexte(r)}`;
    const periode = r.date_debut || r.date_fin ? ` (${periodeTexte(r.date_debut, r.date_fin)})` : '';
    navigate('/emails', {
      state: {
        type: 'promotion',
        sujet: `Votre commission Wonjo passe à ${pct(r.taux)}`,
        message: `Bonne nouvelle {prenom} !\n\nVous bénéficiez d'une commission réduite à ${pct(r.taux)} ${texteTrajet}${periode}.\n\nProfitez-en pour envoyer vos prochains colis avec Wonjo.`,
        ...(r.cible === 'tous' ? { segment: 'tous' } : { ids: r.membre_ids ?? [], noms: r.membres ?? [] }),
      },
    });
  }

  // Recalcule a chaque changement (membre, villes, pays), sans bouton.
  const simCle = useDebounce(JSON.stringify([simUser, simDepVille, simDepPays, simArrVille, simArrPays]));
  useEffect(() => {
    const [u, dv, dp, av, ap] = JSON.parse(simCle) as string[];
    if (!u) { setSimResultat(null); setSimErreur(null); return; }
    setSimCharge(true);
    supabase.rpc('admin_commission_simuler', {
      p_user_id: u, p_dep_ville: dv || null, p_dep_pays: dp || null, p_arr_ville: av || null, p_arr_pays: ap || null,
    }).then(({ data, error: e }) => {
      setSimCharge(false);
      if (e) { setSimErreur(e.message); setSimResultat(null); return; }
      setSimErreur(null);
      setSimResultat(Number(data));
    });
  }, [simCle]);

  const simComptes = useMemo(() => {
    const q = simRecherche.trim().toLowerCase();
    if (!q) return [];
    return comptes.filter((c) => `${c.prenom} ${c.nom} ${c.email}`.toLowerCase().includes(q)).slice(0, 6);
  }, [comptes, simRecherche]);
  const simMembre = comptes.find((c) => c.id === simUser) ?? null;

  const comptesFiltres = useMemo(() => {
    const q = rechercheMembre.trim().toLowerCase();
    return comptes.filter((c) => !q || `${c.prenom} ${c.nom} ${c.email}`.toLowerCase().includes(q)).slice(0, 60);
  }, [comptes, rechercheMembre]);

  const tauxSaisi = Number(taux.replace(',', '.'));
  const resume = nom.trim() && Number.isFinite(tauxSaisi) && taux !== ''
    ? `${cible === 'tous' ? 'Tous les membres' : `${membres.size} membre(s)`} paieront ${tauxSaisi.toLocaleString('fr-FR')} % de commission · ${corridorTexte({ depart_ville: depVille || null, depart_pays: depPays || null, arrivee_ville: arrVille || null, arrivee_pays: arrPays || null })} · ${periodeTexte(dateDebut || null, dateFin || null)}.`
    : null;

  const colonnes: Column<Regle>[] = [
    { key: 'nom', label: 'Règle', value: (r) => r.nom, render: (r) => <strong>{r.nom}</strong> },
    { key: 'taux', label: 'Taux', value: (r) => Number(r.taux), render: (r) => <span className="taux-pill">{pct(r.taux)}</span> },
    {
      key: 'cible', label: 'Pour', filter: 'options', value: (r) => (r.cible === 'tous' ? 'Tous les membres' : 'Membres choisis'),
      render: (r) => (r.cible === 'tous' ? 'Tous les membres' : <span title={(r.membres ?? []).join(', ')}>{r.nb_membres} membre(s){r.membres?.length ? ` : ${r.membres.slice(0, 3).join(', ')}${r.membres.length > 3 ? '…' : ''}` : ''}</span>),
    },
    { key: 'corridor', label: 'Trajets', value: (r) => corridorTexte(r) },
    { key: 'periode', label: 'Période', value: (r) => r.date_debut ?? '', render: (r) => periodeTexte(r.date_debut, r.date_fin) },
    { key: 'etat', label: 'État', filter: 'options', value: (r) => etatRegle(r).label, render: (r) => { const e = etatRegle(r); return <span className={`badge ${e.tone}`}>{e.label}</span>; } },
    { key: 'creee', label: 'Créée', value: (r) => r.created_at, filter: 'date', render: (r) => <span className="hint">{dateHeure(r.created_at)}<br />par {r.cree_par_nom ?? '-'}</span> },
    {
      key: 'actions', label: '', render: (r) => r.statut === 'en_attente' ? (
        r.cree_par === params?.moi
          ? <button className="btn btn-sm" onClick={() => desactiver(r)}>Annuler ma proposition</button>
          : (
            <div className="action-row">
              <button className="btn btn-success btn-sm" onClick={() => decider('regle', r.id, true)}>Approuver</button>
              <button className="btn btn-danger-outline btn-sm" onClick={() => decider('regle', r.id, false)}>Rejeter</button>
            </div>
          )
      ) : r.statut === 'rejetee' ? <span className="hint">Rejetée par {r.traitee_par_nom ?? '-'}{r.motif_rejet ? ` : ${r.motif_rejet}` : ''}</span> : r.actif ? (
        <div className="action-row">
          <button className="btn btn-soft btn-sm" onClick={() => prevenir(r)}>Prévenir par email</button>
          <button className="btn btn-danger-outline btn-sm" onClick={() => desactiver(r)}>Désactiver</button>
        </div>
      ) : <span className="hint">par {r.desactivee_par_nom ?? '-'}</span>,
    },
  ];

  const nbEnAttente = changements.length + (regles ?? []).filter((r) => r.statut === 'en_attente').length;
  useEffect(() => { if (nbEnAttente > 0) setTab('aValider'); }, [nbEnAttente === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const nbEnVigueur = (regles ?? []).filter((r) => r.actif && r.statut === 'approuvee').length;

  if (!params) return error ? <p className="page-error">{error}</p> : <p className="loading-state">Chargement…</p>;

  return (
    <div>
      {params.nb_super_admins < 2 && (
        <div className="insight-banner warn">
          <div>
            <p className="insight-oneline">
              <strong>Double validation : </strong>
              invitez un second super admin (Administration), sinon vos baisses restent en attente.
            </p>
          </div>
        </div>
      )}

      <div className="cards">
        <Kpi index={0} label="Taux personnalisés" value={params.actif ? 1 : 0} format={() => (params.actif ? 'Actives' : 'Inactives')} />
        <Kpi index={1} label={`Taux par défaut (${pct(params.plancher)}, 10 % max)`} value={params.defaut * 100} format={(n) => `${n.toLocaleString('fr-FR')} %`} />
        <Kpi index={2} label="Règles en vigueur" value={nbEnVigueur} />
        <Kpi index={3} label="À valider" value={nbEnAttente} hint={nbEnAttente > 0 ? 'Aucun effet tant que non approuvé' : undefined} />
      </div>

      {error && <p className="page-error" style={{ marginBottom: 16 }}>{error}</p>}
      {message && <p className="success-text" style={{ marginBottom: 16 }}>{message}</p>}

      <div className="tabs">
        <button className={tab === 'aValider' ? 'active' : ''} onClick={() => setTab('aValider')}>
          À valider{nbEnAttente > 0 && <span className="tab-badge">{nbEnAttente}</span>}
        </button>
        <button className={tab === 'reglages' ? 'active' : ''} onClick={() => setTab('reglages')}>Réglages</button>
        <button className={tab === 'regles' ? 'active' : ''} onClick={() => setTab('regles')}>Règles ({(regles ?? []).length})</button>
        <button className={tab === 'simulateur' ? 'active' : ''} onClick={() => setTab('simulateur')}>Simulateur</button>
      </div>

      {tab === 'aValider' && (
        nbEnAttente === 0 ? <p className="empty-state">Rien à valider pour le moment.</p> : (
        <div className="panel pending-panel">
          <p className="chart-sub">Sans effet tant qu'un autre super admin ne les a pas approuvés.</p>
          <ul className="pending-list">
            {changements.map((c) => (
              <li key={c.id}>
                <div>
                  <strong>{c.type === 'activation' ? 'Activer les commissions personnalisées' : `Baisser le taux par défaut à ${pct(Number(c.valeur))}`}</strong>
                  <span className="hint">Demandé par {c.demande_par_nom ?? '-'} · {dateHeure(c.created_at)}</span>
                </div>
                {c.demande_par === params.moi
                  ? <span className="hint">En attente d'un autre super admin</span>
                  : (
                    <div className="action-row">
                      <button className="btn btn-success btn-sm" onClick={() => decider('changement', c.id, true)}>Approuver</button>
                      <button className="btn btn-danger-outline btn-sm" onClick={() => decider('changement', c.id, false)}>Rejeter</button>
                    </div>
                  )}
              </li>
            ))}
            {(regles ?? []).filter((r) => r.statut === 'en_attente').map((r) => (
              <li key={r.id}>
                <div>
                  <strong>Règle « {r.nom} » : {pct(r.taux)}</strong>
                  <span className="hint">{r.cible === 'tous' ? 'Tous les membres' : `${r.nb_membres} membre(s)`} · {corridorTexte(r)} · {periodeTexte(r.date_debut, r.date_fin)} · proposée par {r.cree_par_nom ?? '-'}</span>
                </div>
                {r.cree_par === params.moi
                  ? (
                    <div className="action-row" style={{ alignItems: 'center' }}>
                      <span className="hint">En attente d'un autre super admin</span>
                      <button className="btn btn-sm" onClick={() => desactiver(r)}>Annuler ma proposition</button>
                    </div>
                  )
                  : (
                    <div className="action-row">
                      <button className="btn btn-success btn-sm" onClick={() => decider('regle', r.id, true)}>Approuver</button>
                      <button className="btn btn-danger-outline btn-sm" onClick={() => decider('regle', r.id, false)}>Rejeter</button>
                    </div>
                  )}
              </li>
            ))}
          </ul>
        </div>
        )
      )}

      {tab === 'reglages' && (
        <div className="grid-2">
          <div className={`panel commission-switch ${params.actif ? 'on' : ''}`}>
            <div>
              <h3>Commissions personnalisées : {params.actif ? 'actives' : 'inactives'}</h3>
              <p className="chart-sub">
                {params.actif
                  ? 'Les règles s\'appliquent aux nouvelles demandes ; chaque demande garde son taux.'
                  : <>Toutes les demandes sont à 10 % tant que c'est inactif.<br />L'app affiche le vrai taux dès l'activation.</>}
              </p>
            </div>
            <button className={`btn ${params.actif ? 'btn-danger-outline' : 'btn-primary'}`} disabled={busy} onClick={basculer}>
              {params.actif ? 'Désactiver' : 'Activer'}
            </button>
          </div>

          <div className="panel">
            <h3>Taux par défaut</h3>
            <p className="chart-sub">Une baisse doit être validée par un autre super admin.</p>
            <div className="inline-form">
              <div className="suffix-input">
                <input type="text" inputMode="decimal" value={defautSaisi} onChange={(e) => setDefautSaisi(e.target.value)} aria-label="Taux par défaut" />
                <span>%</span>
              </div>
              <button className="btn btn-primary" disabled={busy} onClick={enregistrerDefaut}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'reglages' && <div style={{ marginTop: 16, display: 'grid', gap: 16 }}><MinimumsZonesCard /><AnnulationFraisCard /></div>}

      {tab === 'regles' && (
        <>
          <div className="panel commission-form">
            <h3>Nouvelle règle de réduction</h3>
            <div className="field-row">
              <label className="field">
                <span>Nom de la règle</span>
                <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Lancement Lyon → Dakar" />
              </label>
              <label className="field">
                <span>Commission</span>
                <div className="suffix-input">
                  <input type="text" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} placeholder="Ex. 7" />
                  <span>%</span>
                </div>
              </label>
            </div>

            <div className="field">
              <span>Pour qui</span>
              <div className="segmented">
                <button className={cible === 'tous' ? 'on' : ''} onClick={() => setCible('tous')}><b>Tous les membres</b><span>Tout le monde en profite</span></button>
                <button className={cible === 'selection' ? 'on' : ''} onClick={() => setCible('selection')}><b>Membres choisis</b><span>{membres.size ? `${membres.size} sélectionné(s)` : 'Une ou plusieurs personnes'}</span></button>
              </div>
            </div>

            {cible === 'selection' && (
              <div className="member-picker">
                <input type="search" placeholder="Rechercher un membre…" value={rechercheMembre} onChange={(e) => setRechercheMembre(e.target.value)} />
                <ul>
                  {comptesFiltres.map((c) => (
                    <li key={c.id}>
                      <label>
                        <input
                          type="checkbox"
                          className="dt-check"
                          checked={membres.has(c.id)}
                          onChange={() => setMembres((m) => { const n = new Set(m); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                        />
                        <Avatar src={c.photo_url} nom={nomComplet(c.prenom, c.nom)} size={28} />
                        <span className="member-name">{nomComplet(c.prenom, c.nom) || c.email}</span>
                        <span className="hint">{c.email}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="field-row">
              <div className="field">
                <span>Départ (facultatif)</span>
                <div className="lieu-row">
                  <Select ariaLabel="Pays de départ" value={depPays} onChange={setDepPays} options={paysOptions} />
                  <input type="text" list="villes-dep" value={depVille} onChange={(e) => setDepVille(e.target.value)} placeholder="Toutes les villes" />
                  <datalist id="villes-dep">{villesPour(depPays).map((v) => <option key={v} value={v} />)}</datalist>
                </div>
              </div>
              <div className="field">
                <span>Arrivée (facultatif)</span>
                <div className="lieu-row">
                  <Select ariaLabel="Pays d'arrivée" value={arrPays} onChange={setArrPays} options={paysOptions} />
                  <input type="text" list="villes-arr" value={arrVille} onChange={(e) => setArrVille(e.target.value)} placeholder="Toutes les villes" />
                  <datalist id="villes-arr">{villesPour(arrPays).map((v) => <option key={v} value={v} />)}</datalist>
                </div>
              </div>
            </div>

            <div className="field-row">
              <label className="field">
                <span>Début (facultatif)</span>
                <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
              </label>
              <label className="field">
                <span>Fin (facultatif)</span>
                <input type="date" value={dateFin} min={dateDebut || undefined} onChange={(e) => setDateFin(e.target.value)} />
              </label>
            </div>

            {resume && <div className="insight-banner"><div><strong>Résumé</strong><span>{resume}</span></div></div>}
            <div className="action-row" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" disabled={busy} onClick={creerRegle}>Créer la règle</button>
            </div>
          </div>

          <div className="panel">
            <h3>Toutes les règles</h3>
            <p className="chart-sub">Désactiver une règle ne change pas les demandes déjà créées.</p>
            {!regles ? <p className="hint">Chargement…</p> : (
              <DataTable rows={regles} columns={colonnes} rowKey={(r) => r.id} emptyText="Aucune règle pour l'instant." searchPlaceholder="Rechercher une règle…" />
            )}
          </div>
        </>
      )}

      {tab === 'simulateur' && (() => {
        const defaut = Number(params.defaut);
        const taux = simResultat;
        const reduit = taux !== null && taux < defaut;
        const exemple = 20;
        const nomPays = (code: string) => (code ? paysOptions.find((o) => o.value === code)?.label ?? code : 'Partout');
        return (
        <div className="chart-card sim">
          <div className="sim-tete">
            <h3>Quel taux paierait ce membre ?</h3>
            <p className="chart-sub">Le taux que le serveur appliquerait aujourd'hui à ce membre, sur ce trajet.</p>
          </div>
          <div className="sim-corps">
            <div className="sim-saisie">
              <div className="champ-frais">
                <span>Membre</span>
                {simMembre ? (
                  <div className="simc-membre">
                    <Avatar src={simMembre.photo_url} nom={nomComplet(simMembre.prenom, simMembre.nom)} size={40} />
                    <div className="simc-membre-texte">
                      <strong>{nomComplet(simMembre.prenom, simMembre.nom) || simMembre.email}</strong>
                      <span>{simMembre.email}</span>
                    </div>
                    <button type="button" className="btn btn-sm" onClick={() => { setSimUser(''); setSimRecherche(''); }}>Changer</button>
                  </div>
                ) : (
                  <div className="simc-recherche">
                    <input type="search" value={simRecherche} autoFocus onChange={(e) => setSimRecherche(e.target.value)}
                           placeholder="Nom, prénom ou e-mail…" aria-label="Rechercher un membre" />
                    {simComptes.length > 0 && (
                      <ul className="simc-resultats">
                        {simComptes.map((c) => (
                          <li key={c.id}>
                            <button type="button" onClick={() => setSimUser(c.id)}>
                              <Avatar src={c.photo_url} nom={nomComplet(c.prenom, c.nom)} size={30} />
                              <span className="simc-membre-texte"><strong>{nomComplet(c.prenom, c.nom) || c.email}</strong><span>{c.email}</span></span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {simRecherche.trim() && simComptes.length === 0 && <p className="hint">Aucun membre trouvé.</p>}
                  </div>
                )}
              </div>

              <div className="champ-frais">
                <span>Trajet <i className="simc-facultatif">facultatif, vide = partout</i></span>
                <div className="simc-trajet">
                  <div className="simc-lieu">
                    <Select ariaLabel="Pays de départ" value={simDepPays} onChange={setSimDepPays} options={paysOptions} />
                    <input type="text" list="sim-villes-dep" value={simDepVille} onChange={(e) => setSimDepVille(e.target.value)} placeholder="Ville de départ" />
                    <datalist id="sim-villes-dep">{villesPour(simDepPays).map((v) => <option key={v} value={v} />)}</datalist>
                  </div>
                  <button type="button" className="sim-inverser" title="Inverser le trajet" aria-label="Inverser le trajet"
                          onClick={() => { setSimDepPays(simArrPays); setSimArrPays(simDepPays); setSimDepVille(simArrVille); setSimArrVille(simDepVille); }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3l4 4-4 4" /><path d="M3 7h18" /><path d="M7 21l-4-4 4-4" /><path d="M21 17H3" /></svg>
                  </button>
                  <div className="simc-lieu">
                    <Select ariaLabel="Pays d'arrivée" value={simArrPays} onChange={setSimArrPays} options={paysOptions} />
                    <input type="text" list="sim-villes-arr" value={simArrVille} onChange={(e) => setSimArrVille(e.target.value)} placeholder="Ville d'arrivée" />
                    <datalist id="sim-villes-arr">{villesPour(simArrPays).map((v) => <option key={v} value={v} />)}</datalist>
                  </div>
                </div>
              </div>
            </div>

            <div className={`sim-recu simc-recu ${reduit ? 'is-reduit' : ''}`}>
              {!params.actif && <p className="rg-note" style={{ margin: '0 0 12px' }}>Commissions personnalisées inactives : 10 % pour tous.</p>}
              {simErreur && <p className="page-error">{simErreur}</p>}
              {!simUser && !simErreur && (
                <div className="simc-vide">
                  <span className="simc-vide-icone" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>
                  </span>
                  <p>Choisissez un membre pour voir son taux.</p>
                </div>
              )}
              {simUser && taux !== null && !simErreur && (
                <>
                  <span className="sim-recu-etiquette">Taux appliqué{simCharge ? '…' : ''}</span>
                  <strong className="sim-recu-total">{pct(taux)}</strong>
                  <span className={`badge ${reduit ? 'badge-green' : 'badge-muted'}`} style={{ alignSelf: 'flex-start' }}>
                    {reduit ? `Réduit, au lieu de ${pct(defaut)}` : 'Taux par défaut'}
                  </span>
                  <div className="simc-jauge" aria-hidden="true"><span style={{ width: `${defaut > 0 ? Math.min(100, (taux / defaut) * 100) : 0}%` }} /></div>
                  <ul className="sim-lignes" style={{ marginTop: 8 }}>
                    <li>Sur un transport de {exemple} €<span /><b>{(exemple * taux).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</b></li>
                    {reduit && <li>Économie pour ce membre<span /><b className="simc-gain">− {(exemple * (defaut - taux)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</b></li>}
                    <li>Trajet<span /><b>{[simDepVille || nomPays(simDepPays), simArrVille || nomPays(simArrPays)].join(' → ')}</b></li>
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
