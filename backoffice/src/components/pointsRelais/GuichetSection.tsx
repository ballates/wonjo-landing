import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { InfoBulle } from '../InfoBulle';
import { Badge } from '../Badge';
import { Avatar } from '../Avatar';
import { Drapeau } from '../Drapeau';
import { Select } from '../Select';
import { ChampTelephone } from '../ChampTelephone';
import { ValidationModal, type AEncaisser } from './AEncaisserSection';
import { ChatGuichetModal } from './ChatGuichetModal';
import { LienCarteModal, type DossierCarte } from './LienCarteModal';
import { dateCourte, equivalentEuros, equivalentLocal, texteTaux, useTauxEuro, useTauxEuros, fraisProtection, libelleDevise, messageRefusPointRelais, montantEuros, montantLocal, pourcent, type BaremeProtection, type PointRelais } from '../../lib/pointsRelais';
import { Pagination } from '../Pagination';
import { DataTable, type Column } from '../DataTable';
import { ChampMultiChoix } from '../ChampMultiChoix';
import { ChampDescription, compterMots } from '../ChampDescription';
import { BasculeUnite, memoriserUnite, uniteMemorisee, type Unite } from '../BasculeUnite';
import { TrajetDetailModal } from './TrajetDetailModal';
import { Copiable } from './Copiable';
import { ParcoursDossier, type NomIcone } from './EtatsDossier';
import { ChampDate } from '../ChampDate';
import { BandePoints, TOUS_LES_POINTS, type CompteurPoint } from './BandePoints';
import { lireMulti } from '../../lib/useMultiPoints';
import { decomposerNumero, numeroComplet } from '../../lib/telephone';

// Guichet (docs/POINTS_RELAIS.md § 6, migration 400) : un client sans l'app confie un colis au point. L'agent choisit
// un trajet de l'app au depart de son pays, saisit client, destinataire et colis : la demande part AU NOM DU POINT.
// Le montant exact vient du serveur ; ensuite tout passe par les ecrans d'A2 (encaisser, deposer, remettre).
// Carte (404) : un lien Stripe que le client paie depuis son telephone ; jamais en meme temps qu'un autre moyen.

export interface Trajet {
  annonce_id: string;
  porteur_id: string;
  porteur_nom: string | null;
  porteur_photo: string | null;
  porteur_verifie: boolean | null;
  porteur_note: number | null;
  porteur_livraisons: number | null;
  ville_depart: string;
  pays_depart_code: string;
  ville_arrivee: string;
  pays_arrivee_code: string;
  date_depart: string;
  heure_depart: string | null;
  date_arrivee: string | null;
  prix_par_kilo: number;
  kilos_disponibles: number;
  accepte_documents: boolean | null;
  depart: string;
}

interface DossierGuichet {
  demande_id: string;
  reference: string;
  statut_colis: string;
  statut_paiement: string;
  trajet: string | null;
  depart: string | null;
  porteur_nom: string | null;
  client_nom: string;
  client_telephone: string;
  destinataire_nom: string;
  destinataire_telephone: string;
  destinataire_ville: string | null;
  montant_local: number;
  devise: string;
  montant_eur: number;
  moyen_choisi: 'mobile_money' | 'especes' | 'carte';
  echeance_paiement: string;
  carte_lien: string | null;
  carte_lien_expire_at: string | null;
  paiement_valide_at: string | null;
  depot_at: string | null;
  created_at: string;
  porteur_telephone: string | null;
  description: string | null;
  poids_kg: number | null;
  lieu_remise: string | null;
  date_arrivee: string | null;
  heure_arrivee: string | null;
}

// Memes natures que l'app (ContacterScreen), enregistrees en libelles separes par des virgules.
const NATURES: { section: string; items: string[] }[] = [
  { section: 'Vêtements & Textiles', items: ['Vêtements', 'Chaussures', 'Accessoires mode', 'Tissu / Pagne', 'Linge de maison'] },
  { section: 'Alimentation', items: ['Denrées alimentaires', 'Épices', 'Conserves', 'Produits séchés'] },
  { section: 'Électronique', items: ['Téléphone', 'Ordinateur / Tablette', 'Accessoires électroniques', 'Câbles & Chargeurs'] },
  { section: 'Cosmétiques & Beauté', items: ['Crèmes & Lotions', 'Parfums', 'Produits capillaires', 'Maquillage'] },
  { section: 'Médicaments & Santé', items: ['Médicaments', 'Compléments alimentaires', 'Matériel médical'] },
  { section: 'Documents & Livres', items: ['Documents officiels', 'Livres', 'Courrier'] },
  { section: 'Enfants & Jouets', items: ['Jouets', 'Articles bébé'] },
  { section: 'Bijoux & Montres', items: ['Bijoux', 'Montres'] },
  { section: 'Divers', items: ['Cadeaux', 'Articles de sport', 'Matériel scolaire', 'Autre'] },
];
const VALEUR_DECLAREE_MAX = 250;
// Meme minimum que l'app (PublierDemandeScreen) : une description d'au moins 5 mots.
const MOTS_MIN_DESCRIPTION = 5;
// Cartes par page (3 par ligne sur un grand ecran) et dossiers par page.
const TRAJETS_PAR_PAGE = 12;
type Tri = 'depart' | 'prix' | 'kilos' | 'note';
const TRIS: { value: Tri; label: string }[] = [
  { value: 'depart', label: 'Départ le plus proche' },
  { value: 'prix', label: 'Prix au kilo le plus bas' },
  { value: 'kilos', label: 'Le plus de place' },
  { value: 'note', label: 'Les mieux notés' },
];

function statutDossier(d: DossierGuichet): { texte: string; tone: 'amber' | 'teal' | 'green' | 'muted' | 'danger'; icone: NomIcone } {
  if (d.statut_colis === 'annule') return { texte: 'Annulé', tone: 'muted', icone: 'annule' };
  if (!d.paiement_valide_at) {
    if (d.moyen_choisi === 'carte') return { texte: d.carte_lien ? 'Lien carte envoyé' : 'À payer par carte', tone: 'amber', icone: 'carte' };
    return { texte: 'À encaisser', tone: 'amber', icone: 'banknote' };
  }
  if (d.statut_colis === 'en_attente') return { texte: d.statut_paiement === 'autorise' ? 'Carte réservée' : 'Attente voyageur', tone: 'teal', icone: 'attente' };
  if (d.statut_colis === 'accepte') return { texte: d.depot_at ? 'Prêt à remettre' : 'Accepté', tone: 'amber', icone: 'accepte' };
  if (d.statut_colis === 'livre') return { texte: 'Livré', tone: 'green', icone: 'livre' };
  if (d.statut_colis === 'arrive') return { texte: 'Arrivé', tone: 'amber', icone: 'arrive' };
  if (d.statut_colis === 'en_transit') return { texte: 'En route', tone: 'teal', icone: 'route' };
  return { texte: d.statut_colis === 'remis_porteur' ? 'Remis au voyageur' : d.statut_colis, tone: 'teal', icone: 'remis' };
}

type TrajetP = Trajet & { point: PointRelais };
type DossierP = DossierGuichet & { point: PointRelais };
type AEncaisserP = AEncaisser & { point: PointRelais };
type CarteP = DossierCarte & { point: PointRelais };

// Un ou plusieurs points : trajets et dossiers de tous les points accessibles sont fusionnes (colonne « Point », bande de filtre).
// Un trajet est rattache au point de son pays de depart ; la demande part au nom de CE point.
export function GuichetSection({ points, nomsPays }: { points: PointRelais[]; nomsPays: Record<string, string> }) {
  useTauxEuros(points.map((p) => p.devise)); // les cartes affichent l'équivalent dès que le taux du serveur est arrivé
  const plusieurs = points.length > 1;
  const cleePoints = points.map((p) => p.id).join(',');
  const [choixPoint, setChoixPoint] = useState(TOUS_LES_POINTS);
  const [trajets, setTrajets] = useState<TrajetP[] | null>(null);
  const [dossiers, setDossiers] = useState<DossierP[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filtreVille, setFiltreVille] = useState('');
  const [filtrePoids, setFiltrePoids] = useState('');
  const [filtreAvant, setFiltreAvant] = useState('');
  const [aConfier, setAConfier] = useState<TrajetP | null>(null);
  const [detail, setDetail] = useState<TrajetP | null>(null);
  const [tri, setTri] = useState<Tri>('depart');
  const [pageTrajets, setPageTrajets] = useState(0);
  const [aEncaisser, setAEncaisser] = useState<AEncaisserP | null>(null);
  const [chat, setChat] = useState<DossierP | null>(null);
  const [fiche, setFiche] = useState<DossierP | null>(null);
  const [filtreTache, setFiltreTache] = useState<'tous' | 'encaisser' | 'code' | 'messages' | 'livres'>('tous');
  const [code, setCode] = useState<DossierP | null>(null);
  const [carte, setCarte] = useState<CarteP | null>(null);
  const [nonLus, setNonLus] = useState<Record<string, number>>({});

  function charger() {
    lireMulti<Trajet>('trajets', points).then(({ lignes, erreur }) => {
      if (erreur) setError(erreur);
      // Deux points d'un meme pays voient les memes trajets : on garde le premier point rencontre.
      const vus = new Set<string>();
      setTrajets(lignes.filter((t) => (vus.has(t.annonce_id) ? false : (vus.add(t.annonce_id), true))));
    });
    lireMulti<DossierGuichet>('dossiers_guichet', points).then(({ lignes, erreur }) => {
      if (erreur) setError(erreur);
      setDossiers(lignes);
    });
    chargerNonLus();
  }
  function chargerNonLus() {
    lireMulti<{ demande_id: string; non_lus: number }>('chats_non_lus', points).then(({ lignes }) => {
      setNonLus(Object.fromEntries(lignes.map((x) => [x.demande_id, x.non_lus])));
    });
  }
  // Nouveaux messages des voyageurs : badges rafraichis toutes les 20 s.
  useEffect(() => {
    const t = window.setInterval(chargerNonLus, 20_000);
    return () => window.clearInterval(t);
  }, [cleePoints]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTrajets(null); setDossiers(null); charger(); }, [cleePoints]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtre « point » de la bande : trajets et dossiers du point choisi (ou de tous).
  const trajetsDuPoint = useMemo(() => (trajets ?? []).filter((t) => choixPoint === TOUS_LES_POINTS || t.point.id === choixPoint), [trajets, choixPoint]);
  const dossiersDuPoint = useMemo(() => (dossiers ?? []).filter((d) => choixPoint === TOUS_LES_POINTS || d.point.id === choixPoint), [dossiers, choixPoint]);

  const villesArrivee = useMemo(() => [...new Set(trajetsDuPoint.map((t) => t.ville_arrivee))].sort((a, b) => a.localeCompare(b, 'fr')), [trajetsDuPoint]);
  const visibles = useMemo(() => trajetsDuPoint.filter((t) => {
    if (filtreVille && t.ville_arrivee !== filtreVille) return false;
    const poids = Number(filtrePoids.replace(',', '.'));
    if (filtrePoids && Number.isFinite(poids) && t.kilos_disponibles < poids) return false;
    if (filtreAvant && t.date_depart > filtreAvant) return false;
    return true;
  }).sort((a, b) => {
    if (tri === 'prix') return Number(a.prix_par_kilo) - Number(b.prix_par_kilo);
    if (tri === 'kilos') return Number(b.kilos_disponibles) - Number(a.kilos_disponibles);
    if (tri === 'note') return Number(b.porteur_note ?? 0) - Number(a.porteur_note ?? 0);
    return new Date(a.depart).getTime() - new Date(b.depart).getTime();
  }), [trajetsDuPoint, filtreVille, filtrePoids, filtreAvant, tri]);
  // Retour a la premiere page des qu'un filtre ou le tri change.
  useEffect(() => { setPageTrajets(0); }, [filtreVille, filtrePoids, filtreAvant, tri, choixPoint, cleePoints]);
  const trajetsPage = visibles.slice(pageTrajets * TRAJETS_PAR_PAGE, (pageTrajets + 1) * TRAJETS_PAR_PAGE);

  async function encaisserMaintenant(demandeId: string, point: PointRelais) {
    const { data } = await supabase.rpc('admin_pr_a_encaisser', { p_point_id: point.id });
    const item = ((data ?? []) as AEncaisser[]).find((i) => i.demande_id === demandeId);
    if (item) setAEncaisser({ ...item, point });
  }

  // Le client prefere la carte au moment d'encaisser : le dossier change de moyen, puis le lien s'affiche.
  async function passerCarte(item: AEncaisserP) {
    const { error: e } = await supabase.rpc('admin_pr_changer_moyen_guichet', { p_demande_id: item.demande_id, p_moyen: 'carte' });
    if (e) { setError(e.message); return; }
    const d = (dossiers ?? []).find((x) => x.demande_id === item.demande_id);
    setAEncaisser(null);
    setCarte({
      demande_id: item.demande_id, reference: item.reference, client_nom: d?.client_nom ?? item.expediteur_nom ?? 'le client',
      client_telephone: d?.client_telephone ?? '', montant_eur: item.montant_eur, montant_local: item.montant_local, devise: item.devise, point: item.point,
    });
    charger();
  }

  const enCours = dossiersDuPoint.filter((d) => !['livre', 'annule'].includes(d.statut_colis));
  // Ce qui attend une action du point : encaisser / envoyer le lien carte, saisir le code, lire un message. Les dossiers à traiter passent
  // en premier ; les pastilles de filtre au-dessus du tableau disent combien il y en a de chaque sorte.
  const estAEncaisser = (d: DossierGuichet) => !d.paiement_valide_at && d.statut_colis === 'en_attente';
  const codeASaisir = (d: DossierGuichet) => d.statut_colis === 'arrive';
  const messagesNonLus = (d: DossierGuichet) => !!nonLus[d.demande_id];
  const actionRequise = (d: DossierGuichet) => estAEncaisser(d) || codeASaisir(d) || messagesNonLus(d);
  const nbEncaisser = enCours.filter(estAEncaisser).length;
  const nbCodes = enCours.filter(codeASaisir).length;
  const nbMessages = enCours.reduce((a, d) => a + (nonLus[d.demande_id] ?? 0), 0);
  const filtreur = { tous: () => true, livres: () => true, encaisser: estAEncaisser, code: codeASaisir, messages: messagesNonLus }[filtreTache];
  const nbLivres = dossiersDuPoint.filter((d) => d.statut_colis === 'livre').length;
  // « Livré » n'est pas « en cours » : il ne s'affiche que si on choisit cette étape dans la frise.
  const dossiersTries = (filtreTache === 'livres' ? dossiersDuPoint.filter((d) => d.statut_colis === 'livre') : enCours.filter(filtreur))
    .sort((a, b) => Number(actionRequise(b)) - Number(actionRequise(a)) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Bande de points : dossiers en cours et ceux qui attendent une action, par point (sur tous les dossiers, pas seulement le point choisi).
  const compteursPoints = useMemo(() => {
    const c: Record<string, CompteurPoint> = {};
    for (const d of dossiers ?? []) {
      if (['livre', 'annule'].includes(d.statut_colis)) continue;
      const x = (c[d.point.id] ??= { total: 0, urgents: 0 });
      x.total += 1;
      if (actionRequise(d)) x.urgents += 1;
    }
    return c;
  }, [dossiers, nonLus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtres rapides, dans le cadre du tableau (le filtre « État » de l'en-tête de colonne est retiré : les pastilles « Étape » le remplacent).
  const filtresDossiers = dossiers && dossiers.length > 0 ? (
    <>
      <button type="button" className={`pr-puce-filtre ${filtreTache === 'tous' ? 'on' : ''}`} onClick={() => setFiltreTache('tous')}>En cours<span>{enCours.length}</span></button>
      {([['encaisser', 'À encaisser', nbEncaisser, 'ambre'], ['code', 'Codes à saisir', nbCodes, 'ambre'], ['messages', 'Messages non lus', nbMessages, 'rouge']] as const).map(([cle, libelle, n, ton]) => (
        <button key={cle} type="button" className={`pr-puce-filtre ${filtreTache === cle ? 'on' : ''} ${n > 0 ? `pr-puce-filtre--${ton}` : ''}`} onClick={() => setFiltreTache(filtreTache === cle ? 'tous' : cle)}>{libelle}<span>{n}</span></button>
      ))}
      <button type="button" className={`pr-puce-filtre ${filtreTache === 'livres' ? 'on' : ''}`} onClick={() => setFiltreTache(filtreTache === 'livres' ? 'tous' : 'livres')}>Livrés<span>{nbLivres}</span></button>
    </>
  ) : undefined;

  // Un dossier par ligne : référence, client → destinataire, trajet, montant, état, puis les actions (messages + action principale).
  const colonnesDossiers: Column<DossierP>[] = [
    ...(plusieurs ? [{ key: 'point', label: 'Point', value: (d: DossierP) => d.point.nom, filter: 'options' as const, width: 120, render: (d: DossierP) => <strong className="pr-nowrap">{d.point.nom}</strong> }] : []),
    { key: 'ref', label: 'Dossier', value: (d) => d.reference, width: 108, render: (d) => <span className="pr-ref">#{d.reference}</span> },
    { key: 'cree', label: 'Créé le', value: (d) => d.created_at, filter: 'date', width: 122,
      render: (d) => <span className="pr-nowrap">{new Date(d.created_at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> },
    { key: 'client', label: 'Client → destinataire', width: 175, value: (d) => `${d.client_nom} ${d.destinataire_nom} ${d.destinataire_ville ?? ''}`,
      render: (d) => <span className="pr-nowrap"><strong>{premierMot(d.client_nom)}</strong><span className="pr-fleche"> → </span>{premierMot(d.destinataire_nom)}</span> },
    { key: 'trajet', label: 'Trajet', width: 170, value: (d) => `${d.trajet ?? ''} ${d.porteur_nom ?? ''}`, // la recherche trouve encore le voyageur par son nom
      render: (d) => <span className="pr-nowrap">{d.trajet ?? '-'}</span> },
    { key: 'montant', label: 'Montant', value: (d) => Number(d.montant_local), width: 118, render: (d) => <strong className="pr-nowrap">{montantLocal(d.montant_local, d.devise)}</strong> },
    { key: 'statut', label: 'État', value: (d) => statutDossier(d).texte, filter: 'options', width: 140, render: (d) => <Badge tone={statutDossier(d).tone}>{statutDossier(d).texte}</Badge> },
    { key: 'actions', label: '', width: 240,
      render: (d) => (
        <div className="pr-actions-ligne">
          <button type="button" className={`pr-btn-icone ${nonLus[d.demande_id] ? 'pr-btn-icone--actif' : ''}`} onClick={(e) => { e.stopPropagation(); setChat(d); }}
                  title={nonLus[d.demande_id] ? `${nonLus[d.demande_id]} message(s) non lu(s)` : 'Messages'} aria-label="Messages">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></svg>
            {nonLus[d.demande_id] ? <span className="pr-badge-non-lu pr-badge-coin">{nonLus[d.demande_id]}</span> : null}
          </button>
          {!d.paiement_valide_at && d.statut_colis === 'en_attente'
            ? (d.moyen_choisi === 'carte'
              ? <button className="btn btn-primary btn-sm pr-nowrap" onClick={(e) => { e.stopPropagation(); setMessage(null); setCarte(d); }}>Lien carte</button>
              : <button className="btn btn-primary btn-sm pr-nowrap" onClick={(e) => { e.stopPropagation(); encaisserMaintenant(d.demande_id, d.point); }}>Encaisser</button>)
            : d.statut_colis === 'arrive'
              ? <button className="btn btn-primary btn-sm pr-nowrap" onClick={(e) => { e.stopPropagation(); setCode(d); }}>Saisir le code</button>
              : null}
          <button type="button" className="btn btn-sm pr-nowrap pr-btn-fiche" onClick={(e) => { e.stopPropagation(); setFiche(d); }} title="Ouvrir la fiche du dossier">Fiche ›</button>
        </div>
      ) },
  ];



  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>Guichet<InfoBulle>{plusieurs
            ? <>Un client vous confie un colis : choisissez un voyageur. La demande part au nom du point du pays de départ du voyageur.</>
            : <>Un client vous confie un colis : choisissez un voyageur qui part de <strong>{nomsPays[points[0].pays_code.trim()] ?? points[0].pays_code}</strong>. La demande part au nom de « Wonjo {points[0].ville} ».{!!texteTaux(points[0].devise) && <> Les prix des voyageurs sont en euros : <strong>{texteTaux(points[0].devise)}</strong>.</>}</>}</InfoBulle></h3>
        </div>
      </div>
      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

      <BandePoints points={points} compteurs={compteursPoints} choix={choixPoint} onChoix={setChoixPoint} />

      <div className="pr-barre">
      <div className="pr-filtres">
        <label>Destination
          <Select
            ariaLabel="Destination"
            value={filtreVille}
            onChange={setFiltreVille}
            minWidth={190}
            options={[{ value: '', label: 'Toutes les destinations' }, ...villesArrivee.map((v) => ({ value: v, label: v }))]}
          />
        </label>
        <label>Poids du colis (kg)<input type="text" inputMode="decimal" value={filtrePoids} onChange={(e) => setFiltrePoids(e.target.value)} placeholder="Ex. 3" /></label>
        <label>Départ au plus tard<ChampDate valeur={filtreAvant} onChange={setFiltreAvant} ariaLabel="Départ au plus tard" placeholder="Toutes les dates" /></label>
        <label>Trier par
          <Select ariaLabel="Trier par" value={tri} onChange={(v) => setTri(v as Tri)} minWidth={210} options={TRIS} />
        </label>
        {(filtreVille || filtrePoids || filtreAvant) && (
          <button type="button" className="pr-filtres-effacer" onClick={() => { setFiltreVille(''); setFiltrePoids(''); setFiltreAvant(''); }}>Effacer les filtres</button>
        )}
        {trajets && <p className="pr-compteur pr-compteur--filtres"><strong>{visibles.length}</strong> trajet{visibles.length > 1 ? 's' : ''} disponible{visibles.length > 1 ? 's' : ''}{visibles.length !== trajets.length ? ` sur ${trajets.length}` : ''}</p>}
      </div>
      </div>

      {!trajets ? <p className="loading-state">Chargement des trajets…</p> : visibles.length === 0 ? (
        <div className="empty-state">Aucun trajet ne correspond. Les voyageurs publient leurs trajets dans l'app : revenez plus tard ou élargissez les filtres.</div>
      ) : (
        <div className="pr-grid">
          {trajetsPage.map((t) => (
            <article key={t.annonce_id} className="pr-card pr-trajet pr-trajet--cliquable" role="button" tabIndex={0}
                     aria-label={`Détail du trajet ${t.ville_depart} vers ${t.ville_arrivee}`}
                     onClick={() => setDetail(t)}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(t); } }}>
              <div className="pr-trajet-route">
                <span><Drapeau iso={t.pays_depart_code} /> {t.ville_depart}</span>
                <span className="pr-trajet-fleche" aria-hidden="true" />
                <span><Drapeau iso={t.pays_arrivee_code} /> {t.ville_arrivee}</span>
              </div>
              <div className="pr-ligne"><span className="pr-libelle">Départ</span><span>{dateCourte(t.depart)}</span></div>
              {plusieurs && <div className="pr-ligne"><span className="pr-libelle">Point</span><span>{t.point.nom}</span></div>}
              <div className="pr-ligne"><span className="pr-libelle">Place</span><span><strong>{Number(t.kilos_disponibles).toLocaleString('fr-FR')} kg</strong> · {Number(t.prix_par_kilo).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/kg{equivalentLocal(t.prix_par_kilo, t.point.devise) && <small className="pr-equiv"> {equivalentLocal(t.prix_par_kilo, t.point.devise)}/kg</small>}</span></div>
              <div className="pr-voyageur">
                <Avatar src={t.porteur_photo} nom={t.porteur_nom} size={32} />
                <div>
                  <strong>{t.porteur_nom ?? 'Voyageur'}</strong>
                  <span className="hint">
                    {t.porteur_verifie ? 'Identité vérifiée' : 'Non vérifié'}
                    {t.porteur_livraisons ? ` · ${t.porteur_livraisons} livraison${t.porteur_livraisons > 1 ? 's' : ''}` : ' · nouveau'}
                    {t.porteur_note ? ` · ${Number(t.porteur_note).toFixed(1)}/5` : ''}
                  </span>
                </div>
              </div>
              <button className="btn btn-primary pr-action" onClick={(e) => { e.stopPropagation(); setMessage(null); setAConfier(t); }}>Confier un colis</button>
            </article>
          ))}
        </div>
      )}
      <Pagination page={pageTrajets} total={visibles.length} taille={TRAJETS_PAR_PAGE} onPage={setPageTrajets} unite="trajets" />

      <div className="pr-entete" style={{ marginTop: 28 }}>
        <div><h3>Dossiers du guichet<InfoBulle>Les colis confiés par vos clients, du paiement à la livraison. Les dossiers qui demandent une action sont en haut.</InfoBulle></h3></div>
      </div>
      {!dossiers ? <p className="loading-state">Chargement…</p> : (
        <div className="pr-dossiers-table"><DataTable rows={dossiersTries} columns={colonnesDossiers} rowKey={(d) => d.demande_id} integre pageSize={10} onRowClick={(d) => setFiche(d)} filtres={filtresDossiers}
                   title="Dossiers" searchPlaceholder="Rechercher un client, une référence…"
                   emptyText={filtreTache === 'tous' ? 'Aucun dossier en cours.' : 'Rien à faire de ce côté.'} /></div>
      )}

      {fiche && (
        <FicheDossierModal dossier={fiche} point={fiche.point} nonLus={nonLus[fiche.demande_id] ?? 0} onClose={() => setFiche(null)}
          onMessages={() => { const d = fiche; setFiche(null); setChat(d); }}
          onEncaisser={() => { const d = fiche; setFiche(null); setMessage(null); if (d.moyen_choisi === 'carte') setCarte(d); else encaisserMaintenant(d.demande_id, d.point); }}
          onCode={() => { const d = fiche; setFiche(null); setCode(d); }} />
      )}
      {detail && (
        <TrajetDetailModal trajet={detail} devise={detail.point.devise} onClose={() => setDetail(null)}
          onConfier={() => { const t = detail; setDetail(null); setMessage(null); setAConfier(t); }} />
      )}
      {aConfier && (
        <ConfierModal point={aConfier.point} trajet={aConfier} nomsPays={nomsPays} onClose={() => setAConfier(null)}
          onCree={(r, encaisser) => {
            const pointDuTrajet = aConfier.point;
            setAConfier(null);
            setMessage(r.moyen === 'carte'
              ? `Demande #${r.reference} envoyée au voyageur au nom du point : ${montantEuros(r.montant_eur)} à payer par carte.`
              : `Demande #${r.reference} envoyée au voyageur au nom du point : ${montantLocal(r.montant_local, r.devise)} à encaisser.`);
            charger();
            if (encaisser && r.moyen === 'carte') {
              setCarte({ demande_id: r.demande_id, reference: r.reference, client_nom: r.client_nom, client_telephone: r.client_telephone,
                         montant_eur: r.montant_eur, montant_local: r.montant_local, devise: r.devise, point: pointDuTrajet });
            } else if (encaisser) encaisserMaintenant(r.demande_id, pointDuTrajet);
          }} />
      )}
      {chat && (
        <ChatGuichetModal
          demandeId={chat.demande_id}
          reference={chat.reference}
          porteurNom={chat.porteur_nom}
          destinataire={{ nom: chat.destinataire_nom, telephone: chat.destinataire_telephone, ville: chat.destinataire_ville }}
          ouvert={!['en_attente', 'livre', 'annule'].includes(chat.statut_colis)}
          onClose={() => { setChat(null); chargerNonLus(); }}
        />
      )}
      {code && (
        <CodeLivraisonModal dossier={code} onClose={() => setCode(null)}
          onLivre={() => { setCode(null); setMessage(`Colis #${code.reference} livré : le voyageur sera payé 24 h après, sans litige.`); charger(); }} />
      )}
      {aEncaisser && (
        <ValidationModal point={aEncaisser.point} item={aEncaisser} onClose={() => setAEncaisser(null)}
          onValide={(texte) => { setAEncaisser(null); setMessage(texte); charger(); }}
          onCarte={() => passerCarte(aEncaisser)} />
      )}
      {carte && (
        <LienCarteModal point={carte.point} dossier={carte}
          onClose={() => { setCarte(null); charger(); }}
          onPaye={(texte) => { setCarte(null); setMessage(texte); charger(); }}
          onAutrement={() => { const id = carte.demande_id; const pt = carte.point; setCarte(null); charger(); encaisserMaintenant(id, pt); }} />
      )}
    </div>
  );
}

// Message WhatsApp pre-redige au destinataire : pas de fournisseur SMS, l'agent l'envoie depuis son telephone.
// Fiche d'un dossier : tout ce que le point doit savoir et pouvoir faire sans quitter la page. Les numéros se COPIENT (un lien « tel: »
// ouvre une boîte de dialogue du navigateur peu parlante) ; WhatsApp s'ouvre dans un nouvel onglet.

function FicheDossierModal({ dossier: d, point, nonLus, onClose, onMessages, onEncaisser, onCode }: {
  dossier: DossierGuichet; point: PointRelais; nonLus: number; onClose: () => void; onMessages: () => void; onEncaisser: () => void; onCode: () => void;
}) {
  const s = statutDossier(d);
  const aEncaisser = !d.paiement_valide_at && d.statut_colis === 'en_attente';
  return (
    <Modal onClose={onClose} wide>
      <div className="cg-entete">
        <div className="cg-entete-texte"><strong>Dossier #{d.reference}</strong><span>{d.trajet ?? ''}{d.depart ? ` · départ ${dateCourte(d.depart)}` : ''}</span></div>
        <button className={`btn btn-sm ${nonLus ? 'btn-primary' : ''}`} onClick={onMessages}>Messages{nonLus ? <span className="pr-badge-non-lu">{nonLus}</span> : null}</button>
        <Badge tone={s.tone}>{s.texte}</Badge>
      </div>
      <div className="modal-body">
        <ParcoursDossier dossier={d} />

        {/* Deux colonnes : à gauche le dossier (montant, colis, trajet), à droite les trois personnes. */}
        <div className="pr-fiche-colonnes">
        <div className="pr-fiche-resume">
          <div className="pr-fiche-tuile">
            <span>Montant</span>
            <strong>{montantLocal(d.montant_local, d.devise)}</strong>
            <small>{[equivalentEuros(d.montant_local, d.devise) || montantEuros(d.montant_eur), { especes: 'Espèces', mobile_money: 'Mobile money', carte: 'Carte bancaire' }[d.moyen_choisi]].join(' · ')}</small>
            {aEncaisser && <small className="pr-fiche-alerte">À payer avant le {dateCourte(d.echeance_paiement)}</small>}
          </div>
          <div className="pr-fiche-tuile">
            <span>Colis</span>
            <strong className="pr-fiche-desc">{d.description ?? '-'}</strong>
            <small>{d.poids_kg != null ? `${Number(d.poids_kg).toLocaleString('fr-FR')} kg` : ' '}</small>
          </div>
          <div className="pr-fiche-tuile">
            <span>Trajet</span>
            <strong>{d.trajet ?? '-'}</strong>
            <small>{d.depart ? `Départ ${dateCourte(d.depart)}` : ' '}</small>
          </div>
        </div>

        {/* Les trois personnes du dossier : même présentation (rôle, nom, contact). */}
        <div className="pr-fiche-personnes">
          <div className="pr-fiche-personne">
            <div className="pr-fiche-qui">
              <Avatar nom={d.client_nom} size={30} />
              <div><span className="pr-fiche-role">Client · {point.ville}</span><strong>{d.client_nom}</strong></div>
            </div>
            <div className="pr-fiche-contact"><Copiable valeur={d.client_telephone} /></div>
          </div>
          <div className="pr-fiche-personne">
            <div className="pr-fiche-qui">
              <Avatar nom={d.destinataire_nom} size={30} />
              <div><span className="pr-fiche-role">Destinataire{d.destinataire_ville ? ` · ${d.destinataire_ville}` : ''}</span><strong>{d.destinataire_nom}</strong></div>
            </div>
            <div className="pr-fiche-contact">
              <Copiable valeur={d.destinataire_telephone} />
              <a className="pr-btn-wa" href={lienWhatsApp(d, point)} target="_blank" rel="noopener noreferrer"
                 title={`Écrire au destinataire sur WhatsApp : le message est prérempli. Envoyez-le depuis le WhatsApp de Wonjo${point.telephone ? ` (${point.telephone})` : ''}, pas depuis un compte personnel.`} aria-label="Écrire au destinataire sur WhatsApp">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
              </a>
            </div>
          </div>
          <div className="pr-fiche-personne">
            <div className="pr-fiche-qui">
              <Avatar nom={d.porteur_nom} size={30} />
              <div><span className="pr-fiche-role">Voyageur</span><strong>{d.porteur_nom ?? '-'}</strong></div>
            </div>
            <div className="pr-fiche-contact">
              {d.porteur_telephone ? <Copiable valeur={d.porteur_telephone} /> : <span className="hint">Téléphone visible une fois la demande acceptée</span>}
            </div>
          </div>
        </div>

        </div>

        {(aEncaisser || d.statut_colis === 'arrive') && (
          <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
            {aEncaisser && <button className="btn btn-primary" onClick={onEncaisser}>{d.moyen_choisi === 'carte' ? 'Lien de paiement par carte' : 'Encaisser'}</button>}
            {d.statut_colis === 'arrive' && <button className="btn btn-primary" onClick={onCode}>Saisir le code de livraison</button>}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Prénom seul : le premier mot d'un nom complet (« Aïssatou Ba » -> « Aïssatou », « Moussa K. » -> « Moussa »). La fiche donne le nom entier. */
const premierMot = (nom: string | null | undefined) => (nom ?? '').trim().split(/\s+/)[0] || '-';

function lienWhatsApp(d: DossierGuichet, point: PointRelais): string {
  // Message prêt à envoyer au destinataire : qui est le voyageur, où et quand le rencontrer (lieu et heure de son annonce), comment
  // l'appeler (son téléphone, une fois la demande acceptée) et ce qu'il doit faire à la remise (le code à 4 chiffres).
  const villeArrivee = (d.trajet ?? '').split('→')[1]?.trim();
  const quand = d.date_arrivee
    ? new Date(`${d.date_arrivee}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) + (d.heure_arrivee ? ` vers ${d.heure_arrivee.slice(0, 5).replace(':', 'h')}` : '')
    : null;
  const arrive = d.statut_colis === 'arrive';
  const voyageur = premierMot(d.porteur_nom) === '-' ? 'un voyageur Wonjo' : premierMot(d.porteur_nom);
  const lignes = [
    `Bonjour ${premierMot(d.destinataire_nom)}, c'est le point relais Wonjo de ${point.ville}.`,
    `${premierMot(d.client_nom)} nous a confié un colis pour vous${villeArrivee ? `, à récupérer à ${villeArrivee}` : ''}.`,
    `Le voyageur qui le transporte, ${voyageur}, ${arrive ? `est arrivé${villeArrivee ? ` à ${villeArrivee}` : ''}` : `arrive${villeArrivee ? ` à ${villeArrivee}` : ''}`}.`,
    d.lieu_remise || quand ? `Remise du colis : ${[d.lieu_remise, quand].filter(Boolean).join(', ')}.` : null,
    d.porteur_telephone ? `Vous pouvez l'appeler au ${d.porteur_telephone}.` : null,
    'Quand il vous remet le colis, demandez-lui le code à 4 chiffres et envoyez-le-nous ici pour confirmer la réception. Merci !',
  ].filter(Boolean);
  return `https://wa.me/${d.destinataire_telephone.replace(/\D/g, '')}?text=${encodeURIComponent(lignes.join('\n'))}`;
}

function CodeLivraisonModal({ dossier, onClose, onLivre }: { dossier: DossierGuichet; onClose: () => void; onLivre: () => void }) {
  const [chiffres, setChiffres] = useState(['', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const champs = [0, 1, 2, 3];

  function saisir(i: number, v: string) {
    const c = v.replace(/\D/g, '').slice(-1);
    setChiffres((l) => l.map((x, j) => (j === i ? c : x)));
    if (c && i < 3) (document.getElementById(`code-${i + 1}`) as HTMLInputElement | null)?.focus();
  }

  async function valider() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_saisir_code_livraison', { p_demande_id: dossier.demande_id, p_code: chiffres.join('') });
    setBusy(false);
    const r = data as { ok?: boolean; error?: string; restant?: number; epuise?: boolean } | null;
    if (e) { setError(e.message); return; }
    if (r?.ok) { onLivre(); return; }
    setChiffres(['', '', '', '']);
    setError(r?.epuise ? 'Trop de tentatives : contactez le support.' : r?.restant != null ? `Code incorrect : ${r.restant} essai${r.restant > 1 ? 's' : ''} restant${r.restant > 1 ? 's' : ''}.` : (r?.error ?? 'Code refusé'));
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="modal-title">Code de livraison #{dossier.reference}</h2>
      <div className="modal-body">
        <p className="hint">Le voyageur a remis le colis à {dossier.destinataire_nom} et lui a donné un code à 4 chiffres. Saisissez-le pour confirmer la livraison.</p>
        <div className="pr-code" onPaste={(e) => { const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4); if (t.length === 4) { e.preventDefault(); setChiffres(t.split('')); } }}>
          {champs.map((i) => (
            <input key={i} id={`code-${i}`} type="text" inputMode="numeric" maxLength={1} value={chiffres[i]} autoFocus={i === 0}
                   aria-label={`Chiffre ${i + 1}`} onChange={(e) => saisir(i, e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Backspace' && !chiffres[i] && i > 0) (document.getElementById(`code-${i - 1}`) as HTMLInputElement | null)?.focus(); }} />
          ))}
        </div>
        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={valider} disabled={busy || chiffres.join('').length !== 4}>{busy ? 'Vérification…' : 'Confirmer la livraison'}</button>
        </div>
      </div>
    </Modal>
  );
}

interface Cree {
  demande_id: string; reference: string; montant_local: number; devise: string; montant_eur: number;
  moyen: 'mobile_money' | 'especes' | 'carte'; client_nom: string; client_telephone: string;
}

function ConfierModal({ point, trajet, nomsPays, onClose, onCree }: {
  point: PointRelais; trajet: Trajet; nomsPays: Record<string, string>;
  onClose: () => void; onCree: (r: Cree, encaisser: boolean) => void;
}) {
  const [etape, setEtape] = useState(1);
  const [clientNom, setClientNom] = useState('');
  const [clientPrenom, setClientPrenom] = useState('');
  const [clientTel, setClientTel] = useState('');
  const [destNom, setDestNom] = useState('');
  const [destPrenom, setDestPrenom] = useState('');
  const [destTel, setDestTel] = useState('');
  const [destVille, setDestVille] = useState(trajet.ville_arrivee);
  const [description, setDescription] = useState('');
  const [poids, setPoids] = useState('');
  const [natures, setNatures] = useState<string[]>([]);
  const [valeur, setValeur] = useState('');
  // Unité d'affichage des montants du formulaire : franc CFA ou euro (un point en CFA démarre en CFA ; le choix est retenu).
  // La valeur déclarée se saisit dans l'unité choisie ; le serveur la reçoit toujours en euros.
  // Taux euro -> monnaie du point, lu au serveur (le même que celui figé dans le dossier). Sans taux (monnaie non renseignée), pas de bascule.
  const { taux } = useTauxEuro(point.devise);
  const convertible = taux != null;
  const [unite, setUnite] = useState<Unite>(uniteMemorisee);
  const enLocal = convertible && unite === 'local';
  const fmt = (eur: number | null | undefined) => (enLocal ? equivalentLocal(eur, point.devise).replace(/^≈ /, '') : montantEuros(eur));
  // Dernière conversion faite : revenir à l'unité d'origine sans rien avoir changé redonne exactement le texte tapé (pas de dérive d'arrondi).
  const derniereConversion = useRef<{ vers: 'local' | 'eur'; depuis: string; devient: string } | null>(null);
  function changerUnite(u: Unite) {
    if (u === unite) return;
    const saisi = Number(valeur.replace(',', '.'));
    const memo = derniereConversion.current;
    if (memo && memo.vers === unite && memo.devient === valeur) {
      setValeur(memo.depuis);
      derniereConversion.current = null;
    } else if (valeur.trim() && Number.isFinite(saisi) && saisi > 0) {
      const devient = u === 'eur' ? String(Math.round(saisi / (taux ?? 1) * 100) / 100).replace('.', ',') : String(Math.round(saisi * (taux ?? 1)));
      derniereConversion.current = { vers: u, depuis: valeur, devient };
      setValeur(devient);
    }
    setUnite(u);
    memoriserUnite(u);
  }
  const [fragile, setFragile] = useState(false);
  const [bareme, setBareme] = useState<BaremeProtection | null>(null);
  useEffect(() => {
    supabase.rpc('admin_pr_bareme_protection').then(({ data }) => { if (data) setBareme(data as BaremeProtection); });
  }, []);
  const [moyen, setMoyen] = useState<'mobile_money' | 'especes' | 'carte'>(point.accepte_especes ? 'especes' : 'mobile_money');
  const [interdits, setInterdits] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cree, setCree] = useState<Cree | null>(null);
  // Apres un clic sur « Continuer » / « Envoyer » alors que des champs manquent : ils passent en rouge (remis a zero a chaque etape).
  const [tente, setTente] = useState(false);
  const corps = useRef<HTMLDivElement>(null);

  // Le serveur recoit un nom complet : « Prenom NOM ».
  const clientComplet = `${clientPrenom.trim()} ${clientNom.trim()}`.trim();
  const destComplet = `${destPrenom.trim()} ${destNom.trim()}`.trim();
  const poidsNum = Number(poids.replace(',', '.'));
  const valeurSaisie = Number(valeur.replace(',', '.'));
  const valeurNum = enLocal ? Math.round(valeurSaisie / (taux ?? 1) * 100) / 100 : valeurSaisie; // toujours en euros
  const maxLocal = Math.floor(VALEUR_DECLAREE_MAX * (taux ?? 1));
  // Numero complet au format de son pays (nombre exact de chiffres).
  const poidsOk = Number.isFinite(poidsNum) && poidsNum > 0 && poidsNum <= trajet.kilos_disponibles;
  const valeurOk = Number.isFinite(valeurNum) && valeurNum > 0 && valeurNum <= VALEUR_DECLAREE_MAX;
  const descriptionOk = compterMots(description) >= MOTS_MIN_DESCRIPTION;
  // Ce qui manque a l'etape courante, dit en clair sous le bouton apres un clic.
  const manquants = etape === 1
    ? [clientNom.trim().length < 2 && 'le nom du client', clientPrenom.trim().length < 2 && 'le prénom du client', !numeroComplet(decomposerNumero(clientTel, point.pays_code.trim()).iso, clientTel) && 'le téléphone du client']
    : etape === 2
      ? [destNom.trim().length < 2 && 'le nom du destinataire', destPrenom.trim().length < 2 && 'le prénom du destinataire', !numeroComplet(decomposerNumero(destTel, trajet.pays_arrivee_code.trim()).iso, destTel) && 'le téléphone du destinataire']
      : [!poidsOk && 'le poids', !valeurOk && 'la valeur déclarée', !descriptionOk && `la description (${MOTS_MIN_DESCRIPTION} mots au moins)`,
         natures.length === 0 && 'la nature du contenu', !interdits && 'la confirmation du contenu avec le client'];
  const aCompleter = manquants.filter((m): m is string => !!m);
  // Clic sur le bouton principal : si tout est bon on avance, sinon on colore les champs a completer et on remonte au premier.
  function suite(action: () => void) {
    if (aCompleter.length === 0) { setTente(false); action(); return; }
    setTente(true);
    setTimeout(() => corps.current?.querySelector<HTMLElement>('.champ-invalide, .champ-tel--invalide input, .pr-confirme-invalide')
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
  }
  // Estimation seulement (prix du voyageur + 10 %) : le montant exact, frais de protection compris, vient du serveur.
  // Frais de la valeur declaree : meme bareme que l'app, lu sur le serveur (apercu ; le montant exact est fige a l'envoi).
  const fraisValeur = valeurOk ? fraisProtection(valeurNum, bareme) : 0;
  const baseEur = poidsOk ? Math.round(trajet.prix_par_kilo * poidsNum * 100) / 100 : null;
  const serviceEur = baseEur != null ? Math.round(baseEur * 0.1 * 100) / 100 : 0;
  const estimationEur = baseEur != null ? Math.round((baseEur + serviceEur + fraisValeur) * 100) / 100 : null;
  const poidsTrop = !!poids && Number.isFinite(poidsNum) && poidsNum > trajet.kilos_disponibles;

  async function envoyer() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_confier_colis', {
      p_point_id: point.id,
      p_annonce_id: trajet.annonce_id,
      p_client: { nom: clientComplet, telephone: clientTel },
      p_destinataire: { nom: destComplet, telephone: destTel, ville: destVille.trim() },
      p_colis: { description: description.trim(), poids_kg: poidsNum, nature_contenu: natures.join(', '), valeur_declaree: valeurNum, fragile },
      p_moyen: moyen,
    });
    setBusy(false);
    if (e) {
      const jour = new Date(`${trajet.date_depart}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
      setError(messageRefusPointRelais(e, `départ le ${jour}${trajet.heure_depart ? ` à ${trajet.heure_depart.slice(0, 5).replace(':', 'h')}` : ''}`));
      return;
    }
    setCree({ ...(data as Cree), moyen, client_nom: clientComplet, client_telephone: clientTel });
  }

  if (cree) {
    return (
      <Modal onClose={() => onCree(cree, false)}>
        <h2 className="modal-title">Demande envoyée #{cree.reference}</h2>
        <div className="modal-body">
          <div className="pr-a-recevoir">
            <span>{cree.moyen === 'carte' ? `À payer par carte par ${clientComplet}` : `À encaisser auprès de ${clientComplet}`}</span>
            <strong>{cree.moyen === 'carte' ? montantEuros(cree.montant_eur) : montantLocal(cree.montant_local, cree.devise)}</strong>
            <small>{cree.moyen === 'carte' ? `≈ ${montantLocal(cree.montant_local, cree.devise)} · ` : ''}Montant exact calculé par le serveur</small>
          </div>
          <p className="hint" style={{ marginTop: 12 }}>
            {trajet.porteur_nom ?? 'Le voyageur'} sera prévenu dès que le paiement sera {cree.moyen === 'carte' ? 'fait' : 'validé'}, et pourra alors accepter. Gardez le colis : vous enregistrerez le dépôt dans « Dépôts et remises ».
          </p>
          <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="btn" onClick={() => onCree(cree, false)}>Plus tard</button>
            <button className="btn btn-primary" onClick={() => onCree(cree, true)}>{cree.moyen === 'carte' ? 'Afficher le lien de paiement' : 'Encaisser maintenant'}</button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} wide>
      <h2 className="modal-title">Confier un colis · {trajet.ville_depart} → {trajet.ville_arrivee}</h2>
      <div className="modal-body" ref={corps}>
        <ol className="pr-etapes" aria-label="Étapes">
          {['Client', 'Destinataire', 'Colis'].map((l, i) => (
            <li key={l} className={etape === i + 1 ? 'active' : etape > i + 1 ? 'faite' : ''}><span>{i + 1}</span>{l}</li>
          ))}
        </ol>

        {etape === 1 && (
          <div className="form-grid">
            <p className="hint">La personne qui vous confie le colis et vous paie.</p>
            <div className="field-row field-row--identite">
              <label>Nom<input type="text" value={clientNom} onChange={(e) => setClientNom(e.target.value)} className={tente && clientNom.trim().length < 2 ? 'champ-invalide' : ''} placeholder="Ex. BA" autoComplete="family-name" autoFocus /></label>
              <label>Prénom<input type="text" value={clientPrenom} onChange={(e) => setClientPrenom(e.target.value)} className={tente && clientPrenom.trim().length < 2 ? 'champ-invalide' : ''} placeholder="Ex. Aissatou" autoComplete="given-name" /></label>
              <label>Téléphone<ChampTelephone compact valeur={clientTel} onChange={setClientTel} pays={point.pays_code.trim()} nomsPays={nomsPays} ariaLabel="Téléphone du client"
                                              invalide={tente && !numeroComplet(decomposerNumero(clientTel, point.pays_code.trim()).iso, clientTel)} /></label>
            </div>
          </div>
        )}

        {etape === 2 && (
          <div className="form-grid">
            <p className="hint">La personne qui récupère le colis à l'arrivée : le voyageur lui donnera le code de livraison à la remise.</p>
            <div className="field-row field-row--identite">
              <label>Nom<input type="text" value={destNom} onChange={(e) => setDestNom(e.target.value)} className={tente && destNom.trim().length < 2 ? 'champ-invalide' : ''} placeholder="Ex. YAO" autoComplete="off" autoFocus /></label>
              <label>Prénom<input type="text" value={destPrenom} onChange={(e) => setDestPrenom(e.target.value)} className={tente && destPrenom.trim().length < 2 ? 'champ-invalide' : ''} placeholder="Ex. Koffi" autoComplete="off" /></label>
              <label>Téléphone<ChampTelephone compact valeur={destTel} onChange={setDestTel} pays={trajet.pays_arrivee_code.trim()} nomsPays={nomsPays} ariaLabel="Téléphone du destinataire"
                                              invalide={tente && !numeroComplet(decomposerNumero(destTel, trajet.pays_arrivee_code.trim()).iso, destTel)} /></label>
            </div>
            <label className="champ-ville-etroit">Ville<input type="text" value={destVille} onChange={(e) => setDestVille(e.target.value)} /></label>
          </div>
        )}

        {etape === 3 && (
          <div className="form-grid">
            {convertible && (
              <div className="pr-bascule-ligne">
                <p className="hint">Les prix des voyageurs sont en euros. Taux de change : <strong>{texteTaux(point.devise)}</strong>.</p>
                <BasculeUnite valeur={enLocal ? 'local' : 'eur'} onChange={changerUnite} libelleLocal={libelleDevise(point.devise)} />
              </div>
            )}
            <div className="field-row">
              <label>Poids (kg, {Number(trajet.kilos_disponibles).toLocaleString('fr-FR')} kg disponibles)
                <input type="text" inputMode="decimal" value={poids} onChange={(e) => setPoids(e.target.value)} className={(poids || tente) && !poidsOk ? 'champ-invalide' : ''} placeholder="Ex. 3" autoFocus />
                {poidsTrop && <span className="pr-erreur-champ">Il ne reste que {Number(trajet.kilos_disponibles).toLocaleString('fr-FR')} kg sur ce trajet : on ne peut pas dépasser.</span>}
                {!!poids && Number.isFinite(poidsNum) && poidsNum <= 0 && <span className="pr-erreur-champ">Indiquez un poids supérieur à 0.</span>}
              </label>
              <label>Valeur déclarée ({enLocal ? libelleDevise(point.devise) : '€'}, {enLocal ? `${maxLocal.toLocaleString('fr-FR')} ${libelleDevise(point.devise)}` : `${VALEUR_DECLAREE_MAX} €`} max)
                <input type="text" inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} className={(valeur || tente) && !valeurOk ? 'champ-invalide' : ''} placeholder={enLocal ? 'Ex. 26 000' : 'Ex. 40'} />
                {!!valeur && Number.isFinite(valeurNum) && valeurNum > VALEUR_DECLAREE_MAX && <span className="pr-erreur-champ">La valeur déclarée ne peut pas dépasser {enLocal ? `${maxLocal.toLocaleString('fr-FR')} ${libelleDevise(point.devise)}` : montantEuros(VALEUR_DECLAREE_MAX)}.</span>}
              </label>
            </div>
            {bareme?.actif && (
              <div className="pr-frais-valeur">
                {valeurOk && fraisValeur > 0 ? (
                  <p><strong>Frais de valeur déclarée : + {fmt(fraisValeur)}</strong> <span>({pourcent(fraisValeur / valeurNum)} de la valeur déclarée, ajoutés au total du client)</span></p>
                ) : valeurOk ? (
                  <p><strong>Aucun frais</strong> <span>jusqu'à {fmt(bareme.seuil1)} de valeur déclarée</span></p>
                ) : (
                  <p><strong>Frais de valeur déclarée</strong> <span>calculés dès que la valeur est saisie</span></p>
                )}
                <small>Barème : aucun frais jusqu'à {fmt(bareme.seuil1)} · {pourcent(bareme.taux1)} de la part entre {fmt(bareme.seuil1)} et {fmt(bareme.seuil2)} · {pourcent(bareme.taux2)} au-delà de {fmt(bareme.seuil2)}.</small>
              </div>
            )}
            <div>
              <strong style={{ fontSize: 13 }}>Description du contenu</strong>
              <div style={{ marginTop: 6 }}>
                <ChampDescription valeur={description} onChange={setDescription} motsMin={MOTS_MIN_DESCRIPTION} invalide={tente && !descriptionOk}
                                  placeholder="Ex. Tissus wax, chaussures et sacs à main" />
              </div>
            </div>
            <div>
              <strong style={{ fontSize: 13 }}>Nature du contenu</strong>
              <div style={{ marginTop: 6 }}>
                <ChampMultiChoix groupes={NATURES} valeur={natures} onChange={setNatures} ariaLabel="Nature du contenu" invalide={tente && natures.length === 0}
                                 placeholder="Choisir la nature du contenu (un ou plusieurs choix)" />
              </div>
            </div>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={fragile} onChange={(e) => setFragile(e.target.checked)} /> Colis fragile
            </label>
            <div>
              <strong style={{ fontSize: 13 }}>Le client paiera</strong>
              <div className="moyens">
                {point.accepte_especes && (
                  <button type="button" role="radio" aria-checked={moyen === 'especes'} className={`moyen-pill ${moyen === 'especes' ? 'on' : ''}`} onClick={() => setMoyen('especes')}>
                    <span className="moyen-pastille" style={{ background: '#1D9E75' }} /><span className="moyen-texte"><strong>Espèces</strong><small>Au guichet, maintenant</small></span>
                  </button>
                )}
                {point.comptes_mobile_money.length > 0 && (
                  <button type="button" role="radio" aria-checked={moyen === 'mobile_money'} className={`moyen-pill ${moyen === 'mobile_money' ? 'on' : ''}`} onClick={() => setMoyen('mobile_money')}>
                    <span className="moyen-pastille" style={{ background: '#FF7900' }} /><span className="moyen-texte"><strong>Mobile money</strong><small>Vers le compte du point</small></span>
                  </button>
                )}
                <button type="button" role="radio" aria-checked={moyen === 'carte'} className={`moyen-pill ${moyen === 'carte' ? 'on' : ''}`} onClick={() => setMoyen('carte')}>
                  <span className="moyen-pastille" style={{ background: '#635BFF' }} /><span className="moyen-texte"><strong>Carte bancaire</strong><small>Lien de paiement, sur son téléphone</small></span>
                </button>
              </div>
            </div>
            <label className={tente && !interdits ? 'pr-confirme-invalide' : ''} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 600 }}>
              <input type="checkbox" checked={interdits} onChange={(e) => setInterdits(e.target.checked)} style={{ marginTop: 3 }} />
              <span>J'ai vérifié le contenu avec le client : aucun objet interdit, conforme à la description.</span>
            </label>
            {estimationEur != null && (
              <div className="insight-banner">
                <div>
                  <strong>Estimation : ≈ {fmt(estimationEur)}{moyen === 'carte' && enLocal ? ` (débité en euros : ${montantEuros(estimationEur)})` : ''}</strong>
                  <span>
                    Prix du voyageur {fmt(baseEur)} + frais de service 10 % {fmt(serviceEur)}
                    {fraisValeur > 0 ? ` + valeur déclarée ${fmt(fraisValeur)}` : ''}. Le montant exact s'affiche à l'envoi.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        {/* Pied fixe : le bouton reste visible meme quand le formulaire defile. Il reste actif ; s'il manque des champs, un clic les colore. */}
        <div className="pr-pied-fixe">
          {tente && aCompleter.length > 0 && <p className="pr-a-completer" role="alert">À compléter : {aCompleter.join(', ')}.</p>}
          <div className="action-row" style={{ justifyContent: 'space-between' }}>
            <button className="btn" onClick={() => { setTente(false); if (etape === 1) onClose(); else setEtape(etape - 1); }} disabled={busy}>{etape === 1 ? 'Annuler' : 'Retour'}</button>
            {etape < 3
              ? <button className="btn btn-primary" onClick={() => suite(() => setEtape(etape + 1))}>Continuer</button>
              : <button className="btn btn-primary" disabled={busy} onClick={() => suite(envoyer)}>{busy ? 'Envoi…' : 'Envoyer la demande au voyageur'}</button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
