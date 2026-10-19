import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../Modal';
import { Badge } from '../Badge';
import { Avatar } from '../Avatar';
import { Drapeau } from '../Drapeau';
import { Select } from '../Select';
import { ChampTelephone } from '../ChampTelephone';
import { ValidationModal, type AEncaisser } from './AEncaisserSection';
import { ChatGuichetModal } from './ChatGuichetModal';
import { LienCarteModal, type DossierCarte } from './LienCarteModal';
import { dateCourte, fraisProtection, libelleDevise, montantEuros, montantLocal, pourcent, type BaremeProtection, type PointRelais } from '../../lib/pointsRelais';
import { Pagination } from '../Pagination';
import { ChampMultiChoix } from '../ChampMultiChoix';
import { TrajetDetailModal } from './TrajetDetailModal';
import { ChampDate } from '../ChampDate';
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
  porteur_payable: boolean;
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
// Cartes par page (3 par ligne sur un grand ecran) et dossiers par page.
const TRAJETS_PAR_PAGE = 12;
const DOSSIERS_PAR_PAGE = 10;
type Tri = 'depart' | 'prix' | 'kilos' | 'note';
const TRIS: { value: Tri; label: string }[] = [
  { value: 'depart', label: 'Départ le plus proche' },
  { value: 'prix', label: 'Prix au kilo le plus bas' },
  { value: 'kilos', label: 'Le plus de place' },
  { value: 'note', label: 'Les mieux notés' },
];
const TAUX_CFA = 655.957;

function statutDossier(d: DossierGuichet): { texte: string; tone: 'amber' | 'teal' | 'green' | 'muted' | 'danger' } {
  if (d.statut_colis === 'annule') return { texte: 'Annulé', tone: 'muted' };
  if (!d.paiement_valide_at) {
    if (d.moyen_choisi === 'carte') return { texte: d.carte_lien ? 'Lien carte envoyé' : 'À payer par carte', tone: 'amber' };
    return { texte: 'À encaisser', tone: 'amber' };
  }
  if (d.statut_colis === 'en_attente') return { texte: d.statut_paiement === 'autorise' ? 'Carte réservée' : 'Payé · attente voyageur', tone: 'teal' };
  if (d.statut_colis === 'accepte') return { texte: d.depot_at ? 'Prêt à remettre' : 'Accepté · dépôt à faire', tone: 'amber' };
  if (d.statut_colis === 'livre') return { texte: 'Livré', tone: 'green' };
  if (d.statut_colis === 'arrive') return { texte: 'Arrivé · code à saisir', tone: 'amber' };
  return { texte: d.statut_colis === 'remis_porteur' ? 'Remis au voyageur' : d.statut_colis === 'en_transit' ? 'En route' : d.statut_colis === 'arrive' ? 'Arrivé' : d.statut_colis, tone: 'teal' };
}

export function GuichetSection({ point, nomsPays }: { point: PointRelais; nomsPays: Record<string, string> }) {
  const [trajets, setTrajets] = useState<Trajet[] | null>(null);
  const [dossiers, setDossiers] = useState<DossierGuichet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filtreVille, setFiltreVille] = useState('');
  const [filtrePoids, setFiltrePoids] = useState('');
  const [filtreAvant, setFiltreAvant] = useState('');
  const [aConfier, setAConfier] = useState<Trajet | null>(null);
  const [detail, setDetail] = useState<Trajet | null>(null);
  const [tri, setTri] = useState<Tri>('depart');
  const [pageTrajets, setPageTrajets] = useState(0);
  const [pageDossiers, setPageDossiers] = useState(0);
  const [aEncaisser, setAEncaisser] = useState<AEncaisser | null>(null);
  const [chat, setChat] = useState<DossierGuichet | null>(null);
  const [code, setCode] = useState<DossierGuichet | null>(null);
  const [carte, setCarte] = useState<DossierCarte | null>(null);
  const [nonLus, setNonLus] = useState<Record<string, number>>({});

  function charger() {
    supabase.rpc('admin_pr_trajets', { p_point_id: point.id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); setTrajets([]); return; }
      setTrajets((data ?? []) as Trajet[]);
    });
    supabase.rpc('admin_pr_dossiers_guichet', { p_point_id: point.id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); setDossiers([]); return; }
      setDossiers((data ?? []) as DossierGuichet[]);
    });
    chargerNonLus();
  }
  function chargerNonLus() {
    supabase.rpc('admin_pr_chats_non_lus', { p_point_id: point.id }).then(({ data }) => {
      setNonLus(Object.fromEntries(((data ?? []) as { demande_id: string; non_lus: number }[]).map((x) => [x.demande_id, x.non_lus])));
    });
  }
  // Nouveaux messages des voyageurs : badges rafraichis chaque minute.
  useEffect(() => {
    const t = window.setInterval(chargerNonLus, 60_000);
    return () => window.clearInterval(t);
  }, [point.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTrajets(null); setDossiers(null); charger(); }, [point.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const villesArrivee = useMemo(() => [...new Set((trajets ?? []).map((t) => t.ville_arrivee))].sort((a, b) => a.localeCompare(b, 'fr')), [trajets]);
  const visibles = useMemo(() => (trajets ?? []).filter((t) => {
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
  }), [trajets, filtreVille, filtrePoids, filtreAvant, tri]);
  // Retour a la premiere page des qu'un filtre ou le tri change.
  useEffect(() => { setPageTrajets(0); }, [filtreVille, filtrePoids, filtreAvant, tri, point.id]);
  const trajetsPage = visibles.slice(pageTrajets * TRAJETS_PAR_PAGE, (pageTrajets + 1) * TRAJETS_PAR_PAGE);

  async function encaisserMaintenant(demandeId: string) {
    const { data } = await supabase.rpc('admin_pr_a_encaisser', { p_point_id: point.id });
    const item = ((data ?? []) as AEncaisser[]).find((i) => i.demande_id === demandeId);
    if (item) setAEncaisser(item);
  }

  // Le client prefere la carte au moment d'encaisser : le dossier change de moyen, puis le lien s'affiche.
  async function passerCarte(item: AEncaisser) {
    const { error: e } = await supabase.rpc('admin_pr_changer_moyen_guichet', { p_demande_id: item.demande_id, p_moyen: 'carte' });
    if (e) { setError(e.message); return; }
    const d = (dossiers ?? []).find((x) => x.demande_id === item.demande_id);
    setAEncaisser(null);
    setCarte({
      demande_id: item.demande_id, reference: item.reference, client_nom: d?.client_nom ?? item.expediteur_nom ?? 'le client',
      client_telephone: d?.client_telephone ?? '', montant_eur: item.montant_eur, montant_local: item.montant_local, devise: item.devise,
    });
    charger();
  }

  const enCours = (dossiers ?? []).filter((d) => !['livre', 'annule'].includes(d.statut_colis));

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>Guichet</h3>
          <p className="hint">Un client vous confie un colis : choisissez un voyageur qui part de <strong>{nomsPays[point.pays_code.trim()] ?? point.pays_code}</strong>. La demande part au nom de « Point relais Wonjo - {point.ville} ».</p>
        </div>
      </div>
      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {error && <p className="page-error">{error}</p>}

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
      </div>
      {trajets && <p className="pr-compteur"><strong>{visibles.length}</strong> trajet{visibles.length > 1 ? 's' : ''} disponible{visibles.length > 1 ? 's' : ''}{visibles.length !== trajets.length ? ` sur ${trajets.length}` : ''}</p>}
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
              <div className="pr-ligne"><span className="pr-libelle">Place</span><span><strong>{Number(t.kilos_disponibles).toLocaleString('fr-FR')} kg</strong> · {Number(t.prix_par_kilo).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €/kg</span></div>
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
              {!t.porteur_payable && <p className="hint" style={{ color: 'var(--badge-amber-fg)' }}>Ce voyageur ne peut pas être payé (pas de point à l'arrivée, pas de compte Stripe).</p>}
              <button className="btn btn-primary pr-action" disabled={!t.porteur_payable} onClick={(e) => { e.stopPropagation(); setMessage(null); setAConfier(t); }}>Confier un colis</button>
            </article>
          ))}
        </div>
      )}
      <Pagination page={pageTrajets} total={visibles.length} taille={TRAJETS_PAR_PAGE} onPage={setPageTrajets} unite="trajets" />

      <div className="pr-entete" style={{ marginTop: 28 }}>
        <div><h3>Dossiers du guichet</h3><p className="hint">Les colis confiés par vos clients, du paiement à la livraison.</p></div>
      </div>
      {!dossiers ? <p className="loading-state">Chargement…</p> : enCours.length === 0 ? (
        <div className="empty-state">Aucun dossier en cours.</div>
      ) : (
        <div className="pr-table">
          {enCours.slice(pageDossiers * DOSSIERS_PAR_PAGE, (pageDossiers + 1) * DOSSIERS_PAR_PAGE).map((d) => {
            const s = statutDossier(d);
            return (
              <div key={d.demande_id} className="pr-table-ligne">
                <span className="pr-ref">#{d.reference}</span>
                <div>
                  <strong>{d.client_nom}</strong><span className="hint"> → {d.destinataire_nom}{d.destinataire_ville ? `, ${d.destinataire_ville}` : ''}</span>
                  {['remis_porteur', 'en_transit', 'arrive'].includes(d.statut_colis) && (
                    <div className="pr-contact-dest">
                      <a href={`tel:${d.destinataire_telephone.replace(/[^\d+]/g, '')}`}>Appeler</a>
                      <a href={lienWhatsApp(d, point)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    </div>
                  )}
                </div>
                <span className="hint">{d.trajet}{d.porteur_nom ? ` · ${d.porteur_nom}` : ''}</span>
                <strong>{montantLocal(d.montant_local, d.devise)}</strong>
                <Badge tone={s.tone}>{s.texte}</Badge>
                {!d.paiement_valide_at && d.statut_colis === 'en_attente'
                  ? (d.moyen_choisi === 'carte'
                    ? <button className="btn btn-soft btn-sm" onClick={() => { setMessage(null); setCarte(d); }}>Lien carte</button>
                    : <button className="btn btn-soft btn-sm" onClick={() => encaisserMaintenant(d.demande_id)}>Encaisser</button>)
                  : d.statut_colis === 'arrive'
                  ? <button className="btn btn-primary btn-sm" onClick={() => setCode(d)}>Saisir le code</button>
                  : (
                    <button className="btn btn-soft btn-sm" onClick={() => setChat(d)}>
                      Messages{nonLus[d.demande_id] ? <span className="pr-badge-non-lu">{nonLus[d.demande_id]}</span> : null}
                    </button>
                  )}
              </div>
            );
          })}
        </div>
      )}

      <Pagination page={pageDossiers} total={enCours.length} taille={DOSSIERS_PAR_PAGE} onPage={setPageDossiers} unite="dossiers" />

      {detail && (
        <TrajetDetailModal trajet={detail} onClose={() => setDetail(null)}
          onConfier={() => { const t = detail; setDetail(null); setMessage(null); setAConfier(t); }} />
      )}
      {aConfier && (
        <ConfierModal point={point} trajet={aConfier} nomsPays={nomsPays} onClose={() => setAConfier(null)}
          onCree={(r, encaisser) => {
            setAConfier(null);
            setMessage(r.moyen === 'carte'
              ? `Demande #${r.reference} envoyée au voyageur au nom du point : ${montantEuros(r.montant_eur)} à payer par carte.`
              : `Demande #${r.reference} envoyée au voyageur au nom du point : ${montantLocal(r.montant_local, r.devise)} à encaisser.`);
            charger();
            if (encaisser && r.moyen === 'carte') {
              setCarte({ demande_id: r.demande_id, reference: r.reference, client_nom: r.client_nom, client_telephone: r.client_telephone,
                         montant_eur: r.montant_eur, montant_local: r.montant_local, devise: r.devise });
            } else if (encaisser) encaisserMaintenant(r.demande_id);
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
        <ValidationModal point={point} item={aEncaisser} onClose={() => setAEncaisser(null)}
          onValide={(texte) => { setAEncaisser(null); setMessage(texte); charger(); }}
          onCarte={() => passerCarte(aEncaisser)} />
      )}
      {carte && (
        <LienCarteModal point={point} dossier={carte}
          onClose={() => { setCarte(null); charger(); }}
          onPaye={(texte) => { setCarte(null); setMessage(texte); charger(); }}
          onAutrement={() => { const id = carte.demande_id; setCarte(null); charger(); encaisserMaintenant(id); }} />
      )}
    </div>
  );
}

// Message WhatsApp pre-redige au destinataire : pas de fournisseur SMS, l'agent l'envoie depuis son telephone.
function lienWhatsApp(d: DossierGuichet, point: PointRelais): string {
  const texte = `Bonjour ${d.destinataire_nom}, c'est le point relais Wonjo de ${point.ville}. Votre colis de la part de ${d.client_nom} `
    + `voyage avec ${d.porteur_nom ?? 'un voyageur Wonjo'} (${d.trajet ?? ''}). À la remise, le voyageur vous donnera un code à 4 chiffres : `
    + `envoyez-le-nous ici pour confirmer la réception. Merci !`;
  return `https://wa.me/${d.destinataire_telephone.replace(/\D/g, '')}?text=${encodeURIComponent(texte)}`;
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
  const [clientTel, setClientTel] = useState('');
  const [destNom, setDestNom] = useState('');
  const [destTel, setDestTel] = useState('');
  const [destVille, setDestVille] = useState(trajet.ville_arrivee);
  const [description, setDescription] = useState('');
  const [poids, setPoids] = useState('');
  const [natures, setNatures] = useState<string[]>([]);
  const [valeur, setValeur] = useState('');
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

  const poidsNum = Number(poids.replace(',', '.'));
  const valeurNum = Number(valeur.replace(',', '.'));
  // Numero complet au format de son pays (nombre exact de chiffres).
  const etape1Ok = clientNom.trim().length >= 2 && numeroComplet(decomposerNumero(clientTel, point.pays_code.trim()).iso, clientTel);
  const etape2Ok = destNom.trim().length >= 2 && numeroComplet(decomposerNumero(destTel, trajet.pays_arrivee_code.trim()).iso, destTel);
  const poidsOk = Number.isFinite(poidsNum) && poidsNum > 0 && poidsNum <= trajet.kilos_disponibles;
  const valeurOk = Number.isFinite(valeurNum) && valeurNum > 0 && valeurNum <= VALEUR_DECLAREE_MAX;
  const etape3Ok = description.trim().length >= 3 && natures.length > 0 && poidsOk && valeurOk && interdits;
  // Estimation seulement (prix du voyageur + 10 %) : le montant exact, frais de protection compris, vient du serveur.
  // Frais de la valeur declaree : meme bareme que l'app, lu sur le serveur (apercu ; le montant exact est fige a l'envoi).
  const fraisValeur = valeurOk ? fraisProtection(valeurNum, bareme) : 0;
  const baseEur = poidsOk ? Math.round(trajet.prix_par_kilo * poidsNum * 100) / 100 : null;
  const serviceEur = baseEur != null ? Math.round(baseEur * 0.1 * 100) / 100 : 0;
  const estimationEur = baseEur != null ? Math.round((baseEur + serviceEur + fraisValeur) * 100) / 100 : null;
  const poidsTrop = !!poids && Number.isFinite(poidsNum) && poidsNum > trajet.kilos_disponibles;
  const cfa = point.devise === 'XOF' || point.devise === 'XAF';

  async function envoyer() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await supabase.rpc('admin_pr_confier_colis', {
      p_point_id: point.id,
      p_annonce_id: trajet.annonce_id,
      p_client: { nom: clientNom.trim(), telephone: clientTel },
      p_destinataire: { nom: destNom.trim(), telephone: destTel, ville: destVille.trim() },
      p_colis: { description: description.trim(), poids_kg: poidsNum, nature_contenu: natures.join(', '), valeur_declaree: valeurNum, fragile },
      p_moyen: moyen,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setCree({ ...(data as Cree), moyen, client_nom: clientNom.trim(), client_telephone: clientTel });
  }

  if (cree) {
    return (
      <Modal onClose={() => onCree(cree, false)}>
        <h2 className="modal-title">Demande envoyée #{cree.reference}</h2>
        <div className="modal-body">
          <div className="pr-a-recevoir">
            <span>{cree.moyen === 'carte' ? `À payer par carte par ${clientNom.trim()}` : `À encaisser auprès de ${clientNom.trim()}`}</span>
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
      <div className="modal-body">
        <ol className="pr-etapes" aria-label="Étapes">
          {['Client', 'Destinataire', 'Colis'].map((l, i) => (
            <li key={l} className={etape === i + 1 ? 'active' : etape > i + 1 ? 'faite' : ''}><span>{i + 1}</span>{l}</li>
          ))}
        </ol>

        {etape === 1 && (
          <div className="form-grid">
            <p className="hint">La personne qui vous confie le colis et vous paie.</p>
            <div className="field-row">
              <label>Nom complet<input type="text" value={clientNom} onChange={(e) => setClientNom(e.target.value)} placeholder="Ex. Aissatou Ba" autoFocus /></label>
              <label>Téléphone<ChampTelephone valeur={clientTel} onChange={setClientTel} pays={point.pays_code.trim()} nomsPays={nomsPays} ariaLabel="Téléphone du client" /></label>
            </div>
          </div>
        )}

        {etape === 2 && (
          <div className="form-grid">
            <p className="hint">La personne qui récupère le colis à l'arrivée : le voyageur lui donnera le code de livraison à la remise.</p>
            <div className="field-row">
              <label>Nom complet<input type="text" value={destNom} onChange={(e) => setDestNom(e.target.value)} placeholder="Ex. Koffi Yao" autoFocus /></label>
              <label>Téléphone<ChampTelephone valeur={destTel} onChange={setDestTel} pays={trajet.pays_arrivee_code.trim()} nomsPays={nomsPays} ariaLabel="Téléphone du destinataire" /></label>
            </div>
            <label>Ville<input type="text" value={destVille} onChange={(e) => setDestVille(e.target.value)} /></label>
          </div>
        )}

        {etape === 3 && (
          <div className="form-grid">
            <div className="field-row">
              <label>Poids (kg, {Number(trajet.kilos_disponibles).toLocaleString('fr-FR')} kg disponibles)
                <input type="text" inputMode="decimal" value={poids} onChange={(e) => setPoids(e.target.value)} className={poids && !poidsOk ? 'champ-invalide' : ''} placeholder="Ex. 3" autoFocus />
                {poidsTrop && <span className="pr-erreur-champ">Il ne reste que {Number(trajet.kilos_disponibles).toLocaleString('fr-FR')} kg sur ce trajet : on ne peut pas dépasser.</span>}
                {!!poids && Number.isFinite(poidsNum) && poidsNum <= 0 && <span className="pr-erreur-champ">Indiquez un poids supérieur à 0.</span>}
              </label>
              <label>Valeur déclarée (€, {VALEUR_DECLAREE_MAX} € max)
                <input type="text" inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} className={valeur && !valeurOk ? 'champ-invalide' : ''} placeholder="Ex. 40" />
                {!!valeur && Number.isFinite(valeurNum) && valeurNum > VALEUR_DECLAREE_MAX && <span className="pr-erreur-champ">La valeur déclarée ne peut pas dépasser {VALEUR_DECLAREE_MAX} €.</span>}
              </label>
            </div>
            {bareme?.actif && (
              <div className="pr-frais-valeur">
                {valeurOk && fraisValeur > 0 ? (
                  <p><strong>Frais de valeur déclarée : + {montantEuros(fraisValeur)}</strong> <span>({pourcent(fraisValeur / valeurNum)} de la valeur déclarée, ajoutés au total du client)</span></p>
                ) : valeurOk ? (
                  <p><strong>Aucun frais</strong> <span>jusqu'à {bareme.seuil1.toLocaleString('fr-FR')} € de valeur déclarée</span></p>
                ) : (
                  <p><strong>Frais de valeur déclarée</strong> <span>calculés dès que la valeur est saisie</span></p>
                )}
                <small>Barème : aucun frais jusqu'à {bareme.seuil1.toLocaleString('fr-FR')} € · {pourcent(bareme.taux1)} de la part entre {bareme.seuil1.toLocaleString('fr-FR')} et {bareme.seuil2.toLocaleString('fr-FR')} € · {pourcent(bareme.taux2)} au-delà de {bareme.seuil2.toLocaleString('fr-FR')} €.</small>
              </div>
            )}
            <label>Description<input type="text" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="Ex. Tissus wax et chaussures" /></label>
            <div>
              <strong style={{ fontSize: 13 }}>Nature du contenu</strong>
              <div style={{ marginTop: 6 }}>
                <ChampMultiChoix groupes={NATURES} valeur={natures} onChange={setNatures} ariaLabel="Nature du contenu"
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
            <label style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, fontWeight: 600 }}>
              <input type="checkbox" checked={interdits} onChange={(e) => setInterdits(e.target.checked)} style={{ marginTop: 3 }} />
              <span>J'ai vérifié le contenu avec le client : aucun objet interdit, conforme à la description.</span>
            </label>
            {estimationEur != null && (
              <div className="insight-banner">
                <div>
                  <strong>Estimation : {cfa && moyen !== 'carte' ? `≈ ${Math.ceil(estimationEur * TAUX_CFA).toLocaleString('fr-FR')} ${libelleDevise(point.devise)}` : `≈ ${estimationEur.toLocaleString('fr-FR')} €`}</strong>
                  <span>
                    Prix du voyageur {montantEuros(baseEur)} + frais de service 10 % {montantEuros(serviceEur)}
                    {fraisValeur > 0 ? ` + valeur déclarée ${montantEuros(fraisValeur)}` : ''}. Le montant exact s'affiche à l'envoi.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="page-error" style={{ marginTop: 12 }}>{error}</p>}
        <div className="action-row" style={{ justifyContent: 'space-between', marginTop: 16 }}>
          <button className="btn" onClick={() => (etape === 1 ? onClose() : setEtape(etape - 1))} disabled={busy}>{etape === 1 ? 'Annuler' : 'Retour'}</button>
          {etape < 3
            ? <button className="btn btn-primary" disabled={etape === 1 ? !etape1Ok : !etape2Ok} onClick={() => setEtape(etape + 1)}>Continuer</button>
            : <button className="btn btn-primary" disabled={busy || !etape3Ok} onClick={envoyer}>{busy ? 'Envoi…' : 'Envoyer la demande au voyageur'}</button>}
        </div>
      </div>
    </Modal>
  );
}
