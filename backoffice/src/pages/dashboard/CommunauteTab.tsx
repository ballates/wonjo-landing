import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { supabase } from '../../lib/supabase';
import { Kpi, VizTooltip } from '../../components/Kpi';
import { LABELS_BADGES, LABELS_STATUT_KYC } from '../../lib/labels';

interface StatsCommunaute {
  total: number;
  bloques: number;
  identite_verifiee: number;
  telephone_verifie: number;
  non_verifies: number;
  aucune_verification: number;
  stripe_configure: number;
  push_actif: number;
  actifs_7j: number;
  actifs_30j: number;
  inactifs_30j: number;
  kyc: Record<string, number>;
  niveaux: Record<string, number>;
  badges: { type: string; nb: number }[];
  langues: { langue: string; nb: number }[];
  avis: { nb: number; note_moyenne: number | null };
  entonnoir: Record<string, number>;
}


const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

function HBar({ data, height }: { data: { label: string; nb: number; pct?: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(140, data.length * 46)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
        <YAxis dataKey="label" type="category" tick={{ fontSize: 12.5, fill: 'var(--text)' }} axisLine={false} tickLine={false} width={150} />
        <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--hover)' }} />
        <Bar dataKey="nb" name="Membres" fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive animationDuration={700}>
          <LabelList
            dataKey="nb"
            position="right"
            style={{ fill: 'var(--text)', fontSize: 12, fontWeight: 700 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CommunauteTab() {
  const [s, setS] = useState<StatsCommunaute | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_stats_communaute').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setS(data as StatsCommunaute);
    });
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!s) return <p className="loading-state">Chargement…</p>;

  const e = s.entonnoir;
  const entonnoir = [
    { label: 'Inscrits', nb: e.inscrits },
    { label: 'Téléphone vérifié', nb: e.telephone_verifie },
    { label: 'Identité vérifiée', nb: e.identite_verifiee },
    { label: '1re transaction', nb: e.premiere_transaction },
    { label: '1re livraison', nb: e.premiere_livraison },
  ];
  const niveaux = [
    { label: 'Débutant (0-4)', nb: s.niveaux.debutant ?? 0 },
    { label: 'Ambassadeur (5-10)', nb: s.niveaux.ambassadeur ?? 0 },
    { label: 'Légende (11+)', nb: s.niveaux.legende ?? 0 },
  ];
  const badges = s.badges.map((b) => ({ label: LABELS_BADGES[b.type] ?? b.type, nb: b.nb }));
  const kyc = ['approved', 'pending', 'rejected', 'none'].map((k) => ({ label: LABELS_STATUT_KYC[k] ?? k, nb: s.kyc[k] ?? 0 }));

  return (
    <section>
      <div className="cards">
        <Kpi index={0} label="Membres" value={s.total} />
        <Kpi index={1} label="Identité vérifiée" value={s.identite_verifiee} hint={`${pct(s.identite_verifiee, s.total)} % des membres`} />
        <Kpi index={2} label="Téléphone vérifié" value={s.telephone_verifie} hint={`${pct(s.telephone_verifie, s.total)} %`} />
        <Kpi index={3} label="Non vérifiés (identité)" value={s.non_verifies} hint={`dont ${s.aucune_verification} sans aucune vérif.`} />
        <Kpi index={4} label="Actifs (7 jours)" value={s.actifs_7j} hint={`${s.actifs_30j} sur 30 jours`} />
        <Kpi index={5} label="Inactifs (+30 jours)" value={s.inactifs_30j} hint="à relancer" />
      </div>

      <div className="grid-2">
        <div className="chart-card">
          <h3>Parcours d'un membre</h3>
          <p className="chart-sub">Combien franchissent chaque étape, de l'inscription à la première livraison.</p>
          <HBar data={entonnoir} />
          <p className="insight">
            {pct(e.premiere_transaction, e.inscrits)} % des inscrits ont déjà fait une transaction,
            {' '}{pct(e.premiere_livraison, e.inscrits)} % ont une livraison réussie.
          </p>
        </div>

        <div className="chart-card">
          <h3>Niveaux de réputation</h3>
          <p className="chart-sub">Même règle que l'app : livraisons + colis expédiés.</p>
          <HBar data={niveaux} />
          <p className="insight">{(s.niveaux.ambassadeur ?? 0) + (s.niveaux.legende ?? 0)} membre(s) ambassadeur ou légende.</p>
        </div>

        <div className="chart-card">
          <h3>Badges obtenus</h3>
          <p className="chart-sub">Nombre de membres portant chaque badge.</p>
          {badges.length ? <HBar data={badges} /> : <p className="hint">Aucun badge attribué.</p>}
        </div>

        <div className="chart-card">
          <h3>Vérification d'identité (KYC)</h3>
          <p className="chart-sub">Répartition des statuts.</p>
          <HBar data={kyc} />
        </div>
      </div>

      <div className="chart-card">
        <h3>Joignabilité et paiements</h3>
        <div className="stat-list">
          <div><strong>{s.stripe_configure}</strong><span>peuvent recevoir un paiement (Stripe configuré)</span></div>
          <div><strong>{s.push_actif}</strong><span>ont activé les notifications</span></div>
          <div><strong>{s.avis.note_moyenne ?? '-'} / 5</strong><span>note moyenne ({s.avis.nb} avis)</span></div>
          <div><strong>{s.bloques}</strong><span>comptes bloqués</span></div>
          {s.langues.map((l) => (
            <div key={l.langue}><strong>{l.nb}</strong><span>langue : {l.langue === 'fr' ? 'français' : l.langue === 'en' ? 'anglais' : l.langue}</span></div>
          ))}
        </div>
      </div>
    </section>
  );
}
