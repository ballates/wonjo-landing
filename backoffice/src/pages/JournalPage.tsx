import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Person } from '../components/Avatar';
import { DataTable, type Column } from '../components/DataTable';
import { useFicheCompte } from '../components/FicheCompte';
import { dateHeure, libelleAction, libelleMotif } from '../lib/labels';
import type { EntreeJournal } from '../lib/types';

const LABELS_CIBLE: Record<string, string> = {
  profile: 'Compte',
  admin_users: 'Administrateur',
  signalement: 'Signalement',
  campagne: 'Campagne email',
  commission: 'Commissions',
};

export function JournalPage() {
  const [items, setItems] = useState<EntreeJournal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { ouvrir, modal } = useFicheCompte();

  useEffect(() => {
    supabase.rpc('admin_journal', { p_limite: 1000, p_offset: 0 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as EntreeJournal[]);
    });
  }, []);

  const columns: Column<EntreeJournal>[] = [
    { key: 'date', label: 'Date', value: (e) => e.created_at, render: (e) => dateHeure(e.created_at), width: 170 },
    { key: 'admin', filter: 'options', label: 'Par', value: (e) => e.admin_nom, render: (e) => <Person src={e.admin_avatar} nom={e.admin_nom ?? 'Admin inconnu'} size={30} /> },
    { key: 'action', filter: 'options', label: 'Action', value: (e) => libelleAction(e.action) },
    {
      key: 'cible', label: 'Cible', value: (e) => `${LABELS_CIBLE[e.cible_type ?? ''] ?? e.cible_type ?? ''} ${e.cible_nom ?? ''}`,
      render: (e) => (
        e.cible_type === 'profile' && e.cible_id
          ? <button className="btn btn-soft btn-sm" onClick={() => ouvrir(e.cible_id!)}>{e.cible_nom ?? 'Compte'}</button>
          : <span>{LABELS_CIBLE[e.cible_type ?? ''] ?? e.cible_type}{e.cible_nom ? ` : ${e.cible_nom}` : ''}</span>
      ),
    },
    { key: 'motif', label: 'Motif / détail', value: (e) => libelleMotif(e.action, e.motif), render: (e) => libelleMotif(e.action, e.motif) ?? '-' },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Journal des actions</h1>
          <p className="page-sub">Toutes les actions d'administration, avec leur auteur. Ce journal ne peut être ni modifié ni effacé.</p>
        </div>
      </div>
      {error && <p className="page-error">{error}</p>}
      {!items ? <p className="loading-state">Chargement…</p> : (
        <DataTable rows={items} columns={columns} rowKey={(e) => e.id} initialSort={{ key: 'date', dir: 'desc' }} emptyText="Aucune action enregistrée." />
      )}
      {modal}
    </div>
  );
}
