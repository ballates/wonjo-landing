import { useMemo, useState } from 'react';
import { Select } from './Select';

// Horaires d'ouverture d'un point relais : une ligne par jour (ouvert ou ferme, de... a...), des modeles en un clic,
// et le texte lisible genere automatiquement. La valeur reste une CHAINE (« Lun-ven 8h30-18h ; Sam 9h-13h ; Dim fermé »,
// 200 caracteres au plus cote serveur) : l'app l'affiche telle quelle. Un texte ancien ou libre que le selecteur ne sait pas
// relire reste intact, en saisie libre, jusqu'a ce qu'on choisisse de le remplacer.

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const JOURS_LONGS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

interface Jour { ouvert: boolean; de: string; a: string }
type Semaine = Jour[];

// Heures par pas d'une demi-heure, de 05:00 a 23:30 (minuit exclu : un point ferme avant).
const HEURES = Array.from({ length: 38 }, (_, i) => {
  const m = 5 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});
const OPTIONS_HEURE = HEURES.map((h) => ({ value: h, label: h.replace(':', 'h').replace(/h00$/, 'h') }));

const court = (h: string) => { const [hh, mm] = h.split(':'); return `${Number(hh)}h${mm === '00' ? '' : mm}`; };

function semaineVide(): Semaine { return JOURS.map(() => ({ ouvert: false, de: '09:00', a: '18:00' })); }
function modele(jours: number[], de: string, a: string): Semaine {
  const s = semaineVide();
  jours.forEach((j) => { s[j] = { ouvert: true, de, a }; });
  return s;
}

/** Texte genere : jours consecutifs aux memes horaires regroupes ; les jours fermes sont dits (« Dim fermé ») sauf si tout est ferme. */
export function texteHoraires(s: Semaine): string {
  if (!s.some((j) => j.ouvert)) return '';
  const groupes: { debut: number; fin: number; jour: Jour }[] = [];
  s.forEach((j, i) => {
    const prec = groupes[groupes.length - 1];
    if (prec && prec.fin === i - 1 && prec.jour.ouvert === j.ouvert && (!j.ouvert || (prec.jour.de === j.de && prec.jour.a === j.a))) prec.fin = i;
    else groupes.push({ debut: i, fin: i, jour: j });
  });
  return groupes.map((g) => {
    const nom = g.debut === g.fin ? JOURS[g.debut] : `${JOURS[g.debut]}-${JOURS[g.fin].toLowerCase()}`;
    return g.jour.ouvert ? `${nom} ${court(g.jour.de)}-${court(g.jour.a)}` : `${nom} fermé`;
  }).join(' ; ');
}

/** Relit un texte produit par texteHoraires ; null si le texte est d'une autre forme (saisie libre ancienne). */
export function lireHoraires(texte: string): Semaine | null {
  const brut = texte.trim();
  if (!brut) return semaineVide();
  const s = semaineVide();
  const vus = new Set<number>();
  for (const morceau of brut.split(' ; ')) {
    const m = /^(lun|mar|mer|jeu|ven|sam|dim)(?:-(lun|mar|mer|jeu|ven|sam|dim))? (?:fermé|(\d{1,2})h(\d{2})?-(\d{1,2})h(\d{2})?)$/i.exec(morceau);
    if (!m) return null;
    const minuscules = JOURS.map((x) => x.toLowerCase());
    const i = minuscules.indexOf(m[1].toLowerCase());
    const j = m[2] ? minuscules.indexOf(m[2].toLowerCase()) : i;
    if (j < i) return null;
    for (let k = i; k <= j; k++) {
      if (vus.has(k)) return null;
      vus.add(k);
      if (m[3] === undefined) { s[k] = { ouvert: false, de: '09:00', a: '18:00' }; continue; }
      const de = `${m[3].padStart(2, '0')}:${m[4] ?? '00'}`;
      const a = `${m[5].padStart(2, '0')}:${m[6] ?? '00'}`;
      if (!HEURES.includes(de) || !HEURES.includes(a)) return null;
      s[k] = { ouvert: true, de, a };
    }
  }
  return s;
}

const MODELES: { label: string; semaine: () => Semaine }[] = [
  { label: 'Lun-ven 8h-17h', semaine: () => modele([0, 1, 2, 3, 4], '08:00', '17:00') },
  { label: 'Lun-sam 9h-18h', semaine: () => modele([0, 1, 2, 3, 4, 5], '09:00', '18:00') },
  { label: 'Tous les jours 8h-20h', semaine: () => modele([0, 1, 2, 3, 4, 5, 6], '08:00', '20:00') },
];

export function ChampHoraires({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const initiale = useMemo(() => lireHoraires(valeur), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [libre, setLibre] = useState(initiale === null);
  const [semaine, setSemaine] = useState<Semaine>(initiale ?? semaineVide());

  function maj(s: Semaine) {
    setSemaine(s);
    onChange(texteHoraires(s));
  }
  function changerJour(i: number, patch: Partial<Jour>) {
    const s = semaine.map((j, k) => (k === i ? { ...j, ...patch } : j));
    // Une heure de fin avant le debut est corrigee : fin = debut + 30 min.
    const j = s[i];
    if (j.ouvert && j.a <= j.de) j.a = HEURES[Math.min(HEURES.length - 1, HEURES.indexOf(j.de) + 1)];
    maj(s);
  }
  // Copie les horaires d'un jour sur tous les jours ouverts.
  function copierSurOuverts(i: number) {
    const ref = semaine[i];
    maj(semaine.map((j) => (j.ouvert ? { ...j, de: ref.de, a: ref.a } : j)));
  }

  if (libre) {
    return (
      <div className="champ-horaires">
        <input type="text" value={valeur} maxLength={200} onChange={(e) => onChange(e.target.value)} placeholder="Ex. Lun-sam 9h-18h" aria-label="Horaires" />
        <p className="hint" style={{ marginTop: 6 }}>
          Texte libre.{' '}
          <button type="button" className="btn-link" onClick={() => {
            const s = lireHoraires('') ?? semaineVide();
            setSemaine(s); setLibre(false); onChange('');
          }}>Utiliser le sélecteur (remplace ce texte)</button>
        </p>
      </div>
    );
  }

  const resume = texteHoraires(semaine);
  return (
    <div className="champ-horaires">
      <div className="champ-horaires-modeles">
        {MODELES.map((m) => (
          <button key={m.label} type="button" className="chip-filter" onClick={() => maj(m.semaine())}>{m.label}</button>
        ))}
        {resume && <button type="button" className="chip-filter" onClick={() => maj(semaineVide())}>Tout effacer</button>}
      </div>
      <div className="champ-horaires-jours">
        {semaine.map((j, i) => (
          <div key={i} className={`champ-horaires-jour ${j.ouvert ? 'ouvert' : ''}`}>
            <button type="button" role="switch" aria-checked={j.ouvert} aria-label={`${JOURS_LONGS[i]} : ${j.ouvert ? 'ouvert' : 'fermé'}`}
                    className={`champ-horaires-switch ${j.ouvert ? 'on' : ''}`} onClick={() => changerJour(i, { ouvert: !j.ouvert })}>
              <span />
            </button>
            <span className="champ-horaires-nom">{JOURS_LONGS[i]}</span>
            {j.ouvert ? (
              <>
                <Select ariaLabel={`${JOURS_LONGS[i]} : ouverture`} size="sm" value={j.de} options={OPTIONS_HEURE.filter((o) => o.value < '23:30')} onChange={(v) => changerJour(i, { de: v })} minWidth={92} />
                <span className="champ-horaires-a">à</span>
                <Select ariaLabel={`${JOURS_LONGS[i]} : fermeture`} size="sm" value={j.a} options={OPTIONS_HEURE.filter((o) => o.value > j.de)} onChange={(v) => changerJour(i, { a: v })} minWidth={92} />
                <button type="button" className="champ-horaires-copie" title="Appliquer ces heures à tous les jours ouverts" onClick={() => copierSurOuverts(i)}>Pour tous</button>
              </>
            ) : <span className="champ-horaires-ferme">Fermé</span>}
          </div>
        ))}
      </div>
      <p className="champ-horaires-resume">{resume ? <>Affiché aux clients : <strong>{resume}</strong></> : <span className="hint">Aucun horaire : le point s'affichera sans horaires.</span>}</p>
    </div>
  );
}
