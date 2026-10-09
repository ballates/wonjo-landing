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
  const part = (n: number) => (res && res.debit > 0 ? Math.max(0, n) : 0);
  const pourcent = (n: number) => `${Math.round(n * 1000) / 10} %`;

  return (
    <div className="chart-card sim">
      <div className="sim-tete">
        <h3>Simuler un envoi</h3>
        <p className="chart-sub">Calcul du serveur avec les réglages en vigueur. Prix vide : 70 % du plafond.</p>
      </div>

      <div className="sim-corps">
        <div className="sim-saisie">
          <div className="sim-segment" role="group" aria-label="Type d'envoi">
            <button type="button" className={type === 'colis' ? 'on' : ''} onClick={() => setType('colis')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
              Colis
            </button>
            <button type="button" className={type === 'document' ? 'on' : ''} onClick={() => { setType('document'); setFragile(false); setRenforcee(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
              Enveloppes
            </button>
          </div>

          <div className="sim-trajet">
            <label className="champ-frais"><span>Départ</span>
              <Select ariaLabel="Pays de départ" value={depart} options={optionsPays} onChange={setDepart} /></label>
            <button type="button" className="sim-inverser" title="Inverser le trajet" aria-label="Inverser le trajet"
                    onClick={() => { setDepart(arrivee); setArrivee(depart); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 3l4 4-4 4" /><path d="M3 7h18" /><path d="M7 21l-4-4 4-4" /><path d="M21 17H3" /></svg>
            </button>
            <label className="champ-frais"><span>Arrivée</span>
              <Select ariaLabel="Pays d'arrivée" value={arrivee} options={optionsPays} onChange={setArrivee} /></label>
          </div>

          <div className="sim-champs">
            {type === 'colis' ? (
              <>
                <label className="champ-frais"><span>Poids</span>
                  <div className="suffix-input"><input type="text" inputMode="decimal" value={poids} onChange={(e) => setPoids(e.target.value)} /><span>kg</span></div></label>
                <label className="champ-frais"><span>Prix au kilo</span>
                  <div className="suffix-input"><input type="text" inputMode="decimal" placeholder="défaut" value={prixKilo} onChange={(e) => setPrixKilo(e.target.value)} /><span>€</span></div></label>
              </>
            ) : (
              <>
                <label className="champ-frais"><span>Enveloppes</span>
                  <div className="suffix-input"><input type="text" inputMode="numeric" value={nbEnv} onChange={(e) => setNbEnv(e.target.value)} /><span>×</span></div></label>
                <label className="champ-frais"><span>Prix par enveloppe</span>
                  <div className="suffix-input"><input type="text" inputMode="decimal" placeholder="défaut" value={prixEnv} onChange={(e) => setPrixEnv(e.target.value)} /><span>€</span></div></label>
              </>
            )}
            <label className="champ-frais"><span>Valeur déclarée</span>
              <div className="suffix-input"><input type="text" inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} /><span>€</span></div></label>
            <label className="champ-frais"><span>Commission</span>
              <div className="suffix-input"><input type="text" inputMode="decimal" value={taux} onChange={(e) => setTaux(e.target.value)} /><span>%</span></div></label>
          </div>

          <div className="champ-frais">
            <span>Commission fixe</span>
            <div className="sim-segment sim-segment--petit" role="group" aria-label="Commission fixe">
              {([['actuel', 'Réglage actuel'], ['oui', 'Allumée'], ['non', 'Éteinte']] as [Minimums, string][]).map(([v, l]) => (
                <button key={v} type="button" className={minimums === v ? 'on' : ''} onClick={() => setMinimums(v)}>{l}</button>
              ))}
            </div>
          </div>

          {type === 'colis' && (
            <div className="sim-options">
              <button type="button" className={`sim-option ${fragile ? 'on' : ''}`} aria-pressed={fragile}
                      onClick={() => { setFragile(!fragile); if (fragile) setRenforcee(false); }}>Colis fragile</button>
              <button type="button" className={`sim-option ${renforcee ? 'on' : ''}`} aria-pressed={renforcee} disabled={!fragile}
                      onClick={() => setRenforcee(!renforcee)}>Protection renforcée</button>
            </div>
          )}
        </div>

        <div className={`sim-recu ${perte ? 'is-perte' : ''}`}>
          {erreur && <p className="page-error">{erreur}</p>}
          {!res && !erreur && <p className="hint">Renseignez une valeur déclarée pour lancer le calcul.</p>}
          {res && (
            <>
              <span className="sim-recu-etiquette">L'expéditeur paie</span>
              <strong className="sim-recu-total">{euros(res.debit)}</strong>
              <div className="sim-barre" aria-hidden="true">
                <span className="c-voyageur" style={{ flexGrow: part(res.voyageur) }} />
                <span className="c-commission" style={{ flexGrow: part(res.commission) }} />
                <span className="c-valeur" style={{ flexGrow: part(res.protection - res.renforcee) }} />
                <span className="c-renforcee" style={{ flexGrow: part(res.renforcee) }} />
              </div>
              <ul className="sim-lignes">
                <li><i className="c-voyageur" />Voyageur
                  <span className="hint">{res.prix_kilo != null ? `${euros(res.prix_kilo)}/kg` : res.prix_enveloppe != null ? `${euros(res.prix_enveloppe)}/env.` : ''}</span>
                  <b>{euros(res.voyageur)}</b></li>
                <li><i className="c-commission" />Commission {pourcent(res.taux)}
                  <span className="hint">{res.commission_fixe > 0 ? `dont ${euros(res.commission_fixe)} fixe` : ''}</span>
                  <b>{euros(res.commission)}</b></li>
                <li><i className="c-valeur" />Valeur déclarée<span /><b>{euros(res.protection - res.renforcee)}</b></li>
                {res.renforcee > 0 && <li><i className="c-renforcee" />Protection renforcée<span /><b>{euros(res.renforcee)}</b></li>}
              </ul>

              <div className="sim-wonjo">
                <span className="sim-recu-etiquette">Ce que Wonjo garde</span>
                <ul className="sim-lignes">
                  <li>Commission + valeur déclarée<span /><b>{euros(res.commission + res.protection - res.renforcee)}</b></li>
                  <li>Frais Stripe<span className="hint">carte UE : {euros(res.stripe_ue)}</span><b>− {euros(res.stripe)}</b></li>
                  <li className="sim-ligne-total">Marge<span /><b>{euros(res.marge_hors_reserve)}</b></li>
                  <li>Commission seule, après Stripe<span /><b className={perte ? 'texte-perte' : undefined}>{euros(res.marge_commission_seule)}</b></li>
                  {res.renforcee > 0 && <li>Réserve casses<span /><b>{euros(res.renforcee)}</b></li>}
                </ul>
              </div>
              {perte && <p className="sim-alerte">La commission ne couvre pas les frais Stripe de cet envoi.</p>}
              {res.avertissements.map((a) => <p key={a} className="sim-note">{a}</p>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
