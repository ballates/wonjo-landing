import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants (build sans les secrets ?)');
}

// La session admin vit dans sessionStorage et NON dans localStorage (audit du back-office, point 1). Le back-office est servi par
// wonjo.app/backoffice/, sur la MEME origine que le site vitrine (qui charge un script tiers) et l'editeur des textes juridiques :
// localStorage est partage par toutes les pages de l'origine, donc un script compromis ailleurs sur wonjo.app y lirait la session.
// sessionStorage est propre a chaque onglet : aucune autre page ne peut le lire. Contrepartie voulue : un nouvel onglet demande de
// se reconnecter (mot de passe + code TOTP).
const stockageSession = {
  getItem: (cle: string) => { try { return window.sessionStorage.getItem(cle); } catch { return null; } },
  setItem: (cle: string, valeur: string) => { try { window.sessionStorage.setItem(cle, valeur); } catch { /* stockage indisponible */ } },
  removeItem: (cle: string) => { try { window.sessionStorage.removeItem(cle); } catch { /* stockage indisponible */ } },
};

// Menage : les sessions ouvertes avant ce changement ont laisse un jeton dans localStorage (cle « sb-<projet>-auth-token »). On l'efface au
// chargement pour qu'il ne reste lisible par aucune autre page.
try {
  for (const cle of Object.keys(window.localStorage)) {
    if (/^sb-.+-auth-token(-code-verifier)?$/.test(cle)) window.localStorage.removeItem(cle);
  }
} catch { /* stockage indisponible */ }

export const supabase = createClient(url, anonKey, { auth: { storage: stockageSession } });
