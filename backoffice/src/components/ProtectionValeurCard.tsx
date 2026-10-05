import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';

// [318] Frais de protection de la valeur déclarée (app_config, fn_bareme_protection).
// Par tranches : rien jusqu'au seuil 1, taux 1 sur la part entre les deux seuils,
// taux 2 au-delà du seuil 2 (plafond de la valeur déclarée : 250 €). Colis ET
// documents (valeur déclarée de toute l'expédition). Figé sur chaque demande à sa
// création ; livré ÉTEINT.
// Modifiable par le super admin seul (admin_definir_protection), motif obligatoire,
// inscrit au journal. L'app suit en temps réel.
interface Bareme { actif: boolean; seuil1: number; seuil2: number; taux1: number; taux2: number }

const PLAFOND_VALEUR = 250;
const eur = (n: number) => `${n.toFixed(2).replace('.', ',').replace(/,00$/, '')} €`;

function frais(valeur: number, b: Bareme): number {
  if (valeur <= b.seuil1) return 0;
  return Math.round(((Math.min(valeur, b.seuil2) - b.seuil1) * b.taux1 + Math.max(valeur - b.seuil2, 0) * b.taux2) * 100) / 100;
}

export function ProtectionValeurCard() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [actuel, setActuel] = useState<Bareme | null>(null);
  const [actif, setActif] = useState(false);
  const [seuil1, setSeuil1] = useState('');
  const [seuil2, setSeuil2] = useState('');
  const [taux1, setTaux1] = useState('');
  const [taux2, setTaux2] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function charger() {
    supabase.rpc('fn_bareme_protection').single().then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      const b = data as { actif: boolean; seuil_1: number; seuil_2: number; taux_1: number; taux_2: number };
      const lu = { actif: b.actif, seuil1: Number(b.seuil_1), seuil2: Number(b.seuil_2), taux1: Number(b.taux_1), taux2: Number(b.taux_2) };
      setActuel(lu);
      setActif(lu.actif);
      setSeuil1(String(lu.seuil1));
      setSeuil2(String(lu.seuil2));
      setTaux1(String(Math.round(lu.taux1 * 1000) / 10));
      setTaux2(String(Math.round(lu.taux2 * 1000) / 10));
    });
  }
  useEffect(charger, []);

  const nombre = (v: string) => Number(v.replace(',', '.'));
  const propose: Bareme = {
    actif, seuil1: nombre(seuil1), seuil2: nombre(seuil2), taux1: nombre(taux1) / 100, taux2: nombre(taux2) / 100,
  };
  const valide = [propose.seuil1, propose.seuil2, propose.taux1, propose.taux2].every(Number.isFinite)
    && propose.seuil1 >= 0 && propose.seuil2 > propose.seuil1 && propose.seuil2 <= PLAFOND_VALEUR
    && propose.taux1 >= 0 && propose.taux2 >= 0 && propose.taux1 <= 0.15 && propose.taux2 <= 0.15;
  const modifie = actuel !== null && (
    propose.actif !== actuel.actif || propose.seuil1 !== actuel.seuil1 || propose.seuil2 !== actuel.seuil2
    || Math.abs(propose.taux1 - actuel.taux1) > 1e-9 || Math.abs(propose.taux2 - actuel.taux2) > 1e-9);
  const allume = modifie && actuel !== null && !actuel.actif && propose.actif;
  const desactive = !modifiable || busy;

  async function enregistrer() {
    if (!motif.trim()) { setErreur('Le motif est obligatoire.'); return; }
    setBusy(true);
    setErreur(null);
    const { error } = await supabase.rpc('admin_definir_protection', {
      p_actif: propose.actif, p_seuil_1: propose.seuil1, p_seuil_2: propose.seuil2,
      p_taux_1: propose.taux1, p_taux_2: propose.taux2, p_motif: motif.trim(),
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
        Frais ajouté au paiement d'une expédition (colis ou documents) dont la valeur déclarée dépasse le
        premier seuil, par tranches (aucun saut de prix à la frontière). Calculé sur la valeur déclarée de
        toute l'expédition et figé sur chaque demande à sa création. Éteint, aucun frais n'est calculé ni affiché.
      </p>
      <div className="action-group motif-form">
        <div className="poids-bornes">
          <Champ label="Seuil 1" unite="€" aide="Aucun frais en dessous" value={seuil1} disabled={desactive}
                 avant={modifie && actuel && propose.seuil1 !== actuel.seuil1 ? eur(actuel.seuil1) : undefined}
                 onChange={(v) => { setSeuil1(v); setOk(false); }} />
          <Champ label="Taux 1" unite="%" aide="Sur la part entre les deux seuils" value={taux1} disabled={desactive}
                 avant={modifie && actuel && Math.abs(propose.taux1 - actuel.taux1) > 1e-9 ? `${Math.round(actuel.taux1 * 1000) / 10} %` : undefined}
                 onChange={(v) => { setTaux1(v); setOk(false); }} />
        </div>
        <div className="poids-bornes">
          <Champ label="Seuil 2" unite="€" aide={`Le taux change ici (plafond ${PLAFOND_VALEUR} €)`} value={seuil2} disabled={desactive}
                 avant={modifie && actuel && propose.seuil2 !== actuel.seuil2 ? eur(actuel.seuil2) : undefined}
                 onChange={(v) => { setSeuil2(v); setOk(false); }} />
          <Champ label="Taux 2" unite="%" aide="Sur la part au-dessus du seuil 2" value={taux2} disabled={desactive}
                 avant={modifie && actuel && Math.abs(propose.taux2 - actuel.taux2) > 1e-9 ? `${Math.round(actuel.taux2 * 1000) / 10} %` : undefined}
                 onChange={(v) => { setTaux2(v); setOk(false); }} />
        </div>
        {valide && (
          <p className="hint">
            Exemples : {[40, 100, 150, 200, 250].map((v) => `${v} € → ${eur(frais(v, propose))}`).join(' · ')}
          </p>
        )}
        {modifiable && modifie && (
          <>
            {allume && (
              <p className="page-error">
                Avant d'allumer : la fonction stripe-client doit être déployée (elle ajoute le frais au débit), et le
                cadre réglementaire de ce frais validé. Sinon l'app afficherait un frais que Stripe ne débiterait pas.
              </p>
            )}
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)}
                      placeholder="Motif (journal) - ex. activation après validation par l'avocat." />
            {!valide && (
              <p className="page-error">Il faut 0 ≤ seuil 1 &lt; seuil 2 ≤ {PLAFOND_VALEUR} € et des taux entre 0 et 15 %.</p>
            )}
            <div className="action-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm" disabled={busy}
                      onClick={() => { charger(); setErreur(null); }}>Annuler</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || !valide || !motif.trim()} onClick={enregistrer}>
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
