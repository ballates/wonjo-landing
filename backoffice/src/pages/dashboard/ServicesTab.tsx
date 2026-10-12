import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { AnimatedNumber } from '../../components/Kpi';

// [388] Consommation des services gratuits sous quota : e-mails Resend et verifications Didit. Les
// chiffres viennent de nos propres comptages (admin_consommation_services), pas des fournisseurs :
// ils commencent le 12 oct. 2026 et le « mois » est le mois calendaire, heure de Paris.

interface Consommation {
  depuis: string | null;
  resend: {
    jour: number; semaine: number; mois: number;
    quota_jour: number | null; quota_mois: number | null;
    par_source: { source: string; nb: number }[];
  };
  didit: { jour: number; semaine: number; mois: number; sessions_mois: number; quota_mois: number | null };
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

function Jauge({ valeur, quota }: { valeur: number; quota: number | null }) {
  if (!quota) return null;
  const part = Math.min(100, Math.round((valeur / quota) * 100));
  const couleur = valeur >= quota ? 'var(--danger)' : part >= 80 ? '#C47F00' : undefined;
  return (
    <div className="rg-jauge" style={{ margin: '8px 0 4px' }} aria-label={`${part} % du quota`}>
      <span style={{ width: `${part}%`, ...(couleur ? { background: couleur } : {}) }} />
    </div>
  );
}

function Ligne({ label, valeur, quota }: { label: string; valeur: number; quota?: number | null }) {
  const depasse = quota != null && valeur >= quota;
  return (
    <div className="info-row">
      <span className="info-row-label">{label}</span>
      <span className="info-row-value" style={depasse ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
        {valeur.toLocaleString('fr-FR')}{quota != null && ` / ${quota.toLocaleString('fr-FR')}`}
      </span>
    </div>
  );
}

function Carte({ titre, sous, mois, quota, unite, children }: {
  titre: string; sous: string; mois: number; quota: number | null; unite: string; children: ReactNode;
}) {
  const reste = quota != null ? Math.max(0, quota - mois) : null;
  return (
    <div className="chart-card">
      <h3 style={{ margin: 0 }}>{titre}</h3>
      <p className="chart-sub">{sous}</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <strong style={{ fontSize: 30, fontWeight: 800 }}><AnimatedNumber value={mois} /></strong>
        {quota != null && <span className="hint">/ {quota.toLocaleString('fr-FR')} {unite} ce mois</span>}
      </div>
      <Jauge valeur={mois} quota={quota} />
      {reste != null && <p className="hint" style={{ margin: '0 0 10px' }}>{reste === 0 ? 'Quota du mois atteint' : `Il en reste ${reste.toLocaleString('fr-FR')} ce mois-ci`}</p>}
      <div className="info-rows">{children}</div>
    </div>
  );
}

export function ServicesTab() {
  const [c, setC] = useState<Consommation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_consommation_services').then(({ data, error: rpcError }) => {
      if (rpcError) { setError(rpcError.message); return; }
      setC(data as Consommation);
    });
  }, []);

  if (error) return <p className="page-error">{error}</p>;
  if (!c) return <p className="loading-state">Chargement…</p>;

  const depuis = c.depuis ? new Date(c.depuis).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  return (
    <section className="viz-root">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        <Carte titre="E-mails (Resend)" sous="Plan gratuit : 3 000 par mois et 100 par jour. Un e-mail à plusieurs destinataires compte pour chacun."
          mois={c.resend.mois} quota={c.resend.quota_mois} unite="e-mails">
          <Ligne label="Aujourd'hui" valeur={c.resend.jour} quota={c.resend.quota_jour} />
          <Ligne label="7 derniers jours" valeur={c.resend.semaine} />
          {c.resend.par_source.map((s) => (
            <Ligne key={s.source} label={SOURCES[s.source] ?? s.source} valeur={s.nb} />
          ))}
        </Carte>
        <Carte titre="Vérifications d'identité (Didit)" sous="Didit facture les vérifications menées au bout (verdict ou revue), pas les sessions abandonnées."
          mois={c.didit.mois} quota={c.didit.quota_mois} unite="vérifications">
          <Ligne label="Aujourd'hui" valeur={c.didit.jour} />
          <Ligne label="7 derniers jours" valeur={c.didit.semaine} />
          <Ligne label="Sessions ouvertes ce mois" valeur={c.didit.sessions_mois} />
        </Carte>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Compté par Wonjo à chaque envoi et chaque vérification{depuis ? `, depuis le ${depuis}` : ' (aucun envoi compté pour l\'instant)'}. Le mois est le mois calendaire ;
        les fournisseurs remettent leur compteur à zéro à leur propre date. Les quotas se règlent dans app_config
        (quota_resend_mois, quota_resend_jour, quota_didit_mois).
      </p>
    </section>
  );
}
