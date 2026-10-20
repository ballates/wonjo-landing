import type { ReactNode } from 'react';

// États d'un dossier du guichet, vus du point : icônes (celles de l'app : Clock, CheckCircle, UserCheck, Waypoints, MapPin, Package),
// parcours visuel (la « machine à états » du dossier, avec l'étape en cours) et vue d'ensemble par étape. Les étapes suivent
// demandes_transport.statut_colis, précédées du paiement que le point encaisse au guichet.

export type NomIcone = 'banknote' | 'carte' | 'attente' | 'accepte' | 'remis' | 'route' | 'arrive' | 'livre' | 'annule';

const TRACES: Record<NomIcone, ReactNode> = {
  banknote: <><rect width="20" height="12" x="2" y="6" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></>,
  carte: <><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></>,
  attente: <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>,
  accepte: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></>,
  remis: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><polyline points="16 11 18 13 22 9" /></>,
  route: <><circle cx="12" cy="4.5" r="2.5" /><path d="m10.2 6.3-3.9 3.9" /><circle cx="4.5" cy="12" r="2.5" /><path d="M7 12h10" /><circle cx="19.5" cy="12" r="2.5" /><path d="m13.8 17.7 3.9-3.9" /><circle cx="12" cy="19.5" r="2.5" /></>,
  arrive: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
  livre: <><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>,
  annule: <><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></>,
};

export function IconeEtat({ nom, taille = 14 }: { nom: NomIcone; taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none' }}>
      {TRACES[nom]}
    </svg>
  );
}

/** Les sept étapes d'un dossier, dans l'ordre. `qui` : de qui dépend l'étape suivante ; `suite` : ce qui se passe ensuite. */
export const ETAPES: { cle: string; titre: string; icone: NomIcone; qui: string; suite: string }[] = [
  { cle: 'paiement', titre: 'À payer', icone: 'banknote', qui: 'Point', suite: 'Encaisser le client (espèces, mobile money) ou lui envoyer le lien de paiement par carte.' },
  { cle: 'attente', titre: 'Payé', icone: 'attente', qui: 'Voyageur', suite: 'Le voyageur doit accepter la demande : il a été prévenu dans son application.' },
  { cle: 'accepte', titre: 'Accepté', icone: 'accepte', qui: 'Point', suite: 'Déposer le colis au point, puis le remettre au voyageur (QR de remise).' },
  { cle: 'remis', titre: 'Remis', icone: 'remis', qui: 'Voyageur', suite: 'Le voyageur a le colis et part : rien à faire pour le point.' },
  { cle: 'route', titre: 'En route', icone: 'route', qui: 'Voyageur', suite: 'Le voyageur transporte le colis : rien à faire pour le point.' },
  { cle: 'arrive', titre: 'Arrivé', icone: 'arrive', qui: 'Point', suite: 'Le destinataire donne le code de livraison : le saisir pour confirmer la réception.' },
  { cle: 'livre', titre: 'Livré', icone: 'livre', qui: '', suite: 'Terminé : le voyageur peut être payé.' },
];

export interface DossierEtape { statut_colis: string; paiement_valide_at: string | null }

/** Index de l'étape en cours (0 à 6), ou -1 si le dossier est annulé. */
export function etapeDossier(d: DossierEtape): number {
  if (d.statut_colis === 'annule') return -1;
  if (!d.paiement_valide_at && d.statut_colis === 'en_attente') return 0;
  return { en_attente: 1, accepte: 2, remis_porteur: 3, en_transit: 4, arrive: 5, livre: 6 }[d.statut_colis] ?? 1;
}

/** Parcours d'un dossier : la machine à états, étape en cours en couleur, étapes passées cochées, et ce qui vient ensuite. */
export function ParcoursDossier({ dossier }: { dossier: DossierEtape }) {
  const i = etapeDossier(dossier);
  return (
    <div className="pr-parcours">
      {i === -1 ? (
        <p className="pr-parcours-annule"><IconeEtat nom="annule" taille={16} /> Dossier annulé : plus aucune action.</p>
      ) : (
        <ol>
          {ETAPES.map((e, k) => (
            <li key={e.cle} className={k < i ? 'fait' : k === i ? 'courant' : ''} aria-current={k === i ? 'step' : undefined}>
              <span className="pr-parcours-noeud"><IconeEtat nom={k < i ? 'accepte' : e.icone} taille={16} /></span>
              <span className="pr-parcours-titre">{e.titre}</span>
              {e.qui && <small>{e.qui}</small>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Filtre par étape : de simples pastilles avec leur compteur, posées dans la ligne de filtres du tableau (ce n'est pas la machine à états, qui est dans la fiche). */
export function FriseEtapes({ comptes, actif, onChoix }: { comptes: number[]; actif: number | null; onChoix: (i: number | null) => void }) {
  return (
    <>
      <span className="pr-filtre-etapes-titre">Étape</span>
      {ETAPES.map((e, k) => (
        <button key={e.cle} type="button" className={`pr-puce-filtre ${actif === k ? 'on' : ''}`} onClick={() => onChoix(actif === k ? null : k)}>
          {e.titre}<span>{comptes[k]}</span>
        </button>
      ))}
    </>
  );
}

/** Mini-parcours d'une ligne du tableau : 7 points, verts jusqu'à l'étape franchie, l'étape en cours cerclée, le reste grisé. */
export function MiniParcours({ dossier }: { dossier: DossierEtape }) {
  const i = etapeDossier(dossier);
  if (i === -1) return null;
  return (
    <span className="pr-mini" role="img" aria-label={`Étape ${i + 1} sur ${ETAPES.length} : ${ETAPES[i].titre}`}>
      {ETAPES.map((e, k) => <span key={e.cle} className={k < i ? 'fait' : k === i ? 'courant' : ''} title={e.titre} />)}
    </span>
  );
}
