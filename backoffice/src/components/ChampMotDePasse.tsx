import { useState } from 'react';
import { IconEye, IconEyeOff } from './Icons';

export function ChampMotDePasse({ value, onChange, ...props }: {
  value: string;
  onChange: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="champ-mot-de-passe">
      <input type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} {...props} />
      <button
        type="button"
        className="champ-mot-de-passe-bascule"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        tabIndex={-1}
      >
        {visible ? <IconEyeOff /> : <IconEye />}
      </button>
    </div>
  );
}
