import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { euros } from './Kpi';

// [460] Rapprochement : l'argent réellement détenu (Stripe, moins ce qui est dû aux voyageurs, plus les caisses des points) doit retomber sur la marge
// nette (acquise + à venir). Vert quand c'est égal, rouge sinon, avec ce qui explique l'écart. Finance et super_admin ; la base décide des droits.

interface Rapprochement {
  egal: boolean;
  stripe: { disponible: number; en_attente: number; total: number; autres_devises: { devise: string; montant: number }[] };
  voyageurs_a_payer: number;
  nb_voyageurs_a_payer: number;
  caisses: number;
  points: { point: string; eur: number }[];
  siege: { recu: number; avance: number; paye_voyageurs: number; poche: number };
  detenu: number;
  marge: { acquise: number; a_venir: number; total: number };
  ecart: number;
  paiements_sans_dossier: { id: string; date: string | null; devise: string; net: number | null }[];
  ecart_explique: number;
  ecart_inexplique: number;
  lu_a: string;
}

const signe = (n: number) => `${n > 0 ? '+' : ''}${euros(n)}`;

export function RapprochementFinance() {
  const [data, setData] = useState<Rapprochement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    setBusy(true);
    setError(null);
    const { data: d, error: e } = await supabase.functions.invoke('admin-rapprochement-finance');
    if (e) {
      const ctx = (e as { context?: Response }).context;
      const corps = ctx ? await ctx.json().catch(() => null) as { error?: string } | null : null;
      setError(corps?.error ?? e.message);
    } else {
      setData(d as Rapprochement);
    }
    setBusy(false);
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  const etat = data ? (data.egal ? 'ok' : 'ecart') : 'attente';
  return (
    <div className={`rapprochement rapprochement--${etat}`}>
      <div className="rapprochement-tete">
        <div>
          <h3>Rapprochement : l'argent réel retombe-t-il sur la marge ?</h3>
          <p className="chart-sub">Stripe, moins l'argent des voyageurs, plus les caisses des points, doit être égal à la marge nette.</p>
        </div>
        <div className="action-row">
          {data && (
            <span className={`rapprochement-badge rapprochement-badge--${etat}`} role="status">
              {data.egal ? 'Égal à la marge nette' : `Écart de ${signe(data.ecart)}`}
            </span>
          )}
          <button type="button" className="btn btn-soft btn-sm" onClick={() => void charger()} disabled={busy}>{busy ? 'Lecture…' : 'Actualiser'}</button>
        </div>
      </div>

      {error && <p className="page-error">{error}</p>}
      {!data && !error && <p className="loading-state">Lecture de Stripe…</p>}

      {data && (
        <>
          <div className="info-rows">
            <Ligne label="Solde Stripe" valeur={euros(data.stripe.total)}
              detail={`disponible ${euros(data.stripe.disponible)} · en attente ${euros(data.stripe.en_attente)}`} />
            <Ligne label="Moins : argent des voyageurs pas encore payé" valeur={signe(-data.voyageurs_a_payer)}
              detail={`${data.nb_voyageurs_a_payer} dossier(s) en séquestre ou libéré, sans virement`} />
            <Ligne label="Plus : caisses des points" valeur={signe(data.caisses)}
              detail={data.points.length ? data.points.map((p) => `${p.point} ${euros(p.eur)}`).join(' · ') : 'aucun mouvement de caisse'} />
            {data.siege.poche !== 0 && (
              <Ligne label="Plus : argent déjà remis au siège par les points" valeur={signe(data.siege.poche)}
                detail={`remis ${euros(data.siege.recu)} (plus dans leur caisse) − avances aux points ${euros(data.siege.avance)} − voyageurs payés hors Stripe ${euros(data.siege.paye_voyageurs)}`} />
            )}
            <Ligne fort label="Argent qui est vraiment à Wonjo" valeur={euros(data.detenu)} />
            <Ligne fort label="Marge nette attendue" valeur={euros(data.marge.total)}
              detail={`acquise ${euros(data.marge.acquise)} + à venir ${euros(data.marge.a_venir)}`} />
            <Ligne fort label="Écart" valeur={signe(data.ecart)} />
          </div>

          {!data.egal && (
            <div className="rapprochement-reste">
              <strong>Ce qu'il reste pour que ce soit égal : {signe(-data.ecart)}.</strong>
              {data.paiements_sans_dossier.length > 0 && (
                <p>
                  {data.ecart_explique !== 0 ? `${signe(data.ecart_explique)} s'expliquent par ` : 'Ces paiements sont à regarder : '}
                  {data.paiements_sans_dossier.length} paiement(s) Stripe dont l'application n'a plus de dossier (le colis a été supprimé). L'argent est
                  dans Stripe, mais ne vient d'aucune marge.
                </p>
              )}
              {data.paiements_sans_dossier.length > 0 && (
                <ul className="liste-simple">
                  {data.paiements_sans_dossier.map((p) => (
                    <li key={p.id}>
                      <code>{p.id}</code>
                      {p.date && ` · ${new Date(p.date).toLocaleDateString('fr-FR')}`}
                      {p.net != null ? ` · ${euros(p.net)} net` : ` · en ${p.devise}, non compté`}
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Reste inexpliqué : <strong>{signe(data.ecart_inexplique)}</strong>
                {Math.abs(data.ecart_inexplique) >= 0.01 && ' : un mouvement que l\'application ne connaît pas (virement vers une banque, remboursement, litige, écart de caisse…). À vérifier dans Stripe.'}
              </p>
            </div>
          )}
          {data.stripe.autres_devises.length > 0 && (
            <p className="hint">Soldes en autre devise, non comptés ici : {data.stripe.autres_devises.map((m) => `${m.montant.toLocaleString('fr-FR')} ${m.devise}`).join(' · ')}.</p>
          )}
          <p className="hint">Lu à {new Date(data.lu_a).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</p>
        </>
      )}
    </div>
  );
}

function Ligne({ label, valeur, detail, fort }: { label: string; valeur: string; detail?: string; fort?: boolean }) {
  return (
    <div className="info-row">
      <span className="info-row-label rapprochement-label">{label}</span>
      <span className="info-row-value rapprochement-valeur">
        <span className={fort ? 'rapprochement-fort' : undefined}>{valeur}</span>
        {detail && <span className="hint"> · {detail}</span>}
      </span>
    </div>
  );
}
