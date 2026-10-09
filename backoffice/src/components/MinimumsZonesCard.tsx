import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { signalerReglagesChange } from './ReglagesEnAttente';
import { peutGererAdmins } from '../lib/permissions';
import { ReglageTete } from './ReglageTete';

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
const PAS = 0.05;

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

  function charger() {
    supabase.rpc('admin_lister_tarifs_zones').then(({ data, error }) => {
      if (error) { setErreur(error.message); return; }
      const d = data as { actif: boolean; zones: Zone[] };
      setActif(d.actif);
      setZones(d.zones);
      setSaisie(Object.fromEntries(d.zones.map((z) => [z.zone, { commission: Number(z.commission_fixe).toFixed(2) }])));
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

  async function basculer(allumer: boolean, m: string): Promise<string | null> {
    const { error } = await supabase.rpc('admin_definir_minimums_actifs', { p_actif: allumer, p_motif: m });
    if (error) return error.message;
    setMessage(allumer ? 'Commission fixe allumée : elle s\'applique aux nouvelles demandes.' : 'Commission fixe éteinte : 10 % seulement.');
    charger();
    return null;
  }

  function regler(z: Zone, valeur: number) {
    const v = Math.min(Number(z.borne_max), Math.max(Number(z.borne_min), Math.round(valeur * 100) / 100));
    setSaisie({ ...saisie, [z.zone]: { commission: v.toFixed(2) } });
    setErreur(null);
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
    <div className="chart-card rg-carte">
      <ReglageTete
        titre="Commission fixe par zone"
        sousTitre="10 % du prix du voyageur, plus ce montant une fois par envoi. Nouvelles demandes uniquement."
        actif={actif}
        etatOn="Allumée"
        etatOff="Éteinte · 10 % seulement"
        questionAllumer="Allumer la commission fixe pour toutes les nouvelles demandes ?"
        questionEteindre="Éteindre la commission fixe (retour à 10 % seulement) ?"
        modifiable={modifiable}
        onConfirmer={basculer}
      />
      {actif === false && (
        <p className="rg-note">À allumer une fois la mise à jour de l'app publiée : les anciennes versions afficheraient moins que le débit réel.</p>
      )}

      <div className="rg-zones">
        {zones.map((z) => {
          const s = saisie[z.zone] ?? { commission: '' };
          const v = num(s.commission);
          const change = modifiees.some((m) => m.zone === z.zone);
          const max = Number(z.borne_max);
          const hors = Number.isFinite(v) && (v < Number(z.borne_min) || v > max);
          const pct = max > 0 && Number.isFinite(v) ? Math.min(100, Math.max(0, (v / max) * 100)) : 0;
          return (
            <div key={z.zone} className={`rg-zone ${change ? 'is-modifie' : ''} ${!z.zone_active ? 'is-fermee' : ''} ${hors ? 'is-invalide' : ''}`}>
              <div className="rg-zone-tete">
                <span className="rg-zone-nom">{NOMS[z.zone] ?? z.zone}</span>
              </div>
              <div className="rg-zone-saisie">
                <button type="button" className="poids-borne-btn" aria-label="Diminuer" disabled={!modifiable || busy || v <= Number(z.borne_min)} onClick={() => regler(z, v - PAS)}>−</button>
                <label className="rg-zone-valeur">
                  <input type="text" inputMode="decimal" value={s.commission.replace('.', ',')}
                         disabled={!modifiable || busy} aria-label={`Commission fixe ${NOMS[z.zone] ?? z.zone}`}
                         onChange={(e) => setSaisie({ ...saisie, [z.zone]: { commission: e.target.value.replace(',', '.').replace(/[^\d.]/g, '') } })} />
                  <span>€</span>
                </label>
                <button type="button" className="poids-borne-btn" aria-label="Augmenter" disabled={!modifiable || busy || v >= max} onClick={() => regler(z, v + PAS)}>+</button>
              </div>
              <div className="rg-jauge" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
              <div className="rg-jauge-bornes"><span>{eur(Number(z.borne_min))}</span>{change ? <span className="rg-zone-avant">avant {eur(Number(z.commission_fixe))}</span> : <span>{v === 0 ? '10 % seulement' : ''}</span>}<span>{eur(max)}</span></div>
              <span className="rg-zone-pied">
                {!z.zone_active ? 'Zone fermée'
                  : z.enveloppe_min != null && z.enveloppe_max != null ? `Pli : ${eur(Number(z.enveloppe_min))} à ${eur(Number(z.enveloppe_max))}` : 'Ouverte'}
              </span>
            </div>
          );
        })}
      </div>

      {exemple && (
        <div className="rg-exemple">
          <span className="rg-exemple-titre">Exemple Europe ↔ Afrique · colis de 0,5 kg à 3 €/kg</span>
          <div className="rg-exemple-barre" aria-hidden="true">
            <span className="is-voyageur" style={{ flexGrow: exemple.base }} />
            <span className="is-wonjo" style={{ flexGrow: exemple.commission }} />
          </div>
          <div className="rg-exemple-legende">
            <span><i className="is-voyageur" />Voyageur <b>{eur(exemple.base)}</b></span>
            <span><i className="is-wonjo" />Wonjo <b>{eur(exemple.commission)}</b></span>
            <span>Expéditeur paie <b>{eur(exemple.total)}</b></span>
          </div>
        </div>
      )}

      {modifiable && modifiees.length > 0 && (
        <div className="rg-barre-enregistrer">
          <span className="rg-barre-compte">{modifiees.length} zone{modifiees.length > 1 ? 's' : ''} modifiée{modifiees.length > 1 ? 's' : ''}</span>
          <input type="text" value={motif} placeholder="Motif (inscrit au journal)"
                 onChange={(e) => { setMotif(e.target.value); setErreur(null); }} />
          <button type="button" className="btn btn-sm" disabled={busy} onClick={() => { charger(); setErreur(null); setMotif(''); }}>Annuler</button>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !valide || !motif.trim()} onClick={enregistrer}>
            {busy ? '…' : 'Enregistrer'}
          </button>
        </div>
      )}
      {!valide && <p className="page-error" style={{ marginTop: 10 }}>Une commission fixe sort des bornes de sa zone.</p>}
      {!modifiable && <p className="hint" style={{ marginTop: 10 }}>Modifiable par un super admin.</p>}
      {message && <p className="success-text" style={{ marginTop: 10 }}>{message}</p>}
      {erreur && <p className="page-error" style={{ marginTop: 10 }}>{erreur}</p>}
    </div>
  );
}
