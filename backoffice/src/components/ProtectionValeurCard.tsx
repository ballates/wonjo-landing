import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';

// [318-320] Frais de protection de la valeur déclarée (app_config, fn_bareme_protection).
// Par tranches : rien jusqu'au seuil 1, taux 1 sur la part entre les deux seuils,
// taux 2 au-delà du seuil 2 (plafond de la valeur déclarée : 250 €). Deux barèmes
// INDÉPENDANTS - colis et documents - pour pouvoir ajuster l'un sans toucher
// l'autre ; un seul interrupteur (taux des documents à 0 % = documents exemptés).
// Calculé sur la valeur déclarée de toute l'expédition et figé sur chaque demande
// à sa création. Modifiable par le super admin seul (admin_definir_protection),
// motif obligatoire, inscrit au journal. L'app suit en temps réel.
interface Bareme { seuil1: number; seuil2: number; taux1: number; taux2: number }
interface Saisie { seuil1: string; seuil2: string; taux1: string; taux2: string }
type Type = 'colis' | 'document';

const PLAFOND_VALEUR = 250;
const TYPES: { type: Type; titre: string; sous: string }[] = [
  { type: 'colis', titre: 'Colis', sous: 'Valeur déclarée du colis' },
  { type: 'document', titre: 'Documents (enveloppes)', sous: 'Valeur déclarée de l\'ensemble des enveloppes' },
];
const eur = (n: number) => `${n.toFixed(2).replace('.', ',').replace(/,00$/, '')} €`;
const pct = (n: number) => `${Math.round(n * 1000) / 10} %`;

function frais(valeur: number, b: Bareme): number {
  if (valeur <= b.seuil1) return 0;
  return Math.round(((Math.min(valeur, b.seuil2) - b.seuil1) * b.taux1 + Math.max(valeur - b.seuil2, 0) * b.taux2) * 100) / 100;
}

const versSaisie = (b: Bareme): Saisie => ({
  seuil1: String(b.seuil1), seuil2: String(b.seuil2),
  taux1: String(Math.round(b.taux1 * 1000) / 10), taux2: String(Math.round(b.taux2 * 1000) / 10),
});
const nombre = (v: string) => Number(v.replace(',', '.'));
const versBareme = (s: Saisie): Bareme => ({
  seuil1: nombre(s.seuil1), seuil2: nombre(s.seuil2), taux1: nombre(s.taux1) / 100, taux2: nombre(s.taux2) / 100,
});
const valide = (b: Bareme) => [b.seuil1, b.seuil2, b.taux1, b.taux2].every(Number.isFinite)
  && b.seuil1 >= 0 && b.seuil2 > b.seuil1 && b.seuil2 <= PLAFOND_VALEUR
  && b.taux1 >= 0 && b.taux2 >= 0 && b.taux1 <= 0.15 && b.taux2 <= 0.15;
const egal = (a: Bareme, b: Bareme) => a.seuil1 === b.seuil1 && a.seuil2 === b.seuil2
  && Math.abs(a.taux1 - b.taux1) < 1e-9 && Math.abs(a.taux2 - b.taux2) < 1e-9;

export function ProtectionValeurCard() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [actuel, setActuel] = useState<{ actif: boolean; colis: Bareme; document: Bareme } | null>(null);
  const [actif, setActif] = useState(false);
  const [saisie, setSaisie] = useState<Record<Type, Saisie> | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function charger() {
    Promise.all([
      supabase.rpc('fn_bareme_protection', { p_type: 'colis' }).single(),
      supabase.rpc('fn_bareme_protection', { p_type: 'document' }).single(),
    ]).then(([c, d]) => {
      if (c.error || d.error) { setErreur((c.error ?? d.error)!.message); return; }
      const lire = (r: unknown): Bareme => {
        const b = r as { seuil_1: number; seuil_2: number; taux_1: number; taux_2: number };
        return { seuil1: Number(b.seuil_1), seuil2: Number(b.seuil_2), taux1: Number(b.taux_1), taux2: Number(b.taux_2) };
      };
      const colis = lire(c.data);
      const document = lire(d.data);
      const allume = (c.data as { actif: boolean }).actif;
      setActuel({ actif: allume, colis, document });
      setActif(allume);
      setSaisie({ colis: versSaisie(colis), document: versSaisie(document) });
    });
  }
  useEffect(charger, []);

  const propose = saisie ? { colis: versBareme(saisie.colis), document: versBareme(saisie.document) } : null;
  const tousValides = !!propose && valide(propose.colis) && valide(propose.document);
  const modifie = !!actuel && !!propose && (
    actif !== actuel.actif || !egal(propose.colis, actuel.colis) || !egal(propose.document, actuel.document));
  const allume = modifie && !!actuel && !actuel.actif && actif;
  const desactive = !modifiable || busy;

  async function enregistrer() {
    if (!propose) return;
    if (!motif.trim()) { setErreur('Le motif est obligatoire.'); return; }
    const json = (b: Bareme) => ({ seuil_1: b.seuil1, seuil_2: b.seuil2, taux_1: b.taux1, taux_2: b.taux2 });
    setBusy(true);
    setErreur(null);
    const { error } = await supabase.rpc('admin_definir_protection', {
      p_actif: actif, p_colis: json(propose.colis), p_document: json(propose.document), p_motif: motif.trim(),
    });
    setBusy(false);
    if (error) { setErreur(error.message); return; }
    setMotif('');
    setOk(true);
    charger();
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div className="chart-head-titre">
          <h3>Protection de la valeur déclarée</h3>
          {actuel && (
            <span className={`badge ${actuel.actif ? 'badge-green' : 'badge-muted'}`}>{actuel.actif ? 'Activée' : 'Éteinte'}</span>
          )}
        </div>
        <label className={`corridor-toggle ${actif ? 'is-on' : ''}`} title={actif ? 'Éteindre' : 'Allumer'}>
          <input type="checkbox" checked={actif} disabled={desactive}
                 onChange={() => { setActif((v) => !v); setOk(false); }} />
          <span className="corridor-toggle-switch" />
        </label>
      </div>
      <p className="chart-sub">
        Frais ajouté au paiement d'une expédition dont la valeur déclarée dépasse le premier seuil, par tranches
        (aucun saut de prix à la frontière). Figé sur chaque demande à sa création. Éteint, aucun frais n'est
        calculé ni affiché. Un taux à 0 % exempte le type concerné.
      </p>
      <div className="action-group motif-form">
        {saisie && actuel && propose && TYPES.map(({ type, titre, sous }) => (
          <BlocBareme key={type} titre={titre} sous={sous}
                      saisie={saisie[type]} propose={propose[type]} actuel={actuel[type]} disabled={desactive}
                      onChange={(s) => { setSaisie({ ...saisie, [type]: s }); setOk(false); }} />
        ))}
        {modifiable && modifie && (
          <>
            {allume && (
              <p className="page-error">
                Avant d'allumer : le cadre réglementaire de ce frais doit être validé, et les emails de paiement
                relus (ils ne montrent pas encore la ligne de protection).
              </p>
            )}
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)}
                      placeholder="Motif (journal) - ex. taux des documents ramenés à 2 % suite au retour du juridique." />
            {!tousValides && (
              <p className="page-error">Il faut 0 ≤ seuil 1 &lt; seuil 2 ≤ {PLAFOND_VALEUR} € et des taux entre 0 et 15 %.</p>
            )}
            <div className="action-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm" disabled={busy}
                      onClick={() => { charger(); setErreur(null); }}>Annuler</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || !tousValides || !motif.trim()} onClick={enregistrer}>
                {busy ? '…' : 'Valider'}
              </button>
            </div>
          </>
        )}
        {!modifiable && <p className="hint">Modifiable par un super admin.</p>}
        {ok && <p className="hint">Enregistré : l'app applique le nouveau réglage.</p>}
        {erreur && <p className="page-error">{erreur}</p>}
      </div>
    </div>
  );
}

function BlocBareme({
  titre, sous, saisie, propose, actuel, disabled, onChange,
}: {
  titre: string; sous: string; saisie: Saisie; propose: Bareme; actuel: Bareme; disabled: boolean; onChange: (s: Saisie) => void;
}) {
  const avant = (champ: keyof Bareme, formate: (n: number) => string) =>
    Math.abs(propose[champ] - actuel[champ]) > 1e-9 ? formate(actuel[champ]) : undefined;
  return (
    <div className="protection-bloc">
      <h4 style={{ margin: '4px 0 2px' }}>{titre}</h4>
      <p className="hint" style={{ margin: '0 0 8px' }}>{sous}</p>
      <div className="poids-bornes">
        <Champ label="Seuil 1" unite="€" aide="Aucun frais en dessous" value={saisie.seuil1} disabled={disabled}
               avant={avant('seuil1', eur)} onChange={(v) => onChange({ ...saisie, seuil1: v })} />
        <Champ label="Taux 1" unite="%" aide="Sur la part entre les deux seuils" value={saisie.taux1} disabled={disabled}
               avant={avant('taux1', pct)} onChange={(v) => onChange({ ...saisie, taux1: v })} />
      </div>
      <div className="poids-bornes">
        <Champ label="Seuil 2" unite="€" aide={`Le taux change ici (plafond ${PLAFOND_VALEUR} €)`} value={saisie.seuil2} disabled={disabled}
               avant={avant('seuil2', eur)} onChange={(v) => onChange({ ...saisie, seuil2: v })} />
        <Champ label="Taux 2" unite="%" aide="Sur la part au-dessus du seuil 2" value={saisie.taux2} disabled={disabled}
               avant={avant('taux2', pct)} onChange={(v) => onChange({ ...saisie, taux2: v })} />
      </div>
      {valide(propose) && (
        <p className="hint">
          Exemples : {[40, 100, 150, 200, 250].map((v) => `${v} € → ${eur(frais(v, propose))}`).join(' · ')}
        </p>
      )}
    </div>
  );
}

function Champ({
  label, unite, aide, value, avant, disabled, onChange,
}: {
  label: string; unite: string; aide: string; value: string; avant?: string; disabled: boolean; onChange: (v: string) => void;
}) {
  return (
    <div className={`poids-borne ${avant ? 'is-modifie' : ''}`}>
      <div className="poids-borne-head">
        <span className="poids-borne-label">{label}</span>
        {avant && <span className="poids-borne-avant">avant {avant}</span>}
      </div>
      <div className="poids-borne-saisie">
        <div className="poids-borne-valeur">
          <input type="text" inputMode="decimal" value={value.replace('.', ',')} disabled={disabled} aria-label={`${label} (${unite})`}
                 onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
          <span>{unite}</span>
        </div>
      </div>
      <span className="poids-borne-aide">{aide}</span>
    </div>
  );
}
