import { useState } from 'react';
import { IconEye } from './Icons';

// Le numero reste masque par defaut dans les fiches (compte, transaction) :
// un admin qui a une fiche ouverte a l'ecran (partage d'ecran, bureau
// partage...) n'expose pas un numero personnel sans le vouloir. Un clic le
// revele, par fiche, jusqu'a la fermeture de celle-ci.
export function NumeroTelephone({ numero }: { numero: string | null }) {
  const [visible, setVisible] = useState(false);

  if (!numero) return <>téléphone non renseigné</>;
  if (visible) return <>{numero}</>;

  return (
    <button type="button" className="numero-masque" onClick={() => setVisible(true)}>
      <IconEye /> Afficher le numéro
    </button>
  );
}
