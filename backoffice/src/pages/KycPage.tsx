import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Select } from '../components/Select';
import { supabase } from '../lib/supabase';
import { StatutBadge } from '../components/Badge';
import { Avatar } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import { useFicheCompte, VoirFicheButton } from '../components/FicheCompte';
import { LABELS_STATUT_KYC, casserNom, casserPrenom, nomComplet } from '../lib/labels';
import type { FicheKyc } from '../lib/types';
import { useConfirmation } from '../components/Confirmation';
import { dateHeure } from '../lib/labels';

// [439] Validations manuelles d'identite demandees par un administrateur Securite, a approuver par un AUTRE.
interface ValidationEnAttente { id: string; user_id: string; nom: string | null; motif: string; demande_par_nom: string; created_at: string; a_moi: boolean; autres_approbateurs: number }

function ValidationsAApprouver({ onChange, ouvrir }: { onChange: () => void; ouvrir: (id: string) => void }) {
  const [items, setItems] = useState<ValidationEnAttente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirmer, demanderTexte, fenetre } = useConfirmation();

  function charger() {
    supabase.rpc('admin_kyc_validations_en_attente').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setItems((data ?? []) as ValidationEnAttente[]);
    });
  }
  useEffect(charger, []);

  async function executer(id: string, appel: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(id);
    setError(null);
    const { error: e } = await appel();
    setBusy(null);
    if (e) { setError(e.message); return; }
    charger();
    onChange();
  }
  async function approuver(v: ValidationEnAttente) {
    if (!(await confirmer({ titre: `Valider l'identité de ${v.nom ?? 'ce compte'} ?`, texte: <>Demandé par {v.demande_par_nom}, motif : « {v.motif} ». La vérification de Didit est contournée : le compte devient vérifié.</>, libelleOui: 'Valider l\'identité' }))) return;
    await executer(v.id, () => supabase.rpc('admin_approuver_kyc', { p_id: v.id, p_approuver: true, p_motif: null }));
  }
  async function refuser(v: ValidationEnAttente) {
    const motif = await demanderTexte({ titre: 'Refuser cette validation ?', libelleOui: 'Refuser', danger: true, champ: { libelle: 'Motif du refus', obligatoire: true, min: 4 } });
    if (!motif) return;
    await executer(v.id, () => supabase.rpc('admin_approuver_kyc', { p_id: v.id, p_approuver: false, p_motif: motif }));
  }

  if (items.length === 0 && !error) return null;
  return (
    <div className="chart-card" style={{ marginBottom: 16 }}>
      <div className="chart-head">
        <div className="chart-head-titre">
          <h3>Validations à approuver</h3>
          <span className="badge badge-amber">{items.length}</span>
        </div>
      </div>
      <p className="chart-sub">Valider une identité à la main demande deux administrateurs : celui qui a fait la demande ne peut pas l'approuver lui-même.</p>
      {error && <p className="page-error">{error}</p>}
      {items.map((v) => (
        <div key={v.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <button className="btn btn-soft btn-sm" onClick={() => ouvrir(v.user_id)}>{v.nom ?? 'Compte'}</button>
            <div className="hint">{v.demande_par_nom} · {dateHeure(v.created_at)} · « {v.motif} »</div>
            {v.a_moi && v.autres_approbateurs === 0 && <div className="hint" style={{ color: 'var(--badge-amber-fg)' }}>Aucun autre administrateur Sécurité actif : ajoutez-en un pour approuver.</div>}
          </div>
          <div className="action-row">
            {v.a_moi
              ? <button className="btn btn-sm" disabled={busy === v.id} onClick={() => executer(v.id, () => supabase.rpc('admin_annuler_kyc_validation', { p_id: v.id }))}>Annuler ma demande</button>
              : <>
                  <button className="btn btn-sm" disabled={busy === v.id} onClick={() => refuser(v)}>Refuser</button>
                  <button className="btn btn-primary btn-sm" disabled={busy === v.id} onClick={() => approuver(v)}>Approuver</button>
                </>}
          </div>
        </div>
      ))}
      {fenetre}
    </div>
  );
}

export function KycPage() {
  const location = useLocation();
  const filtreDemande = (location.state as { filtre?: string } | null)?.filtre;
  const [items, setItems] = useState<FicheKyc[] | null>(null);
  const [statut, setStatut] = useState(filtreDemande ?? 'pending');
  const [error, setError] = useState<string | null>(null);

  function load() {
    setError(null);
    supabase.rpc('admin_file_kyc', { p_statut: statut || null }).then(({ data, error: rpcError }) => {
      // En erreur, liste vide plutot que "Chargement…" affiche indefiniment.
      if (rpcError) { setError(rpcError.message); setItems([]); return; }
      setItems((data ?? []) as FicheKyc[]);
    });
  }
  useEffect(load, [statut]); // eslint-disable-line react-hooks/exhaustive-deps
  const { ouvrir, modal } = useFicheCompte(load);

  const columns: Column<FicheKyc>[] = [
    { key: 'avatar', label: 'Avatar', render: (k) => <Avatar src={k.photo_url} nom={nomComplet(k.prenom, k.nom)} size={36} />, width: 70 },
    { key: 'prenom', label: 'Prénom', value: (k) => k.prenom, render: (k) => <strong>{casserPrenom(k.prenom)}</strong> },
    { key: 'nom', label: 'Nom', value: (k) => k.nom, render: (k) => casserNom(k.nom) },
    { key: 'statut', filter: 'options', label: 'Statut', value: (k) => LABELS_STATUT_KYC[k.kyc_status ?? 'none'] ?? k.kyc_status, render: (k) => <StatutBadge statut={k.kyc_status ?? 'none'} label={LABELS_STATUT_KYC[k.kyc_status ?? 'none'] ?? String(k.kyc_status)} /> },
    { key: 'motif', filter: 'options', label: 'Motif du rejet', value: (k) => k.kyc_reject_reason, render: (k) => k.kyc_reject_reason ?? '-' },
    { key: 'tentatives', label: 'Tentatives', value: (k) => k.kyc_attempts ?? 0 },
    { key: 'expiration', label: 'Pièce expire le', value: (k) => k.kyc_doc_expiration_date, filter: 'date', render: (k) => k.kyc_doc_expiration_date ? new Date(k.kyc_doc_expiration_date).toLocaleDateString('fr-FR') : '-' },
    { key: 'inscrit', label: 'Inscrit le', value: (k) => k.created_at, filter: 'date', render: (k) => new Date(k.created_at).toLocaleDateString('fr-FR') },
    { key: 'actions', label: '', render: (k) => <VoirFicheButton onClick={() => ouvrir(k.id)} />, width: 100 },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Vérifications d'identité (KYC)</h1>
          <p className="page-sub">Ouvrez la fiche d'un compte pour approuver ou rejeter sa vérification.</p>
        </div>
      </div>
      <ValidationsAApprouver onChange={load} ouvrir={ouvrir} />
      {error && <p className="page-error">{error}</p>}
      {!items ? <p className="loading-state">Chargement…</p> : (
        <DataTable
          rows={items}
          columns={columns}
          rowKey={(k) => k.id}
          initialSort={{ key: 'inscrit', dir: 'desc' }}
          emptyText="Aucun dossier dans cette file."
          toolbar={(
            <Select
              ariaLabel="Statut KYC"
              value={statut}
              onChange={(v) => { setItems(null); setStatut(v); }}
              minWidth={180}
              options={[
                { value: 'pending', label: 'En attente' },
                { value: 'rejected', label: 'Rejetés' },
                { value: 'approved', label: 'Approuvés' },
                { value: 'expire_bientot', label: 'Pièce expire sous 14 jours' },
                { value: '', label: 'Tous les dossiers' },
              ]}
            />
          )}
        />
      )}
      {modal}
    </div>
  );
}
