// Code pays ISO 3166-1 alpha-2 -> continent, pour regrouper les itineraires
// du tableau de bord par zone d'arrivee.
//
// Seuls les pays desservis par un corridor actif sont listes ici (pas tous
// les pays connus de l'app) : un pays sans corridor ouvert n'a par
// construction aucun itineraire dans admin_stats_marche, mais on evite quand
// meme de le faire apparaitre comme "Autre" s'il finissait par avoir une
// ligne (ancienne donnee, corridor ferme depuis). A tenir a jour avec
// PAYS_MONDE dans wonjo/src/constants/corridors.ts (source de verite des
// corridors actifs) a chaque ouverture/fermeture de pays.
const PAYS_PAR_CONTINENT: Record<string, string> = {
  // Europe (PAYS_EUROPE)
  FR: 'Europe', BE: 'Europe', CH: 'Europe', GB: 'Europe', DE: 'Europe',
  IT: 'Europe', ES: 'Europe', PT: 'Europe', NL: 'Europe', LU: 'Europe',
  // Afrique Ouest (PAYS_AFRIQUE_OUEST)
  SN: 'Afrique', CI: 'Afrique', ML: 'Afrique', BF: 'Afrique', GN: 'Afrique',
  BJ: 'Afrique', TG: 'Afrique',
  // Afrique Centrale (PAYS_AFRIQUE_CENTRALE)
  TD: 'Afrique', CM: 'Afrique', GA: 'Afrique', CG: 'Afrique', CD: 'Afrique',
  CF: 'Afrique', GQ: 'Afrique',
  // Afrique Nord (PAYS_AFRIQUE_NORD)
  MA: 'Afrique', TN: 'Afrique',
  // Afrique Est (PAYS_AFRIQUE_EST)
  KE: 'Afrique', RW: 'Afrique', UG: 'Afrique', MG: 'Afrique', KM: 'Afrique',
  // Afrique Australe (PAYS_AFRIQUE_AUSTRALE)
  ZA: 'Afrique',
};

export function continentDe(codePays: string | null | undefined): string {
  if (!codePays) return 'Autre';
  return PAYS_PAR_CONTINENT[codePays.toUpperCase()] ?? 'Autre';
}
