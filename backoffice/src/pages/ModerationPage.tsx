import { decimales } from '../lib/nombre';
import { useEffect, useState } from 'react';
import { Select } from '../components/Select';
import { supabase } from '../lib/supabase';
import { Badge, StatutBadge } from '../components/Badge';
import { Avatar } from '../components/Avatar';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins, peutModerer, peutVoirRevenus } from '../lib/permissions';
import { DataTable, type Column } from '../components/DataTable';
import { ServerTable, type ServerColumn } from '../components/ServerTable';
import { Modal } from '../components/Modal';
import { useFicheCompte, VoirFicheButton } from '../components/FicheCompte';
import { LABELS_NIVEAU, LABELS_PAIEMENT, LABELS_STATUT_COLIS, LABELS_STATUT_KYC, LABELS_STATUT_SIGNALEMENT, casserNom, casserPrenom, dateHeure, dateSeule, depuis, nomComplet } from '../lib/labels';
import { useDebounce } from '../lib/useDebounce';
import type { CompteRecherche, Litige, Signalement, TransactionBloquee } from '../lib/types';

const PAGE_SIZE_COMPTES = 10;

type Tab = 'comptes' | 'signalements' | 'litiges';

export function ModerationPage() {
  const location = useLocation();
  // [335] ?onglet=litiges : lien de l'e-mail d'arbitrage, qui ne peut pas
  // transporter d'etat de navigation.
  const ongletUrl = new URLSearchParams(location.search).get('onglet') as Tab | null;
  const ongletDemande = (location.state as { tab?: Tab } | null)?.tab ?? ongletUrl ?? undefined;
  const { roles } = useAuth();
  // [301] La finance n'accede qu'aux litiges (pas aux comptes ni aux signalements).
  const moderateur = peutModerer(roles);
  const [tab, setTab] = useState<Tab>(moderateur ? (ongletDemande ?? 'comptes') : 'litiges');
  useEffect(() => { if (ongletDemande && moderateur) setTab(ongletDemande); }, [ongletDemande, location.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Signalements & litiges</h1>
          <p className="page-sub">Comptes, signalements et litiges.</p>
        </div>
      </div>
      <div className="tabs">
        {moderateur && <button className={tab === 'comptes' ? 'active' : ''} onClick={() => setTab('comptes')}>Comptes</button>}
        {moderateur && <button className={tab === 'signalements' ? 'active' : ''} onClick={() => setTab('signalements')}>Signalements</button>}
        <button className={tab === 'litiges' ? 'active' : ''} onClick={() => setTab('litiges')}>Litiges</button>
      </div>
      {tab === 'comptes' && moderateur && <ComptesTab />}
      {tab === 'signalements' && moderateur && <SignalementsTab />}
      {tab === 'litiges' && <LitigesTab />}
    </div>
  );
}

function ComptesTab() {
  const location = useLocation();
  const filtreDemande = (location.state as { filtre?: string } | null)?.filtre;
  const [filtreDoublons, setFiltreDoublons] = useState(filtreDemande === 'doublons_identite');
  useEffect(() => { if (filtreDemande === 'doublons_identite') setFiltreDoublons(true); }, [filtreDemande, location.key]);

  // Recherche/filtres/tri/page : chaque changement redemande une page au
  // serveur (253) plutot que de tout retelecharger pour filtrer sur place -
  // seule cette page-la est jamais en memoire.
  const [recherche, setRecherche] = useState('');
  const rechercheDebattue = useDebounce(recherche);
  const [statut, setStatut] = useState<string[]>(filtreDemande === 'bloque' ? ['bloque'] : []);
  useEffect(() => { if (filtreDemande === 'bloque') setStatut(['bloque']); }, [filtreDemande, location.key]);
  const [kyc, setKyc] = useState<string[]>([]);
  const [verif, setVerif] = useState<string[]>([]);
  const [niveau, setNiveau] = useState<string[]>([]);
  const [tri, setTri] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(0);

  const [items, setItems] = useState<CompteRecherche[] | null>(null);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [selectionInfo, setSelectionInfo] = useState<Map<string, CompteRecherche>>(new Map());
  const { roles } = useAuth();
  const peutEnvoyer = peutGererAdmins(roles);
  const navigate = useNavigate();

  function load() {
    setChargement(true);
    const rpc = filtreDoublons ? 'admin_comptes_doublons_identite' : 'admin_rechercher_comptes';
    const params = filtreDoublons ? {} : {
      p_recherche: rechercheDebattue,
      p_statut: statut.length ? statut : null,
      p_kyc: kyc.length ? kyc : null,
      p_verif: verif.length ? verif : null,
      p_tri: tri?.key ?? 'created_at',
      p_ordre: tri?.dir ?? 'desc',
      p_limite: PAGE_SIZE_COMPTES,
      p_offset: page * PAGE_SIZE_COMPTES,
      p_niveau: niveau.length ? niveau : null,
    };
    supabase.rpc(rpc, params).then(({ data, error: rpcError }) => {
      setChargement(false);
      if (rpcError) { setError(rpcError.message); return; }
      const lignes = (data ?? []) as (CompteRecherche & { total_count?: number })[];
      setItems(lignes);
      setTotal(filtreDoublons ? lignes.length : (lignes[0]?.total_count ?? 0));
    });
  }
  useEffect(load, [filtreDoublons, rechercheDebattue, statut, kyc, verif, niveau, tri, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0); }, [rechercheDebattue, statut, kyc, verif, niveau, filtreDoublons]);
  const { ouvrir, modal } = useFicheCompte(load);

  function changerSelection(next: Set<string>) {
    setSelection(next);
    setSelectionInfo((prev) => {
      const m = new Map(prev);
      for (const id of m.keys()) if (!next.has(id)) m.delete(id);
      for (const id of next) if (!m.has(id)) {
        const trouve = items?.find((c) => c.id === id);
        if (trouve) m.set(id, trouve);
      }
      return m;
    });
  }

  const colonnesCommunes = [
    { key: 'avatar', label: 'Avatar', render: (c: CompteRecherche) => <Avatar src={c.photo_url} nom={nomComplet(c.prenom, c.nom)} size={36} />, width: 70 },
    { key: 'prenom', label: 'Prénom', render: (c: CompteRecherche) => <strong>{casserPrenom(c.prenom)}</strong> },
    { key: 'nom', label: 'Nom', sortKey: 'nom', render: (c: CompteRecherche) => casserNom(c.nom) },
    { key: 'email', label: 'Email', render: (c: CompteRecherche) => c.email },
    {
      key: 'statut', label: 'Statut', filterKey: 'statut',
      filterOptions: [{ value: 'actif', label: 'Actif' }, { value: 'bloque', label: 'Bloqué' }],
      render: (c: CompteRecherche) => (c.bloque ? <span className="badge badge-danger">Bloqué</span> : <span className="badge badge-green">Actif</span>),
    },
    {
      key: 'verif', label: 'Vérifié', filterKey: 'verif',
      filterOptions: [
        { value: 'identite', label: 'Identité vérifiée' },
        { value: 'telephone', label: 'Téléphone vérifié' },
        { value: 'aucun', label: 'Non vérifié' },
      ],
      render: (c: CompteRecherche) => (c.id_verifie ? <span className="badge badge-green">Identité</span> : c.telephone_verifie ? <span className="badge badge-teal">Téléphone</span> : <span className="badge badge-muted">Non vérifié</span>),
    },
    {
      key: 'niveau', label: 'Niveau', filterKey: 'niveau',
      filterOptions: Object.entries(LABELS_NIVEAU).map(([value, label]) => ({ value, label })),
      render: (c: CompteRecherche) => <span className={`badge ${c.niveau === 'debutant' ? 'badge-muted' : `badge-niveau-${c.niveau}`}`}>{LABELS_NIVEAU[c.niveau]}</span>,
    },
    {
      key: 'kyc', label: 'KYC', filterKey: 'kyc',
      filterOptions: Object.entries(LABELS_STATUT_KYC).map(([value, label]) => ({ value, label })),
      render: (c: CompteRecherche) => <StatutBadge statut={c.kyc_status ?? 'none'} label={LABELS_STATUT_KYC[c.kyc_status ?? 'none'] ?? String(c.kyc_status)} />,
    },
    { key: 'connexion', label: 'Dernière connexion', sortKey: 'derniere_connexion', render: (c: CompteRecherche) => depuis(c.derniere_connexion) },
  ];

  if (error) return <p className="page-error">{error}</p>;

  if (filtreDoublons) {
    const columnsDoublons: Column<CompteRecherche>[] = [
      ...colonnesCommunes,
      { key: 'actions', label: '', render: (c) => <VoirFicheButton onClick={() => ouvrir(c.id)} />, width: 100 },
    ];
    return (
      <>
        <p className="hint" style={{ marginBottom: 12 }}>
          Filtré sur les identités (nom + prénom) portées par plusieurs comptes, dont au moins un déjà vérifié.{' '}
          <button type="button" className="btn-link" onClick={() => { setItems(null); setFiltreDoublons(false); }}>Voir tous les comptes</button>
        </p>
        {!items ? <p className="loading-state">Chargement…</p> : (
          <DataTable rows={items} columns={columnsDoublons} rowKey={(c) => c.id} searchPlaceholder="Rechercher un nom, un email…" emptyText="Aucun compte ne correspond." />
        )}
        {modal}
      </>
    );
  }

  const columns: ServerColumn<CompteRecherche>[] = [
    ...colonnesCommunes,
    { key: 'actions', label: '', render: (c) => <VoirFicheButton onClick={() => ouvrir(c.id)} />, width: 100 },
  ];

  const choisis = [...selectionInfo.values()];
  return (
    <>
      <ServerTable
        rows={items ?? []}
        columns={columns}
        rowKey={(c) => c.id}
        loading={chargement}
        search={recherche}
        onSearchChange={setRecherche}
        searchPlaceholder="Rechercher un nom, un email…"
        emptyText="Aucun compte ne correspond."
        total={total}
        page={page}
        pageSize={PAGE_SIZE_COMPTES}
        onPageChange={setPage}
        sort={tri}
        onSortChange={setTri}
        filtres={{ statut, kyc, verif, niveau }}
        onFiltreChange={(cle, valeurs) => {
          if (cle === 'statut') setStatut(valeurs);
          else if (cle === 'kyc') setKyc(valeurs);
          else if (cle === 'verif') setVerif(valeurs);
          else if (cle === 'niveau') setNiveau(valeurs);
        }}
        {...(peutEnvoyer ? { selected: selection, onSelectedChange: changerSelection } : {})}
      />
      {peutEnvoyer && selection.size > 0 && (
        <div className="selection-bar">
          <span>{selection.size} compte(s) sélectionné(s)</span>
          <div className="action-row">
            <button className="btn btn-sm" onClick={() => { setSelection(new Set()); setSelectionInfo(new Map()); }}>Tout désélectionner</button>
            <button
              className="btn btn-sm"
              onClick={() => navigate('/commissions', { state: { ids: [...selection], noms: choisis.map((c) => nomComplet(c.prenom, c.nom) || c.email) } })}
            >
              Réduire la commission
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate('/emails', { state: { ids: [...selection], noms: choisis.map((c) => nomComplet(c.prenom, c.nom) || c.email) } })}
            >
              Envoyer un email
            </button>
          </div>
        </div>
      )}
      {modal}
    </>
  );
}

function SignalementsTab() {
  const location = useLocation();
  const filtreDemande = (location.state as { filtre?: string } | null)?.filtre;
  const [items, setItems] = useState<Signalement[] | null>(null);
  const [statut, setStatut] = useState<string>(filtreDemande ?? 'nouveau');
  const [error, setError] = useState<string | null>(null);

  function load() {
    supabase.rpc('admin_lister_signalements', { p_statut: statut || null, p_limite: 500, p_offset: 0 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as Signalement[]);
    });
  }
  useEffect(load, [statut]); // eslint-disable-line react-hooks/exhaustive-deps
  const { ouvrir, modal } = useFicheCompte(load);

  const [aTraiter, setATraiter] = useState<{ signalement: Signalement; decision: DecisionSignalement } | null>(null);

  const columns: Column<Signalement>[] = [
    { key: 'raison', filter: 'options', label: 'Raison', value: (s) => s.raison },
    { key: 'details', label: 'Détails', value: (s) => s.details },
    { key: 'date', label: 'Créé le', value: (s) => s.created_at, filter: 'date', render: (s) => dateHeure(s.created_at) },
    { key: 'statut', filter: 'options', label: 'Statut', value: (s) => LABELS_STATUT_SIGNALEMENT[s.statut] ?? s.statut, render: (s) => <StatutBadge statut={s.statut} label={LABELS_STATUT_SIGNALEMENT[s.statut] ?? s.statut} /> },
    {
      key: 'actions', label: 'Actions', render: (s) => (
        <div className="action-row">
          <VoirFicheButton onClick={() => ouvrir(s.cible_id)} />
          {s.statut === 'nouveau' && (
            <button className="btn btn-sm" title="Vous le suivez : il passe dans la file « En cours »" onClick={() => setATraiter({ signalement: s, decision: 'en_cours' })}>Prendre en charge</button>
          )}
          {s.statut !== 'clos_sans_suite' && s.statut !== 'clos_action_prise' && (
            <>
              <button className="btn btn-sm btn-soft" title="Le signalement ne demande aucune intervention" onClick={() => setATraiter({ signalement: s, decision: 'clos_sans_suite' })}>Rien à faire</button>
              <button className="btn btn-sm btn-soft-success" title="Vous avez agi (compte bloqué, contact, avertissement…) : le dossier est clos" onClick={() => setATraiter({ signalement: s, decision: 'clos_action_prise' })}>Action menée</button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {error && <p className="page-error">{error}</p>}
      {!items ? <p className="loading-state">Chargement…</p> : (
        <DataTable
          rows={items}
          columns={columns}
          rowKey={(s) => s.id}
          initialSort={{ key: 'date', dir: 'desc' }}
          emptyText="Aucun signalement dans cette file."
          toolbar={(
            <Select
              ariaLabel="Statut des signalements"
              value={statut}
              onChange={(v) => { setItems(null); setStatut(v); }}
              minWidth={200}
              options={[
                { value: 'nouveau', label: 'Nouveaux' },
                { value: 'en_cours', label: 'En cours' },
                { value: 'clos_sans_suite', label: 'Clos sans suite' },
                { value: 'clos_action_prise', label: 'Clos - action prise' },
                { value: '', label: 'Tous les statuts' },
              ]}
            />
          )}
        />
      )}
      {modal}
      {aTraiter && (
        <SignalementDecisionModal
          signalement={aTraiter.signalement}
          decision={aTraiter.decision}
          onClose={() => setATraiter(null)}
          onDone={() => { setATraiter(null); load(); }}
        />
      )}
    </>
  );
}

// Traitement d'un signalement : remplace window.prompt, dont la boite native du
// navigateur ne disait pas ce que chaque bouton signifie. Cloturer est un
// classement INTERNE : personne n'est prevenu, aucun compte n'est bloque (le
// blocage se fait depuis la fiche du compte), la note n'est lisible que des admins.
type DecisionSignalement = 'en_cours' | 'clos_sans_suite' | 'clos_action_prise';

const TEXTES_DECISION: Record<DecisionSignalement, { titre: string; explication: string; bouton: string; placeholder: string; ton: string }> = {
  en_cours: {
    titre: 'Prendre en charge ce signalement',
    explication: 'Vous indiquez que vous vous en occupez. Le signalement passe dans la file « En cours » et reste ouvert tant que vous ne l\'avez pas clos.',
    bouton: 'Prendre en charge',
    placeholder: 'Ex. j\'écris au membre signalé avant de décider.',
    ton: 'btn-primary',
  },
  clos_sans_suite: {
    titre: 'Clore : rien à faire',
    explication: 'Le signalement ne justifie aucune intervention (infondé, déjà réglé, malentendu). Le dossier est classé.',
    bouton: 'Clore sans suite',
    placeholder: 'Ex. conflit personnel entre deux membres, aucune règle enfreinte.',
    ton: 'btn-primary',
  },
  clos_action_prise: {
    titre: 'Clore : action menée',
    explication: 'Vous avez agi à la suite de ce signalement (compte bloqué, avertissement, contact avec le membre…). Le dossier est classé avec la mention « action prise ».',
    bouton: 'Clore : action menée',
    placeholder: 'Ex. compte bloqué 30 jours après deux signalements concordants.',
    ton: 'btn-primary',
  },
};

function SignalementDecisionModal({ signalement, decision, onClose, onDone }: {
  signalement: Signalement; decision: DecisionSignalement; onClose: () => void; onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = TEXTES_DECISION[decision];

  async function confirmer() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_traiter_signalement', {
      p_id: signalement.id, p_statut: decision, p_note: note.trim() || null,
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    onDone();
  }

  return (
    <Modal onClose={onClose} narrow>
      <h2 className="modal-title">{t.titre}</h2>
      <div className="modal-body">
        <div className="signalement-resume">
          <b>{signalement.raison}</b>
          {signalement.details && <span>{signalement.details}</span>}
          <span className="hint">Reçu le {dateHeure(signalement.created_at)}</span>
        </div>
        <p className="hint">{t.explication}</p>
        <p className="hint">Classement interne : ni le membre signalé ni la personne qui a signalé ne sont prévenus, et aucun compte n'est bloqué. Pour bloquer un compte, ouvrez sa fiche.</p>
        <div className="action-group motif-form">
          <label htmlFor="note-signalement">Note interne (facultative)</label>
          <textarea id="note-signalement" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.placeholder} />
        </div>
        {error && <p className="page-error">{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" disabled={busy} onClick={onClose}>Annuler</button>
          <button className={`btn ${t.ton}`} disabled={busy} onClick={confirmer}>{busy ? '…' : t.bouton}</button>
        </div>
      </div>
    </Modal>
  );
}

// [303] Decision de Wonjo a defaut d'accord (CGU 1.5.0, art. 8) : pour
// l'expediteur (annulation) ou pour le voyageur (transport repute effectue).
// Les conditions sont reverifiees par la base ; ici elles servent a expliquer.
type Decision = 'expediteur' | 'voyageur';
const COLIS_REMIS = ['remis_porteur', 'en_transit', 'arrive', 'livre'];
const COLIS_CHEZ_VOYAGEUR = ['remis_porteur', 'en_transit'];

function LitigeResolutionModal({ litige, onClose, onDone }: { litige: Litige; onClose: () => void; onDone: () => void }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const avant = litige.statut_avant_litige ?? '';
  const voyageurPossible = COLIS_REMIS.includes(avant) && litige.statut_paiement === 'escrow';
  const restitution = COLIS_CHEZ_VOYAGEUR.includes(avant);
  const montant = `${decimales(Number(litige.montant_total), 2)} €`;

  async function confirmer() {
    const m = motif.trim();
    if (!decision) { setError('Choisissez en faveur de qui trancher.'); return; }
    if (!m) { setError('Le motif est obligatoire.'); return; }
    setBusy(true);
    setError(null);
    const rpc = decision === 'voyageur' ? 'admin_resoudre_litige_voyageur' : 'admin_resoudre_litige_remboursement';
    const { error: rpcError } = await supabase.rpc(rpc, { p_demande_id: litige.id, p_motif: m });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    onDone();
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Trancher le litige</h2>
      <div className="modal-body">
        <p className="hint">Colis : {litige.description_colis} · {montant} · litige ouvert au stade « {LABELS_STATUT_COLIS[avant] ?? (avant || 'inconnu')} »</p>
        <p className="hint">Décision de Wonjo (CGU, art. 8), définitive sur la plateforme : aucun nouveau litige ne pourra être ouvert. À prendre à défaut d'accord entre les parties, après examen du dossier (constats, conversation, déclarations), ou quand un accord trouvé via le support ne s'est pas appliqué dans l'app.</p>
        <div className="segmented" role="radiogroup" aria-label="Décision">
          <button role="radio" aria-checked={decision === 'expediteur'} className={decision === 'expediteur' ? 'on' : ''} onClick={() => setDecision('expediteur')}>
            <b>Rembourser l'expéditeur</b>
            <span>{restitution
              ? 'Transaction annulée. Le voyageur doit rendre le colis ; remboursement une fois la restitution confirmée par les deux.'
              : 'Transaction annulée, remboursement Stripe traité automatiquement dans l\'heure.'}</span>
          </button>
          <button role="radio" aria-checked={decision === 'voyageur'} className={decision === 'voyageur' ? 'on' : ''} disabled={!voyageurPossible} onClick={() => setDecision('voyageur')}>
            <b>Payer le voyageur</b>
            <span>{voyageurPossible
              ? 'Transport réputé effectué : transaction livrée, virement au voyageur dans l\'heure.'
              : litige.statut_paiement !== 'escrow'
                ? 'Impossible : aucun paiement encaissé sur cette transaction.'
                : 'Impossible : le colis n\'a jamais été remis au voyageur.'}</span>
          </button>
        </div>
        <div className="action-group motif-form">
          <label htmlFor="motif-litige">Motif de la décision : il sera envoyé aux deux parties dans leur conversation</label>
          <textarea id="motif-litige" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={decision === 'voyageur'
            ? 'Ex. la photo de livraison montre le colis intact remis au destinataire ; l\'expéditeur n\'a fourni aucun élément contraire.'
            : 'Ex. le colis n\'a jamais été remis au destinataire : aucune photo de livraison et le voyageur ne répond plus depuis 10 jours.'} />
        </div>
        {error && <p className="page-error">{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" disabled={busy} onClick={onClose}>Annuler</button>
          <button className={`btn ${decision === 'voyageur' ? 'btn-primary' : 'btn-danger'}`} disabled={busy || !decision} onClick={confirmer}>
            {busy ? '…' : decision === 'voyageur' ? `Verser ${montant} au voyageur` : decision === 'expediteur' ? 'Confirmer le remboursement' : 'Confirmer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function LitigesTab() {
  const { roles } = useAuth();
  const [items, setItems] = useState<Litige[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aTrancher, setATrancher] = useState<Litige | null>(null);

  function charger() {
    supabase.rpc('admin_lister_litiges', { p_limite: 500, p_offset: 0 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as Litige[]);
    });
  }

  useEffect(charger, []);
  const { ouvrir, modal } = useFicheCompte();

  const columns: Column<Litige>[] = [
    { key: 'colis', label: 'Colis', value: (l) => l.description_colis },
    { key: 'montant', label: 'Montant', value: (l) => Number(l.montant_total), render: (l) => `${decimales(Number(l.montant_total), 2)} €` },
    { key: 'paiement', filter: 'options', label: 'Statut paiement', value: (l) => LABELS_PAIEMENT[l.statut_paiement] ?? l.statut_paiement },
    { key: 'conteste', label: 'Contesté le', value: (l) => l.conteste_at, filter: 'date', render: (l) => (l.conteste_at ? dateHeure(l.conteste_at) : '-') },
    { key: 'resolutions', label: 'Résolutions en attente', value: (l) => l.resolutions_en_attente },
    {
      key: 'arbitrage', label: 'Arbitrage', value: (l) => l.arbitrage_demande_at ?? '', render: (l) => l.arbitrage_demande_at
        ? <Badge tone="danger">Demandé par {l.arbitrage_demande_role === 'expediteur' ? 'l\'expéditeur' : 'le voyageur'}, {depuis(l.arbitrage_demande_at)}</Badge>
        : l.ouvert_par_wonjo ? <Badge tone="amber">Ouvert par Wonjo</Badge> : <span className="hint">-</span>,
    },
    {
      key: 'actions', label: 'Parties', render: (l) => !peutModerer(roles) ? <span className="hint">-</span> : (
        <div className="action-row">
          <button className="btn btn-soft btn-sm" onClick={() => ouvrir(l.expediteur_id)}>Expéditeur</button>
          <button className="btn btn-soft btn-sm" onClick={() => ouvrir(l.porteur_id)}>Voyageur</button>
        </div>
      ),
    },
    ...(peutVoirRevenus(roles) ? [{
      key: 'resoudre', label: '', render: (l: Litige) => (
        <button className="btn btn-soft btn-sm" onClick={() => setATrancher(l)}>Trancher</button>
      ), width: 130,
    }] : []),
  ];

  if (error) return <p className="page-error">{error}</p>;
  if (!items) return <p className="loading-state">Chargement…</p>;
  return (
    <>
      <p className="hint">Arbitrages demandés en premier : réponse promise sous 5 jours ouvrés.</p>
      <DataTable rows={items} columns={columns} rowKey={(l) => l.id} initialSort={{ key: 'arbitrage', dir: 'desc' }} emptyText="Aucun litige en cours." />
      <DossiersBloques onChange={charger} />
      {modal}
      {aTrancher && (
        <LitigeResolutionModal
          litige={aTrancher}
          onClose={() => setATrancher(null)}
          onDone={() => { setATrancher(null); charger(); }}
        />
      )}
    </>
  );
}

// [335] Transactions que les parties ne peuvent pas debloquer seules : une
// restitution qui n'aboutit pas, un depart ou une arrivee jamais declares.
// Les conditions sont reverifiees par la base ; ici elles servent a expliquer.
const LABELS_MOTIF_BLOQUE: Record<TransactionBloquee['motif'], string> = {
  restitution: 'Restitution en cours',
  depart_non_declare: 'Départ non déclaré',
  arrivee_non_declaree: 'Arrivée non déclarée',
};

function joursDepuis(iso: string | null): number {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 0;
}

type ActionBloque = { dossier: TransactionBloquee; type: 'clore' | 'litige' };

function DossierBloqueModal({ action, onClose, onDone }: { action: ActionBloque; onClose: () => void; onDone: () => void }) {
  const { dossier, type } = action;
  const [issue, setIssue] = useState<'colis_rendu' | 'colis_non_rendu' | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montant = `${decimales(Number(dossier.montant_total), 2)} €`;

  async function confirmer() {
    const m = motif.trim();
    if (type === 'clore' && !issue) { setError('Indiquez si le colis a été rendu.'); return; }
    if (!m) { setError('Le motif est obligatoire.'); return; }
    setBusy(true);
    setError(null);
    const { error: rpcError } = type === 'clore'
      ? await supabase.rpc('admin_clore_restitution', { p_demande_id: dossier.id, p_issue: issue, p_motif: m })
      : await supabase.rpc('admin_ouvrir_litige', { p_demande_id: dossier.id, p_motif: m });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    onDone();
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">{type === 'clore' ? 'Clore la restitution' : 'Ouvrir un litige'}</h2>
      <div className="modal-body">
        <p className="hint">Colis : {dossier.description_colis} · {montant} · {LABELS_MOTIF_BLOQUE[dossier.motif]} {dossier.depuis ? `depuis le ${dateSeule(dossier.depuis)}` : ''}</p>
        {type === 'clore' ? (
          <>
            <p className="hint">Photo du voyageur : {dossier.photo_voyageur ? 'oui' : 'non'} · confirmation de l'expéditeur : {dossier.photo_expediteur ? 'oui' : 'non'}.</p>
            <div className="signalement-resume">
              <b>Dans les deux cas, voici ce qui se passe</b>
              <span>La transaction est annulée et l'expéditeur est remboursé de {montant} : Wonjo demande le remboursement à Stripe aussitôt (un contrôle automatique le refait chaque heure si besoin). Le délai bancaire de quelques jours est celui de Stripe.</span>
              <span>Le voyageur n'est pas payé. Les deux parties reçoivent votre motif dans leur conversation.</span>
              <span>Wonjo ne récupère pas le colis : s'il n'est pas revenu, c'est aux parties de le régler entre elles, hors plateforme.</span>
              <span>Le choix ci-dessous ne change donc pas l'argent : il sert à la trace et au message envoyé aux parties.</span>
            </div>
            <div className="segmented" role="radiogroup" aria-label="Issue">
              <button role="radio" aria-checked={issue === 'colis_rendu'} className={issue === 'colis_rendu' ? 'on' : ''} onClick={() => setIssue('colis_rendu')}>
                <b>Colis rendu</b>
                <span>Le colis est bien revenu à l'expéditeur, mais la restitution n'a pas été confirmée dans l'app. Le message dit que la restitution est close.</span>
              </button>
              <button role="radio" aria-checked={issue === 'colis_non_rendu'} className={issue === 'colis_non_rendu' ? 'on' : ''} onClick={() => setIssue('colis_non_rendu')}>
                <b>Restitution impossible</b>
                <span>Voyageur ou expéditeur injoignable, rendez-vous jamais tenu : le colis n'est pas revenu. Le message dit que la restitution n'a pas pu aboutir.</span>
              </button>
            </div>
          </>
        ) : (
          <p className="hint">La transaction passe en litige, fonds bloqués. Les deux parties sont prévenues et peuvent proposer une solution ; sans accord, tranchez ensuite depuis la liste des litiges (le colis étant chez le voyageur, un remboursement passera par une restitution).</p>
        )}
        <div className="action-group motif-form">
          <label htmlFor="motif-bloque">Motif : il sera envoyé aux deux parties dans leur conversation</label>
          <textarea id="motif-bloque" value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={type === 'clore'
            ? 'Ex. le voyageur ne répond plus depuis 3 semaines malgré nos relances.'
            : 'Ex. arrivée prévue le 2 octobre, toujours pas déclarée, le voyageur ne répond pas à l\'expéditeur.'} />
        </div>
        {error && <p className="page-error">{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" disabled={busy} onClick={onClose}>Annuler</button>
          <button className="btn btn-danger" disabled={busy || (type === 'clore' && !issue)} onClick={confirmer}>
            {busy ? '…' : type === 'clore' ? 'Clore et rembourser l\'expéditeur' : 'Ouvrir le litige'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function DossiersBloques({ onChange }: { onChange: () => void }) {
  const { roles } = useAuth();
  const [items, setItems] = useState<TransactionBloquee[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionBloque | null>(null);
  const { ouvrir, modal } = useFicheCompte();

  function charger() {
    supabase.rpc('admin_lister_transactions_bloquees').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as TransactionBloquee[]);
    });
  }
  useEffect(charger, []);

  const columns: Column<TransactionBloquee>[] = [
    { key: 'motif', filter: 'options', label: 'Situation', value: (d) => LABELS_MOTIF_BLOQUE[d.motif] },
    {
      key: 'depuis', label: 'Depuis', value: (d) => d.depuis ?? '', render: (d) => {
        const j = joursDepuis(d.depuis);
        const urgent = d.motif === 'restitution' ? j > 14 : true;
        return <Badge tone={urgent ? 'danger' : 'amber'}>{d.depuis ? `${j} j` : '-'}</Badge>;
      },
    },
    {
      key: 'signale', label: 'Signalement', value: (d) => d.signale_at ?? '', render: (d) => d.signale_at
        ? <Badge tone="danger">Signalé par {d.signale_role === 'expediteur' ? 'l\'expéditeur' : 'le voyageur'}, {depuis(d.signale_at)}</Badge>
        : <span className="hint">-</span>,
    },
    { key: 'colis', label: 'Colis', value: (d) => d.description_colis },
    { key: 'montant', label: 'Montant', value: (d) => Number(d.montant_total), render: (d) => `${decimales(Number(d.montant_total), 2)} €` },
    {
      key: 'photos', label: 'Photos de restitution', value: (d) => Number(d.photo_voyageur) + Number(d.photo_expediteur),
      render: (d) => d.motif !== 'restitution' ? <span className="hint">-</span>
        : `${d.photo_voyageur ? 'voyageur ✓' : 'voyageur ✗'} · ${d.photo_expediteur ? 'expéditeur ✓' : 'expéditeur ✗'}`,
    },
    {
      key: 'parties', label: 'Parties', render: (d) => !peutModerer(roles) ? <span className="hint">-</span> : (
        <div className="action-row">
          <button className="btn btn-soft btn-sm" onClick={() => ouvrir(d.expediteur_id)}>Expéditeur</button>
          <button className="btn btn-soft btn-sm" onClick={() => ouvrir(d.porteur_id)}>Voyageur</button>
        </div>
      ),
    },
    ...(peutVoirRevenus(roles) ? [{
      key: 'agir', label: '', width: 170, render: (d: TransactionBloquee) => (
        <button className="btn btn-soft btn-sm" onClick={() => setAction({ dossier: d, type: d.motif === 'restitution' ? 'clore' : 'litige' })}>
          {d.motif === 'restitution' ? 'Clore la restitution' : 'Ouvrir un litige'}
        </button>
      ),
    }] : []),
  ];

  if (error) return <p className="page-error">{error}</p>;
  if (!items) return <p className="loading-state">Chargement…</p>;
  return (
    <>
      <p className="section-title" style={{ marginTop: 28 }}>Dossiers bloqués hors litige</p>
      <p className="hint">Restitutions en cours et transports en retard, ou signalés par un membre.</p>
      <DataTable rows={items} columns={columns} rowKey={(d) => d.id} initialSort={{ key: 'signale', dir: 'desc' }} emptyText="Aucun dossier bloqué." />
      {modal}
      {action && (
        <DossierBloqueModal
          action={action}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); charger(); onChange(); }}
        />
      )}
    </>
  );
}
