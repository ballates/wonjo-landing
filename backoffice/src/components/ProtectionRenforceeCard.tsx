import { decimales } from '../lib/nombre';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { signalerReglagesChange } from './ReglagesEnAttente';
import { peutGererAdmins } from '../lib/permissions';
import { Champ } from './ProtectionValeurCard';

// [346] Protection renforcée d'un colis fragile (fn_bareme_renforce). Supplément par
// tranches de la valeur déclarée, sur les seuils de la protection de base des colis :
// taux 0 jusqu'au seuil 1, taux 1 entre les deux seuils, taux 2 au-delà. Interrupteur
// propre : éteint, l'option disparaît de l'app et rien n'est facturé. Figé sur chaque
// demande à sa création. Modifiable par le super admin seul, motif obligatoire, journal.
interface Bareme { seuil1: number; seuil2: number; taux0: number; taux1: number; taux2: number }
interface Saisie { taux0: string; taux1: string; taux2: string }

const eur = (n: number) => `${decimales(n, 2).replace(/,00$/, '')} €`;
const pct = (n: number) => `${Math.round(n * 1000) / 10} %`;
const nombre = (v: string) => Number(v.replace(',', '.'));

function supplement(valeur: number, b: Bareme): number {
  const t0 = Math.min(valeur, b.seuil1) * b.taux0;
  const t1 = Math.max(Math.min(valeur, b.seuil2) - b.seuil1, 0) * b.taux1;
  const t2 = Math.max(valeur - b.seuil2, 0) * b.taux2;
  return Math.round((t0 + t1 + t2) * 100) / 100;
}

export function ProtectionRenforceeCard() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [actuel, setActuel] = useState<{ actif: boolean; bareme: Bareme } | null>(null);
  const [actif, setActif] = useState(false);
  const [saisie, setSaisie] = useState<Saisie | null>(null);
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function charger() {
    supabase.rpc('fn_bareme_renforce').single().then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      const r = data as { actif: boolean; seuil_1: number; seuil_2: number; taux_0: number; taux_1: number; taux_2: number };
      const bareme = { seuil1: Number(r.seuil_1), seuil2: Number(r.seuil_2), taux0: Number(r.taux_0), taux1: Number(r.taux_1), taux2: Number(r.taux_2) };
      setActuel({ actif: r.actif, bareme });
      setActif(r.actif);
      setSaisie({
        taux0: String(Math.round(bareme.taux0 * 1000) / 10),
        taux1: String(Math.round(bareme.taux1 * 1000) / 10),
        taux2: String(Math.round(bareme.taux2 * 1000) / 10),
      });
    });
  }
  useEffect(charger, []);

  const propose: Bareme | null = actuel && saisie
    ? { ...actuel.bareme, taux0: nombre(saisie.taux0) / 100, taux1: nombre(saisie.taux1) / 100, taux2: nombre(saisie.taux2) / 100 }
    : null;
  const valide = !!propose && [propose.taux0, propose.taux1, propose.taux2].every((x) => Number.isFinite(x) && x >= 0 && x <= 0.15);
  const modifie = !!actuel && !!propose && (
    actif !== actuel.actif
    || Math.abs(propose.taux0 - actuel.bareme.taux0) > 1e-9
    || Math.abs(propose.taux1 - actuel.bareme.taux1) > 1e-9
    || Math.abs(propose.taux2 - actuel.bareme.taux2) > 1e-9);
  const desactive = !modifiable || busy;
  const avant = (champ: 'taux0' | 'taux1' | 'taux2') =>
    actuel && propose && Math.abs(propose[champ] - actuel.bareme[champ]) > 1e-9 ? pct(actuel.bareme[champ]) : undefined;

  async function enregistrer() {
    if (!propose) return;
    if (!motif.trim()) { setErreur('Le motif est obligatoire.'); return; }
    setBusy(true);
    setErreur(null);
    const { data, error } = await supabase.rpc('admin_definir_protection_renforcee', {
      p_actif: actif, p_taux_0: propose.taux0, p_taux_1: propose.taux1, p_taux_2: propose.taux2, p_motif: motif.trim(),
    });
    setBusy(false);
    if (error) { setErreur(error.message); return; }
    setMotif('');
    setOk(data === 'en_attente'
      ? 'Demande enregistrée : un autre super admin doit la valider (encart « Changements de tarif à valider », en haut de la page Tarification). Le réglage actuel reste en vigueur.'
      : 'Enregistré : l\'app applique le nouveau réglage.');
    charger();
    signalerReglagesChange();
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div className="chart-head-titre">
          <h3>Protection renforcée (colis fragile)</h3>
          {actuel && <span className={`badge ${actuel.actif ? 'badge-green' : 'badge-muted'}`}>{actuel.actif ? 'Activée' : 'Éteinte'}</span>}
        </div>
        <label className={`corridor-toggle ${actif ? 'is-on' : ''}`} title={actif ? 'Éteindre' : 'Allumer'}>
          <input type="checkbox" checked={actif} disabled={desactive}
                 onChange={() => { setActif((v) => !v); setOk(null); }} />
          <span className="corridor-toggle-switch" />
        </label>
      </div>
      <p className="chart-sub">
        Option proposée à l'expéditeur dont le colis est marqué fragile : en cas de casse constatée, il est indemnisé jusqu'à la valeur
        déclarée. Le supplément s'ajoute à la protection de base ; il se calcule par tranches sur les mêmes seuils que la protection des colis
        {actuel ? ` (${eur(actuel.bareme.seuil1)} et ${eur(actuel.bareme.seuil2)})` : ''}. Éteinte, l'option disparaît de l'app et rien n'est facturé.
        Les sommes encaissées sont à garder en réserve pour indemniser les casses : elles figurent à part dans la carte « Marge nette » de Finance.
      </p>
      <div className="action-group motif-form">
        {saisie && (
          <div className="protection-bloc">
            <div className="poids-bornes">
              <Champ label="Taux 0" unite="%" aide="Sur la part jusqu'au seuil 1" value={saisie.taux0} disabled={desactive}
                     avant={avant('taux0')} onChange={(v) => { setSaisie({ ...saisie, taux0: v }); setOk(null); }} />
              <Champ label="Taux 1" unite="%" aide="Sur la part entre les deux seuils" value={saisie.taux1} disabled={desactive}
                     avant={avant('taux1')} onChange={(v) => { setSaisie({ ...saisie, taux1: v }); setOk(null); }} />
              <Champ label="Taux 2" unite="%" aide="Sur la part au-dessus du seuil 2" value={saisie.taux2} disabled={desactive}
                     avant={avant('taux2')} onChange={(v) => { setSaisie({ ...saisie, taux2: v }); setOk(null); }} />
            </div>
            {valide && propose && (
              <p className="hint">
                Exemples : {[40, 100, 150, 200, 250].map((v) => `${v} € → ${eur(supplement(v, propose))}`).join(' · ')}
              </p>
            )}
          </div>
        )}
        {modifiable && modifie && (
          <>
            <textarea value={motif} onChange={(e) => setMotif(e.target.value)}
                      placeholder="Motif (journal) - ex. option suspendue en attendant l'avis juridique." />
            {!valide && <p className="page-error">Les taux doivent être compris entre 0 et 15 %.</p>}
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
        {ok && <p className="hint">{ok}</p>}
        {erreur && <p className="page-error">{erreur}</p>}
      </div>
    </div>
  );
}
