import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { FicheKyc } from '../lib/types';

export function KycPage() {
  const [items, setItems] = useState<FicheKyc[]>([]);
  const [statut, setStatut] = useState('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_file_kyc', { p_statut: statut || null }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as FicheKyc[]);
    });
  }, [statut]);

  return (
    <div>
      <h1>File KYC</h1>
      <select value={statut} onChange={(e) => setStatut(e.target.value)}>
        <option value="pending">En attente</option>
        <option value="rejected">Rejetés</option>
        <option value="approved">Approuvés</option>
        <option value="">Tous</option>
      </select>
      {error && <p className="page-error">{error}</p>}
      <table>
        <thead><tr><th>Nom</th><th>Statut</th><th>Motif rejet</th><th>Tentatives</th><th>Inscrit le</th></tr></thead>
        <tbody>
          {items.map((k) => (
            <tr key={k.id}>
              <td>{k.prenom} {k.nom}</td>
              <td>{k.kyc_status ?? '—'}</td>
              <td>{k.kyc_reject_reason ?? '—'}</td>
              <td>{k.kyc_attempts ?? 0}</td>
              <td>{new Date(k.created_at).toLocaleDateString('fr-FR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
