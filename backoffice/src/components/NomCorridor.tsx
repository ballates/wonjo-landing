import { IconArrowLeftRight, IconChevronRight } from './Icons';

// Les noms de corridors stockes en base utilisent tantot "→", tantot
// " vers " (ex. "Europe → Afrique de l'Ouest" / "Europe vers Afrique
// Australe") - affiches avec le meme chevron dans les deux cas.
export function NomCorridor({ nom }: { nom: string }) {
  const parties = nom.split(/\s*→\s*|\s+vers\s+/i).filter(Boolean);
  if (parties.length < 2) return <span>{nom}</span>;
  return (
    <span className="corridors-nom-chevrons">
      {parties.map((partie, i) => (
        <span key={i} className="corridors-nom-partie">
          {i > 0 && <IconChevronRight />}
          {partie}
        </span>
      ))}
    </span>
  );
}

// Zones de tarif enveloppe : deux sens ("Europe ↔ Afrique"), une fleche
// double plutot que le symbole texte "↔".
export function NomZoneEnveloppe({ nom }: { nom: string }) {
  const parties = nom.split(/\s*↔\s*/).filter(Boolean);
  if (parties.length < 2) return <span>{nom}</span>;
  return (
    <span className="corridors-nom-chevrons">
      {parties.map((partie, i) => (
        <span key={i} className="corridors-nom-partie">
          {i > 0 && <IconArrowLeftRight />}
          {partie}
        </span>
      ))}
    </span>
  );
}
