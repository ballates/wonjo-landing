import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { StatutBadge } from './Badge';
import { Avatar } from './Avatar';
import { Modal } from './Modal';
import { IconClose } from './Icons';
import { useFicheCompte } from './FicheCompte';
import { LABELS_CONSTAT, LABELS_ORIGINE, LABELS_PAIEMENT, LABELS_STATUT_COLIS, LABELS_TYPE_ENVOI, dateHeure, dateSeule } from '../lib/labels';
import type { EvenementTimeline, FicheTransaction, PhotoConstat, TransactionMessage } from '../lib/types';

const LABELS_EVENEMENT: Record<string, string> = {
  creee: 'Demande créée',
  acceptee: 'Acceptée par le porteur',
  code_genere: 'Code de livraison généré',
  arrivee: 'Arrivée déclarée',
  livree: 'Livrée',
  contestee: 'Contestée (litige ouvert)',
  declaration_expediteur: 'Déclaration de l\'expéditeur',
  acceptation_porteur: 'Acceptation du porteur',
  presomption_acceptation: 'Acceptation présumée (délai écoulé)',
  contestation: 'Litige ouvert',
  proposition_resolution: 'Proposition de résolution',
  acceptation_resolution: 'Résolution acceptée',
  refus_resolution: 'Résolution refusée',
  ...LABELS_CONSTAT,
};

interface EvenementAffiche { cle: string; label: string; date: string; role: string | null; photo?: PhotoConstat }

// Reconstitue la machine a etat en fusionnant les jalons (colonnes de la
// demande, toujours presents), le journal_confiance (litiges/resolutions) et
// les constats photo (remise/livraison/restitution, table `constats`).
function construireTimeline(f: FicheTransaction, photos: PhotoConstat[]): EvenementAffiche[] {
  const jalons: EvenementAffiche[] = [
    { cle: 'creee', label: LABELS_EVENEMENT.creee, date: f.created_at, role: 'expediteur' },
    f.accepte_at && { cle: 'acceptee', label: LABELS_EVENEMENT.acceptee, date: f.accepte_at, role: 'porteur' },
    f.code_genere_at && { cle: 'code_genere', label: LABELS_EVENEMENT.code_genere, date: f.code_genere_at, role: null },
    f.arrive_at && { cle: 'arrivee', label: LABELS_EVENEMENT.arrivee, date: f.arrive_at, role: 'porteur' },
    f.conteste_at && { cle: 'contestee', label: LABELS_EVENEMENT.contestee, date: f.conteste_at, role: null },
    f.livre_at && { cle: 'livree', label: LABELS_EVENEMENT.livree, date: f.livre_at, role: null },
  ].filter(Boolean) as EvenementAffiche[];

  const evenementsJournal: EvenementAffiche[] = (f.timeline ?? [])
    .filter((e: EvenementTimeline) => !['declaration_expediteur'].includes(e.type)) // deja couvert par "creee"
    .map((e: EvenementTimeline, i: number) => ({
      cle: `journal-${i}`,
      label: LABELS_EVENEMENT[e.type] ?? e.type.replace(/_/g, ' '),
      date: e.created_at,
      role: e.role,
    }));

  const evenementsPhoto: EvenementAffiche[] = photos.map((p) => ({
    cle: `photo-${p.id}`,
    label: LABELS_CONSTAT[p.type] ?? p.type.replace(/_/g, ' '),
    date: p.created_at,
    role: p.confirmed_by === f.expediteur_id ? 'expediteur' : p.confirmed_by === f.porteur_id ? 'porteur' : null,
    photo: p,
  }));

  return [...jalons, ...evenementsJournal, ...evenementsPhoto].sort((a, b) => a.date.localeCompare(b.date));
}

export function TransactionModal({ demandeId, onClose }: { demandeId: string; onClose: () => void }) {
  const [f, setF] = useState<FicheTransaction | null>(null);
  const [photos, setPhotos] = useState<PhotoConstat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [photoOuverte, setPhotoOuverte] = useState<PhotoConstat | null>(null);
  const [messages, setMessages] = useState<TransactionMessage[] | null>(null);
  const [messagesOuverts, setMessagesOuverts] = useState(false);
  const { ouvrir, modal } = useFicheCompte();

  useEffect(() => {
    supabase.rpc('admin_fiche_transaction', { p_demande_id: demandeId }).single().then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setF(data as FicheTransaction);
    });
    supabase.functions.invoke('admin-photos-transaction', { body: { demandeId } }).then(({ data, error: e }) => {
      if (!e && data?.photos) setPhotos(data.photos as PhotoConstat[]);
    });
    supabase.rpc('admin_messages_transaction', { p_demande_id: demandeId }).then(({ data, error: e }) => {
      if (!e) setMessages((data ?? []) as TransactionMessage[]);
    });
  }, [demandeId]);

  if (error) return <Modal onClose={onClose}><p className="page-error" style={{ margin: 24 }}>{error}</p></Modal>;
  if (!f) return <Modal onClose={onClose}><p className="loading-state" style={{ margin: 24 }}>Chargement…</p></Modal>;

  const timeline = construireTimeline(f, photos);
  const roleLabel = (role: string | null) => (role === 'expediteur' ? (f.expediteur_nom ?? 'Expéditeur') : role === 'porteur' ? (f.porteur_nom ?? 'Porteur') : null);

  return (
    <Modal onClose={onClose} wide>
      <div className="modal-hero">
        <div style={{ minWidth: 0 }}>
          <h2>Transaction</h2>
          <p className="modal-email">{Number(f.montant_total).toFixed(2)} € · créée le {dateSeule(f.created_at)}</p>
          <div className="badges">
            <StatutBadge statut={f.statut_colis} label={LABELS_STATUT_COLIS[f.statut_colis] ?? f.statut_colis} />
            <StatutBadge statut={f.statut_paiement} label={LABELS_PAIEMENT[f.statut_paiement] ?? f.statut_paiement} />
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

        <div>
          <p className="section-title">Origine</p>
          <p className="hint">{f.origine ? (LABELS_ORIGINE[f.origine] ?? f.origine) : 'Origine inconnue'}</p>
        </div>

        <div>
          <p className="section-title">Suivi de la transaction {photos.length > 0 && <span className="hint">· cliquez sur une étape avec photo pour l'agrandir</span>}</p>
          <div className="stepper">
            {timeline.map((e, i) => (
              <button
                type="button"
                key={e.cle}
                className={`stepper-step ${e.photo ? 'stepper-step--photo' : ''}`}
                onClick={e.photo ? () => setPhotoOuverte(e.photo!) : undefined}
                disabled={!e.photo}
              >
                {i < timeline.length - 1 && <div className="stepper-line" />}
                <div className="stepper-dot">{e.photo && <img src={e.photo.url} alt="" />}</div>
                <div className="stepper-label">{e.label}</div>
                <div className="stepper-date">{dateHeure(e.date)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="modal-columns">
          <div className="modal-col">
            <div>
              <p className="section-title">Parties</p>
              <div className="action-row">
                <button className="btn btn-soft btn-sm" onClick={() => ouvrir(f.expediteur_id)}>
                  <Avatar src={f.expediteur_photo} nom={f.expediteur_nom ?? ''} size={18} /> {f.expediteur_nom ?? 'Expéditeur'}
                </button>
                <button className="btn btn-soft btn-sm" onClick={() => ouvrir(f.porteur_id)}>
                  <Avatar src={f.porteur_photo} nom={f.porteur_nom ?? ''} size={18} /> {f.porteur_nom ?? 'Porteur'}
                </button>
              </div>
              <button
                type="button"
                className="btn btn-soft btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => setMessagesOuverts((v) => !v)}
              >
                {messagesOuverts ? 'Masquer' : 'Voir'} les messages{messages ? ` (${messages.length + (f.description_colis ? 1 : 0)})` : ''}
              </button>
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

          <div className="modal-col">
            <p className="section-title">Points de remise</p>
            <div className="chips">
              <span className="chip">Départ : {f.lieu_remise_reception ?? 'non renseigné'}</span>
              <span className="chip">Arrivée : {f.lieu_remise_livraison ?? 'non renseigné'}</span>
            </div>
          </div>
        </div>

        {messagesOuverts && (
          <div>
            <p className="section-title">Messages</p>
            {f.description_colis && (
              <div className="message-bubble">
                <strong>{f.expediteur_nom ?? 'Expéditeur'}</strong>
                <span>{f.description_colis}</span>
                <span className="timeline-meta">Note laissée à la publication</span>
              </div>
            )}
            {messages === null && <p className="hint">Chargement…</p>}
            {messages !== null && messages.length === 0 && !f.description_colis && (
              <p className="hint">Aucun message échangé.</p>
            )}
            {messages?.map((m) => (
              <div key={m.id} className="message-bubble">
                <strong>{roleLabel(m.sender_id === f.expediteur_id ? 'expediteur' : 'porteur') ?? 'Utilisateur'}</strong>
                <span>{m.contenu}</span>
                <span className="timeline-meta">{dateHeure(m.created_at)}{m.edited_at ? ' · modifié' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {photoOuverte && createPortal(
        <div className="photo-lightbox" onClick={() => setPhotoOuverte(null)}>
          <button className="modal-close on-surface" onClick={() => setPhotoOuverte(null)} aria-label="Fermer"><IconClose /></button>
          <div className="photo-lightbox-body" onClick={(e) => e.stopPropagation()}>
            <img src={photoOuverte.url} alt={LABELS_CONSTAT[photoOuverte.type] ?? photoOuverte.type} />
            <div className="photo-lightbox-meta">
              <strong>{LABELS_CONSTAT[photoOuverte.type] ?? photoOuverte.type}</strong>
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
