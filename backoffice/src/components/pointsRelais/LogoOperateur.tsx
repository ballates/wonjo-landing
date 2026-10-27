import logoWave from '../../assets/operateurs/wave.png';
import logoOrange from '../../assets/operateurs/orange_money.png';
import logoMtn from '../../assets/operateurs/mtn_momo.png';
import logoMoov from '../../assets/operateurs/moov_money.png';

// Logo d'un operateur mobile money (Wave, Orange Money, MTN MoMo, Moov Money) a la place de la pastille de couleur. Les logos sans fond propre sont poses
// sur une pastille de fond : le symbole d'Orange (les deux fleches) est noir et orange, celui de Moov est blanc. Un operateur sans logo (Free Money, autre, especes, virement) garde sa pastille.
const LOGOS: Record<string, { src: string; fond?: string; large?: boolean }> = {
  wave: { src: logoWave },
  orange_money: { src: logoOrange, fond: '#FFFFFF', large: true },
  mtn_momo: { src: logoMtn },
  moov_money: { src: logoMoov, fond: '#0B2A4A', large: true },
};

export function LogoOperateur({ operateur, couleur, taille = 20 }: { operateur?: string | null; couleur: string; taille?: number }) {
  const logo = operateur ? LOGOS[operateur] : undefined;
  if (!logo) return <span className="moyen-pastille" style={{ background: couleur }} aria-hidden="true" />;
  return (
    <span className={`logo-op${logo.large ? ' logo-op--large' : ''}`} style={{ height: taille, background: logo.fond }} aria-hidden="true">
      <img src={logo.src} alt="" draggable={false} />
    </span>
  );
}
