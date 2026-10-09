import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Select, type Option } from '../components/Select';
import { Avatar, Person } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import { dateHeure, nomComplet } from '../lib/labels';
import { useAuth } from '../auth/AuthContext';
import { peutEnvoyerInformation } from '../lib/permissions';
import type { CompteRecherche } from '../lib/types';
import logo from '../assets/wonjo-logo.png';
import { IconChevronLeft, IconRestore, IconSend, IconSquarePencil, IconTrash } from '../components/Icons';

type TypeEmail = 'service' | 'promotion';
type SousOnglet = 'envoyer' | 'modeles' | 'desinscrits' | 'corbeille';

interface Modele {
  id: string;
  categorie: string;
  nom: string;
  sujet: string;
  corps: string;
  created_at: string;
  updated_at: string;
  cree_par_nom: string | null;
  corbeille: boolean;
}

const CATEGORIES_MODELE: Option<string>[] = [
  { value: 'bienvenue', label: 'Bienvenue' },
  { value: 'verification', label: 'Vérification' },
  { value: 'relance', label: 'Relance' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'support', label: 'Support' },
  { value: 'autre', label: 'Autre' },
];
const LABELS_CATEGORIE_MODELE = Object.fromEntries(CATEGORIES_MODELE.map((c) => [c.value, c.label]));

const SEGMENTS: Option<string>[] = [
  { value: 'tous', label: 'Tous les membres', hint: 'Comptes actifs non supprimés' },
  { value: 'non_verifies', label: 'Identité non vérifiée', hint: 'Pour les inciter à finir leur vérification' },
  { value: 'telephone_non_verifie', label: 'Téléphone non vérifié' },
  { value: 'kyc_en_attente', label: 'KYC en attente' },
  { value: 'kyc_rejete', label: 'KYC rejeté', hint: 'Pour les aider à recommencer' },
  { value: 'inactifs_30j', label: 'Inactifs depuis 30 jours', hint: 'Pour les inviter à revenir' },
  { value: 'sans_transaction', label: 'Jamais fait de transaction' },
  { value: 'sans_stripe', label: 'Paiements non configurés', hint: 'Voyageurs qui ne peuvent pas encore être payés' },
  { value: 'ambassadeurs', label: 'Ambassadeurs et légendes' },
];

const LABELS_SEGMENT: Record<string, string> = Object.fromEntries([...SEGMENTS.map((s) => [s.value, s.label]), ['selection', 'Sélection manuelle']]);

interface Desinscrit {
  user_id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  desinscrit_le: string;
}

interface Campagne {
  id: string;
  created_at: string;
  type: TypeEmail;
  sujet: string;
  message: string;
  segment: string;
  nb_destinataires: number;
  nb_envoyes: number;
  nb_echecs: number;
  admin_nom: string | null;
  admin_avatar: string | null;
  corbeille: boolean;
}

export function EmailsPage() {
  const location = useLocation();
  const { roles, profil } = useAuth();
  // Emails "Information" (ignorent les desinscriptions) : super_admin seul.
  const peutInformation = peutEnvoyerInformation(roles);
  // Pre-remplissage depuis Moderation (comptes coches) ou Commissions
  // ("Prevenir par email" d'une regle).
  const etat = (location.state ?? null) as {
    ids?: string[]; noms?: string[]; segment?: string; type?: TypeEmail; sujet?: string; message?: string;
  } | null;
  const selectionInitiale = etat?.ids && etat.ids.length ? { ids: etat.ids, noms: etat.noms ?? [] } : null;
  // Noms connus avant meme le chargement de l'annuaire (comptes charge en
  // arriere-plan) : ceux passes par Moderation/Commissions via location.state.
  const nomsInitiaux = useMemo(() => new Map((selectionInitiale?.ids ?? []).map((id, i) => [id, selectionInitiale?.noms[i]])), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [type, setType] = useState<TypeEmail>(peutInformation ? (etat?.type ?? 'service') : 'promotion');
  const [segment, setSegment] = useState(selectionInitiale ? 'selection' : etat?.segment ?? 'non_verifies');
  const [membres, setMembres] = useState<Set<string>>(new Set(selectionInitiale?.ids ?? []));
  const [rechercheMembre, setRechercheMembre] = useState('');
  const [comptes, setComptes] = useState<CompteRecherche[]>([]);
  const ids = useMemo(() => [...membres], [membres]);
  const [sujet, setSujet] = useState(etat?.sujet ?? '');
  const [message, setMessage] = useState(etat?.message ?? '');
  const [ctaLabel, setCtaLabel] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [compte, setCompte] = useState<{ destinataires: number; desinscrits_exclus: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  // Echec d'un chargement (modeles, campagnes, desinscrits...) : affiche plutot
  // qu'une liste vide trompeuse.
  const [erreurChargement, setErreurChargement] = useState<string | null>(null);
  const [campagnes, setCampagnes] = useState<Campagne[] | null>(null);
  const [sousOnglet, setSousOnglet] = useState<SousOnglet>('envoyer');
  const [composerOuvert, setComposerOuvert] = useState(false);
  const [modeles, setModeles] = useState<Modele[] | null>(null);
  const [modeleChoisi, setModeleChoisi] = useState('');
  const [nbDesinscrits, setNbDesinscrits] = useState<number | null>(null);
  const [desinscrits, setDesinscrits] = useState<Desinscrit[] | null>(null);
  const [modelesCorbeille, setModelesCorbeille] = useState<Modele[] | null>(null);
  const [campagnesCorbeille, setCampagnesCorbeille] = useState<Campagne[] | null>(null);
  const [campagneOuverte, setCampagneOuverte] = useState<Campagne | null>(null);

  useEffect(() => {
    supabase.rpc('admin_nb_desinscrits').then(({ data, error: e }) => { if (e) { setErreurChargement(e.message); return; } setNbDesinscrits(Number(data ?? 0)); });
  }, []);

  useEffect(() => {
    if (sousOnglet === 'desinscrits' && !desinscrits) {
      supabase.rpc('admin_lister_desinscrits').then(({ data, error: e }) => { if (e) { setErreurChargement(e.message); return; } setDesinscrits((data ?? []) as Desinscrit[]); });
    }
  }, [sousOnglet, desinscrits]);

  function chargerCorbeille() {
    supabase.rpc('admin_lister_modeles', { p_corbeille: true }).then(({ data, error: e }) => { if (e) { setErreurChargement(e.message); return; } setModelesCorbeille((data ?? []) as Modele[]); });
    supabase.rpc('admin_lister_campagnes', { p_corbeille: true }).then(({ data, error: e }) => { if (e) { setErreurChargement(e.message); return; } setCampagnesCorbeille((data ?? []) as Campagne[]); });
  }
  useEffect(() => {
    if (sousOnglet === 'corbeille') chargerCorbeille();
  }, [sousOnglet]); // eslint-disable-line react-hooks/exhaustive-deps

  function chargerModeles() {
    supabase.rpc('admin_lister_modeles', { p_corbeille: false }).then(({ data, error: e }) => { if (e) { setErreurChargement(e.message); return; } setModeles((data ?? []) as Modele[]); });
  }
  useEffect(chargerModeles, []);

  function chargerModeleDansFormulaire(id: string) {
    setModeleChoisi(id);
    const m = modeles?.find((x) => x.id === id);
    if (!m) return;
    setSujet(m.sujet);
    setMessage(m.corps);
  }

  const segmentOptions = useMemo(
    () => [{ value: 'selection', label: `Sélection manuelle${ids.length ? ` (${ids.length})` : ''}`, hint: 'Une ou plusieurs personnes précises' }, ...SEGMENTS],
    [ids.length],
  );

  function chargerCampagnes() {
    supabase.rpc('admin_lister_campagnes', { p_corbeille: false }).then(({ data, error: e }) => { if (e) { setErreurChargement(e.message); return; } setCampagnes((data ?? []) as Campagne[]); });
  }
  useEffect(chargerCampagnes, []);
  useEffect(() => {
    supabase.rpc('admin_rechercher_comptes', { p_recherche: '', p_limite: 2000 }).then(({ data, error: e }) => { if (e) { setErreurChargement(e.message); return; } setComptes((data ?? []) as CompteRecherche[]); });
  }, []);

  const comptesFiltres = useMemo(() => {
    const q = rechercheMembre.trim().toLowerCase();
    if (!q) return [];
    return comptes.filter((c) => `${c.prenom} ${c.nom} ${c.email}`.toLowerCase().includes(q)).slice(0, 60);
  }, [comptes, rechercheMembre]);

  const compteParId = useMemo(() => new Map(comptes.map((c) => [c.id, c])), [comptes]);
  const nomAffiche = (id: string) => {
    const c = compteParId.get(id);
    return c ? (nomComplet(c.prenom, c.nom) || c.email) : (nomsInitiaux.get(id) ?? id);
  };

  useEffect(() => {
    setCompte(null);
    const t = setTimeout(() => {
      supabase.rpc('admin_compter_destinataires', { p_segment: segment, p_ids: ids, p_type: type }).then(({ data, error: e }) => {
        if (e) { setErreurChargement(e.message); return; }
        if (data) setCompte(data as { destinataires: number; desinscrits_exclus: number });
      });
    }, 200);
    return () => clearTimeout(t);
  }, [segment, type, ids]);

  const pret = sujet.trim().length > 0 && message.trim().length > 0 && (!ctaUrl || ctaUrl.startsWith('https://'));

  async function envoyer(test: boolean) {
    if (!pret) return;
    if (!test && !window.confirm(`Envoyer cet email à ${compte?.destinataires ?? '?'} destinataire(s) ? Cette action est définitive.`)) return;
    setBusy(true);
    setRetour(null);
    const { data, error } = await supabase.functions.invoke('admin-envoyer-email', {
      body: {
        type, segment, ids, sujet, message, test,
        cta_label: ctaLabel.trim() || undefined,
        cta_url: ctaUrl.trim() || undefined,
      },
    });
    setBusy(false);
    if (error) {
      let texte = error.message;
      try { texte = (await (error as { context?: Response }).context?.json())?.error ?? texte; } catch { /* reponse non JSON */ }
      setRetour({ ok: false, texte });
      return;
    }
    const r = data as { envoyes: number; destinataires: number; echecs: number };
    setRetour({
      ok: r.echecs === 0,
      texte: test ? 'Email de test envoyé sur votre adresse.' : `${r.envoyes} email(s) envoyé(s) sur ${r.destinataires}${r.echecs ? `, ${r.echecs} échec(s)` : ''}.`,
    });
    if (!test) { chargerCampagnes(); if (r.echecs === 0) setComposerOuvert(false); }
  }

  const prenomApercu = (profil?.nom_affiche || profil?.nom || 'Prénom').trim().split(/\s+/)[0];
  const apercu = message.split('{prenom}').join(prenomApercu);

  const [modeleForm, setModeleForm] = useState<{ id: string | null; categorie: string; nom: string; sujet: string; corps: string } | null>(null);
  const [busyModele, setBusyModele] = useState(false);

  function ouvrirNouveauModele(depuisFormulaire: boolean) {
    setModeleForm({
      id: null,
      categorie: 'autre',
      nom: '',
      sujet: depuisFormulaire ? sujet : '',
      corps: depuisFormulaire ? message : '',
    });
  }

  function ouvrirEditionModele(m: Modele) {
    setModeleForm({ id: m.id, categorie: m.categorie, nom: m.nom, sujet: m.sujet, corps: m.corps });
  }

  async function enregistrerModele() {
    if (!modeleForm) return;
    setBusyModele(true);
    const { error } = await supabase.rpc('admin_enregistrer_modele', {
      p_id: modeleForm.id, p_categorie: modeleForm.categorie, p_nom: modeleForm.nom, p_sujet: modeleForm.sujet, p_corps: modeleForm.corps,
    });
    setBusyModele(false);
    if (error) { setRetour({ ok: false, texte: error.message }); return; }
    setModeleForm(null);
    chargerModeles();
  }

  // Actions groupees : une erreur (droits, reseau) ne doit pas passer pour
  // un succes silencieux.
  async function toutes(appels: PromiseLike<{ error: { message: string } | null }>[]): Promise<boolean> {
    const res = await Promise.all(appels);
    const echecs = res.filter((r) => r.error);
    if (echecs.length) {
      setRetour({ ok: false, texte: `${echecs.length} action(s) sur ${res.length} ont échoué : ${echecs[0].error!.message}` });
      return false;
    }
    return true;
  }

  function toggleSelection(set: Set<string>, id: string): Set<string> {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  }

  const [selectionModeles, setSelectionModeles] = useState<Set<string> | null>(null);
  const [selectionCampagnes, setSelectionCampagnes] = useState<Set<string> | null>(null);
  const [selectionModelesCorbeille, setSelectionModelesCorbeille] = useState<Set<string>>(new Set());
  const [selectionCampagnesCorbeille, setSelectionCampagnesCorbeille] = useState<Set<string>>(new Set());

  async function mettreModelesCorbeille(ids: string[]) {
    if (ids.length === 0) return;
    await toutes(ids.map((id) => supabase.rpc('admin_deplacer_modele_corbeille', { p_id: id, p_corbeille: true })));
    setSelectionModeles(null);
    chargerModeles();
  }
  async function restaurerModeles(ids: string[]) {
    if (ids.length === 0) return;
    await toutes(ids.map((id) => supabase.rpc('admin_deplacer_modele_corbeille', { p_id: id, p_corbeille: false })));
    setSelectionModelesCorbeille(new Set());
    chargerCorbeille();
    chargerModeles();
  }
  async function supprimerModelesDefinitivement(ids: string[]) {
    if (ids.length === 0) return;
    if (!window.confirm(`Supprimer définitivement ${ids.length} modèle(s) ? Impossible à annuler.`)) return;
    await toutes(ids.map((id) => supabase.rpc('admin_supprimer_modele', { p_id: id })));
    setSelectionModelesCorbeille(new Set());
    chargerCorbeille();
  }

  async function mettreCampagnesCorbeille(ids: string[]) {
    if (ids.length === 0) return;
    await toutes(ids.map((id) => supabase.rpc('admin_deplacer_campagne_corbeille', { p_id: id, p_corbeille: true })));
    setSelectionCampagnes(null);
    chargerCampagnes();
  }
  async function restaurerCampagnes(ids: string[]) {
    if (ids.length === 0) return;
    await toutes(ids.map((id) => supabase.rpc('admin_deplacer_campagne_corbeille', { p_id: id, p_corbeille: false })));
    setSelectionCampagnesCorbeille(new Set());
    chargerCorbeille();
    chargerCampagnes();
  }
  async function supprimerCampagnesDefinitivement(ids: string[]) {
    if (ids.length === 0) return;
    if (!window.confirm(`Supprimer définitivement ${ids.length} envoi(s) de l'historique ? Impossible à annuler.`)) return;
    await toutes(ids.map((id) => supabase.rpc('admin_supprimer_campagne', { p_id: id })));
    setSelectionCampagnesCorbeille(new Set());
    chargerCorbeille();
  }

  const colonnes: Column<Campagne>[] = [
    { key: 'date', label: 'Date', value: (c) => c.created_at, filter: 'date', render: (c) => dateHeure(c.created_at), width: 170 },
    { key: 'par', filter: 'options', label: 'Par', value: (c) => c.admin_nom, render: (c) => <Person src={c.admin_avatar} nom={c.admin_nom ?? '-'} size={28} /> },
    { key: 'type', filter: 'options', label: 'Type', value: (c) => (c.type === 'promotion' ? 'Promotion' : 'Information'), render: (c) => <span className={`badge ${c.type === 'promotion' ? 'badge-amber' : 'badge-teal'}`}>{c.type === 'promotion' ? 'Promotion' : 'Information'}</span> },
    { key: 'sujet', label: 'Objet', value: (c) => c.sujet },
    { key: 'cible', filter: 'options', label: 'Cible', value: (c) => LABELS_SEGMENT[c.segment] ?? c.segment },
    { key: 'envoyes', label: 'Envoyés', value: (c) => c.nb_envoyes, render: (c) => `${c.nb_envoyes} / ${c.nb_destinataires}${c.nb_echecs ? ` (${c.nb_echecs} échecs)` : ''}` },
  ];

  const colonnesDesinscrits: Column<Desinscrit>[] = [
    { key: 'nom', label: 'Membre', value: (d) => `${d.prenom ?? ''} ${d.nom ?? ''}`, render: (d) => nomComplet(d.prenom, d.nom) || d.email || '-' },
    { key: 'email', label: 'Email', value: (d) => d.email },
    { key: 'date', label: 'Désinscrit le', value: (d) => d.desinscrit_le, filter: 'date', render: (d) => dateHeure(d.desinscrit_le), width: 170 },
  ];

  return (
    <div>
      <div className="page-head">
        <div className="wmail-title">
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" className="wmail-logo">
            <defs>
              <linearGradient id="wmail-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#4A8896" />
                <stop offset="1" stopColor="#7D4E2E" />
              </linearGradient>
              <linearGradient id="wmail-glass" x1="0" y1="0" x2="0" y2="40" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
                <stop offset="0.45" stopColor="#fff" stopOpacity="0.05" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M6,10 L13,30 L20,14 L27,30 L34,10" fill="none" stroke="url(#wmail-grad)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M6,10 L13,30 L20,14 L27,30 L34,10" fill="none" stroke="url(#wmail-glass)" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <h1>Wmail</h1>
        </div>
      </div>

      <div className="tabs">
        <button className={sousOnglet === 'envoyer' ? 'active' : ''} onClick={() => setSousOnglet('envoyer')}><IconSend /> Messages envoyés</button>
        <button className={sousOnglet === 'modeles' ? 'active' : ''} onClick={() => setSousOnglet('modeles')}>Modèles{modeles?.length ? ` (${modeles.length})` : ''}</button>
        <button className={sousOnglet === 'desinscrits' ? 'active' : ''} onClick={() => setSousOnglet('desinscrits')}>Désinscrits{nbDesinscrits ? ` (${nbDesinscrits})` : ''}</button>
        <button className={sousOnglet === 'corbeille' ? 'active' : ''} onClick={() => setSousOnglet('corbeille')}><IconTrash /> Corbeille</button>
      </div>
      {erreurChargement && <p className="page-error">{erreurChargement}</p>}
      {retour && !retour.ok && !composerOuvert && <p className="page-error">{retour.texte}</p>}

      {sousOnglet === 'modeles' ? (
        <div className="panel">
          <div className="page-head" style={{ marginBottom: 12 }}>
            <p className="chart-sub" style={{ margin: 0 }}>Des sujets/messages prêts à réutiliser, classés par catégorie. Chargez-en un depuis l'onglet Composer, modifiez-le si besoin, puis envoyez.</p>
            <div className="action-row">
              <button className="btn btn-primary btn-sm" onClick={() => ouvrirNouveauModele(false)}><IconSquarePencil /> Nouveau modèle</button>
              {selectionModeles ? (
                <>
                  <button className="btn btn-sm" onClick={() => setSelectionModeles(null)}>Annuler</button>
                  <button className="btn btn-danger-outline btn-sm" disabled={selectionModeles.size === 0} onClick={() => mettreModelesCorbeille([...selectionModeles])}>
                    <IconTrash /> Mettre à la corbeille{selectionModeles.size ? ` (${selectionModeles.size})` : ''}
                  </button>
                </>
              ) : (
                <button className="icon-button icon-button-danger" title="Sélectionner des modèles à supprimer" aria-label="Sélectionner des modèles à supprimer" onClick={() => setSelectionModeles(new Set())}><IconTrash /></button>
              )}
            </div>
          </div>
          {!modeles ? <p className="hint">Chargement…</p> : modeles.length === 0 ? <p className="hint">Aucun modèle enregistré pour l'instant.</p> : (
            <div className="dt-wrap">
              <table>
                <thead>
                  <tr>
                    {selectionModeles && (
                      <th style={{ width: 36 }}>
                        <input
                          type="checkbox" className="dt-check" aria-label="Tout sélectionner"
                          checked={modeles.length > 0 && selectionModeles.size === modeles.length}
                          onChange={() => setSelectionModeles(selectionModeles.size === modeles.length ? new Set() : new Set(modeles.map((m) => m.id)))}
                        />
                      </th>
                    )}
                    <th>Catégorie</th><th>Nom</th><th>Objet</th><th>Dernière modif.</th>
                  </tr>
                </thead>
                <tbody>
                  {modeles.map((m) => (
                    <tr
                      key={m.id}
                      className="dt-row-clickable"
                      onClick={() => (selectionModeles ? setSelectionModeles(toggleSelection(selectionModeles, m.id)) : ouvrirEditionModele(m))}
                    >
                      {selectionModeles && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" className="dt-check" aria-label="Sélectionner" checked={selectionModeles.has(m.id)} onChange={() => setSelectionModeles(toggleSelection(selectionModeles, m.id))} />
                        </td>
                      )}
                      <td><span className="badge badge-teal">{LABELS_CATEGORIE_MODELE[m.categorie] ?? m.categorie}</span></td>
                      <td>{m.nom}</td>
                      <td>{m.sujet}</td>
                      <td className="hint">{dateHeure(m.updated_at)}{m.cree_par_nom ? ` · ${m.cree_par_nom}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {modeleForm && (
            <div className="email-layout" style={{ marginTop: 16 }}>
              <div className="panel email-form">
                <label className="field">
                  <span>Catégorie</span>
                  <Select ariaLabel="Catégorie" value={modeleForm.categorie} onChange={(v) => setModeleForm((f) => f && { ...f, categorie: v })} options={CATEGORIES_MODELE} />
                </label>
                <label className="field">
                  <span>Nom du modèle</span>
                  <input type="text" value={modeleForm.nom} onChange={(e) => setModeleForm((f) => f && { ...f, nom: e.target.value })} placeholder="Ex. Relance KYC rejeté" />
                </label>
                <label className="field">
                  <span>Objet</span>
                  <input type="text" value={modeleForm.sujet} onChange={(e) => setModeleForm((f) => f && { ...f, sujet: e.target.value })} />
                </label>
                <label className="field">
                  <span>Message</span>
                  <textarea rows={8} value={modeleForm.corps} onChange={(e) => setModeleForm((f) => f && { ...f, corps: e.target.value })} placeholder={'Écrivez le corps du modèle (sans "Bonjour", déjà ajouté automatiquement).\n\nL\'en-tête et le pied de page (logo, mentions) sont ajoutés automatiquement à l\'envoi, inutile de les écrire ici.'} />
                </label>
                <div className="action-row" style={{ justifyContent: 'flex-end' }}>
                  <button className="btn" disabled={busyModele} onClick={() => setModeleForm(null)}>Annuler</button>
                  <button className="btn btn-primary" disabled={busyModele || !modeleForm.nom.trim() || !modeleForm.sujet.trim() || !modeleForm.corps.trim()} onClick={enregistrerModele}>
                    {busyModele ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>

              <div className="email-preview-wrap">
                <p className="section-title">Aperçu</p>
                <div className="email-preview">
                  <div className="email-preview-head">
                    <img className="email-preview-logo" src={logo} alt="" width={81} height={44} />
                    <span className="email-preview-title">WONJO</span>
                    <span className="email-preview-slogan">Le colis qui nous lie</span>
                  </div>
                  <div className="email-preview-body">
                    <h4>Bonjour Ben</h4>
                    {(modeleForm.corps.split('{prenom}').join('Ben') || 'Le corps du modèle apparaîtra ici.').split(/\n{2,}/).map((p, i) => (
                      <p key={i}>{p.split('\n').map((l, j) => <span key={j}>{l}{j < p.split('\n').length - 1 && <br />}</span>)}</p>
                    ))}
                  </div>
                  <div className="email-preview-foot">
                    © 2026 <b>Wonjo</b> · <u>Nous contacter</u><br />
                    Email automatique, merci de ne pas y répondre.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : sousOnglet === 'corbeille' ? (
        <div className="panel">
          <p className="chart-sub" style={{ marginTop: 0 }}>Éléments supprimés, récupérables tant qu'ils n'ont pas été effacés définitivement. Le journal des actions garde une trace dans tous les cas.</p>

          <div className="page-head" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Modèles</h3>
            <div className="action-row">
              <button className="btn btn-sm" disabled={selectionModelesCorbeille.size === 0} onClick={() => restaurerModeles([...selectionModelesCorbeille])}><IconRestore /> Restaurer{selectionModelesCorbeille.size ? ` (${selectionModelesCorbeille.size})` : ''}</button>
              <button className="btn btn-danger-outline btn-sm" disabled={selectionModelesCorbeille.size === 0} onClick={() => supprimerModelesDefinitivement([...selectionModelesCorbeille])}><IconTrash /> Supprimer définitivement{selectionModelesCorbeille.size ? ` (${selectionModelesCorbeille.size})` : ''}</button>
            </div>
          </div>
          {!modelesCorbeille ? <p className="hint">Chargement…</p> : modelesCorbeille.length === 0 ? <p className="hint">Corbeille des modèles vide.</p> : (
            <div className="dt-wrap" style={{ marginBottom: 24 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox" className="dt-check" aria-label="Tout sélectionner"
                        checked={modelesCorbeille.length > 0 && selectionModelesCorbeille.size === modelesCorbeille.length}
                        onChange={() => setSelectionModelesCorbeille(selectionModelesCorbeille.size === modelesCorbeille.length ? new Set() : new Set(modelesCorbeille.map((m) => m.id)))}
                      />
                    </th>
                    <th>Catégorie</th><th>Nom</th><th>Objet</th>
                  </tr>
                </thead>
                <tbody>
                  {modelesCorbeille.map((m) => (
                    <tr key={m.id} className="dt-row-clickable" onClick={() => setSelectionModelesCorbeille(toggleSelection(selectionModelesCorbeille, m.id))}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="dt-check" aria-label="Sélectionner" checked={selectionModelesCorbeille.has(m.id)} onChange={() => setSelectionModelesCorbeille(toggleSelection(selectionModelesCorbeille, m.id))} />
                      </td>
                      <td><span className="badge badge-teal">{LABELS_CATEGORIE_MODELE[m.categorie] ?? m.categorie}</span></td>
                      <td>{m.nom}</td>
                      <td>{m.sujet}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="page-head" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Messages envoyés</h3>
            <div className="action-row">
              <button className="btn btn-sm" disabled={selectionCampagnesCorbeille.size === 0} onClick={() => restaurerCampagnes([...selectionCampagnesCorbeille])}><IconRestore /> Restaurer{selectionCampagnesCorbeille.size ? ` (${selectionCampagnesCorbeille.size})` : ''}</button>
              <button className="btn btn-danger-outline btn-sm" disabled={selectionCampagnesCorbeille.size === 0} onClick={() => supprimerCampagnesDefinitivement([...selectionCampagnesCorbeille])}><IconTrash /> Supprimer définitivement{selectionCampagnesCorbeille.size ? ` (${selectionCampagnesCorbeille.size})` : ''}</button>
            </div>
          </div>
          {!campagnesCorbeille ? <p className="hint">Chargement…</p> : campagnesCorbeille.length === 0 ? <p className="hint">Corbeille de l'historique vide.</p> : (
            <div className="dt-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input
                        type="checkbox" className="dt-check" aria-label="Tout sélectionner"
                        checked={campagnesCorbeille.length > 0 && selectionCampagnesCorbeille.size === campagnesCorbeille.length}
                        onChange={() => setSelectionCampagnesCorbeille(selectionCampagnesCorbeille.size === campagnesCorbeille.length ? new Set() : new Set(campagnesCorbeille.map((c) => c.id)))}
                      />
                    </th>
                    <th>Date</th><th>Objet</th><th>Envoyés</th>
                  </tr>
                </thead>
                <tbody>
                  {campagnesCorbeille.map((c) => (
                    <tr key={c.id} className="dt-row-clickable" onClick={() => setSelectionCampagnesCorbeille(toggleSelection(selectionCampagnesCorbeille, c.id))}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="dt-check" aria-label="Sélectionner" checked={selectionCampagnesCorbeille.has(c.id)} onChange={() => setSelectionCampagnesCorbeille(toggleSelection(selectionCampagnesCorbeille, c.id))} />
                      </td>
                      <td className="hint">{dateHeure(c.created_at)}</td>
                      <td>{c.sujet}</td>
                      <td>{c.nb_envoyes} / {c.nb_destinataires}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : sousOnglet === 'desinscrits' ? (
        <div className="panel">
          <div className="page-head" style={{ marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>Désinscrits des promotions</h3>
              <p className="chart-sub">Exclus automatiquement de tous les prochains envois de type Promotion. Ils reçoivent toujours les emails d'information liés à leur compte.</p>
            </div>
          </div>
          {!desinscrits ? <p className="hint">Chargement…</p> : (
            <DataTable
              rows={desinscrits}
              columns={colonnesDesinscrits}
              rowKey={(d) => d.user_id}
              initialSort={{ key: 'date', dir: 'desc' }}
              emptyText="Personne ne s'est désinscrit pour l'instant."
            />
          )}
        </div>
      ) : !composerOuvert ? (
        <div>
          <div className="panel">
            <div className="page-head" style={{ marginBottom: 12 }}>
              <p className="chart-sub" style={{ margin: 0 }}>Chaque envoi est tracé ci-dessous.</p>
              <div className="action-row">
                {selectionCampagnes ? (
                  <>
                    <button className="btn btn-sm" onClick={() => setSelectionCampagnes(null)}>Annuler</button>
                    <button className="btn btn-danger-outline btn-sm" disabled={selectionCampagnes.size === 0} onClick={() => mettreCampagnesCorbeille([...selectionCampagnes])}>
                      <IconTrash /> Mettre à la corbeille{selectionCampagnes.size ? ` (${selectionCampagnes.size})` : ''}
                    </button>
                  </>
                ) : (
                  <button className="icon-button icon-button-danger" title="Sélectionner des envois à supprimer" aria-label="Sélectionner des envois à supprimer" onClick={() => setSelectionCampagnes(new Set())}><IconTrash /></button>
                )}
                <button className="btn btn-primary btn-sm" onClick={() => setComposerOuvert(true)}><IconSquarePencil /> Nouveau message</button>
              </div>
            </div>
            <h3>Historique des envois</h3>
            {!campagnes ? <p className="hint">Chargement…</p> : (
              <DataTable
                rows={campagnes} columns={colonnes} rowKey={(c) => c.id} initialSort={{ key: 'date', dir: 'desc' }} emptyText="Aucun envoi pour l'instant."
                onRowClick={selectionCampagnes ? undefined : setCampagneOuverte}
                selected={selectionCampagnes ?? undefined}
                onSelectedChange={selectionCampagnes ? setSelectionCampagnes : undefined}
              />
            )}
          </div>

          {campagneOuverte && (
            <div className="modal-overlay" onClick={() => setCampagneOuverte(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="page-head" style={{ marginBottom: 12 }}>
                  <div>
                    <h3 style={{ margin: 0 }}>{campagneOuverte.sujet}</h3>
                    <p className="chart-sub" style={{ margin: 0 }}>
                      {dateHeure(campagneOuverte.created_at)} · {campagneOuverte.type === 'promotion' ? 'Promotion' : 'Information'} · {LABELS_SEGMENT[campagneOuverte.segment] ?? campagneOuverte.segment} · {campagneOuverte.nb_envoyes}/{campagneOuverte.nb_destinataires} envoyé(s){campagneOuverte.nb_echecs ? `, ${campagneOuverte.nb_echecs} échec(s)` : ''}
                    </p>
                  </div>
                  <button className="btn btn-sm" onClick={() => setCampagneOuverte(null)}>Fermer</button>
                </div>
                <div className="panel" style={{ whiteSpace: 'pre-wrap' }}>{campagneOuverte.message}</div>
              </div>
            </div>
          )}
        </div>
      ) : (
      <>
      <div className="action-row" style={{ marginBottom: 12 }}>
        <button className="btn btn-sm" onClick={() => setComposerOuvert(false)}>
          <span className="icon-circle"><IconChevronLeft /></span> Retour à l'historique
        </button>
      </div>
      <div className="email-layout">
        <div className="panel email-form">
          <div className="segmented" role="radiogroup" aria-label="Type d'email">
            {peutInformation && (
              <button role="radio" aria-checked={type === 'service'} className={type === 'service' ? 'on' : ''} onClick={() => setType('service')}>
                <b>Information</b><span>Lié au compte : vérification, reconnexion, nouveauté</span>
              </button>
            )}
            <button role="radio" aria-checked={type === 'promotion'} className={type === 'promotion' ? 'on' : ''} onClick={() => setType('promotion')}>
              <b>Promotion</b><span>Offre commerciale, avec lien de désinscription</span>
            </button>
          </div>

          <label className="field">
            <span>Destinataires</span>
            <Select ariaLabel="Destinataires" value={segment} onChange={setSegment} options={segmentOptions} />
          </label>
          {segment === 'selection' && (
            <div className="member-picker">
              <input type="search" placeholder="Rechercher un membre par nom ou email…" value={rechercheMembre} onChange={(e) => setRechercheMembre(e.target.value)} />
              {membres.size > 0 && (
                <div className="chips">
                  {[...membres].map((id) => (
                    <span key={id} className="chip">
                      {nomAffiche(id)}
                      <button type="button" aria-label={`Retirer ${nomAffiche(id)}`} onClick={() => setMembres((m) => { const n = new Set(m); n.delete(id); return n; })}>×</button>
                    </span>
                  ))}
                </div>
              )}
              {rechercheMembre.trim() === '' ? (
                <p className="hint" style={{ margin: '8px 0 0' }}>Tapez un nom ou un email pour rechercher…</p>
              ) : comptesFiltres.length === 0 ? (
                <p className="hint" style={{ margin: '8px 0 0' }}>Aucun membre trouvé.</p>
              ) : (
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
              )}
            </div>
          )}
          <p className="hint">
            {compte ? <><b>{compte.destinataires}</b> destinataire(s)</> : 'Calcul…'}
            {compte && compte.desinscrits_exclus > 0 && ` · ${compte.desinscrits_exclus} désinscrit(s) exclu(s)`}
            {type === 'promotion' && ' · comptes bloqués exclus'}
          </p>

          {modeles && modeles.length > 0 && (
            <label className="field">
              <span>Charger un modèle (facultatif)</span>
              <Select
                ariaLabel="Charger un modèle"
                value={modeleChoisi}
                onChange={chargerModeleDansFormulaire}
                options={[{ value: '', label: 'Aucun - écrire librement' }, ...modeles.map((m) => ({ value: m.id, label: `${LABELS_CATEGORIE_MODELE[m.categorie] ?? m.categorie} · ${m.nom}` }))]}
              />
            </label>
          )}

          <label className="field">
            <span>Objet</span>
            <input type="text" maxLength={150} value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Ex. Finalisez votre vérification en 2 minutes" />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea rows={8} maxLength={5000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={'Écrivez votre message (sans "Bonjour", déjà ajouté automatiquement).\n\nAstuce : {prenom} est remplacé par le prénom de chaque destinataire.'} />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Bouton (facultatif)</span>
              <input type="text" value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Ex. Ouvrir Wonjo" />
            </label>
            <label className="field">
              <span>Lien du bouton</span>
              <input type="text" value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://wonjo.app" />
            </label>
          </div>

          {retour && <p className={retour.ok ? 'success-text' : 'page-error'}>{retour.texte}</p>}
          <div className="action-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" disabled={!sujet.trim() || !message.trim()} onClick={() => { ouvrirNouveauModele(true); setSousOnglet('modeles'); }}>Enregistrer comme modèle</button>
            <button className="btn" disabled={!pret || busy} onClick={() => envoyer(true)}>M'envoyer un test</button>
            <button className="btn btn-primary" disabled={!pret || busy || !compte?.destinataires} onClick={() => envoyer(false)}>
              {busy ? 'Envoi…' : `Envoyer à ${compte?.destinataires ?? '…'} destinataire(s)`}
            </button>
          </div>
        </div>

        <div className="email-preview-wrap">
          <p className="section-title">Aperçu</p>
          <div className="email-preview">
            <div className="email-preview-head">
              <img className="email-preview-logo" src={logo} alt="" width={81} height={44} />
              <span className="email-preview-title">WONJO</span>
              <span className="email-preview-slogan">Le colis qui nous lie</span>
            </div>
            <div className="email-preview-body">
              <h4>Bonjour Ben</h4>
              {(apercu || 'Votre message apparaîtra ici.').split(/\n{2,}/).map((p, i) => (
                <p key={i}>{p.split('\n').map((l, j) => <span key={j}>{l}{j < p.split('\n').length - 1 && <br />}</span>)}</p>
              ))}
              {ctaLabel && <span className="email-preview-cta">{ctaLabel}</span>}
              {type === 'promotion' && <small>Vous recevez cet email car vous avez un compte Wonjo.<br />Ne plus recevoir nos offres</small>}
            </div>
            {/* Meme pied que emailFooter() (_shared/email-layout.ts) des emails de l'app. */}
            <div className="email-preview-foot">
              © 2026 <b>Wonjo</b> · <u>Nous contacter</u><br />
              Email automatique, merci de ne pas y répondre.
            </div>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
}
