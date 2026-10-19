import { Modal } from '../Modal';
import { Badge } from '../Badge';
import { Avatar } from '../Avatar';
import { Drapeau } from '../Drapeau';
import { dateCourte, montantEuros } from '../../lib/pointsRelais';
import type { Trajet } from './GuichetSection';

// Detail d'un trajet depuis le guichet, comme la fiche d'une annonce dans l'app : l'itineraire, les dates, le prix, la place,
// le voyageur et ce que couterait un colis au client (prix du voyageur + 10 % ; frais de valeur declaree en plus, voir
// « Confier un colis »). Les donnees sont celles de la liste (admin_pr_trajets).

function joursAvant(iso: string): string {
  const h = (new Date(iso).getTime() - Date.now()) / 3600000;
  if (h < 0) return 'déjà parti';
  if (h < 24) return `dans ${Math.max(1, Math.round(h))} h`;
  const j = Math.round(h / 24);
  return `dans ${j} jour${j > 1 ? 's' : ''}`;
}

export function TrajetDetailModal({ trajet: t, onClose, onConfier }: { trajet: Trajet; onClose: () => void; onConfier: () => void }) {
  const exemples = [1, 5, 10].filter((kg) => kg <= t.kilos_disponibles);
  if (exemples.length === 0) exemples.push(Math.max(0.5, Math.floor(t.kilos_disponibles * 10) / 10));
  const prix = (kg: number) => Math.round(Number(t.prix_par_kilo) * kg * 1.1 * 100) / 100;
  return (
    <Modal onClose={onClose} wide>
      <h2 className="modal-title">Détail du trajet</h2>
      <div className="modal-body">
        <div className="pr-detail-route">
          <span><Drapeau iso={t.pays_depart_code} /> {t.ville_depart}</span>
          <span className="pr-trajet-fleche" aria-hidden="true" />
          <span><Drapeau iso={t.pays_arrivee_code} /> {t.ville_arrivee}</span>
        </div>
        <p className="hint" style={{ marginTop: 4 }}>
          Départ {dateCourte(t.depart)} ({joursAvant(t.depart)}){t.date_arrivee ? ` · arrivée prévue le ${new Date(t.date_arrivee).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}
        </p>

        <div className="pr-detail-grille">
          <div><span>Prix au kilo</span><strong>{montantEuros(Number(t.prix_par_kilo))}</strong></div>
          <div><span>Place disponible</span><strong>{Number(t.kilos_disponibles).toLocaleString('fr-FR')} kg</strong></div>
          <div><span>Documents</span><strong>{t.accepte_documents ? 'Acceptés' : 'Non acceptés'}</strong></div>
        </div>

        <div className="pr-detail-bloc">
          <h3>Voyageur</h3>
          <div className="pr-voyageur">
            <Avatar src={t.porteur_photo} nom={t.porteur_nom} size={44} />
            <div>
              <strong>{t.porteur_nom ?? 'Voyageur'}</strong>
              <span className="hint">
                {t.porteur_verifie ? 'Identité vérifiée' : 'Non vérifié'}
                {t.porteur_livraisons ? ` · ${t.porteur_livraisons} livraison${t.porteur_livraisons > 1 ? 's' : ''}` : ' · nouveau sur Wonjo'}
                {t.porteur_note ? ` · ${Number(t.porteur_note).toFixed(1)}/5` : ''}
              </span>
            </div>
            <Badge tone={t.porteur_payable ? 'green' : 'amber'}>{t.porteur_payable ? 'Paiement du voyageur assuré' : 'Voyageur impossible à payer'}</Badge>
          </div>
          {t.porteur_payable && (
            <p className="hint" style={{ marginTop: 8 }}>
              Après la livraison, le voyageur pourra recevoir sa part : par le point relais du pays d'arrivée, ou par virement sur son compte de paiement.
            </p>
          )}
          {!t.porteur_payable && (
            <p className="hint" style={{ color: 'var(--badge-amber-fg)', marginTop: 8 }}>
              Ce voyageur ne peut pas être payé : pas de point relais dans le pays d'arrivée, et pas de compte de paiement Stripe actif.
            </p>
          )}
        </div>

        <div className="pr-detail-bloc">
          <h3>Ce que paierait votre client</h3>
          <p className="hint">Prix du voyageur + 10 % de frais de service. Les frais de valeur déclarée s'ajoutent au-delà de 50 € (calculés dans « Confier un colis »).</p>
          <div className="pr-detail-exemples">
            {exemples.map((kg) => (
              <div key={kg}><span>{kg.toLocaleString('fr-FR')} kg</span><strong>≈ {montantEuros(prix(kg))}</strong></div>
            ))}
          </div>
        </div>

        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Fermer</button>
          <button className="btn btn-primary" disabled={!t.porteur_payable} onClick={onConfier}>Confier un colis à ce voyageur</button>
        </div>
      </div>
    </Modal>
  );
}
