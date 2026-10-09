import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { signalerReglagesChange } from './ReglagesEnAttente';
import { peutGererAdmins } from '../lib/permissions';

// [353] Commission fixe de Wonjo par zone, ajoutee aux 10 % du prix du voyageur (colis
// et enveloppes, une fois par demande). Le plancher du prix d'un colis a ete retire par
// la 351 : le voyageur touche toujours prix au kilo x poids. Derriere un
// interrupteur ETEINT par defaut : les anciennes versions de l'app ne connaissent
// pas ces minimums et afficheraient moins que le debit reel. Modifiable par le super
// admin seul, motif obligatoire, inscrit au journal. Les demandes deja creees gardent
// leurs montants.
interface Zone {
  zone: string;
  commission_fixe: number;
  borne_min: number;
  borne_max: number;
  enveloppe_min: number | null;
  enveloppe_max: number | null;
  zone_active: boolean;
}

const NOMS: Record<string, string> = {
  europe_afrique: 'Europe ↔ Afrique',
  intra_europe: 'Europe (intérieur)',
  intra_afrique: 'Afrique ↔ Afrique',
  europe_amerique: 'Europe ↔ Amérique',
  europe_asie: 'Europe ↔ Asie',
};

const eur = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 })} €`;
const num = (v: string) => Number(v.replace(',', '.'));

export function MinimumsZonesCard() {
  const { roles } = useAuth();
  const modifiable = peutGererAdmins(roles);
  const [actif, setActif] = useState<boolean | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [saisie, setSaisie] = useState<Record<string, { commission: string }>>({});
  const [motif, setMotif] = useState('');
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState(false);

  function charger() {
    supabase.rpc('admin_lister_tarifs_zones').then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      const d = data as { actif: boolean; zones: Zone[] };
      setActif(d.actif);
      setZones(d.zones);
      setSaisie(Object.fromEntries(d.zones.map((z) => [z.zone, { commission: String(z.commission_fixe) }])));
    });
  }
  useEffect(charger, []);

  const modifiees = useMemo(
    () => zones.filter((z) => {
      const s = saisie[z.zone];
      return s && num(s.commission) !== Number(z.commission_fixe);
    }),
    [zones, saisie],
  );
  const valide = modifiees.every((z) => {
    const s = saisie[z.zone];
    const c = num(s.commission);
    return Number.isFinite(c) && c >= Number(z.borne_min) && c <= Number(z.borne_max);
  });

  async function enregistrer() {
    if (!motif.trim()) { setErreur('Le motif est obligatoire.'); return; }
    setBusy(true);
    setErreur(null);
    setMessage(null);
    let enAttente = 0;
    for (const z of modifiees) {
      const s = saisie[z.zone];
      const { data, error } = await supabase.rpc('admin_definir_tarif_zone', {
        p_zone: z.zone, p_commission_fixe: num(s.commission), p_motif: motif.trim(),
      });
      if (error) { setErreur(`${NOMS[z.zone] ?? z.zone} : ${error.message}`); setBusy(false); charger(); return; }
      if (data === 'en_attente') enAttente += 1;
    }
    setBusy(false);
    setMotif('');
    signalerReglagesChange();
    if (enAttente > 0) {
      setMessage(`${enAttente} baisse(s) enregistrée(s) en attente : un autre super admin doit les valider (encart « Changements de tarif à valider », en haut de la page Tarification). Les montants actuels restent en vigueur.`);
      charger();
      return;
    }
    setMessage(actif ? 'Enregistré : l\'app applique les nouveaux montants aux prochaines demandes.' : 'Enregistré. La commission fixe est éteinte : rien ne change pour les utilisateurs tant que vous ne les allumez pas.');
    charger();
  }

  async function basculer() {
    if (actif === null) return;
    if (!motif.trim()) { setErreur('Le motif est obligatoire (il est inscrit au journal).'); return; }
    setBusy(true);
    setErreur(null);
    const { error } = await supabase.rpc('admin_definir_minimums_actifs', { p_actif: !actif, p_motif: motif.trim() });
    setBusy(false);
    if (error) { setErreur(error.message); return; }
    setMotif('');
    setConfirmation(false);
    setMessage(!actif ? 'Commission fixe allumée : elle s\'applique aux nouvelles demandes.' : 'Commission fixe éteinte.');
    charger();
  }

  // Exemple parlant : un colis de 0,5 kg a 3 EUR/kg, dans la zone la plus utilisee.
  const exemple = useMemo(() => {
    const z = zones.find((x) => x.zone === 'europe_afrique');
    const s = z && saisie[z.zone];
    if (!z || !s) return null;
    const cmin = num(s.commission);
    if (!Number.isFinite(cmin)) return null;
    const base = 0.5 * 3;
    const commission = Math.round((Math.round(base * 0.1 * 100) / 100 + cmin) * 100) / 100;
    return { base, commission, total: base + commission };
  }, [zones, saisie]);

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div className="chart-head-titre">
          <h3>Commission fixe par zone</h3>
          {actif !== null && <span className={`badge ${actif ? 'badge-teal' : 'badge-muted'}`}>{actif ? 'Allumés' : 'Éteints'}</span>}
        </div>
      </div>
      <p className="chart-sub">
        Le voyageur touche toujours le prix qu'il a fixé (prix au kilo × poids). La commission de Wonjo est de 10 %
        de ce prix, plus ce montant fixe une fois par envoi (colis et enveloppes). Ne s'applique qu'aux nouvelles
        demandes. Le prix minimum au kilo que peut annoncer un voyageur se règle par corridor (page Corridors).
      </p>

      {actif === false && (
        <div className="insight-banner warn" style={{ marginBottom: 14 }}>
          <div>
            <p className="insight-oneline">
              <strong>Éteints : </strong>à allumer une fois la mise à jour de l'app publiée. Les anciennes versions
              afficheraient un prix inférieur au débit réel.
            </p>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Zone</th>
              <th>Commission fixe</th>
              <th>Bornes</th>
              <th>Enveloppe (Pli)</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => {
              const s = saisie[z.zone] ?? { commission: '' };
              const change = modifiees.some((m) => m.zone === z.zone);
              return (
                <tr key={z.zone} className={change ? 'is-modifie' : undefined}>
                  <td>
                    {NOMS[z.zone] ?? z.zone}
                    {!z.zone_active && <span className="badge badge-muted" style={{ marginLeft: 8 }}>fermée</span>}
                  </td>
                  <td>
                    <input type="text" inputMode="decimal" className="input-montant" value={s.commission.replace('.', ',')}
                           disabled={!modifiable || busy} aria-label={`Commission fixe ${NOMS[z.zone] ?? z.zone}`}
                           onChange={(e) => setSaisie({ ...saisie, [z.zone]: { ...s, commission: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') } })} /> €
                  </td>
                  <td className="hint">{eur(Number(z.borne_min))} à {eur(Number(z.borne_max))}</td>
                  <td className="hint">{z.enveloppe_min != null && z.enveloppe_max != null ? `${eur(Number(z.enveloppe_min))} à ${eur(Number(z.enveloppe_max))}` : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {exemple && (
        <p className="chart-sub" style={{ marginTop: 12 }}>
          <strong>Exemple Europe ↔ Afrique :</strong> un colis de 0,5 kg à 3 €/kg ;
          le voyageur reçoit {eur(exemple.base)}, Wonjo prend {eur(exemple.commission)} et l'expéditeur paie {eur(exemple.total)}.
        </p>
      )}

      {modifiable ? (
        <div className="action-group motif-form" style={{ marginTop: 12 }}>
          <textarea value={motif} onChange={(e) => { setMotif(e.target.value); setErreur(null); }}
                    placeholder="Motif (journal) - ex. révision du pricing d'octobre, ou allumage avec l'OTA 1.6." />
          {!valide && <p className="page-error">Commission fixe hors des bornes de sa zone (voir la colonne « Bornes »).</p>}
          <div className="action-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            {actif !== null && (
              confirmation ? (
                <span className="action-row">
                  <span className="hint">{actif ? 'Éteindre la commission fixe ?' : 'Allumer pour tous les utilisateurs ?'}</span>
                  <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setConfirmation(false)}>Non</button>
                  <button type="button" className={`btn btn-sm ${actif ? 'btn-danger-outline' : 'btn-primary'}`} disabled={busy || !motif.trim()} onClick={basculer}>Oui</button>
                </span>
              ) : (
                <button type="button" className={`btn btn-sm ${actif ? 'btn-danger-outline' : ''}`} disabled={busy} onClick={() => setConfirmation(true)}>
                  {actif ? 'Éteindre la commission fixe' : 'Allumer la commission fixe'}
                </button>
              )
            )}
            <span className="action-row">
              {modifiees.length > 0 && (
                <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { charger(); setErreur(null); }}>Annuler</button>
              )}
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || modifiees.length === 0 || !valide || !motif.trim()} onClick={enregistrer}>
                {busy ? '…' : `Enregistrer${modifiees.length > 1 ? ` (${modifiees.length} zones)` : ''}`}
              </button>
            </span>
          </div>
        </div>
      ) : (
        <p className="hint">Modifiable par un super admin.</p>
      )}
      {message && <p className="success-text">{message}</p>}
      {erreur && <p className="page-error">{erreur}</p>}
    </div>
  );
}
