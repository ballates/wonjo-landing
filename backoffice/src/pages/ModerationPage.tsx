import { useEffect, useState } from 'react';
import { Select } from '../components/Select';
import { supabase } from '../lib/supabase';
import { StatutBadge } from '../components/Badge';
import { Avatar } from '../components/Avatar';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins, peutVoirRevenus } from '../lib/permissions';
import { DataTable, type Column } from '../components/DataTable';
import { ServerTable, type ServerColumn } from '../components/ServerTable';
import { Modal } from '../components/Modal';
import { useFicheCompte, VoirFicheButton } from '../components/FicheCompte';
import { LABELS_NIVEAU, LABELS_PAIEMENT, LABELS_STATUT_KYC, LABELS_STATUT_SIGNALEMENT, casserNom, casserPrenom, dateHeure, depuis, nomComplet } from '../lib/labels';
import { useDebounce } from '../lib/useDebounce';
import type { CompteRecherche, Litige, Signalement } from '../lib/types';

const PAGE_SIZE_COMPTES = 10;

type Tab = 'comptes' | 'signalements' | 'litiges';

export function ModerationPage() {
  const location = useLocation();
  const ongletDemande = (location.state as { tab?: Tab } | null)?.tab;
  const [tab, setTab] = useState<Tab>(ongletDemande ?? 'comptes');
  useEffect(() => { if (ongletDemande) setTab(ongletDemande); }, [ongletDemande, location.key]);
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Signalements & litiges</h1>
          <p className="page-sub">Consulter un compte, le bloquer ou le débloquer, traiter les signalements et les litiges.</p>
        </div>
      </div>
      <div className="tabs">
        <button className={tab === 'comptes' ? 'active' : ''} onClick={() => setTab('comptes')}>Comptes</button>
        <button className={tab === 'signalements' ? 'active' : ''} onClick={() => setTab('signalements')}>Signalements</button>
        <button className={tab === 'litiges' ? 'active' : ''} onClick={() => setTab('litiges')}>Litiges</button>
      </div>
      {tab === 'comptes' && <ComptesTab />}
      {tab === 'signalements' && <SignalementsTab />}
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

  async function traiter(id: string, nouveauStatut: string) {
    const note = window.prompt('Note (facultative) :');
    if (note === null) return;
    const { error: rpcError } = await supabase.rpc('admin_traiter_signalement', { p_id: id, p_statut: nouveauStatut, p_note: note || null });
    if (rpcError) { alert(rpcError.message); return; }
    load();
  }

  const columns: Column<Signalement>[] = [
    { key: 'raison', filter: 'options', label: 'Raison', value: (s) => s.raison },
    { key: 'details', label: 'Détails', value: (s) => s.details },
    { key: 'date', label: 'Créé le', value: (s) => s.created_at, filter: 'date', render: (s) => dateHeure(s.created_at) },
    { key: 'statut', filter: 'options', label: 'Statut', value: (s) => LABELS_STATUT_SIGNALEMENT[s.statut] ?? s.statut, render: (s) => <StatutBadge statut={s.statut} label={LABELS_STATUT_SIGNALEMENT[s.statut] ?? s.statut} /> },
    {
      key: 'actions', label: 'Actions', render: (s) => (
        <div className="action-row">
          <VoirFicheButton onClick={() => ouvrir(s.cible_id)} />
          {s.statut === 'nouveau' && <button className="btn btn-sm" onClick={() => traiter(s.id, 'en_cours')}>Prendre en charge</button>}
          {s.statut !== 'clos_sans_suite' && s.statut !== 'clos_action_prise' && (
            <>
              <button className="btn btn-sm btn-soft" onClick={() => traiter(s.id, 'clos_sans_suite')}>Clore sans suite</button>
              <button className="btn btn-sm btn-soft-success" onClick={() => traiter(s.id, 'clos_action_prise')}>Clore - action prise</button>
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
    </>
  );
}

function LitigeResolutionModal({ litige, onClose, onDone }: { litige: Litige; onClose: () => void; onDone: () => void }) {
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmer() {
    const m = motif.trim();
    if (!m) { setError('Le motif est obligatoire.'); return; }
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('admin_resoudre_litige_remboursement', { p_demande_id: litige.id, p_motif: m });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    onDone();
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Rembourser l'expéditeur</h2>
      <div className="modal-body">
        <p className="hint">Colis : {litige.description_colis} · {Number(litige.montant_total).toFixed(2)} €</p>
        <p className="hint">Le transport sera annulé et le remboursement Stripe traité automatiquement dans l'heure, via le circuit habituel. À utiliser quand un accord a été trouvé entre les deux parties (ex. via le support) mais que la résolution automatique dans l'app ne s'est pas déclenchée.</p>
        <div className="action-group motif-form">
          <label htmlFor="motif-litige">Motif de la résolution manuelle</label>
          <textarea id="motif-litige" autoFocus value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Ex. accord trouvé entre les deux parties via le support, le 26/09." />
        </div>
        {error && <p className="page-error">{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" disabled={busy} onClick={onClose}>Annuler</button>
          <button className="btn btn-danger" disabled={busy} onClick={confirmer}>Confirmer le remboursement</button>
        </div>
      </div>
    </Modal>
  );
}

function LitigesTab() {
  const { roles } = useAuth();
  const [items, setItems] = useState<Litige[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aRembourser, setARembourser] = useState<Litige | null>(null);

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
    { key: 'montant', label: 'Montant', value: (l) => Number(l.montant_total), render: (l) => `${Number(l.montant_total).toFixed(2)} €` },
    { key: 'paiement', filter: 'options', label: 'Statut paiement', value: (l) => LABELS_PAIEMENT[l.statut_paiement] ?? l.statut_paiement },
    { key: 'conteste', label: 'Contesté le', value: (l) => l.conteste_at, filter: 'date', render: (l) => (l.conteste_at ? dateHeure(l.conteste_at) : '-') },
    { key: 'resolutions', label: 'Résolutions en attente', value: (l) => l.resolutions_en_attente },
    {
      key: 'actions', label: 'Parties', render: (l) => (
        <div className="action-row">
          <button className="btn btn-soft btn-sm" onClick={() => ouvrir(l.expediteur_id)}>Expéditeur</button>
          <button className="btn btn-soft btn-sm" onClick={() => ouvrir(l.porteur_id)}>Voyageur</button>
        </div>
      ),
    },
    ...(peutVoirRevenus(roles) ? [{
      key: 'resoudre', label: '', render: (l: Litige) => (
        <button className="btn btn-danger-outline btn-sm" onClick={() => setARembourser(l)}>Rembourser</button>
      ), width: 130,
    }] : []),
  ];

  if (error) return <p className="page-error">{error}</p>;
  if (!items) return <p className="loading-state">Chargement…</p>;
  return (
    <>
      <DataTable rows={items} columns={columns} rowKey={(l) => l.id} initialSort={{ key: 'conteste', dir: 'desc' }} emptyText="Aucun litige en cours." />
      {modal}
      {aRembourser && (
        <LitigeResolutionModal
          litige={aRembourser}
          onClose={() => setARembourser(null)}
          onDone={() => { setARembourser(null); charger(); }}
        />
      )}
    </>
  );
}
