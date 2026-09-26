// Affiche un nombre formate (plus d'animation de comptage).
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('fr-FR') }: { value: number; format?: (n: number) => string }) {
  return <>{format(value)}</>;
}

export const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const pourcent = (n: number) => `${Math.round(n)} %`;

export function Kpi({ label, value, format, hint }: { label: string; value: number; format?: (n: number) => string; hint?: string; index?: number }) {
  return (
    <div className="card">
      <span className="card-value"><AnimatedNumber value={value} format={format} /></span>
      <span className="card-label">{label}</span>
      {hint && <span className="card-hint">{hint}</span>}
    </div>
  );
}

interface VizTooltipEntry { dataKey: string; name: string; value: number; }
interface VizTooltipProps { active?: boolean; payload?: VizTooltipEntry[]; label?: string; formatter?: (v: number) => string; }

export function VizTooltip({ active, payload, label, formatter }: VizTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="viz-tooltip">
      <strong>{label}</strong>
      {payload.map((p) => (
        <div key={p.dataKey}>{p.name} : {formatter ? formatter(p.value) : p.value}</div>
      ))}
    </div>
  );
}
