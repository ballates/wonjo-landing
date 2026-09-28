import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ServerTable, type ServerColumn } from '../components/ServerTable';
import { StatutBadge } from '../components/Badge';
import { TransactionModal } from '../components/TransactionModal';
import { LABELS_CATEGORIE_AVIS, casserPrenom, categorieAvis, dateHeure, premierMot } from '../lib/labels';
import { useDebounce } from '../lib/useDebounce';
import type { AvisListe } from '../lib/types';

const PAGE_SIZE = 10;

export function AvisPage() {
  const location = useLocation();
  const etat = location.state as { demandeId?: string; categorie?: string } | null;
  const demandeVoulue = etat?.demandeId ?? null;
  const [filtreCategorie, setFiltreCategorie] = useState<string[]>(etat?.categorie ? [etat.categorie] : []);
  useEffect(() => { setFiltreCategorie(etat?.categorie ? [etat.categorie] : []); }, [etat?.categorie, location.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const [recherche, setRecherche] = useState('');
  const rechercheDebattue = useDebounce(recherche);
  const [tri, setTri] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(0);

  const [items, setItems] = useState<AvisListe[] | null>(null);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);

  function load() {
    setChargement(true);
    supabase.rpc('admin_lister_avis', {
      p_demande_id: demandeVoulue,
      p_recherche: rechercheDebattue,
      p_categorie: filtreCategorie.length ? filtreCategorie : null,
      p_tri: tri?.key ?? 'created_at',
      p_ordre: tri?.dir ?? 'desc',
      p_limite: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    }).then(({ data, error: rpcError }) => {
      setChargement(false);
      if (rpcError) { setError(rpcError.message); return; }
      const lignes = (data ?? []) as (AvisListe & { total_count?: number })[];
      setItems(lignes);
      setTotal(lignes[0]?.total_count ?? 0);
    });
  }
  useEffect(load, [demandeVoulue, rechercheDebattue, filtreCategorie, tri, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0); }, [demandeVoulue, rechercheDebattue, filtreCategorie]);

  const columns: ServerColumn<AvisListe>[] = [
    { key: 'date', label: 'Date', sortKey: 'created_at', width: 150, render: (a) => dateHeure(a.created_at) },
    { key: 'note', label: 'Note', sortKey: 'note', width: 80, render: (a) => `⭐ ${a.note}/5` },
    {
      key: 'categorie', label: 'Catégorie', filterKey: 'categorie',
      filterOptions: Object.entries(LABELS_CATEGORIE_AVIS).map(([value, label]) => ({ value, label })),
      render: (a) => { const c = categorieAvis(a.note); return <StatutBadge statut={c} label={LABELS_CATEGORIE_AVIS[c]} />; },
    },
    { key: 'auteur', label: 'Auteur', sortKey: 'auteur_nom', render: (a) => casserPrenom(premierMot(a.auteur_prenom)) },
    { key: 'destinataire', label: 'Destinataire', render: (a) => casserPrenom(premierMot(a.destinataire_prenom)) },
    { key: 'commentaire', label: 'Commentaire', render: (a) => a.commentaire ?? <span className="hint">Sans commentaire</span> },
    { key: 'actions', label: '', width: 100, render: (a) => <button className="btn btn-soft btn-sm" onClick={() => setOuverte(a.demande_id)}>Fiche</button> },
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
      <ServerTable
        rows={items ?? []}
        columns={columns}
        rowKey={(a) => a.id}
        loading={chargement}
        search={recherche}
        onSearchChange={setRecherche}
        searchPlaceholder="Rechercher un auteur, un destinataire…"
        emptyText={demandeVoulue ? 'Aucun avis pour cette transaction.' : 'Aucun avis pour le moment.'}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        sort={tri}
        onSortChange={setTri}
        filtres={{ categorie: filtreCategorie }}
        onFiltreChange={(_cle, valeurs) => setFiltreCategorie(valeurs)}
      />
      {ouverte && <TransactionModal demandeId={ouverte} onClose={() => setOuverte(null)} />}
    </div>
  );
}
