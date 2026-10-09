import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Select } from './Select';
import { euros } from './Kpi';
import { useDebounce } from '../lib/useDebounce';

// [347] Simulateur d'envoi : le détail d'un envoi (ce que reçoit le voyageur, la commission,
// les protections, le débit, les frais Stripe, ce que Wonjo garde) calculé par le SERVEUR
// avec les réglages en vigueur (admin_simuler_envoi), jamais recalculé ici. Sert à vérifier
// un cas avant de changer un réglage, ou à comprendre un prix.
interface Pays { code: string; nom: string }
interface Resultat {
  zone: string | null; corridor: string; minimums_appliques: boolean;
  prix_kilo: number | null; prix_enveloppe: number | null;
  calcule: number; voyageur: number; taux: number; commission: number; commission_fixe: number;
  protection: number; renforcee: number; debit: number; stripe: number; stripe_ue: number;
  marge: number; marge_ue: number; marge_hors_reserve: number; marge_commission_seule: number;
  avertissements: string[];
}
type Minimums = 'actuel' | 'oui' | 'non';
const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(',', '.')));
const vide = (v: string) => v.trim() === '';

export function SimulateurCard() {
  const [pays, setPays] = useState<Pays[]>([]);
  const [type, setType] = useState<'colis' | 'document'>('colis');
  const [depart, setDepart] = useState('FR');
  const [arrivee, setArrivee] = useState('SN');
  const [poids, setPoids] = useState('2');
  const [prixKilo, setPrixKilo] = useState('');
  const [nbEnv, setNbEnv] = useState('1');
  const [prixEnv, setPrixEnv] = useState('');
  const [valeur, setValeur] = useState('100');
  const [fragile, setFragile] = useState(false);
  const [renforcee, setRenforcee] = useState(false);
  const [taux, setTaux] = useState('10');
  const [minimums, setMinimums] = useState<Minimums>('actuel');
  const [res, setRes] = useState<Resultat | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_lister_pays_corridors').then(({ data }) => {
      setPays(((data ?? []) as (Pays & { actif: boolean })[]).filter((p) => p.actif));
    });
  }, []);

  const saisie = useDebounce(JSON.stringify({ type, depart, arrivee, poids, prixKilo, nbEnv, prixEnv, valeur, fragile, renforcee, taux, minimums }));

  useEffect(() => {
    const s = JSON.parse(saisie) as Record<string, string | boolean>;
    const v = num(String(s.valeur));
    if (!Number.isFinite(v)) { setRes(null); setErreur(null); return; }
    supabase.rpc('admin_simuler_envoi', {
      p_type: s.type,
      p_pays_depart: s.depart,
      p_pays_arrivee: s.arrivee,
      p_poids: s.type === 'colis' ? num(String(s.poids)) : null,
      p_prix_kilo: s.type === 'colis' && !vide(String(s.prixKilo)) ? num(String(s.prixKilo)) : null,
      p_nb_enveloppes: s.type === 'document' ? Math.round(num(String(s.nbEnv))) : null,
      p_prix_enveloppe: s.type === 'document' && !vide(String(s.prixEnv)) ? num(String(s.prixEnv)) : null,
      p_valeur: v,
      p_fragile: s.fragile,
      p_renforcee: s.renforcee,
      p_taux: Number.isFinite(num(String(s.taux))) ? num(String(s.taux)) / 100 : 0.10,
      p_avec_minimums: s.minimums === 'actuel' ? null : s.minimums === 'oui',
    }).then(({ data, error }) => {
      if (error) { setErreur(error.message); setRes(null); return; }
      setErreur(null);
      setRes(data as Resultat);
    });
  }, [saisie]);

  const optionsPays = pays.map((p) => ({ value: p.code, label: p.nom }));
  const perte = !!res && res.marge_commission_seule < 0;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div className="chart-head-titre"><h3>Simuler un envoi</h3></div>
      </div>
      <p className="chart-sub">
        Le détail est calculé par le serveur avec les réglages en vigueur (commission, minimums, protections, frais Stripe).
        Laissez le prix vide pour prendre le prix proposé par défaut (70 % du plafond).
      </p>

      <div className="action-row" style={{ marginBottom: 12 }}>
        <button type="button" className={`chip-filter ${type === 'colis' ? 'on' : ''}`} onClick={() => setType('colis')}>Colis</button>
        <button type="button" className={`chip-filter ${type === 'document' ? 'on' : ''}`} onClick={() => { setType('document'); setFragile(false); setRenforcee(false); }}>Enveloppes</button>
      </div>

      <div className="simu-grille">
        <label className="champ-frais"><span>Départ</span>
          <Select ariaLabel="Pays de départ" value={depart} options={optionsPays} onChange={setDepart} minWidth={180} /></label>
        <label className="champ-frais"><span>Arrivée</span>
          <Select ariaLabel="Pays d'arrivée" value={arrivee} options={optionsPays} onChange={setArrivee} minWidth={180} /></label>
        {type === 'colis' ? (
          <>
            <label className="champ-frais"><span>Poids (0,5 à 23 kg)</span>
              <div className="suffix-input"><input type="text" inputMode="decimal" value={poids} onChange={(e) => setPoids(e.target.value)} /><span>kg</span></div></label>
            <label className="champ-frais"><span>Prix au kilo (voyageur)</span>
              <div className="suffix-input"><input type="text" inputMode="decimal" placeholder="défaut" value={prixKilo} onChange={(e) => setPrixKilo(e.target.value)} /><span>€</span></div></label>
          </>
        ) : (
          <>
            <label className="champ-frais"><span>Nombre d'enveloppes</span>
              <div className="suffix-input"><input type="text" inputMode="numeric" value={nbEnv} onChange={(e) => setNbEnv(e.target.value)} /><span>×</span></div></label>
            <label className="champ-frais"><span>Prix par enveloppe (voyageur)</span>
              <div className="suffix-input"><input type="text" inputMode="decimal" placeholder="défaut" value={prixEnv} onChange={(e) => setPrixEnv(e.target.value)} /><span>€</span></div></label>
          </>
        )}
        <label className="champ-frais"><span>Valeur déclarée (max 250 €)</span>
          <div className="suffix-input"><input type="text" inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} /><span>€</span></div></label>
        <label className="champ-frais"><span>Commission</span>
          <div className="suffix-input"><input type="text" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} /><span>%</span></div></label>
        <label className="champ-frais"><span>Commission fixe</span>
          <Select ariaLabel="Commission fixe" value={minimums} onChange={setMinimums} minWidth={180}
                  options={[{ value: 'actuel', label: 'Réglage actuel' }, { value: 'oui', label: 'Comme si allumée' }, { value: 'non', label: 'Comme si éteinte' }]} /></label>
        {type === 'colis' && (
          <>
            <label className="check-inline"><input type="checkbox" checked={fragile} onChange={(e) => { setFragile(e.target.checked); if (!e.target.checked) setRenforcee(false); }} /> Colis fragile</label>
            <label className="check-inline"><input type="checkbox" checked={renforcee} disabled={!fragile} onChange={(e) => setRenforcee(e.target.checked)} /> Protection renforcée choisie</label>
          </>
        )}
      </div>

      {erreur && <p className="page-error" style={{ marginTop: 12 }}>{erreur}</p>}

      {res && (
        <>
          <div className="dt-wrap" style={{ marginTop: 14 }}>
            <table>
              <tbody>
                <tr><td>Le voyageur reçoit</td><td><strong>{euros(res.voyageur)}</strong>
                  {res.prix_kilo != null && <span className="hint"> · {euros(res.prix_kilo)}/kg</span>}
                  {res.prix_enveloppe != null && <span className="hint"> · {euros(res.prix_enveloppe)}/enveloppe</span>}</td></tr>
                <tr><td>Commission Wonjo ({Math.round(res.taux * 1000) / 10} %)</td><td>{euros(res.commission)}{res.commission_fixe > 0 && <span className="hint"> · dont {euros(res.commission_fixe)} fixe</span>}</td></tr>
                <tr><td>Frais liés à la valeur déclarée</td><td>{euros(res.protection)}</td></tr>
                <tr><td>Protection renforcée</td><td>{euros(res.renforcee)}</td></tr>
                <tr><td><strong>L'expéditeur paie</strong></td><td><strong>{euros(res.debit)}</strong></td></tr>
                <tr><td>Frais Stripe</td><td>− {euros(res.stripe)} <span className="hint">(estimation des réglages ; carte européenne : {euros(res.stripe_ue)})</span></td></tr>
                <tr><td>Commission seule, après Stripe</td><td className={res.marge_commission_seule < 0 ? 'texte-perte' : undefined}>{euros(res.marge_commission_seule)}</td></tr>
                <tr><td>Marge (commission + protection de base − Stripe)</td><td><strong>{euros(res.marge_hors_reserve)}</strong></td></tr>
                <tr><td>Réserve pour les casses (protection renforcée)</td><td>{euros(res.renforcee)}</td></tr>
              </tbody>
            </table>
          </div>
          {perte && <p className="page-error" style={{ marginTop: 10 }}>Wonjo perd de l'argent sur la commission de cet envoi : elle ne couvre pas les frais Stripe.</p>}
          {res.avertissements.map((a) => <p key={a} className="hint">{a}</p>)}
        </>
      )}
    </div>
  );
}
