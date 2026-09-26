import { useEffect, useRef, useState } from 'react';
import { animate, motion } from 'framer-motion';

// Chiffre qui "compte" jusqu'a sa valeur a l'affichage.
export function AnimatedNumber({ value, format = (n) => Math.round(n).toLocaleString('fr-FR') }: { value: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setDisplay(value); from.current = value; return; }
    const controls = animate(from.current, value, {
      duration: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setDisplay,
    });
    from.current = value;
    return () => controls.stop();
  }, [value]);
  return <>{format(display)}</>;
}

export const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const pourcent = (n: number) => `${Math.round(n)} %`;

export function Kpi({ label, value, format, hint, index = 0 }: { label: string; value: number; format?: (n: number) => string; hint?: string; index?: number }) {
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05, ease: 'easeOut' }}
    >
      <span className="card-value"><AnimatedNumber value={value} format={format} /></span>
      <span className="card-label">{label}</span>
      {hint && <span className="card-hint">{hint}</span>}
    </motion.div>
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
