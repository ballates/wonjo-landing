import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, LabelList } from 'recharts';
import { supabase } from '../../lib/supabase';
import { Kpi, VizTooltip, pourcent } from '../../components/Kpi';
import { IconChevronRight } from '../../components/Icons';
import { LABELS_BADGES, LABELS_CATEGORIE_AVIS, LABELS_STATUT_KYC } from '../../lib/labels';
import type { AvisDashboard } from '../../lib/types';

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
        <Bar dataKey="nb" name="Membres" fill="var(--teal)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
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

const COULEUR_NOTE = (n: number) => (n <= 2 ? 'var(--badge-danger-fg)' : n === 5 ? 'var(--badge-green-fg)' : 'var(--badge-amber-fg)');

export function CommunauteTab() {
  const navigate = useNavigate();
  const [s, setS] = useState<StatsCommunaute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avis, setAvis] = useState<AvisDashboard | null>(null);

  useEffect(() => {
    supabase.rpc('admin_stats_communaute').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setS(data as StatsCommunaute);
    });
    supabase.rpc('admin_avis_dashboard').then(({ data, error: e }) => {
      if (!e) setAvis(data as AvisDashboard);
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
  const badges = Object.values(
    s.badges.reduce<Record<string, { label: string; nb: number }>>((acc, b) => {
      const label = LABELS_BADGES[b.type] ?? b.type;
      acc[label] = { label, nb: (acc[label]?.nb ?? 0) + b.nb };
      return acc;
    }, {}),
  );
  const kyc = ['approved', 'pending', 'rejected', 'none'].map((k) => ({ label: LABELS_STATUT_KYC[k] ?? k, nb: s.kyc[k] ?? 0 }));
  const distributionNotes = [5, 4, 3, 2, 1].map((n) => ({ label: `${n} ★`, note: n, nb: avis?.distribution[String(n)] ?? 0 }));
  const dist = avis?.distribution ?? {};
  const compterNotes = (notes: number[]) => notes.reduce((total, n) => total + (dist[String(n)] ?? 0), 0);
  const categoriesAvis = [
    { cle: 'negatif', icone: '🔴', nb: compterNotes([1, 2]) },
    { cle: 'intermediaire', icone: '🟠', nb: compterNotes([3]) },
    { cle: 'positif', icone: '🟢', nb: compterNotes([4, 5]) },
  ];

  return (
    <section>
      <div className="cards">
        <Kpi index={0} label="Membres" value={s.total} />
        <Kpi index={1} label="Identité vérifiée" value={pct(s.identite_verifiee, s.total)} format={pourcent} hint={`${s.identite_verifiee} membre(s)`} />
        <Kpi index={2} label="Téléphone vérifié" value={pct(s.telephone_verifie, s.total)} format={pourcent} hint={`${s.telephone_verifie} membre(s)`} />
        <Kpi index={3} label="Non vérifiés" value={s.aucune_verification} hint={`${pct(s.aucune_verification, s.total)} % des membres`} />
        <Kpi index={4} label="Réputation élevée" value={pct((s.niveaux.ambassadeur ?? 0) + (s.niveaux.legende ?? 0), s.total)} format={pourcent} hint={`${(s.niveaux.ambassadeur ?? 0) + (s.niveaux.legende ?? 0)} ambassadeurs ou légendes`} />
        <Kpi index={5} label="Note moyenne" value={Number(s.avis.note_moyenne ?? 0)} format={(n) => `${n.toFixed(1)} / 5`} hint={`${s.avis.nb} avis`} />
      </div>

      <div className="chart-card">
        <h3>Joignabilité et paiements</h3>
        <div className="stat-list stat-list--nowrap">
          <div><strong>{s.stripe_configure}</strong><span>paiement configuré</span></div>
          <div><strong>{s.push_actif}</strong><span>notifications activées</span></div>
          <div><strong>{s.avis.note_moyenne ?? '-'} / 5</strong><span>note moyenne ({s.avis.nb})</span></div>
          <div><strong>{s.bloques}</strong><span>comptes bloqués</span></div>
          {s.langues.map((l) => (
            <div key={l.langue}><strong>{l.nb}</strong><span>{l.langue === 'fr' ? 'français' : l.langue === 'en' ? 'anglais' : l.langue}</span></div>
          ))}
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-head">
          <div>
            <h3>Avis à surveiller</h3>
            <p className="chart-sub">Répartition des notes. Cliquez une catégorie pour voir le détail dans Avis.</p>
          </div>
          {avis && (
            <div className="action-row">
              {categoriesAvis.map((c) => (
                <button
                  key={c.cle}
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() => navigate('/avis', { state: { categorie: c.cle } })}
                >
                  {c.icone} {LABELS_CATEGORIE_AVIS[c.cle]} ({c.nb}) <IconChevronRight />
                </button>
              ))}
            </div>
          )}
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={distributionNotes} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
            <CartesianGrid stroke="var(--grid-line)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis dataKey="label" type="category" tick={{ fontSize: 12.5, fill: 'var(--text)' }} axisLine={false} tickLine={false} width={40} />
            <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--hover)' }} />
            <Bar dataKey="nb" name="Avis" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
              {distributionNotes.map((d) => <Cell key={d.note} fill={COULEUR_NOTE(d.note)} />)}
              <LabelList dataKey="nb" position="right" style={{ fill: 'var(--text)', fontSize: 12, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
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
    </section>
  );
}
