import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DataTable, type Column } from '../components/DataTable';
import { TransactionModal } from '../components/TransactionModal';
import { LABELS_ROLE_AVIS, dateHeure } from '../lib/labels';
import type { AvisListe } from '../lib/types';

export function AvisPage() {
  const location = useLocation();
  const demandeVoulue = (location.state as { demandeId?: string } | null)?.demandeId ?? null;
  const [items, setItems] = useState<AvisListe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_lister_avis', { p_demande_id: demandeVoulue, p_limite: 500 }).then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setItems((data ?? []) as AvisListe[]);
    });
  }, [demandeVoulue, location.key]);

  const columns: Column<AvisListe>[] = [
    { key: 'date', label: 'Date', value: (a) => a.created_at, render: (a) => dateHeure(a.created_at), width: 150 },
    { key: 'note', label: 'Note', value: (a) => a.note, render: (a) => `⭐ ${a.note}/5` },
    { key: 'auteur', filter: 'options', label: 'Auteur', value: (a) => a.auteur_nom, render: (a) => `${a.auteur_prenom ?? '-'} (${LABELS_ROLE_AVIS[a.role_auteur]})` },
    { key: 'destinataire', filter: 'options', label: 'Destinataire', value: (a) => a.destinataire_nom, render: (a) => `${a.destinataire_prenom ?? '-'} (${LABELS_ROLE_AVIS[a.role_destinataire]})` },
    { key: 'commentaire', label: 'Commentaire', value: (a) => a.commentaire ?? '', render: (a) => a.commentaire ?? <span className="hint">Sans commentaire</span> },
    { key: 'actions', label: '', render: (a) => <button className="btn btn-soft btn-sm" onClick={() => setOuverte(a.demande_id)}>Voir la transaction</button>, width: 170 },
  ];

  if (error) return <p className="page-error">{error}</p>;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Avis</h1>
          <p className="page-sub">Tous les avis laissés entre expéditeurs et voyageurs, avec accès à la transaction concernée.</p>
        </div>
      </div>
      {!items ? <p className="loading-state">Chargement…</p> : (
        <DataTable
          rows={items}
          columns={columns}
          rowKey={(a) => a.id}
          initialSort={{ key: 'date', dir: 'desc' }}
          emptyText={demandeVoulue ? 'Aucun avis pour cette transaction.' : 'Aucun avis pour le moment.'}
          searchPlaceholder="Rechercher un avis…"
        />
      )}
      {ouverte && <TransactionModal demandeId={ouverte} onClose={() => setOuverte(null)} />}
    </div>
  );
}
