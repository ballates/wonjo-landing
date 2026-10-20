import { Modal } from '../Modal';
import { Avatar } from '../Avatar';
import { Drapeau } from '../Drapeau';
import { useState } from 'react';
import { BasculeUnite, memoriserUnite, uniteMemorisee, type Unite } from '../BasculeUnite';
import { dateCourte, equivalentLocal, libelleDevise, montantEuros, texteTaux, useTauxEuro } from '../../lib/pointsRelais';
import type { Trajet } from './GuichetSection';

// Detail d'un trajet depuis le guichet, comme la fiche d'une annonce dans l'app : l'itineraire, les dates, le prix, la place,
// le voyageur. L'estimation du prix pour un colis se fait dans « Confier un colis ». Les donnees sont celles de la liste (admin_pr_trajets).

function joursAvant(iso: string): string {
  const h = (new Date(iso).getTime() - Date.now()) / 3600000;
  if (h < 0) return 'déjà parti';
  if (h < 24) return `dans ${Math.max(1, Math.round(h))} h`;
  const j = Math.round(h / 24);
  return `dans ${j} jour${j > 1 ? 's' : ''}`;
}

export function TrajetDetailModal({ trajet: t, devise, onClose, onConfier }: { trajet: Trajet; devise: string; onClose: () => void; onConfier: () => void }) {
  // Bascule € / monnaie du point : un seul montant affiché à la fois (le choix est partagé avec « Confier un colis »).
  const { taux } = useTauxEuro(devise);
  const [unite, setUnite] = useState<Unite>(uniteMemorisee);
  const enLocal = taux != null && unite === 'local';
  const fmt = (eur: number) => (enLocal ? equivalentLocal(eur, devise).replace(/^≈ /, '') : montantEuros(eur));
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

        {taux != null && (
          <div className="pr-bascule-ligne" style={{ marginTop: 10 }}>
            <p className="hint">Le prix du voyageur est en euros. Taux de change : <strong>{texteTaux(devise)}</strong>.</p>
            <BasculeUnite valeur={enLocal ? 'local' : 'eur'} libelleLocal={libelleDevise(devise)} onChange={(u) => { setUnite(u); memoriserUnite(u); }} />
          </div>
        )}
        <div className="pr-detail-grille">
          <div><span>Prix au kilo</span><strong>{fmt(Number(t.prix_par_kilo))}</strong></div>
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
</div>
        </div>

        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Fermer</button>
          <button className="btn btn-primary" onClick={onConfier}>Confier un colis à ce voyageur</button>
        </div>
      </div>
    </Modal>
  );
}
