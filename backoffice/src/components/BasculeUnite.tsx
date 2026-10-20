// Bascule « monnaie locale | € » pour les écrans où un montant peut se lire dans l'une ou l'autre. À poser seulement là où la lecture
// en euros ne gêne pas le geste (comparer des points, estimer un prix) ; les écrans où le montant doit rester tel quel (argent
// compté en caisse, paiement par carte débité en euros) n'en ont pas.
export type Unite = 'local' | 'eur';

// Le choix est commun au formulaire « Confier un colis » et à la fiche d'un trajet : on le retient dans le navigateur.
const CLE_UNITE = 'wonjo_bo_unite_guichet';
export function uniteMemorisee(): Unite {
  try { const v = localStorage.getItem(CLE_UNITE); if (v === 'eur' || v === 'local') return v; } catch { /* stockage indisponible */ }
  return 'local';
}
export function memoriserUnite(u: Unite) {
  try { localStorage.setItem(CLE_UNITE, u); } catch { /* stockage indisponible */ }
}

export function BasculeUnite({ valeur, onChange, libelleLocal, ariaLabel = 'Unité des montants' }: {
  valeur: Unite; onChange: (u: Unite) => void; libelleLocal: string; ariaLabel?: string;
}) {
  return (
    <div className="pr-bascule" role="radiogroup" aria-label={ariaLabel}>
      <button type="button" role="radio" aria-checked={valeur === 'local'} className={valeur === 'local' ? 'on' : ''} onClick={() => onChange('local')}>{libelleLocal}</button>
      <button type="button" role="radio" aria-checked={valeur === 'eur'} className={valeur === 'eur' ? 'on' : ''} onClick={() => onChange('eur')}>€</button>
    </div>
  );
}
