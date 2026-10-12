import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell } from 'recharts';
import { supabase } from '../../lib/supabase';
import { AnimatedNumber, VizTooltip } from '../../components/Kpi';

// [388-389] Consommation des services gratuits sous quota : e-mails Resend et verifications Didit, mois
// par mois. Les chiffres viennent de nos propres comptages (admin_consommation_services), pas des
// fournisseurs : ils commencent le 12 oct. 2026 et le mois est le mois calendaire, heure de Paris.

interface Point { jour: string; nb: number }
interface Consommation {
  depuis: string | null;
  mois: string;
  mois_courant: boolean;
  mois_disponibles: string[];
  resend: {
    jour: number; semaine: number; mois: number; mois_precedent: number;
    quota_jour: number | null; quota_mois: number | null;
    par_source: { source: string; nb: number }[];
    serie: Point[];
  };
  didit: {
    jour: number; semaine: number; mois: number; mois_precedent: number;
    sessions_mois: number; quota_mois: number | null; serie: Point[];
  };
}

const SOURCES: Record<string, string> = {
  'send-transactional-email': 'E-mails des transactions',
  'send-verification-otp': 'Codes d\'inscription',
  'send-auth-email': 'Mot de passe oublié',
  'send-kyc-email': 'Vérification d\'identité',
  'alerte-securite': 'Alertes de sécurité',
  'alerte-arbitrage': 'Arbitrages de litige',
  'alerte-commission': 'Changements de commission',
  'admin-envoyer-email': 'Campagnes du back-office',
  'admin-apercu-email': 'E-mails de test',
  'kyc-webhook': 'Revues KYC envoyées à l\'équipe',
};

const nombre = (n: number) => n.toLocaleString('fr-FR');

function nomMois(mois: string, court = false): string {
  const [a, m] = mois.split('-').map(Number);
  const t = new Date(a, m - 1, 1).toLocaleDateString('fr-FR', court ? { month: 'long' } : { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function moisVoisin(mois: string, decalage: number): string {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(a, m - 1 + decalage, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Tous les jours du mois, zeros compris : un graphique sans les jours creux mentirait sur le rythme.
function joursDuMois(mois: string, serie: Point[]) {
  const [a, m] = mois.split('-').map(Number);
  const n = new Date(a, m, 0).getDate();
  const parJour = new Map(serie.map((p) => [p.jour, Number(p.nb)]));
  return Array.from({ length: n }, (_, i) => {
    const jour = `${mois}-${String(i + 1).padStart(2, '0')}`;
    return { jour, label: String(i + 1), nb: parJour.get(jour) ?? 0 };
  });
}

type Niveau = 'ok' | 'attention' | 'atteint';
const niveau = (valeur: number, quota: number | null): Niveau =>
  !quota ? 'ok' : valeur >= quota ? 'atteint' : valeur >= quota * 0.8 ? 'attention' : 'ok';
const LIBELLE_NIVEAU: Record<Niveau, string> = { ok: 'Dans le quota', attention: 'Proche du quota', atteint: 'Quota atteint' };

function Anneau({ valeur, quota }: { valeur: number; quota: number | null }) {
  const part = quota ? Math.min(1, valeur / quota) : 0;
  const r = 34;
  const tour = 2 * Math.PI * r;
  const n = niveau(valeur, quota);
  return (
    <div className={`svc-anneau svc-anneau--${n}`}>
      <svg viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r={r} className="svc-anneau-fond" />
        <circle cx="40" cy="40" r={r} className="svc-anneau-trait" strokeDasharray={tour} strokeDashoffset={tour * (1 - part)} />
      </svg>
      <span>{quota ? `${Math.round(part * 100)} %` : '-'}</span>
    </div>
  );
}

function Evolution({ actuel, precedent, mois }: { actuel: number; precedent: number; mois: string }) {
  const nom = nomMois(moisVoisin(mois, -1), true).toLowerCase();
  if (precedent === 0) return <span className="svc-evol">Rien compté en {nom}{actuel > 0 ? ', pas de comparaison' : ''}</span>;
  const delta = Math.round(((actuel - precedent) / precedent) * 100);
  const sens = delta > 0 ? 'hausse' : delta < 0 ? 'baisse' : 'stable';
  return (
    <span className={`svc-evol svc-evol--${sens}`}>
      {delta > 0 ? '+' : ''}{delta} % <span>vs {nom} ({nombre(precedent)})</span>
    </span>
  );
}

function Stat({ label, valeur, quota }: { label: string; valeur: ReactNode; quota?: number | null }) {
  return (
    <div className="svc-stat">
      <span>{label}</span>
      <strong>{valeur}{quota != null && <small> / {nombre(quota)}</small>}</strong>
    </div>
  );
}

function Graphique({ mois, serie, quotaJour, couleur, nom }: {
  mois: string; serie: Point[]; quotaJour?: number | null; couleur: string; nom: string;
}) {
  const donnees = useMemo(() => joursDuMois(mois, serie), [mois, serie]);
  const max = Math.max(0, ...donnees.map((d) => d.nb));
  if (max === 0) return <p className="svc-vide">Aucun envoi compté ce mois-ci.</p>;
  return (
    <div className="svc-graph">
      <ResponsiveContainer width="100%" height={130}>
        <BarChart data={donnees} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} interval={4} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={40}
            domain={[0, (m: number) => Math.max(m, quotaJour && max >= quotaJour * 0.6 ? quotaJour : 0)]} />
          <Tooltip content={<VizTooltip />} cursor={{ fill: 'var(--hover)' }} />
          {quotaJour && max >= quotaJour * 0.6 && (
            <ReferenceLine y={quotaJour} stroke="var(--danger)" strokeDasharray="4 4" label={{ value: `${quotaJour} / jour`, position: 'insideTopRight', fontSize: 10, fill: 'var(--danger)' }} />
          )}
          <Bar dataKey="nb" name={nom} radius={[4, 4, 0, 0]} maxBarSize={12} isAnimationActive={false}>
            {donnees.map((d) => <Cell key={d.jour} fill={quotaJour && d.nb >= quotaJour ? 'var(--danger)' : couleur} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Carte({ titre, plan, mois, valeur, precedent, quota, unite, children }: {
  titre: string; plan: string; mois: string; valeur: number; precedent: number; quota: number | null; unite: string; children: ReactNode;
}) {
  const n = niveau(valeur, quota);
  const reste = quota != null ? Math.max(0, quota - valeur) : null;
  return (
    <article className="chart-card svc-carte">
      <header className="svc-tete">
        <div>
          <h3>{titre}</h3>
          <p className="chart-sub">{plan}</p>
        </div>
        <span className={`svc-pastille svc-pastille--${n}`}>{LIBELLE_NIVEAU[n]}</span>
      </header>
      <div className="svc-resume">
        <Anneau valeur={valeur} quota={quota} />
        <div className="svc-chiffres">
          <div className="svc-total">
            <strong><AnimatedNumber value={valeur} /></strong>
            {quota != null && <span>/ {nombre(quota)} {unite}</span>}
          </div>
          {reste != null && <p className="svc-reste">{reste === 0 ? 'Plus rien de gratuit ce mois-là' : `Il en reste ${nombre(reste)}`}</p>}
          <Evolution actuel={valeur} precedent={precedent} mois={mois} />
        </div>
      </div>
      {children}
    </article>
  );
}

function Sources({ sources }: { sources: { source: string; nb: number }[] }) {
  if (sources.length === 0) return null;
  const max = Math.max(...sources.map((s) => Number(s.nb)));
  return (
    <div className="svc-sources">
      <p className="svc-sous-titre">D'où partent les e-mails</p>
      {sources.map((s) => (
        <div key={s.source} className="svc-source">
          <span className="svc-source-nom">{SOURCES[s.source] ?? s.source}</span>
          <span className="svc-source-barre"><span style={{ width: `${(Number(s.nb) / max) * 100}%` }} /></span>
          <span className="svc-source-nb">{nombre(Number(s.nb))}</span>
        </div>
      ))}
    </div>
  );
}

function SelecteurMois({ mois, disponibles, courant, onChange }: {
  mois: string; disponibles: string[]; courant: boolean; onChange: (m: string) => void;
}) {
  const liste = disponibles.includes(mois) ? disponibles : [mois, ...disponibles];
  const i = liste.indexOf(mois);
  const plusRecent = i > 0 ? liste[i - 1] : null;
  const plusAncien = i < liste.length - 1 ? liste[i + 1] : null;
  return (
    <div className="svc-mois" role="group" aria-label="Mois affiché">
      <button className="svc-mois-fleche" disabled={!plusAncien} onClick={() => plusAncien && onChange(plusAncien)} aria-label="Mois précédent">‹</button>
      <label className="svc-mois-choix">
        <select value={mois} onChange={(e) => onChange(e.target.value)} aria-label="Choisir un mois">
          {liste.map((m) => <option key={m} value={m}>{nomMois(m)}</option>)}
        </select>
        <span aria-hidden="true">{nomMois(mois)}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </label>
      <button className="svc-mois-fleche" disabled={!plusRecent} onClick={() => plusRecent && onChange(plusRecent)} aria-label="Mois suivant">›</button>
      {!courant && liste[0] && <button className="svc-mois-retour" onClick={() => onChange(liste[0])}>Mois en cours</button>}
    </div>
  );
}

export function ServicesTab() {
  const [mois, setMois] = useState<string | null>(null);
  const [c, setC] = useState<Consommation | null>(null);
  const [chargement, setChargement] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    setChargement(true);
    supabase.rpc('admin_consommation_services', { p_mois: mois ? `${mois}-01` : null }).then(({ data, error: rpcError }) => {
      if (!actif) return;
      setChargement(false);
      if (rpcError) { setError(rpcError.message); return; }
      setError(null);
      setC(data as Consommation);
    });
    return () => { actif = false; };
  }, [mois]);

  if (error && !c) return <p className="page-error">{error}</p>;
  if (!c) return <p className="loading-state">Chargement…</p>;

  const tauxDidit = c.didit.sessions_mois > 0 ? Math.round((c.didit.mois / c.didit.sessions_mois) * 100) : null;
  const pic = (serie: Point[]) => Math.max(0, ...serie.map((p) => Number(p.nb)));

  return (
    <section className={`viz-root svc${chargement ? ' svc--charge' : ''}`}>
      <div className="svc-barre">
        <div>
          <h2 className="svc-titre">Services sous quota</h2>
          <p className="chart-sub">{c.mois_courant ? 'Mois en cours, mis à jour à chaque ouverture.' : `Bilan de ${nomMois(c.mois).toLowerCase()}.`}</p>
        </div>
        <SelecteurMois mois={c.mois} disponibles={c.mois_disponibles ?? []} courant={c.mois_courant} onChange={setMois} />
      </div>
      {error && <p className="page-error">{error}</p>}

      <div className="svc-grille">
        <Carte titre="E-mails" plan="Resend · plan gratuit, 3 000 par mois et 100 par jour" mois={c.mois}
          valeur={c.resend.mois} precedent={c.resend.mois_precedent} quota={c.resend.quota_mois} unite="e-mails">
          <div className="svc-stats">
            {c.mois_courant ? (
              <>
                <Stat label="Aujourd'hui" valeur={nombre(c.resend.jour)} quota={c.resend.quota_jour} />
                <Stat label="7 derniers jours" valeur={nombre(c.resend.semaine)} />
              </>
            ) : null}
            <Stat label="Pic d'une journée" valeur={nombre(pic(c.resend.serie))} quota={c.resend.quota_jour} />
          </div>
          <Graphique mois={c.mois} serie={c.resend.serie} quotaJour={c.resend.quota_jour} couleur="var(--teal)" nom="E-mails" />
          <Sources sources={c.resend.par_source} />
        </Carte>

        <Carte titre="Vérifications d'identité" plan="Didit · 500 gratuites par mois, seules les vérifications menées au bout comptent"
          mois={c.mois} valeur={c.didit.mois} precedent={c.didit.mois_precedent} quota={c.didit.quota_mois} unite="vérifications">
          <div className="svc-stats">
            {c.mois_courant && (
              <>
                <Stat label="Aujourd'hui" valeur={nombre(c.didit.jour)} />
                <Stat label="7 derniers jours" valeur={nombre(c.didit.semaine)} />
              </>
            )}
            <Stat label="Sessions ouvertes" valeur={nombre(c.didit.sessions_mois)} />
            <Stat label="Menées au bout" valeur={tauxDidit != null ? `${tauxDidit} %` : '-'} />
          </div>
          <Graphique mois={c.mois} serie={c.didit.serie} couleur="var(--brown)" nom="Vérifications" />
        </Carte>
      </div>

    </section>
  );
}
