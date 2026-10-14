import { useEffect, useState } from 'react';
import { supabase } from './supabase';

// Photos de profil en URL signees (migration 394 puis bucket avatars prive, audit du 14 oct. 2026).
// Meme mecanique que l'app (src/utils/photosProfil.ts du depot wonjo) : photo_url / avatar_url
// gardent leur format public et ne servent qu'a designer le fichier ; on affiche une URL signee 1 h.
// Un administrateur authentifie (aal2) peut signer toute photo. Les demandes d'un meme rendu
// (un tableau) partent en un seul appel.

const PREFIXE = `${import.meta.env.VITE_SUPABASE_URL as string}/storage/v1/object/public/avatars/`;
const DUREE_S = 3600;
const MARGE_MS = 5 * 60 * 1000;

const cache = new Map<string, { url: string; expire: number }>();
const enCours = new Map<string, Promise<string | null>>();
let lot: { cle: string; chemin: string; resoudre: (url: string | null) => void }[] = [];
let minuteur: ReturnType<typeof setTimeout> | null = null;

function cheminAvatar(url: string): string | null {
  if (!url.startsWith(PREFIXE)) return null;
  const chemin = decodeURIComponent(url.slice(PREFIXE.length).split('?')[0]);
  return chemin || null;
}

function enCache(url: string): string | null {
  if (!cheminAvatar(url)) return url;
  const e = cache.get(url);
  return e && e.expire - MARGE_MS > Date.now() ? e.url : null;
}

async function envoyerLot() {
  const courant = lot;
  lot = [];
  minuteur = null;
  const chemins = [...new Set(courant.map((d) => d.chemin))];
  const parChemin = new Map<string, string>();
  const { data, error } = await supabase.storage.from('avatars').createSignedUrls(chemins, DUREE_S);
  if (!error) {
    for (const s of data ?? []) if (s.path && s.signedUrl && !s.error) parChemin.set(s.path, s.signedUrl);
  }
  const expire = Date.now() + DUREE_S * 1000;
  for (const d of courant) {
    const url = parChemin.get(d.chemin) ?? null;
    if (url) cache.set(d.cle, { url, expire });
    enCours.delete(d.cle);
    d.resoudre(url);
  }
}

function signerPhoto(url: string): Promise<string | null> {
  const chemin = cheminAvatar(url);
  if (!chemin) return Promise.resolve(url);
  const deja = enCache(url);
  if (deja) return Promise.resolve(deja);
  const attente = enCours.get(url);
  if (attente) return attente;
  const promesse = new Promise<string | null>((resoudre) => {
    lot.push({ cle: url, chemin, resoudre });
    if (!minuteur) minuteur = setTimeout(envoyerLot, 30);
  });
  enCours.set(url, promesse);
  return promesse;
}

export function usePhotoSignee(url?: string | null): string | null {
  const [resolue, setResolue] = useState<string | null>(() => (url ? enCache(url) : null));
  useEffect(() => {
    if (!url) { setResolue(null); return; }
    const immediate = enCache(url);
    setResolue(immediate);
    if (immediate) return;
    let actif = true;
    signerPhoto(url).then((u) => { if (actif) setResolue(u); });
    return () => { actif = false; };
  }, [url]);
  return resolue;
}
