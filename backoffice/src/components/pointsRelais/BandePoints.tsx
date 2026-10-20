import type { PointRelais } from '../../lib/pointsRelais';
import { Select } from '../Select';

// Au-dela de ce nombre de points, des cartes alignees n'ont plus de sens : un menu avec recherche prend leur place.
const SEUIL_CARTES = 6;

// Bande de synthese au-dessus d'un tableau : une carte par point avec ses compteurs, plus « Tous ». Elle sert aussi de filtre :
// un clic isole un point, un second clic (ou « Tous ») revient a l'ensemble. Un point en retard se voit sans rien ouvrir.
export const TOUS_LES_POINTS = 'tous';

export interface CompteurPoint { total: number; urgents: number }

export function BandePoints({ points, compteurs, choix, onChoix }: {
  points: PointRelais[];
  compteurs: Record<string, CompteurPoint>;
  choix: string;
  onChoix: (id: string) => void;
}) {
  if (points.length < 2) return null;
  if (points.length > SEUIL_CARTES) {
    // Beaucoup de points : menu avec recherche, les points qui ont du travail en premier, le nombre en attente en indication.
    const n = (p: PointRelais) => compteurs[p.id]?.total ?? 0;
    const triees = [...points].sort((a, b) => n(b) - n(a) || a.nom.localeCompare(b.nom, 'fr'));
    const total = points.reduce((s, p) => s + n(p), 0);
    return (
      <div className="bande-points" role="group" aria-label="Filtrer par point relais">
        <Select ariaLabel="Point relais" value={choix} onChange={onChoix} minWidth={260} recherche
                options={[{ value: TOUS_LES_POINTS, label: 'Tous', hint: String(total) },
                          ...triees.map((p) => ({ value: p.id, label: p.nom, hint: String(n(p)) }))]} />
      </div>
    );
  }
  const total = points.reduce((s, p) => s + (compteurs[p.id]?.total ?? 0), 0);
  return (
    <div className="bande-points" role="group" aria-label="Filtrer par point relais">
      <Carte actif={choix === TOUS_LES_POINTS} onClick={() => onChoix(TOUS_LES_POINTS)} nom="Tous" total={total} />
      {points.map((p) => {
        const c = compteurs[p.id] ?? { total: 0, urgents: 0 };
        return <Carte key={p.id} actif={choix === p.id} onClick={() => onChoix(choix === p.id ? TOUS_LES_POINTS : p.id)}
                      nom={p.nom} total={c.total} />;
      })}
    </div>
  );
}

function Carte({ actif, onClick, nom, total }: {
  actif: boolean; onClick: () => void; nom: string; total: number;
}) {
  return (
    <button type="button" className={`bande-carte ${actif ? 'on' : ''}`} aria-pressed={actif} onClick={onClick}>
      <span className="bande-nom"><strong>{nom}</strong></span>
      <span className="bande-chiffres">
        <b>{total}</b>
      </span>
    </button>
  );
}
