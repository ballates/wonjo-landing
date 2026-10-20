import { useEffect, useMemo, useRef, useState } from 'react';
import { RACCOURCIS, debutDeJour, finDeJour, libellePlage, plageDuRaccourci, type Plage } from '../lib/periode';

const memeJour = (a: Date, b: Date) => a.getTime() === b.getTime();

// Filtre de periode (porte du filtre d'administration de Lampas) : raccourcis a gauche, calendrier a deux clics a droite. Les jours a venir sont
// grises ; le second clic applique la plage. Echap, clic dehors ou choix d'un raccourci le ferment.
export function FiltrePeriode({ valeur, onChange }: { valeur: Plage; onChange: (p: Plage) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [mois, setMois] = useState(() => debutDeJour(valeur.to));
  const [premier, setPremier] = useState<Date | null>(null);
  const [survol, setSurvol] = useState<Date | null>(null);
  const racine = useRef<HTMLDivElement>(null);
  const aujourdhui = debutDeJour(new Date());

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => { if (!racine.current?.contains(e.target as Node)) setOuvert(false); };
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') setOuvert(false); };
    document.addEventListener('mousedown', dehors);
    document.addEventListener('keydown', echap);
    return () => { document.removeEventListener('mousedown', dehors); document.removeEventListener('keydown', echap); };
  }, [ouvert]);

  function basculer() {
    if (!ouvert) { setMois(debutDeJour(valeur.to)); setPremier(null); setSurvol(null); }
    setOuvert((o) => !o);
  }

  // La plage en cours de tracage : premier clic + jour survole, sinon la plage appliquee.
  const affichee = useMemo(() => {
    if (premier) {
      const autre = survol ?? premier;
      return premier <= autre ? { from: premier, to: autre } : { from: autre, to: premier };
    }
    return { from: debutDeJour(valeur.from), to: debutDeJour(valeur.to) };
  }, [premier, survol, valeur]);

  const debutMois = new Date(mois.getFullYear(), mois.getMonth(), 1);
  const nbJours = new Date(mois.getFullYear(), mois.getMonth() + 1, 0).getDate();
  const decalage = (debutMois.getDay() + 6) % 7; // semaine commencant le lundi
  const cases: (Date | null)[] = [
    ...Array.from({ length: decalage }, () => null),
    ...Array.from({ length: nbJours }, (_, i) => new Date(mois.getFullYear(), mois.getMonth(), i + 1)),
  ];
  const moisCourant = debutMois.getFullYear() === aujourdhui.getFullYear() && debutMois.getMonth() === aujourdhui.getMonth();
  const jours = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  function choisir(jour: Date) {
    if (!premier) { setPremier(jour); return; }
    const [from, to] = premier <= jour ? [premier, jour] : [jour, premier];
    onChange({ from, to: finDeJour(to), raccourci: 'custom' });
    setPremier(null);
    setOuvert(false);
  }

  return (
    <div className="fp" ref={racine}>
      <button type="button" className={`fp-bouton ${ouvert ? 'ouvert' : ''}`} onClick={basculer} aria-haspopup="dialog" aria-expanded={ouvert}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>
        {libellePlage(valeur)}
        <svg className="fp-chevron" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {ouvert && (
        <div className="fp-popover" role="dialog" aria-label="Période">
          <ul className="fp-raccourcis">
            {RACCOURCIS.map((r) => (
              <li key={r.id}>
                <button type="button" className={valeur.raccourci === r.id ? 'actif' : ''} onClick={() => { onChange(plageDuRaccourci(r.id)); setOuvert(false); }}>
                  {r.label}
                  {valeur.raccourci === r.id && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>}
                </button>
              </li>
            ))}
          </ul>
          <div className="fp-calendrier">
            <div className="fp-mois">
              <button type="button" aria-label="Mois précédent" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}>‹</button>
              <strong>{mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>
              <button type="button" aria-label="Mois suivant" disabled={moisCourant} onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}>›</button>
            </div>
            <div className="fp-semaine">{jours.map((j, i) => <span key={i}>{j}</span>)}</div>
            <div className="fp-grille" onMouseLeave={() => setSurvol(null)}>
              {cases.map((jour, i) => {
                if (!jour) return <span key={`v${i}`} />;
                const futur = jour > aujourdhui;
                const bord = memeJour(jour, affichee.from) || memeJour(jour, affichee.to);
                const dedans = jour >= affichee.from && jour <= affichee.to;
                return (
                  <button key={jour.getTime()} type="button" disabled={futur} onClick={() => choisir(jour)} onMouseEnter={() => premier && setSurvol(jour)}
                          className={`fp-jour ${futur ? 'futur' : bord ? 'bord' : dedans ? 'dedans' : ''} ${memeJour(jour, aujourdhui) ? 'auj' : ''}`}>
                    {jour.getDate()}
                  </button>
                );
              })}
            </div>
            {premier && <p className="fp-aide">Choisissez le dernier jour de la plage.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
