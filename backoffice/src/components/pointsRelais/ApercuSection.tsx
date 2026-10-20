import { useMemo, useState } from 'react';
import { InfoBulle } from '../InfoBulle';
import { FiltrePeriode } from '../FiltrePeriode';
import { BasculeUnite, type Unite } from '../BasculeUnite';
import { DataTable, type Column } from '../DataTable';
import { useMultiPoints } from '../../lib/useMultiPoints';
import { plageDuRaccourci, type Plage } from '../../lib/periode';
import { BandePoints, TOUS_LES_POINTS, type CompteurPoint } from './BandePoints';
import { dateJour, montantEuros, montantLocal, tauxDe, useTauxEuros, type PointRelais } from '../../lib/pointsRelais';

// Aperçu (453-455) : les chiffres d'un point en un coup d'œil, et la comparaison des points entre eux sur la plage de dates choisie (même filtre que le
// back-office d'administration de Lampas : raccourcis et calendrier). Uniquement des comptages et des montants, jamais de donnée personnelle ; le serveur
// ne renvoie que les points auxquels la personne a droit. La comparaison n'apparaît que s'il y a plusieurs points.

interface Apercu {
  devise: string;
  encaisse: number; encaisse_eur: number; nb_encaissements: number; livres: number;
  a_encaisser: number; a_deposer: number; a_remettre: number;
  delai_encaissement_min: number | null;
  solde_especes: number; solde_mobile: number;
  derniere_cloture: string | null; ecarts: number; operations_attente: number;
}
type Ligne = Apercu & { point: PointRelais };

function delai(min: number | null): string {
  if (min == null) return '-';
  const m = Math.round(Number(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function ApercuSection({ points }: { points: PointRelais[] }) {
  const [plage, setPlage] = useState<Plage>(() => plageDuRaccourci('7d'));
  const args = useMemo(() => ({ debut: plage.from.toISOString(), fin: plage.to.toISOString() }), [plage]);
  const { items, error } = useMultiPoints<Apercu>(points, 'apercu', 60_000, args);
  const [choix, setChoix] = useState(TOUS_LES_POINTS);
  // Monnaie locale par defaut (chaque point dans la sienne) ; l'euro sur demande. Plusieurs monnaies a la fois ne s'additionnent qu'en euros.
  const [unite, setUnite] = useState<Unite>('local');
  useTauxEuros((items ?? []).map((l) => l.devise));

  const visibles = useMemo(() => (items ?? []).filter((l) => choix === TOUS_LES_POINTS || l.point.id === choix), [items, choix]);
  const aTraiter = (l: Apercu) => Number(l.a_encaisser) + Number(l.a_deposer) + Number(l.a_remettre);
  const compteurs = useMemo(() => {
    const c: Record<string, CompteurPoint> = {};
    for (const l of items ?? []) c[l.point.id] = { total: aTraiter(l), urgents: 0 };
    return c;
  }, [items]);

  const enEuros = (v: number, devise: string): number | null => {
    if (devise === 'EUR') return Number(v);
    const t = tauxDe(devise);
    return t == null ? null : Number(v) / t;
  };
  const somme = (f: (l: Ligne) => number) => visibles.reduce((s, l) => s + Number(f(l)), 0);
  const enCaisseEur = (l: Ligne) => {
    const e = enEuros(l.solde_especes, l.devise), m = enEuros(l.solde_mobile, l.devise);
    return e == null || m == null ? null : e + m;
  };
  const detenu = (() => {
    const v = visibles.map(enCaisseEur);
    return v.some((x) => x == null) ? null : v.reduce((s: number, x) => s + (x ?? 0), 0);
  })();
  // XOF et XAF valent exactement la meme chose (taux fixe avec l'euro) : Abidjan et N'Djamena s'additionnent en FCFA.
  const devises = new Set(visibles.map((l) => l.devise));
  const unePourDevise = devises.size === 0 ? null : [...devises].every((d) => d === 'XOF' || d === 'XAF') ? 'XOF' : devises.size === 1 ? [...devises][0] : null;
  const eur = (v: number | null) => (v == null ? 'taux ?' : montantEuros(Math.round(v * 100) / 100));
  const nbEnc = somme((l) => l.nb_encaissements);
  // Une seule monnaie dans la vue : on peut additionner en monnaie locale. Sinon (plusieurs pays), on convertit en euros.
  const enLocal = unite === 'local' && !!unePourDevise;
  const melange = unite === 'local' && !unePourDevise;
  const montant = (local: number, euros: number | null) => (enLocal ? montantLocal(local, unePourDevise!) : eur(euros));

  const tuiles: { cle: string; libelle: string; valeur: string; detail?: string; alerte?: boolean }[] = [
    { cle: 'enc', libelle: 'Encaissé', valeur: montant(somme((l) => l.encaisse), somme((l) => l.encaisse_eur)), detail: `${nbEnc} encaissement${nbEnc > 1 ? 's' : ''}${melange ? ' · en €' : ''}` },
    { cle: 'aenc', libelle: 'À encaisser', valeur: String(somme((l) => l.a_encaisser)) },
    { cle: 'dep', libelle: 'À déposer', valeur: String(somme((l) => l.a_deposer)) },
    { cle: 'rem', libelle: 'À remettre', valeur: String(somme((l) => l.a_remettre)) },
    { cle: 'liv', libelle: 'Livrés', valeur: String(somme((l) => l.livres)) },
    { cle: 'caisse', libelle: 'En caisse', valeur: montant(somme((l) => l.solde_especes) + somme((l) => l.solde_mobile), detenu), detail: melange ? 'en €' : undefined },
    { cle: 'ecart', libelle: 'Écarts', valeur: String(somme((l) => l.ecarts)), alerte: somme((l) => l.ecarts) > 0 },
  ];

  // Comparaison : seulement ce qui permet de juger un point par rapport aux autres.
  const colonnes: Column<Ligne>[] = [
    { key: 'point', label: 'Point', value: (l) => l.point.nom, render: (l) => <strong className="pr-nowrap">{l.point.nom}</strong> },
    { key: 'enc', label: 'Encaissé', value: (l) => Number(l.encaisse_eur), render: (l) => <span className="pr-nowrap">{unite === 'eur' ? montantEuros(l.encaisse_eur) : montantLocal(l.encaisse, l.devise)}</span> },
    { key: 'liv', label: 'Livrés', value: (l) => l.livres },
    { key: 'trait', label: 'À traiter', value: (l) => aTraiter(l) },
    { key: 'delai', label: 'Délai', value: (l) => (l.delai_encaissement_min == null ? -1 : Number(l.delai_encaissement_min)), render: (l) => <span className="pr-nowrap">{delai(l.delai_encaissement_min)}</span> },
    { key: 'caisse', label: 'En caisse', value: (l) => Number(enCaisseEur(l) ?? 0), render: (l) => <span className="pr-nowrap">{unite === 'eur' ? eur(enCaisseEur(l)) : montantLocal(Number(l.solde_especes) + Number(l.solde_mobile), l.devise)}</span> },
    { key: 'cloture', label: 'Compté le', value: (l) => l.derniere_cloture ?? '', render: (l) => (l.derniere_cloture ? dateJour(l.derniere_cloture) : <span className="hint">Jamais</span>) },
    { key: 'ecart', label: 'Écarts', value: (l) => l.ecarts, render: (l) => (l.ecarts > 0 ? <strong style={{ color: 'var(--badge-danger-fg)' }}>{l.ecarts}</strong> : '0') },
  ];

  return (
    <div>
      <div className="pr-entete">
        <div>
          <h3>Aperçu<InfoBulle>Les chiffres de vos points en un coup d'œil. La période choisie règle les encaissements, le nombre d'encaissements, les colis livrés et le délai ; le reste (dossiers à traiter, caisse, écarts) est l'état du moment. Uniquement des comptages et des montants, jamais de données personnelles.</InfoBulle></h3>
        </div>
        <div className="action-row">
          <BasculeUnite valeur={unite} onChange={setUnite} libelleLocal="Monnaie locale" ariaLabel="Unité des montants" />
          <FiltrePeriode valeur={plage} onChange={setPlage} />
        </div>
      </div>
      {error && <p className="page-error">{error}</p>}
      {!items ? <p className="loading-state">Chargement…</p> : (
        <>
          <BandePoints points={points} compteurs={compteurs} choix={choix} onChoix={setChoix} />
          <div className="ap-tuiles">
            {tuiles.map((t) => (
              <div key={t.cle} className={`ap-tuile ${t.alerte ? 'alerte' : ''}`}>
                <small>{t.libelle}</small>
                <strong>{t.valeur}</strong>
                {t.detail && <span>{t.detail}</span>}
              </div>
            ))}
          </div>
          {items.length > 1 && (
            <div className="pr-dense">
              <DataTable rows={items} columns={colonnes} rowKey={(l) => l.point.id} integre title="Comparaison des points" pageSize={20}
                         initialSort={{ key: 'point', dir: 'asc' }} emptyText="Aucun point." />
            </div>
          )}
        </>
      )}
    </div>
  );
}
