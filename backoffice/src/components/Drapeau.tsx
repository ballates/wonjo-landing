import { useState } from 'react';

// Drapeau d'un pays en image : les drapeaux emoji ne s'affichent pas sous Windows (deux lettres a la
// place). Image flagcdn (CSP img-src https:, referrer coupe) ; si elle ne charge pas, le code pays.
export function Drapeau({ iso, taille = 18 }: { iso: string; taille?: number }) {
  const [rate, setRate] = useState(false);
  const code = iso.trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code) || rate) {
    return <span className="drapeau drapeau--code" style={{ height: Math.round(taille * 0.75) }}>{code.toUpperCase()}</span>;
  }
  return (
    <img
      className="drapeau"
      src={`https://flagcdn.com/w40/${code}.png`}
      alt=""
      width={taille}
      height={Math.round(taille * 0.75)}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setRate(true)}
    />
  );
}
