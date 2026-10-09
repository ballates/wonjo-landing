import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';

// [317] Formats d'enveloppe : le prix d'un format est celui du Pli de la zone multiplié par
// son coefficient. Le Pli est la référence du barème (coefficient 1, toujours ouvert).
// Un format fermé n'est plus proposé aux voyageurs ni aux expéditeurs ; les demandes déjà
// créées gardent leur prix. Super admin seul, inscrit au journal.
interface Format { code: string; dimensions: string; coefficient: number; ordre: number; actif: boolean }
const NOMS: Record<string, string> = { pli: 'Pli', a4: 'A4', a3: 'A3' };
const num = (v: string) => Number(v.replace(',', '.'));

export function EnveloppeFormatsCard() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [formats, setFormats] = useState<Format[] | null>(null);
  const [saisie, setSaisie] = useState<Record<string, { coef: string; actif: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  function charger() {
    supabase.rpc('admin_lister_enveloppe_formats').then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      const liste = ((data ?? []) as Format[]).map((f) => ({ ...f, coefficient: Number(f.coefficient) }));
      setFormats(liste);
      setSaisie(Object.fromEntries(liste.map((f) => [f.code, { coef: String(f.coefficient), actif: f.actif }])));
    });
  }
  useEffect(charger, []);

  const modifies = (formats ?? []).filter((f) => {
    const s = saisie[f.code];
    return s && (num(s.coef) !== f.coefficient || s.actif !== f.actif);
  });
  const valide = modifies.every((f) => {
    const c = num(saisie[f.code].coef);
    return Number.isFinite(c) && c > 0 && c <= 10;
  });

  async function enregistrer() {
    setBusy(true);
    setErreur(null);
    for (const f of modifies) {
      const s = saisie[f.code];
      const { error } = await supabase.rpc('admin_definir_enveloppe_format', { p_code: f.code, p_coefficient: num(s.coef), p_actif: s.actif });
      if (error) { setErreur(`${NOMS[f.code] ?? f.code} : ${error.message}`); setBusy(false); charger(); return; }
    }
    setBusy(false);
    setOk(true);
    charger();
  }

  if (!formats) return erreur ? <p className="page-error">{erreur}</p> : null;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div className="chart-head-titre">
          <h3>Formats d'enveloppe</h3>
          <span className="badge badge-muted">{formats.filter((f) => f.actif).length}/{formats.length}</span>
        </div>
        {modifiable && modifies.length > 0 && (
          <div className="action-row">
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { charger(); setErreur(null); }}>Annuler</button>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy || !valide} onClick={enregistrer}>
              {busy ? '…' : `Valider (${modifies.length})`}
            </button>
          </div>
        )}
      </div>
      <p className="chart-sub">
        Le prix d'une enveloppe est celui du Pli de la zone multiplié par le coefficient de son format. Le Pli est la référence : coefficient 1, toujours ouvert.
        Fermer un format le retire des choix proposés ; les demandes déjà créées gardent leur prix.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Format</th><th>Dimensions</th><th>Coefficient</th><th>Ouvert</th></tr></thead>
          <tbody>
            {formats.map((f) => {
              const s = saisie[f.code] ?? { coef: String(f.coefficient), actif: f.actif };
              const verrouille = f.code === 'pli';
              const change = num(s.coef) !== f.coefficient || s.actif !== f.actif;
              return (
                <tr key={f.code} className={change ? 'is-modifie' : undefined}>
                  <td><strong>{NOMS[f.code] ?? f.code}</strong></td>
                  <td className="hint">{f.dimensions}</td>
                  <td>
                    <div className="suffix-input">
                      <input type="text" inputMode="decimal" className="input-montant" value={s.coef.replace('.', ',')}
                             disabled={!modifiable || busy || verrouille} aria-label={`Coefficient ${NOMS[f.code] ?? f.code}`}
                             onChange={(e) => { setSaisie({ ...saisie, [f.code]: { ...s, coef: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') } }); setOk(false); }} />
                      <span>×</span>
                    </div>
                  </td>
                  <td>
                    <label className={`corridor-toggle ${s.actif ? 'is-on' : ''}`} title={verrouille ? 'Le Pli reste toujours ouvert' : s.actif ? 'Fermer' : 'Ouvrir'}>
                      <input type="checkbox" checked={s.actif} disabled={!modifiable || busy || verrouille}
                             onChange={() => { setSaisie({ ...saisie, [f.code]: { ...s, actif: !s.actif } }); setOk(false); }} />
                      <span className="corridor-toggle-switch" />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!modifiable && <p className="hint">Modifiable par un super admin.</p>}
      {ok && <p className="hint">Enregistré : l'app applique les nouveaux coefficients aux prochaines demandes.</p>}
      {erreur && <p className="page-error">{erreur}</p>}
    </div>
  );
}
