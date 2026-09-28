import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { Avatar } from './Avatar';
import { NumeroTelephone } from './NumeroTelephone';
import { Modal } from './Modal';
import { IconClose } from './Icons';
import { useFicheCompte } from './FicheCompte';
import { LABELS_TYPE_DOCUMENT, LABELS_TYPE_ENVOI, dateHeure, libellesEvenement, libellesOrigine, premierMot } from '../lib/labels';
import type { EvenementTimeline, FicheTransaction, PhotoConstat } from '../lib/types';

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

  useEffect(() => {
    supabase.rpc('admin_fiche_transaction', { p_demande_id: demandeId }).single().then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setF(data as FicheTransaction);
    });
    // Attendu avant d'afficher le suivi (pas seulement f) : sinon les etapes
    // avec photo (remise/livraison/restitution) apparaissent dans la liste
    // une fois cet appel termine, apres les autres - la liste change de
    // taille sous les yeux de l'admin au lieu de s'afficher complete d'un
    // coup.
    supabase.functions.invoke('admin-photos-transaction', { body: { demandeId } }).then(({ data, error: e }) => {
      setPhotos(!e && data?.photos ? (data.photos as PhotoConstat[]) : []);
    });
  }, [demandeId]);

  if (error) return <Modal onClose={onClose}><p className="page-error" style={{ margin: 24 }}>{error}</p></Modal>;
  if (!f || !photos) return <Modal onClose={onClose}><p className="loading-state" style={{ margin: 24 }}>Chargement…</p></Modal>;

  // Prenom renvoye separement par la RPC (243) : le prenom entier tel que
  // saisi par la personne, meme compose ("Marthe Djininga") - contrairement
  // a un decoupage du nom complet sur le premier espace, qui coupait ces
  // prenoms en deux.
  const prenomExpediteur = f.expediteur_prenom || 'l\'expéditeur';
  const prenomPorteur = f.porteur_prenom || 'le voyageur';
  const libelles = libellesEvenement(prenomExpediteur, prenomPorteur);
  const origines = libellesOrigine(prenomExpediteur, prenomPorteur);
  const timeline = construireTimeline(f, photos, libelles);
  const roleLabel = (role: string | null) => (role === 'expediteur' ? (f.expediteur_nom ?? 'Expéditeur') : role === 'porteur' ? (f.porteur_nom ?? 'Voyageur') : null);

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-hero">
        <div style={{ minWidth: 0, width: '100%' }}>
          <div className="modal-hero-people">
            <div className="modal-hero-party">
              <span className="modal-hero-role">Expéditeur</span>
              <button type="button" className="modal-hero-chip" onClick={() => ouvrir(f.expediteur_id)}>
                <Avatar src={f.expediteur_photo} nom={f.expediteur_nom ?? ''} size={28} /> {premierMot(prenomExpediteur)}
              </button>
              <span className="modal-hero-addr">RDV départ · {f.lieu_remise_reception ?? 'non renseigné'}</span>
              <span className="modal-hero-addr"><NumeroTelephone numero={f.expediteur_telephone} /></span>
            </div>
            <div className="modal-hero-party modal-hero-party--dest">
              <span className="modal-hero-role">Voyageur</span>
              <button type="button" className="modal-hero-chip" onClick={() => ouvrir(f.porteur_id)}>
                <Avatar src={f.porteur_photo} nom={f.porteur_nom ?? ''} size={28} /> {premierMot(prenomPorteur)}
              </button>
              <span className="modal-hero-addr">RDV arrivée · {f.lieu_remise_livraison ?? 'non renseignée'}</span>
              <span className="modal-hero-addr"><NumeroTelephone numero={f.porteur_telephone} /></span>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-body">
        <div className="stats-row">
          <div className="stat"><strong>{LABELS_TYPE_ENVOI[f.type_envoi ?? ''] ?? f.type_envoi ?? '-'}</strong><span>Type d'envoi</span></div>
          <div className="stat"><strong>{f.poids_kg ?? '-'} kg</strong><span>Poids</span></div>
          <div className="stat"><strong>{f.service_fee != null ? `${Number(f.service_fee).toFixed(2)} €` : '-'}</strong><span>Commission Wonjo</span></div>
          <div className="stat"><strong>{f.code_genere ? 'Oui' : 'Non'}</strong><span>Code livraison</span></div>
        </div>

        <p className="section-title-inline"><span className="section-title">Origine :</span> {f.origine ? (origines[f.origine] ?? f.origine) : 'inconnue'}</p>

        <p className="section-title-inline"><span className="section-title">Contenu :</span> {(() => {
          if (f.type_envoi === 'document') {
            const types = (f.type_document ?? '').split(',').filter(Boolean).map((k) => LABELS_TYPE_DOCUMENT[k] ?? k).join(', ');
            const n = f.nb_enveloppes ?? 0;
            return `${n} enveloppe${n > 1 ? 's' : ''}${types ? ` : ${types}` : ''}`;
          }
          return f.nature_contenu ? f.nature_contenu.toLowerCase() : 'non précisé';
        })()}</p>

        <div>
          <p className="section-title">Suivi de la transaction {photos.length > 0 && <span className="hint">: cliquez sur une étape avec photo pour l'agrandir</span>}</p>
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

        {f.photo_colis_url && (
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
