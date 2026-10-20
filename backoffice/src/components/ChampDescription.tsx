import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { normaliserRecherche } from './Select';

// Description libre d'un colis, avec completion pendant la frappe et compteur de mots. La completion remplace le dernier
// mot commence (ou ajoute une expression) a partir d'un vocabulaire de colis courants : rien n'est envoye nulle part, tout est
// local. Clavier : fleches, Entree ou Tab pour accepter, Echap pour fermer. Le compteur dit combien de mots manquent.

const VOCABULAIRE = [
  'Vêtements pour femme', 'Vêtements pour homme', 'Vêtements pour enfant', 'Tissus wax', 'Pagnes', 'Boubous', 'Robes', 'Chemises', 'Pantalons',
  'Chaussures de sport', 'Chaussures pour femme', 'Chaussures pour homme', 'Sandales', 'Sacs à main', 'Sacs de voyage', 'Ceintures', 'Casquettes',
  'Draps et couvertures', 'Serviettes', 'Rideaux', 'Linge de maison',
  'Téléphone portable', 'Smartphone', 'Ordinateur portable', 'Tablette', 'Chargeurs', 'Câbles', 'Écouteurs', 'Disque dur', 'Montre connectée',
  'Parfums', 'Crèmes et lotions', 'Produits de beauté', 'Produits capillaires', 'Perruques', 'Tissages', 'Maquillage', 'Savons',
  'Médicaments sur ordonnance', 'Compléments alimentaires', 'Vitamines', 'Matériel médical',
  'Épices', 'Poisson séché', 'Condiments', 'Conserves', 'Thé et café', 'Produits alimentaires', 'Huile de palme', 'Bonbons et gâteaux',
  'Documents officiels', 'Dossier administratif', 'Livres', 'Cahiers et fournitures scolaires', 'Courrier',
  'Jouets', 'Vêtements de bébé', 'Biberons', 'Poussette', 'Bijoux', 'Montres', 'Colliers', 'Cadeaux', 'Articles de sport', 'Ballon de football',
  'Pièces détachées', 'Outils', 'Petit électroménager', 'Cartons', 'Valise',
];
const MIN_FRAGMENT = 2;

export const compterMots = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

export function ChampDescription({ valeur, onChange, motsMin = 5, maxLength = 200, placeholder, invalide }: {
  valeur: string;
  onChange: (v: string) => void;
  motsMin?: number;
  maxLength?: number;
  placeholder?: string;
  invalide?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(0);
  const racine = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const frappe = useRef(false);

  // Le fragment a completer : tout ce qui suit le dernier mot termine (apres le dernier espace, virgule ou point-virgule).
  const coupe = Math.max(valeur.lastIndexOf(' '), valeur.lastIndexOf(','), valeur.lastIndexOf(';')) + 1;
  const fragment = valeur.slice(coupe);
  const nf = normaliserRecherche(fragment);
  const suggestions = useMemo(() => {
    if (nf.length < MIN_FRAGMENT) return [];
    const dejaLa = normaliserRecherche(valeur);
    const debut = VOCABULAIRE.filter((v) => normaliserRecherche(v).startsWith(nf));
    // Un mot du milieu d'une expression (« wax » pour « Tissus wax ») compte aussi, apres les expressions qui commencent par la frappe.
    const milieu = VOCABULAIRE.filter((v) => !debut.includes(v) && normaliserRecherche(v).split(' ').some((m) => m.startsWith(nf)));
    return [...debut, ...milieu].filter((v) => !dejaLa.includes(normaliserRecherche(v))).slice(0, 6);
  }, [nf, valeur]);

  useEffect(() => { setActif(0); }, [nf]);
  useEffect(() => { setOuvert(frappe.current && suggestions.length > 0); }, [suggestions]);

  useLayoutEffect(() => {
    if (!ouvert) return;
    function placer() {
      const r = racine.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    placer();
    window.addEventListener('scroll', placer, true);
    window.addEventListener('resize', placer);
    return () => { window.removeEventListener('scroll', placer, true); window.removeEventListener('resize', placer); };
  }, [ouvert]);

  function choisir(s: string) {
    // Au debut du texte ou apres une virgule, la casse d'origine ; ailleurs en minuscules (« Tissus wax et chaussures »).
    const apresPhrase = valeur.slice(0, coupe).trim() === '' || /[,;]\s*$/.test(valeur.slice(0, coupe));
    const texte = apresPhrase ? s : s.charAt(0).toLowerCase() + s.slice(1);
    onChange((valeur.slice(0, coupe) + texte + ' ').slice(0, maxLength));
    frappe.current = true;
    setOuvert(false);
  }

  const mots = compterMots(valeur);
  const manque = Math.max(0, motsMin - mots);

  return (
    <div className="champ-description" ref={racine}>
      <input
        type="text" value={valeur} maxLength={maxLength} placeholder={placeholder} autoComplete="off" role="combobox"
        aria-expanded={ouvert} aria-autocomplete="list" aria-label="Description du colis" className={invalide ? 'champ-invalide' : ''}
        onChange={(e) => { frappe.current = true; onChange(e.target.value); }}
        onBlur={() => setOuvert(false)}
        onKeyDown={(e) => {
          if (!ouvert) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActif((a) => Math.min(suggestions.length - 1, a + 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActif((a) => Math.max(0, a - 1)); }
          if ((e.key === 'Enter' || e.key === 'Tab') && suggestions[actif]) { e.preventDefault(); choisir(suggestions[actif]); }
          if (e.key === 'Escape') { e.stopPropagation(); setOuvert(false); }
        }}
      />
      <p className={`champ-description-compteur ${manque > 0 && valeur.length > 0 ? 'manque' : manque === 0 ? 'ok' : ''}`} aria-live="polite">
        {manque === 0
          ? `✓ ${mots} mots : description suffisante`
          : valeur.length === 0
            ? `Décrivez le contenu en ${motsMin} mots au moins (ex. « Tissus wax, chaussures et sacs à main »).`
            : `${mots} mot${mots > 1 ? 's' : ''} : encore ${manque} mot${manque > 1 ? 's' : ''} pour que la description soit prise en compte (${motsMin} au minimum).`}
      </p>
      {createPortal(
        ouvert && pos ? (
          <ul className="ui-select-menu champ-adresse-menu" role="listbox" style={{ top: pos.top, left: pos.left, minWidth: pos.width, maxWidth: pos.width }}>
            {suggestions.map((s, i) => (
              <li key={s} role="option" aria-selected={i === actif} className={`ui-select-option ${i === actif ? 'active' : ''}`}
                  onMouseEnter={() => setActif(i)} onMouseDown={(e) => { e.preventDefault(); choisir(s); }}>
                <span className="ui-select-option-text"><span>{s}</span></span>
              </li>
            ))}
            <li className="champ-adresse-libre" role="presentation">Tab ou Entrée pour compléter. Rien ne convient ? Continuez à écrire.</li>
          </ul>
        ) : null,
        document.body,
      )}
    </div>
  );
}
