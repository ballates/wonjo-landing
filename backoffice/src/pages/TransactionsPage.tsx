import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { StatutBadge } from '../components/Badge';
import { Avatar } from '../components/Avatar';
import { ServerTable, type ServerColumn } from '../components/ServerTable';
import { TransactionModal } from '../components/TransactionModal';
import { prechargementFiche } from '../lib/ficheTransaction';
import { LABELS_PAIEMENT, LABELS_STATUT_COLIS, LABELS_TYPE_ENVOI, casserPrenom, clePaiementAffichee, dateHeure, premierMot } from '../lib/labels';
import { useDebounce } from '../lib/useDebounce';
import type { TransactionListe } from '../lib/types';

const PAGE_SIZE = 10;

type FiltreRapide = 'tout' | 'livre' | 'en_cours' | 'en_attente' | 'annule';

// Raccourcis de la barre d'outils : n'affectent que le meme filtre "statutColis"
// que celui du menu de la colonne Statut (choix multiple) - cliquer un raccourci
// remplace juste la selection par le groupe de statuts correspondant.
const FILTRES: { cle: FiltreRapide; label: string; statuts: string[] }[] = [
  { cle: 'tout', label: 'Tout', statuts: [] },
  { cle: 'livre', label: 'Livré', statuts: ['livre'] },
  { cle: 'en_cours', label: 'En cours', statuts: ['accepte', 'en_transit', 'arrive', 'remis_porteur', 'restitution_en_cours', 'litige'] },
  { cle: 'en_attente', label: 'En attente', statuts: ['en_attente'] },
  { cle: 'annule', label: 'Annulé', statuts: ['annule'] },
];

const OPTIONS_CODE_GENERE = [{ value: 'oui', label: 'Généré' }, { value: 'non', label: 'Non généré' }];

export function TransactionsPage() {
  const [recherche, setRecherche] = useState('');
  const rechercheDebattue = useDebounce(recherche);
  const [statutColis, setStatutColis] = useState<string[]>([]);
  const [statutPaiement, setStatutPaiement] = useState<string[]>([]);
  const [typeEnvoi, setTypeEnvoi] = useState<string[]>([]);
  const [codeGenere, setCodeGenere] = useState<string[]>([]);
  const [montant, setMontant] = useState<string[]>([]);
  const [tri, setTri] = useState<{ key: string; dir: 'asc' | 'desc' } | null>({ key: 'created_at', dir: 'desc' });
  const [page, setPage] = useState(0);

  const [items, setItems] = useState<TransactionListe[] | null>(null);
  const [total, setTotal] = useState(0);
  const [chargement, setChargement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);

  function load() {
    setChargement(true);
    supabase.rpc('admin_lister_transactions', {
      p_recherche: rechercheDebattue,
      p_statuts: statutColis.length ? statutColis : null,
      p_statut_paiement: statutPaiement.length ? statutPaiement : null,
      p_type_envoi: typeEnvoi.length ? typeEnvoi : null,
      p_code_genere: codeGenere.length ? codeGenere : null,
      p_montant_min: montant[0] ? Number(montant[0]) : null,
      p_montant_max: montant[1] ? Number(montant[1]) : null,
      p_tri: tri?.key ?? 'created_at',
      p_ordre: tri?.dir ?? 'desc',
      p_limite: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    }).then(({ data, error: rpcError }) => {
      setChargement(false);
      if (rpcError) { setError(rpcError.message); return; }
      const lignes = (data ?? []) as (TransactionListe & { total_count?: number })[];
      setItems(lignes);
      setTotal(lignes[0]?.total_count ?? 0);
    });
  }
  useEffect(load, [rechercheDebattue, statutColis, statutPaiement, typeEnvoi, codeGenere, montant, tri, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPage(0); }, [rechercheDebattue, statutColis, statutPaiement, typeEnvoi, codeGenere, montant]);

  const columns: ServerColumn<TransactionListe>[] = [
    {
      key: 'type', label: 'Type', filterKey: 'typeEnvoi',
      filterOptions: Object.entries(LABELS_TYPE_ENVOI).filter(([v]) => v !== 'inconnu').map(([value, label]) => ({ value, label })),
      render: (t) => {
        if (t.type_envoi === 'document') {
          const n = t.nb_enveloppes ?? 0;
          return `${n} enveloppe${n > 1 ? 's' : ''}`;
        }
        return t.annonce_accepte_documents ? 'Colis + enveloppes' : 'Colis';
      },
    },
    {
      key: 'montant', label: 'Montant', sortKey: 'montant_total', filterKey: 'montant', filterRange: true,
      render: (t) => `${Number(t.montant_total).toFixed(2)} €`,
    },
    {
      key: 'statut_colis', label: 'Statut', sortKey: 'statut_colis', filterKey: 'statutColis',
      filterOptions: Object.entries(LABELS_STATUT_COLIS).map(([value, label]) => ({ value, label })),
      render: (t) => <StatutBadge statut={t.statut_colis} label={LABELS_STATUT_COLIS[t.statut_colis] ?? t.statut_colis} />,
    },
    {
      key: 'statut_paiement', label: 'Paiement', filterKey: 'statutPaiement',
      filterOptions: Object.entries(LABELS_PAIEMENT).map(([value, label]) => ({ value, label })),
      render: (t) => {
        const cle = clePaiementAffichee(t.statut_paiement, t.statut_colis);
        return <StatutBadge statut={cle} label={LABELS_PAIEMENT[cle] ?? t.statut_paiement} />;
      },
    },
    {
      key: 'expediteur', label: 'Expéditeur', render: (t) => (
        <span className="chip"><Avatar src={t.expediteur_photo} nom={t.expediteur_nom ?? ''} size={22} /> {casserPrenom(premierMot(t.expediteur_prenom))}</span>
      ),
    },
    {
      key: 'porteur', label: 'Voyageur', render: (t) => (
        <span className="chip"><Avatar src={t.porteur_photo} nom={t.porteur_nom ?? ''} size={22} /> {casserPrenom(premierMot(t.porteur_prenom))}</span>
      ),
    },
    {
      key: 'code', label: 'Code', filterKey: 'codeGenere', filterOptions: OPTIONS_CODE_GENERE,
      render: (t) => (t.code_genere ? 'Généré' : 'Non généré'),
    },
    { key: 'creee', label: 'Créée le', sortKey: 'created_at', render: (t) => dateHeure(t.created_at) },
    { key: 'actions', label: '', render: (t) => <button className="btn btn-soft btn-sm" onClick={() => setOuverte(t.id)} {...prechargementFiche(t.id)}>Fiche</button>, width: 100 },
  ];

  if (error) return <p className="page-error">{error}</p>;
  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p className="page-sub">Suivi individuel : qui doit rencontrer qui, où en est la remise, le code de livraison.</p>
        </div>
      </div>
      <ServerTable
        rows={items ?? []}
        columns={columns}
        rowKey={(t) => t.id}
        loading={chargement}
        search={recherche}
        onSearchChange={setRecherche}
        searchPlaceholder="Rechercher un expéditeur, un voyageur…"
        emptyText="Aucune transaction pour ce filtre."
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        sort={tri}
        onSortChange={setTri}
        filtres={{ statutColis, statutPaiement, typeEnvoi, codeGenere, montant }}
        onFiltreChange={(cle, valeurs) => {
          if (cle === 'statutColis') setStatutColis(valeurs);
          else if (cle === 'statutPaiement') setStatutPaiement(valeurs);
          else if (cle === 'typeEnvoi') setTypeEnvoi(valeurs);
          else if (cle === 'codeGenere') setCodeGenere(valeurs);
          else if (cle === 'montant') setMontant(valeurs);
        }}
        toolbar={(
          <div className="action-row" style={{ flexWrap: 'wrap' }}>
            {FILTRES.map((f) => (
              <button
                key={f.cle}
                type="button"
                className={`chip-filter ${JSON.stringify([...statutColis].sort()) === JSON.stringify([...f.statuts].sort()) ? 'on' : ''}`}
                onClick={() => setStatutColis(f.statuts)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      />
      {ouverte && <TransactionModal demandeId={ouverte} onClose={() => setOuverte(null)} />}
    </div>
  );
}
