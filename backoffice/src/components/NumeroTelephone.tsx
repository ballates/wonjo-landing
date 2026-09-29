import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { IconEye } from './Icons';

// Coordonnees personnelles masquees dans les fiches (compte, transaction).
// [300] Les fiches ne recoivent plus qu'une valeur masquee (ex. "•• 42") : la
// vraie valeur est demandee au clic a admin_reveler_coordonnee, qui l'inscrit
// au journal (qui a consulte quoi, quand - RGPD). Revelee par fiche, jusqu'a
// la fermeture de celle-ci.
type Champ = 'telephone' | 'adresse';

function DonneeMasquee({ userId, champ, masque, vide, libelle, formater, apercu }: {
  userId: string;
  apercu?: string;
  champ: Champ;
  masque: string | null;
  vide: string;
  libelle: string;
  formater?: (v: string) => string;
}) {
  const [valeur, setValeur] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (!masque) return <>{vide}</>;
  if (valeur !== null) return <>{formater ? formater(valeur) : valeur}</>;

  async function reveler() {
    setBusy(true);
    setErreur(null);
    const { data, error } = await supabase.rpc('admin_reveler_coordonnee', { p_user_id: userId, p_champ: champ });
    setBusy(false);
    if (error) { setErreur(error.message); return; }
    setValeur((data as string | null) ?? '');
  }

  return (
    <>
      {apercu ? `${apercu} · ` : ''}
      <button type="button" className="numero-masque" disabled={busy} onClick={reveler} title="La consultation est enregistrée dans le journal">
        <IconEye /> {busy ? '…' : libelle}
      </button>
      {erreur && <span className="check-no"> {erreur}</span>}
    </>
  );
}

export function NumeroTelephone({ userId, numero }: { userId: string; numero: string | null }) {
  return <DonneeMasquee userId={userId} champ="telephone" masque={numero} vide="téléphone non renseigné" libelle="Afficher le numéro" />;
}

// [296] profiles.adresse : une ligne par champ, le pays en premiere ligne
// (EditProfilScreen). Affichee dans l'ordre postal : rue, ville, pays.
function adressePostale(adresse: string): string {
  const lignes = adresse.split('\n').map((l) => l.trim()).filter(Boolean);
  return lignes.length > 1 ? [...lignes.slice(1), lignes[0]].join(', ') : lignes[0] ?? '';
}

export function AdresseMasquee({ userId, adresse }: { userId: string; adresse: string | null }) {
  // La fiche renvoie "Pays\n••••" : le pays reste lisible sans revelation.
  const pays = adresse?.split('\n')[0]?.trim();
  return <DonneeMasquee userId={userId} champ="adresse" masque={adresse} apercu={pays} vide="non renseignée" libelle="Afficher l'adresse" formater={adressePostale} />;
}
