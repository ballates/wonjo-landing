// Les valeurs restent en point (base, calculs) ; l'affichage est en francais : virgule.
export const decimales = (n: number, chiffres: number): string =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: chiffres, maximumFractionDigits: chiffres });
