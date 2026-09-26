import { useEffect, useState } from 'react';
import { Select } from '../components/Select';
import { supabase } from '../lib/supabase';
import { StatutBadge } from '../components/Badge';
import { Avatar } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import { useFicheCompte, VoirFicheButton } from '../components/FicheCompte';
import { LABELS_STATUT_KYC, nomComplet } from '../lib/labels';
import type { FicheKyc } from '../lib/types';

export function KycPage() {
  const [items, setItems] = useState<FicheKyc[] | null>(null);
  const [statut, setStatut] = useState('pending');
  const [error, setError] = useState<string | null>(null);

  function load() {
    supabase.rpc('admin_file_kyc', { p_statut: statut || null }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as FicheKyc[]);
    });
  }
  useEffect(load, [statut]); // eslint-disable-line react-hooks/exhaustive-deps
  const { ouvrir, modal } = useFicheCompte(load);

  const columns: Column<FicheKyc>[] = [
    { key: 'avatar', label: 'Avatar', render: (k) => <Avatar src={k.photo_url} nom={nomComplet(k.prenom, k.nom)} size={36} />, width: 70 },
    { key: 'prenom', label: 'Prénom', value: (k) => k.prenom, render: (k) => <strong>{k.prenom || '-'}</strong> },
    { key: 'nom', label: 'Nom', value: (k) => k.nom },
    { key: 'statut', filter: 'options', label: 'Statut', value: (k) => LABELS_STATUT_KYC[k.kyc_status ?? 'none'] ?? k.kyc_status, render: (k) => <StatutBadge statut={k.kyc_status ?? 'none'} label={LABELS_STATUT_KYC[k.kyc_status ?? 'none'] ?? String(k.kyc_status)} /> },
    { key: 'motif', filter: 'options', label: 'Motif du rejet', value: (k) => k.kyc_reject_reason, render: (k) => k.kyc_reject_reason ?? '-' },
    { key: 'tentatives', label: 'Tentatives', value: (k) => k.kyc_attempts ?? 0 },
    { key: 'inscrit', label: 'Inscrit le', value: (k) => k.created_at, render: (k) => new Date(k.created_at).toLocaleDateString('fr-FR') },
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
