// Filtre de periode du back-office (porte du filtre d'administration de Lampas) : raccourcis (aujourd'hui, 7 jours...) et plage libre au calendrier.
// Une plage = des jours entiers, locaux, bornes incluses.

export type RaccourciId = 'today' | 'yesterday' | '3d' | '7d' | '15d' | '30d' | '90d';

export const RACCOURCIS: { id: RaccourciId; label: string }[] = [
  { id: 'today', label: 'Aujourd\'hui' },
  { id: 'yesterday', label: 'Hier' },
  { id: '3d', label: '3 derniers jours' },
  { id: '7d', label: '7 derniers jours' },
  { id: '15d', label: '15 derniers jours' },
  { id: '30d', label: '30 derniers jours' },
  { id: '90d', label: '90 derniers jours' },
];

export interface Plage {
  from: Date;
  to: Date;
  raccourci: RaccourciId | 'custom';
}

export const debutDeJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const finDeJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
export const ajouterJours = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function plageDuRaccourci(id: RaccourciId, maintenant = new Date()): Plage {
  const aujourdhui = debutDeJour(maintenant);
  if (id === 'today') return { from: aujourdhui, to: finDeJour(aujourdhui), raccourci: id };
  if (id === 'yesterday') return { from: ajouterJours(aujourdhui, -1), to: finDeJour(ajouterJours(aujourdhui, -1)), raccourci: id };
  const jours = parseInt(id, 10); // « 7d » -> 7, aujourd'hui compris
  return { from: ajouterJours(aujourdhui, -(jours - 1)), to: finDeJour(aujourdhui), raccourci: id };
}

/** Texte court d'une plage : le nom du raccourci, ou « 3 oct. – 13 oct. ». */
export function libellePlage(p: Plage): string {
  if (p.raccourci !== 'custom') return RACCOURCIS.find((r) => r.id === p.raccourci)?.label ?? '';
  const court = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  return `${court(p.from)} – ${court(p.to)}`;
}
