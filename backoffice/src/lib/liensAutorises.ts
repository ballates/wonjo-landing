// Meme regle que supabase/functions/_shared/liens-autorises.ts (le serveur decide ; ici on previent avant l'envoi) : les e-mails partent de
// noreply@wonjo.app, donc seuls wonjo.app et les boutiques d'applications sont admis comme destination d'un lien.
export function lienAutorise(valeur: string): boolean {
  const brut = valeur.trim();
  if (/[\\\s]/.test(brut)) return false;
  let u: URL;
  try { u = new URL(brut); } catch { return false; }
  const h = u.hostname.toLowerCase();
  const hoteOk = h === 'wonjo.app' || h.endsWith('.wonjo.app') || h === 'apps.apple.com' || h === 'play.google.com';
  return u.protocol === 'https:' && !u.username && !u.password && u.port === '' && hoteOk;
}
