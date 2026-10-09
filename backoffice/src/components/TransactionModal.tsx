import { decimales } from '../lib/nombre';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { chargerFicheTransaction } from '../lib/ficheTransaction';
import { Avatar } from './Avatar';
import { NumeroTelephone } from './NumeroTelephone';
import { ConversationTransaction } from './ConversationTransaction';
import { Modal } from './Modal';
import { IconClose } from './Icons';
import { useFicheCompte } from './FicheCompte';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutModerer, peutVoirRevenus } from '../lib/permissions';
import { LABELS_TYPE_DOCUMENT, LABELS_TYPE_ENVOI, dateHeure, libellesEvenement, premierMot } from '../lib/labels';
import type { EvenementTimeline, FicheTransaction, MargeTransaction, PhotoConstat } from '../lib/types';

interface EvenementAffiche { cle: string; label: string; date: string; role: string | null; photo?: PhotoConstat }

// Reconstitue la machine a etat en fusionnant les jalons (colonnes de la
// demande, toujours presents), le journal_confiance (litiges/resolutions) et
// les constats photo (remise/livraison/restitution, table `constats`).
function construireTimeline(f: FicheTransaction, photos: PhotoConstat[], libelles: Record<string, string>): EvenementAffiche[] {
  const jalons: EvenementAffiche[] = [
    { cle: 'creee', label: libelles.creee, date: f.created_at, role: 'expediteur' },
    f.accepte_at && { cle: 'acceptee', label: libelles.acceptee, date: f.accepte_at, role: 'porteur' },
    f.code_genere_at && { cle: 'code_genere', label: libelles.code_genere, date: f.code_genere_at, role: null },
    f.arrive_at && { cle: 'arrivee', label: libelles.arrivee, date: f.arrive_at, role: 'porteur' },
    f.conteste_at && { cle: 'contestee', label: libelles.contestee, date: f.conteste_at, role: null },
    f.livre_at && { cle: 'livree', label: libelles.livree, date: f.livre_at, role: null },
  ].filter(Boolean) as EvenementAffiche[];

  const evenementsJournal: EvenementAffiche[] = (f.timeline ?? [])
    .filter((e: EvenementTimeline) => !['declaration_expediteur'].includes(e.type)) // deja couvert par "creee"
    .map((e: EvenementTimeline, i: number) => ({
      cle: `journal-${i}`,
      label: libelles[e.type] ?? e.type.replace(/_/g, ' '),
      date: e.created_at,
      role: e.role,
    }));

  const evenementsPhoto: EvenementAffiche[] = photos.map((p) => ({
    cle: `photo-${p.id}`,
    label: libelles[p.type] ?? p.type.replace(/_/g, ' '),
    date: p.created_at,
    role: p.confirmed_by === f.expediteur_id ? 'expediteur' : p.confirmed_by === f.porteur_id ? 'porteur' : null,
    photo: p,
  }));

  return [...jalons, ...evenementsJournal, ...evenementsPhoto].sort((a, b) => a.date.localeCompare(b.date));
}

export function TransactionModal({ demandeId, onClose }: { demandeId: string; onClose: () => void }) {
  const [f, setF] = useState<FicheTransaction | null>(null);
  const [photos, setPhotos] = useState<PhotoConstat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoOuverte, setPhotoOuverte] = useState<PhotoConstat | null>(null);
  const { ouvrir, modal } = useFicheCompte();
  const { roles } = useAuth();
  const voitMarge = peutVoirRevenus(roles);
  // [355] La finance lit la fiche sans la conversation, la fiche des comptes ni le numero complet.
  const moderateur = peutModerer(roles);
  // undefined : en cours ; null : pas de paiement, donc pas de marge.
  const [marge, setMarge] = useState<MargeTransaction | null | undefined>(undefined);

  useEffect(() => {
    if (!voitMarge) return;
    let actif = true;
    supabase.rpc('admin_marges_transactions', { p_ids: [demandeId] }).then(({ data }) => {
      if (actif) setMarge(((data ?? []) as MargeTransaction[])[0] ?? null);
    });
    return () => { actif = false; };
  }, [demandeId, voitMarge]);

  useEffect(() => {
    // Preche au survol du bouton "Fiche" (lib/ficheTransaction) : souvent
    // deja en cache a l'ouverture. La fiche s'affiche des que la RPC repond ;
    // les photos (fonction Edge, plus lente) arrivent ensuite.
    let actif = true;
    const { fiche, photos: photosP } = chargerFicheTransaction(demandeId);
    fiche.then((data) => { if (actif) setF(data); }, (e: Error) => { if (actif) setError(e.message); });
    photosP.then((p) => { if (actif) setPhotos(p); });
    return () => { actif = false; };
  }, [demandeId]);

  if (error) return <Modal onClose={onClose}><p className="page-error" style={{ margin: 24 }}>{error}</p></Modal>;
  if (!f) return <Modal onClose={onClose}><p className="loading-state" style={{ margin: 24 }}>Chargement…</p></Modal>;

  // Prenom renvoye separement par la RPC (243) : le prenom entier tel que
  // saisi par la personne, meme compose ("Marthe Djininga") - contrairement
  // a un decoupage du nom complet sur le premier espace, qui coupait ces
  // prenoms en deux.
  const prenomExpediteur = f.expediteur_prenom || 'l\'expéditeur';
  const prenomPorteur = f.porteur_prenom || 'le voyageur';
  const libelles = libellesEvenement(prenomExpediteur, prenomPorteur);
  const exp = <span className="nom-chip nom-chip--exp">{premierMot(prenomExpediteur)}</span>;
  const enveloppes = f.type_envoi === 'document';
  const plusieurs = (f.nb_enveloppes ?? 0) > 1;
  const objet = enveloppes
    ? (plusieurs ? { indefini: 'des enveloppes', defini: 'les enveloppes' } : { indefini: 'une enveloppe', defini: 'l\'enveloppe' })
    : { indefini: 'un colis', defini: 'le colis' };
  const por = <span className="nom-chip nom-chip--por">{premierMot(prenomPorteur)}</span>;
  const timeline = photos ? construireTimeline(f, photos, libelles) : [];
  const roleLabel = (role: string | null) => (role === 'expediteur' ? (f.expediteur_nom ?? 'Expéditeur') : role === 'porteur' ? (f.porteur_nom ?? 'Voyageur') : null);

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-hero">
        <div style={{ minWidth: 0, width: '100%' }}>
          <div className="modal-hero-people">
            <div className="modal-hero-party">
              <span className="modal-hero-role">Expéditeur</span>
              <button type="button" className="modal-hero-chip" onClick={() => ouvrir(f.expediteur_id)} disabled={!moderateur}>
                <Avatar src={f.expediteur_photo} nom={f.expediteur_nom ?? ''} size={28} /> {premierMot(prenomExpediteur)}
              </button>
              <span className="modal-hero-addr">RDV départ · {f.lieu_remise_reception ?? 'non renseigné'}</span>
              <span className="modal-hero-addr">{moderateur ? <NumeroTelephone userId={f.expediteur_id} numero={f.expediteur_telephone} /> : (f.expediteur_telephone ?? '-')}</span>
            </div>
            <div className="modal-hero-party modal-hero-party--dest">
              <span className="modal-hero-role">Voyageur</span>
              <button type="button" className="modal-hero-chip" onClick={() => ouvrir(f.porteur_id)} disabled={!moderateur}>
                <Avatar src={f.porteur_photo} nom={f.porteur_nom ?? ''} size={28} /> {premierMot(prenomPorteur)}
              </button>
              <span className="modal-hero-addr">RDV arrivée · {f.lieu_remise_livraison ?? 'non renseignée'}</span>
              <span className="modal-hero-addr">{moderateur ? <NumeroTelephone userId={f.porteur_id} numero={f.porteur_telephone} /> : (f.porteur_telephone ?? '-')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-body modal-body--serre">
        <div className="stats-row stats-row--compact">
          <div className="stat"><strong>{LABELS_TYPE_ENVOI[f.type_envoi ?? ''] ?? f.type_envoi ?? '-'}</strong><span>Type d'envoi</span></div>
          <div className="stat"><strong>{f.poids_kg ?? '-'} kg</strong><span>Poids</span></div>
          <div className="stat"><strong>{f.service_fee != null ? `${decimales(Number(f.service_fee), 2)} €` : '-'}</strong><span>Commission Wonjo</span></div>
          <div className="stat"><strong>{f.code_genere ? 'Oui' : 'Non'}</strong><span>Code livraison</span></div>
        </div>

        {voitMarge && marge !== undefined && (
          <div className="info-rows">
            <div className="info-row">
              <span className="info-row-label">Marge Wonjo</span>
              <span className="info-row-value">
                {marge === null ? 'Aucun paiement encaissé : pas de marge.' : (
                  <>
                    <strong>{decimales(Number(marge.marge_nette), 2)} €</strong>
                    {f.statut_paiement === 'rembourse'
                      ? ' - perte : remboursé, Stripe garde ses frais'
                      : ` = commission ${decimales(Number(marge.commission), 2)} € + protection ${decimales(Number(marge.protection), 2)} € - frais Stripe ${decimales(Number(marge.stripe), 2)} €`}
                    {' '}<span className="hint">({marge.stripe_reel ? 'frais réels' : 'frais estimés'})</span>
                  </>
                )}
              </span>
            </div>
          </div>
        )}

        <div className="info-rows">
          <div className="info-row">
            <span className="info-row-label">Origine</span>
            <span className="info-row-value">
              {f.origine === 'annonce' ? <>{exp} a demandé à envoyer {objet.indefini} sur le trajet de {por}</>
                : f.origine === 'offre_colis' ? <>{por} a proposé de transporter {objet.defini} de {exp}</>
                : 'Inconnue'}
            </span>
          </div>
          <div className="info-row">
            <span className="info-row-label">Contenu</span>
            <span className="info-row-value info-row-tags">{(() => {
              if (f.type_envoi === 'document') {
                const types = (f.type_document ?? '').split(',').filter(Boolean).map((k) => LABELS_TYPE_DOCUMENT[k] ?? k);
                const n = f.nb_enveloppes ?? 0;
                return <>
                  <span>{n} enveloppe{n > 1 ? 's' : ''}{types.length > 0 && ' :'}</span>
                  {types.map((t) => <span key={t} className="tag-chip">{t}</span>)}
                </>;
              }
              const natures = (f.nature_contenu ?? '').split(',').map((x) => x.trim()).filter(Boolean);
              if (natures.length === 0) return 'Non précisé';
              return natures.map((n) => <span key={n} className="tag-chip">{n.charAt(0).toUpperCase() + n.slice(1)}</span>);
            })()}</span>
          </div>
        </div>

        <div className="info-card">
          <p className="section-title">Suivi de la transaction {photos && photos.length > 0 && <span className="hint">: cliquez sur une étape avec photo pour l'agrandir</span>}</p>
          {!photos && <p className="loading-state">Chargement du suivi…</p>}
          <ul className="stepper-vertical">
            {timeline.map((e, i) => (
              <li key={e.cle} className={`stepper-vertical-item ${e.photo ? 'stepper-vertical-item--photo' : ''}`}>
                <span className="stepper-vertical-marker">
                  <span className="stepper-vertical-dot">{e.photo && <img src={e.photo.url} alt="" />}</span>
                  {i < timeline.length - 1 && <span className="stepper-vertical-line" />}
                </span>
                {e.photo ? (
                  <button type="button" className="stepper-vertical-body" onClick={() => setPhotoOuverte(e.photo!)}>
                    <span className="stepper-vertical-label">{e.label}</span>
                    <span className="timeline-meta">{dateHeure(e.date)}</span>
                  </button>
                ) : (
                  <div className="stepper-vertical-body">
                    <span className="stepper-vertical-label">{e.label}</span>
                    <span className="timeline-meta">{dateHeure(e.date)}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {moderateur && <ConversationTransaction demandeId={f.id} />}

        {/* [297] URL fournie a l'origine par le membre : jamais un lien si
            elle n'est pas en https (un "javascript:" s'executerait au clic,
            React 18 ne le bloque pas). Verrouillee aussi cote serveur. */}
        {f.photo_colis_url && /^https:\/\//i.test(f.photo_colis_url) && (
          <div>
            <p className="section-title">Photo du colis (à la publication)</p>
            <a href={f.photo_colis_url} target="_blank" rel="noopener noreferrer">
              <img src={f.photo_colis_url} alt="Colis" style={{ width: '100%', maxWidth: 220, borderRadius: 12, border: '1px solid var(--border)' }} />
            </a>
          </div>
        )}
      </div>

      {photoOuverte && createPortal(
        <div className="photo-lightbox" onClick={() => setPhotoOuverte(null)}>
          <button className="modal-close on-surface" onClick={() => setPhotoOuverte(null)} aria-label="Fermer"><IconClose /></button>
          <div className="photo-lightbox-body" onClick={(e) => e.stopPropagation()}>
            <img src={photoOuverte.url} alt={libelles[photoOuverte.type] ?? photoOuverte.type} />
            <div className="photo-lightbox-meta">
              <strong>{libelles[photoOuverte.type] ?? photoOuverte.type}</strong>
              <span>Soumise par {roleLabel(photoOuverte.confirmed_by === f.expediteur_id ? 'expediteur' : 'porteur') ?? 'un utilisateur'} · {dateHeure(photoOuverte.created_at)}</span>
              {photoOuverte.notes && <span>« {photoOuverte.notes} »</span>}
            </div>
          </div>
        </div>,
        document.body,
      )}
      {modal}
    </Modal>
  );
}
