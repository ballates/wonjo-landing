// Rapidite du back-office : (1) les pages se chargent a la demande (un paquet par page) ; on les telecharge des que la souris survole le menu,
// avant le clic ; (2) les listes deja vues sont gardees en memoire pour la session : revenir sur un onglet l'affiche tout de suite, puis la
// rafraichit en arriere-plan. Le cache est vide a la deconnexion (jamais de donnees d'un compte chez le suivant).

// Une entree par page : le MEME import() que celui de App.tsx, donc le navigateur ne telecharge le paquet qu'une fois.
export const PAGES: Record<string, () => Promise<unknown>> = {
  '/': () => import('../pages/DashboardPage'),
  '/moderation': () => import('../pages/ModerationPage'),
  '/transactions': () => import('../pages/TransactionsPage'),
  '/avis': () => import('../pages/AvisPage'),
  '/kyc': () => import('../pages/KycPage'),
  '/admins': () => import('../pages/AdminsPage'),
  '/emails': () => import('../pages/EmailsPage'),
  '/tarification': () => import('../pages/TarificationPage'),
  '/audit': () => import('../pages/AuditPage'),
  '/points-relais': () => import('../pages/PointsRelaisPage'),
};

const dejaDemandees = new Set<string>();
export function precharger(chemin: string): void {
  if (dejaDemandees.has(chemin)) return;
  const charge = PAGES[chemin];
  if (!charge) return;
  dejaDemandees.add(chemin);
  charge().catch(() => dejaDemandees.delete(chemin)); // reseau coupe : on reessaiera au prochain survol
}

const cache = new Map<string, unknown>();
export const lireCache = <T,>(cle: string): T | undefined => cache.get(cle) as T | undefined;
export const ecrireCache = (cle: string, valeur: unknown): void => { cache.set(cle, valeur); };
export const viderCache = (): void => { cache.clear(); };
