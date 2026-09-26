import { useEffect, useState } from 'react';
import { Select } from '../components/Select';
import { supabase } from '../lib/supabase';
import { StatutBadge } from '../components/Badge';
import { Avatar } from '../components/Avatar';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins, peutVoirRevenus } from '../lib/permissions';
import { DataTable, type Column } from '../components/DataTable';
import { Modal } from '../components/Modal';
import { useFicheCompte, VoirFicheButton } from '../components/FicheCompte';
import { LABELS_NIVEAU, LABELS_PAIEMENT, LABELS_STATUT_KYC, LABELS_STATUT_SIGNALEMENT, dateHeure, depuis, nomComplet } from '../lib/labels';
import type { CompteRecherche, Litige, Signalement } from '../lib/types';

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
  const [items, setItems] = useState<CompteRecherche[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const { role } = useAuth();
  const peutEnvoyer = peutGererAdmins(role);
  const navigate = useNavigate();

  function load() {
    supabase.rpc('admin_rechercher_comptes', { p_recherche: '', p_limite: 2000 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as CompteRecherche[]);
    });
  }
  useEffect(load, []);
  const { ouvrir, modal } = useFicheCompte(load);

  const columns: Column<CompteRecherche>[] = [
    { key: 'avatar', label: 'Avatar', render: (c) => <Avatar src={c.photo_url} nom={nomComplet(c.prenom, c.nom)} size={36} />, width: 70 },
    { key: 'prenom', label: 'Prénom', value: (c) => c.prenom, render: (c) => <strong>{c.prenom || '-'}</strong> },
    { key: 'nom', label: 'Nom', value: (c) => c.nom },
    { key: 'email', label: 'Email', value: (c) => c.email },
    { key: 'statut', filter: 'options', label: 'Statut', value: (c) => (c.bloque ? 'Bloqué' : 'Actif'), render: (c) => (c.bloque ? <span className="badge badge-danger">Bloqué</span> : <span className="badge badge-green">Actif</span>) },
    {
      key: 'verif', filter: 'options', label: 'Vérifié', value: (c) => (c.id_verifie ? 'Identité' : c.telephone_verifie ? 'Téléphone' : 'Non vérifié'),
      render: (c) => (c.id_verifie ? <span className="badge badge-green">Identité</span> : c.telephone_verifie ? <span className="badge badge-teal">Téléphone</span> : <span className="badge badge-muted">Non vérifié</span>),
    },
    { key: 'niveau', filter: 'options', label: 'Niveau', value: (c) => LABELS_NIVEAU[c.niveau], render: (c) => <span className={`badge ${c.niveau === 'debutant' ? 'badge-muted' : `badge-niveau-${c.niveau}`}`}>{LABELS_NIVEAU[c.niveau]}</span> },
    { key: 'kyc', filter: 'options', label: 'KYC', value: (c) => LABELS_STATUT_KYC[c.kyc_status ?? 'none'] ?? c.kyc_status, render: (c) => <StatutBadge statut={c.kyc_status ?? 'none'} label={LABELS_STATUT_KYC[c.kyc_status ?? 'none'] ?? String(c.kyc_status)} /> },
    { key: 'connexion', label: 'Dernière connexion', value: (c) => c.derniere_connexion ?? '', render: (c) => depuis(c.derniere_connexion) },
    { key: 'actions', label: '', render: (c) => <VoirFicheButton onClick={() => ouvrir(c.id)} />, width: 100 },
  ];

  if (error) return <p className="page-error">{error}</p>;
  if (!items) return <p className="loading-state">Chargement…</p>;
  const choisis = items.filter((c) => selection.has(c.id));
  return (
    <>
      <DataTable
        rows={items}
        columns={columns}
        rowKey={(c) => c.id}
        searchPlaceholder="Rechercher un nom, un email…"
        emptyText="Aucun compte ne correspond."
        {...(peutEnvoyer ? { selected: selection, onSelectedChange: setSelection } : {})}
      />
      {peutEnvoyer && selection.size > 0 && (
        <div className="selection-bar">
          <span>{selection.size} compte(s) sélectionné(s)</span>
          <div className="action-row">
            <button className="btn btn-sm" onClick={() => setSelection(new Set())}>Tout désélectionner</button>
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
  const [items, setItems] = useState<Signalement[] | null>(null);
  const [statut, setStatut] = useState<string>('nouveau');
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
    { key: 'date', label: 'Créé le', value: (s) => s.created_at, render: (s) => dateHeure(s.created_at) },
    { key: 'statut', filter: 'options', label: 'Statut', value: (s) => LABELS_STATUT_SIGNALEMENT[s.statut] ?? s.statut, render: (s) => <StatutBadge statut={s.statut} label={LABELS_STATUT_SIGNALEMENT[s.statut] ?? s.statut} /> },
    {
      key: 'actions', label: 'Actions', render: (s) => (
        <div className="action-row">
          <VoirFicheButton onClick={() => ouvrir(s.cible_id)} />
          {s.statut === 'nouveau' && <button className="btn btn-sm" onClick={() => traiter(s.id, 'en_cours')}>Prendre en charge</button>}
          {s.statut !== 'clos_sans_suite' && s.statut !== 'clos_action_prise' && (
            <>
              <button className="btn btn-sm" onClick={() => traiter(s.id, 'clos_sans_suite')}>Clore sans suite</button>
              <button className="btn btn-sm" onClick={() => traiter(s.id, 'clos_action_prise')}>Clore - action prise</button>
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
  const { role } = useAuth();
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
    { key: 'conteste', label: 'Contesté le', value: (l) => l.conteste_at, render: (l) => (l.conteste_at ? dateHeure(l.conteste_at) : '-') },
    { key: 'resolutions', label: 'Résolutions en attente', value: (l) => l.resolutions_en_attente },
    {
      key: 'actions', label: 'Parties', render: (l) => (
        <div className="action-row">
          <button className="btn btn-soft btn-sm" onClick={() => ouvrir(l.expediteur_id)}>Expéditeur</button>
          <button className="btn btn-soft btn-sm" onClick={() => ouvrir(l.porteur_id)}>Porteur</button>
        </div>
      ),
    },
    ...(peutVoirRevenus(role) ? [{
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
