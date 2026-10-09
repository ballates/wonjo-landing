// Les valeurs restent en point (base, calculs) ; l'affichage est en francais : virgule.
// Un montant negatif porte le vrai signe moins (U+2212), jamais un tiret : sur une
// marge, « -1,20 » se confond avec le tiret « - » qui signifie « sans valeur ».
export const decimales = (n: number, chiffres: number): string => {
  const texte = Math.abs(n).toLocaleString('fr-FR', { minimumFractionDigits: chiffres, maximumFractionDigits: chiffres });
  const nul = Number(Math.abs(n).toFixed(chiffres)) === 0;
  return n < 0 && !nul ? `\u2212${texte}` : texte;
};
