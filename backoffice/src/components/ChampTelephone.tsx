import { useEffect, useMemo, useState } from 'react';
import { Select } from './Select';
import { Drapeau } from './Drapeau';
import { TELEPHONE_PAYS, aideNumero, decomposerNumero, grouperNumero, numeroInternational } from '../lib/telephone';

const NOMS_HORS_AFRIQUE: Record<string, string> = {
  FR: 'France', BE: 'Belgique', CH: 'Suisse', LU: 'Luxembourg', ES: 'Espagne', PT: 'Portugal', IT: 'Italie',
  NL: 'Pays-Bas', GB: 'Royaume-Uni', US: 'États-Unis / Canada',
};

// Indicatif (drapeau + code) et numero formate pendant la frappe. `valeur` est la forme enregistree
// (« +221 77 123 45 67 ») ; `pays` choisit l'indicatif par defaut quand le champ est vide (le pays du
// point), sans ecraser un numero deja saisi avec un autre indicatif.
export function ChampTelephone({ valeur, onChange, pays, nomsPays, placeholder, ariaLabel = 'Téléphone', invalide, compact }: {
  valeur: string;
  onChange: (v: string) => void;
  pays: string;
  nomsPays: Record<string, string>;
  placeholder?: string;
  ariaLabel?: string;
  invalide?: boolean;
  /** Largeur du champ réduite au numéro le plus long de la liste des pays (14 caractères groupés + un zéro de tête), au lieu de remplir la ligne. */
  compact?: boolean;
}) {
  const initial = useMemo(() => decomposerNumero(valeur, pays || 'SN'), []); // eslint-disable-line react-hooks/exhaustive-deps
  // Sans pays choisi et sans numero, aucun indicatif n'est suppose : on attend le choix du pays (ou de l'indicatif).
  const [iso, setIso] = useState(valeur ? initial.iso : (pays || ''));
  const [local, setLocal] = useState(valeur ? initial.local : '');

  // Le pays du point change et rien n'est saisi : l'indicatif suit.
  useEffect(() => {
    if (!local && pays && TELEPHONE_PAYS[pays]) setIso(pays);
  }, [pays]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => Object.entries(TELEPHONE_PAYS)
    .map(([code, p]) => ({
      value: code,
      label: p.indicatif,
      icon: <Drapeau iso={code} />,
      hint: nomsPays[code] ?? NOMS_HORS_AFRIQUE[code] ?? code,
    }))
    .sort((a, b) => (a.value === pays ? -1 : b.value === pays ? 1 : (a.hint ?? '').localeCompare(b.hint ?? '', 'fr'))),
  [nomsPays, pays]);

  function changerIso(v: string) {
    setIso(v);
    onChange(numeroInternational(v, local));
  }
  function changerLocal(v: string) {
    const groupe = grouperNumero(v, iso);
    setLocal(groupe);
    onChange(numeroInternational(iso, groupe));
  }

  const aide = iso ? aideNumero(iso, numeroInternational(iso, local)) : '';
  return (
    <span className="champ-tel-bloc">
    <div className={`champ-tel ${aide ? 'champ-tel--incomplet' : ''} ${invalide ? 'champ-tel--invalide' : ''} ${compact ? 'champ-tel--compact' : ''}`}>
      <Select ariaLabel={`Indicatif - ${ariaLabel}`} value={iso} onChange={changerIso} options={iso ? options : [{ value: '', label: 'Indicatif' }, ...options]} minWidth={112} />
      <input
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-label={ariaLabel}
        value={local}
        disabled={!iso}
        placeholder={!iso ? 'Choisissez le pays' : placeholder ?? grouperNumero('7'.repeat((TELEPHONE_PAYS[iso]?.groupes ?? [2, 2, 2, 2]).reduce((a, b) => a + b, 0)), iso)}
        onChange={(e) => changerLocal(e.target.value)}
      />
    </div>
    {aide && <span className="champ-tel-aide">{aide}</span>}
    </span>
  );
}
