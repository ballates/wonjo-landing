// Montant entier saisi a la main, groupe par milliers pendant la frappe (« 1 500 000 ») avec son unite (« FCFA »).
// La valeur reste une chaine : les appelants la lisent deja en retirant les espaces (Number(v.replace(/\s/g, ''))).

export function grouperMontant(v: string | number | null | undefined): string {
  const chiffres = String(v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return chiffres.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function ChampMontant({ valeur, onChange, unite, ariaLabel, invalide, autoFocus, placeholder }: {
  valeur: string;
  onChange: (v: string) => void;
  unite?: string;
  ariaLabel?: string;
  invalide?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <span className={`champ-montant ${invalide ? 'champ-invalide' : ''}`}>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        value={grouperMontant(valeur)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(grouperMontant(e.target.value))}
      />
      {unite && <span className="champ-montant-unite">{unite}</span>}
    </span>
  );
}
