import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';

// [314] Bornes du poids d'un colis (app_config, fn_bornes_poids). Appliquees
// par le serveur a chaque demande de transport et a chaque publication de
// colis ; le maximum borne aussi la capacite d'un trajet (315). L'app les
// recoit en temps reel. Modifiables par le super admin
// seul (admin_definir_bornes_poids), motif obligatoire, inscrit au journal.
// Les publications et demandes deja creees ne sont pas retouchees.
export function PoidsColisCard() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [actuel, setActuel] = useState<{ min: number; max: number } | null>(null);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function charger() {
    supabase.rpc('fn_bornes_poids').single().then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      const b = data as { min_kg: number; max_kg: number };
      setActuel({ min: Number(b.min_kg), max: Number(b.max_kg) });
      setMin(String(b.min_kg));
      setMax(String(b.max_kg));
    });
  }
  useEffect(charger, []);

  const minNum = Number(min.replace(',', '.'));
  const maxNum = Number(max.replace(',', '.'));
  const modifie = actuel !== null && (minNum !== actuel.min || maxNum !== actuel.max);
  const valide = Number.isFinite(minNum) && Number.isFinite(maxNum) && minNum >= 0.1 && maxNum <= 50 && minNum < maxNum;

  async function enregistrer() {
    if (!motif.trim()) { setErreur('Le motif est obligatoire.'); return; }
    setBusy(true);
    setErreur(null);
    const { error } = await supabase.rpc('admin_definir_bornes_poids', { p_min: minNum, p_max: maxNum, p_motif: motif.trim() });
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
          <h3>Poids des colis</h3>
          {actuel && <span className="badge badge-muted">{String(actuel.min).replace('.', ',')} à {actuel.max} kg</span>}
        </div>
      </div>
      <p className="chart-sub">
        Poids d'un colis (le maximum borne aussi la capacité d'un trajet). Appliqué en temps réel, sans
        retoucher l'existant. Plafond absolu : 50 kg.
      </p>
      <div className="action-group motif-form">
        <div className="poids-bornes">
          <BornePoids label="Min" aide="Colis le plus léger accepté" value={min} pas={0.1}
                      avant={modifie ? actuel?.min : undefined} disabled={!modifiable || busy}
                      onChange={(v) => { setMin(v); setOk(false); }} />
          <BornePoids label="Max" aide="Colis le plus lourd accepté" value={max} pas={0.5}
                      avant={modifie ? actuel?.max : undefined} disabled={!modifiable || busy}
                      onChange={(v) => { setMax(v); setOk(false); }} />
        </div>
        <PlagePoids min={minNum} max={maxNum} valide={valide} />
        {modifiable && modifie && (
          <>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)}
                      placeholder="Motif (journal) - ex. ouverture exceptionnelle à 30 kg pour la rentrée, retour à 23 kg le 15/10." />
            {!valide && <p className="page-error">Il faut 0,1 kg ≤ minimum &lt; maximum ≤ 50 kg.</p>}
            <div className="action-row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-sm" disabled={busy}
                      onClick={() => { if (actuel) { setMin(String(actuel.min)); setMax(String(actuel.max)); } setErreur(null); }}>Annuler</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || !valide || !motif.trim()} onClick={enregistrer}>
                {busy ? '…' : 'Valider'}
              </button>
            </div>
          </>
        )}
        {!modifiable && <p className="hint">Modifiable par un super admin.</p>}
        {ok && <p className="hint">Enregistré : l'app applique les nouvelles bornes.</p>}
        {erreur && <p className="page-error">{erreur}</p>}
      </div>
    </div>
  );
}

const PLAFOND = 50;
const kg = (n: number) => String(n).replace('.', ',');

function BornePoids({
  label, aide, value, pas, avant, disabled, onChange,
}: {
  label: string; aide: string; value: string; pas: number; avant?: number; disabled: boolean; onChange: (v: string) => void;
}) {
  function ajuster(delta: number) {
    const actuel = Number(value.replace(',', '.')) || 0;
    const suivant = Math.min(PLAFOND, Math.max(0.1, Math.round((actuel + delta) * 10) / 10));
    onChange(String(suivant));
  }
  const n = Number(value.replace(',', '.'));
  const change = avant !== undefined && n !== avant;

  return (
    <div className={`poids-borne ${change ? 'is-modifie' : ''}`}>
      <div className="poids-borne-head">
        <span className="poids-borne-label">{label}</span>
        {change && <span className="poids-borne-avant">avant {kg(avant as number)} kg</span>}
      </div>
      <div className="poids-borne-saisie">
        {!disabled && (
          <button type="button" className="poids-borne-btn" onClick={() => ajuster(-pas)} aria-label={`Diminuer le ${label.toLowerCase()}`}>−</button>
        )}
        <div className="poids-borne-valeur">
          <input type="text" inputMode="decimal" value={value.replace('.', ',')} disabled={disabled} aria-label={`${label} en kg`}
                 onChange={(e) => onChange(e.target.value.replace(',', '.').replace(/[^\d.]/g, ''))} />
          <span>kg</span>
        </div>
        {!disabled && (
          <button type="button" className="poids-borne-btn" onClick={() => ajuster(pas)} aria-label={`Augmenter le ${label.toLowerCase()}`}>+</button>
        )}
      </div>
      <span className="poids-borne-aide">{aide}</span>
    </div>
  );
}

// Reglette 0 - 50 kg : la bande coloree est la plage autorisee.
function PlagePoids({ min, max, valide }: { min: number; max: number; valide: boolean }) {
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / PLAFOND) * 100))}%`;
  return (
    <div className={`poids-plage ${valide ? '' : 'is-invalide'}`} aria-hidden="true">
      <div className="poids-plage-piste">
        {valide && <div className="poids-plage-bande" style={{ left: pct(min), width: `calc(${pct(max)} - ${pct(min)})` }} />}
      </div>
      <div className="poids-plage-graduations">
        <span>0</span><span>10</span><span>20</span><span>30</span><span>40</span><span>{PLAFOND} kg</span>
      </div>
    </div>
  );
}
