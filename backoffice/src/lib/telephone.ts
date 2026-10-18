// Indicatifs et groupage des numeros pour les pays ou un point relais peut exister (regions Afrique et
// Maghreb de corridor_countries), plus la France. Meme forme enregistree que l'app (utils/phone.ts du depot
// wonjo) : « +221 77 123 45 67 ». Le groupage ne sert qu'a l'affichage : il ne coupe JAMAIS un numero
// plus long que prevu (plusieurs pays africains ont allonge leurs numeros ces dernieres annees).

export interface PaysTelephone { indicatif: string; groupes: number[] }

export const TELEPHONE_PAYS: Record<string, PaysTelephone> = {
  // Afrique de l'Ouest
  BF: { indicatif: '+226', groupes: [2, 2, 2, 2] },
  BJ: { indicatif: '+229', groupes: [2, 2, 2, 2, 2] },
  CI: { indicatif: '+225', groupes: [2, 2, 2, 2, 2] },
  GH: { indicatif: '+233', groupes: [2, 3, 4] },
  GM: { indicatif: '+220', groupes: [3, 4] },
  GN: { indicatif: '+224', groupes: [3, 2, 2, 2] },
  GW: { indicatif: '+245', groupes: [3, 3, 3] },
  ML: { indicatif: '+223', groupes: [2, 2, 2, 2] },
  MR: { indicatif: '+222', groupes: [2, 2, 2, 2] },
  NE: { indicatif: '+227', groupes: [2, 2, 2, 2] },
  NG: { indicatif: '+234', groupes: [3, 3, 4] },
  SN: { indicatif: '+221', groupes: [2, 3, 2, 2] },
  TG: { indicatif: '+228', groupes: [2, 2, 2, 2] },
  // Afrique centrale
  CD: { indicatif: '+243', groupes: [3, 3, 3] },
  CF: { indicatif: '+236', groupes: [2, 2, 2, 2] },
  CG: { indicatif: '+242', groupes: [2, 3, 2, 2] },
  CM: { indicatif: '+237', groupes: [1, 2, 2, 2, 2] },
  GA: { indicatif: '+241', groupes: [2, 2, 2, 2] },
  GQ: { indicatif: '+240', groupes: [3, 3, 3] },
  TD: { indicatif: '+235', groupes: [2, 2, 2, 2] },
  // Afrique de l'Est et australe
  AO: { indicatif: '+244', groupes: [3, 3, 3] },
  BI: { indicatif: '+257', groupes: [2, 2, 2, 2] },
  BW: { indicatif: '+267', groupes: [2, 3, 3] },
  DJ: { indicatif: '+253', groupes: [2, 2, 2, 2] },
  ER: { indicatif: '+291', groupes: [1, 3, 3] },
  ET: { indicatif: '+251', groupes: [2, 3, 4] },
  KE: { indicatif: '+254', groupes: [3, 3, 3] },
  KM: { indicatif: '+269', groupes: [3, 2, 2] },
  LS: { indicatif: '+266', groupes: [4, 4] },
  MG: { indicatif: '+261', groupes: [2, 2, 3, 2] },
  MU: { indicatif: '+230', groupes: [4, 4] },
  MW: { indicatif: '+265', groupes: [3, 3, 3] },
  MZ: { indicatif: '+258', groupes: [2, 3, 4] },
  NA: { indicatif: '+264', groupes: [2, 3, 4] },
  RE: { indicatif: '+262', groupes: [3, 2, 2, 2] },
  RW: { indicatif: '+250', groupes: [3, 3, 3] },
  SC: { indicatif: '+248', groupes: [1, 2, 2, 2] },
  SD: { indicatif: '+249', groupes: [2, 3, 4] },
  SO: { indicatif: '+252', groupes: [2, 3, 4] },
  SS: { indicatif: '+211', groupes: [2, 3, 4] },
  SZ: { indicatif: '+268', groupes: [4, 4] },
  TZ: { indicatif: '+255', groupes: [3, 3, 3] },
  UG: { indicatif: '+256', groupes: [3, 3, 3] },
  ZA: { indicatif: '+27', groupes: [2, 3, 4] },
  ZM: { indicatif: '+260', groupes: [2, 3, 4] },
  ZW: { indicatif: '+263', groupes: [2, 3, 4] },
  // Maghreb
  DZ: { indicatif: '+213', groupes: [3, 2, 2, 2] },
  EG: { indicatif: '+20', groupes: [3, 3, 4] },
  LY: { indicatif: '+218', groupes: [2, 3, 4] },
  MA: { indicatif: '+212', groupes: [3, 2, 2, 2] },
  TN: { indicatif: '+216', groupes: [2, 3, 3] },
  // Europe et Amerique du Nord (agent ou titulaire vivant hors d'Afrique)
  FR: { indicatif: '+33', groupes: [1, 2, 2, 2, 2] },
  BE: { indicatif: '+32', groupes: [3, 2, 2, 2] },
  CH: { indicatif: '+41', groupes: [2, 3, 2, 2] },
  LU: { indicatif: '+352', groupes: [3, 3, 3] },
  ES: { indicatif: '+34', groupes: [3, 3, 3] },
  PT: { indicatif: '+351', groupes: [3, 3, 3] },
  IT: { indicatif: '+39', groupes: [3, 3, 4] },
  NL: { indicatif: '+31', groupes: [1, 4, 4] },
  GB: { indicatif: '+44', groupes: [4, 6] },
  US: { indicatif: '+1', groupes: [3, 3, 4] },
};

/** Nombre de chiffres d'un numero national complet, sans le zero de tete (France : 9 apres +33). */
export function chiffresAttendus(iso: string): number {
  return (TELEPHONE_PAYS[iso]?.groupes ?? [2, 2, 2, 2]).reduce((a, b) => a + b, 0);
}

/** Groupage pendant la frappe, au format du pays. La saisie s'arrete au nombre de chiffres du pays (un zero national
 *  de tete en plus est accepte : « 06 12 34 56 78 » en France, il saute a l'enregistrement). */
export function grouperNumero(saisie: string, iso: string): string {
  const brut = saisie.replace(/\D/g, '');
  const max = chiffresAttendus(iso) + (brut.startsWith('0') ? 1 : 0);
  const chiffres = brut.slice(0, max);
  const groupes = TELEPHONE_PAYS[iso]?.groupes ?? [2, 2, 2, 2];
  const parts: string[] = [];
  let pos = 0;
  for (const g of groupes) {
    if (pos >= chiffres.length) break;
    parts.push(chiffres.slice(pos, pos + g));
    pos += g;
  }
  if (pos < chiffres.length) parts.push(chiffres.slice(pos));
  return parts.join(' ');
}

/** Forme enregistree : « +221 77 123 45 67 » ; vide si aucun chiffre. Le zero national de tete
 *  saute seulement s'il est en trop (meme regle que formatPhoneDisplay de l'app). */
export function numeroInternational(iso: string, saisie: string): string {
  const pays = TELEPHONE_PAYS[iso];
  let chiffres = saisie.replace(/\D/g, '');
  if (!pays || !chiffres) return '';
  const attendu = pays.groupes.reduce((a, b) => a + b, 0);
  if (chiffres.startsWith('0') && chiffres.length === attendu + 1) chiffres = chiffres.slice(1);
  return `${pays.indicatif} ${grouperNumero(chiffres, iso)}`;
}

/** Retrouve le pays et le numero local d'une forme enregistree. Plusieurs pays partagent parfois un
 *  indicatif : on prefere le pays propose (celui du point). */
export function decomposerNumero(valeur: string, paysPrefere: string): { iso: string; local: string } {
  const brut = valeur.trim();
  const candidats = Object.entries(TELEPHONE_PAYS)
    .filter(([, p]) => brut.startsWith(p.indicatif))
    .sort((a, b) => b[1].indicatif.length - a[1].indicatif.length || (a[0] === paysPrefere ? -1 : 1));
  if (candidats.length === 0) return { iso: paysPrefere, local: brut.replace(/^\+/, '') };
  const [iso, p] = candidats[0];
  return { iso, local: grouperNumero(brut.slice(p.indicatif.length), iso) };
}

/** Chiffres nationaux d'une forme enregistree (« +221 77 123 45 67 » -> « 771234567 »), sans le zero de tete. */
function chiffresNationaux(iso: string, valeur: string): string {
  const pays = TELEPHONE_PAYS[iso];
  const brut = valeur.trim();
  const sansIndicatif = pays && brut.startsWith(pays.indicatif) ? brut.slice(pays.indicatif.length) : brut;
  const chiffres = sansIndicatif.replace(/\D/g, '');
  return chiffres.length === chiffresAttendus(iso) + 1 && chiffres.startsWith('0') ? chiffres.slice(1) : chiffres;
}

/** Numero complet au format du pays : exactement le nombre de chiffres attendu. */
export function numeroComplet(iso: string, valeur: string): boolean {
  return !!TELEPHONE_PAYS[iso] && chiffresNationaux(iso, valeur).length === chiffresAttendus(iso);
}

/** Message d'aide sous le champ : vide si le numero est complet ou pas encore commence. */
export function aideNumero(iso: string, valeur: string): string {
  const pays = TELEPHONE_PAYS[iso];
  const n = chiffresNationaux(iso, valeur).length;
  if (!pays || n === 0 || n === chiffresAttendus(iso)) return '';
  return `${chiffresAttendus(iso)} chiffres après ${pays.indicatif} (${n} saisi${n > 1 ? 's' : ''})`;
}
