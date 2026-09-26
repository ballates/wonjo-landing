import { useState } from 'react';

function initiales(nom: string | null | undefined): string {
  const parts = (nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

export function Avatar({ src, nom, size = 36 }: { src?: string | null; nom?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const showImg = src && !broken;
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} title={nom ?? undefined}>
      {showImg ? <img src={src} alt="" onError={() => setBroken(true)} /> : initiales(nom)}
    </span>
  );
}

export function Person({ src, nom, label, sub, size = 34 }: { src?: string | null; nom: string; label?: string; sub?: string | null; size?: number }) {
  return (
    <span className="person">
      <Avatar src={src} nom={nom} size={size} />
      <span className="person-text">
        <span className="person-name">{(label ?? nom) || '-'}</span>
        {sub && <span className="person-sub">{sub}</span>}
      </span>
    </span>
  );
}
