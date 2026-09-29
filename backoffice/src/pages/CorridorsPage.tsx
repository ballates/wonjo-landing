import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { NomCorridor, NomZoneEnveloppe } from '../components/NomCorridor';
import { PoidsColisCard } from '../components/PoidsColisCard';

interface PaysCorridor {
  code: string;
  nom: string;
  region: string;
  actif: boolean;
}

interface CorridorPrix {
  id: string;
  nom: string;
  slug: string;
  actif: boolean;
  min_price_per_kg: number;
  max_price_per_kg: number;
  devise: string;
}

interface EnveloppePrix {
  zone: string;
  prix_min: number;
  prix: number;
  devise: string;
  actif: boolean;
}

interface VilleCorridor {
  pays_code: string;
  pays_nom: string;
  ville: string;
  actif: boolean;
}

const LABELS_REGION: Record<string, string> = {
  france: 'France',
  europe: 'Europe',
  maghreb: 'Afrique du Nord',
  afrique_ouest: "Afrique de l'Ouest",
  afrique_centre: 'Afrique centrale',
  afrique_est: "Afrique de l'Est",
  afrique_australe: 'Afrique australe',
  asie: 'Asie',
  amerique_nord: 'Amérique du Nord',
  amerique_sud: 'Amérique du Sud',
};

const LABELS_ZONE_ENVELOPPE: Record<string, string> = {
  intra_europe: 'Intra-Europe',
  europe_afrique: 'Europe ↔ Afrique',
  europe_asie: 'Europe ↔ Asie',
  europe_amerique: 'Europe ↔ Amériques',
  intra_afrique: 'Intra-Afrique',
};

const ORDRE_REGION = ['france', 'europe', 'maghreb', 'afrique_ouest', 'afrique_centre', 'afrique_est', 'afrique_australe', 'asie', 'amerique_nord', 'amerique_sud'];

export function CorridorsSection() {
  const [pays, setPays] = useState<PaysCorridor[] | null>(null);
  const [paysOriginal, setPaysOriginal] = useState<PaysCorridor[] | null>(null);
  const [paysBusy, setPaysBusy] = useState(false);
  const [prixCorridors, setPrixCorridors] = useState<CorridorPrix[] | null>(null);
  const [prixCorridorsOriginal, setPrixCorridorsOriginal] = useState<CorridorPrix[] | null>(null);
  const [prixBusy, setPrixBusy] = useState(false);
  const [prixEnveloppes, setPrixEnveloppes] = useState<EnveloppePrix[] | null>(null);
  const [prixEnveloppesOriginal, setPrixEnveloppesOriginal] = useState<EnveloppePrix[] | null>(null);
  const [prixEnveloppesBusy, setPrixEnveloppesBusy] = useState(false);
  const [villes, setVilles] = useState<VilleCorridor[] | null>(null);
  const [villesOriginal, setVillesOriginal] = useState<VilleCorridor[] | null>(null);
  const [villesBusy, setVillesBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<Set<string>>(new Set());
  const [paysOuvert, setPaysOuvert] = useState<string | null>(null);

  async function charger() {
    const [r1, r2, r3, r4] = await Promise.all([
      supabase.rpc('admin_lister_pays_corridors'),
      supabase.rpc('admin_lister_corridors_prix'),
      supabase.rpc('admin_lister_enveloppe_prix'),
      supabase.rpc('admin_lister_villes_corridors'),
    ]);
    if (r1.error) { setError(r1.error.message); return; }
    if (r2.error) { setError(r2.error.message); return; }
    if (r3.error) { setError(r3.error.message); return; }
    if (r4.error) { setError(r4.error.message); return; }
    setPays((r1.data ?? []) as PaysCorridor[]);
    setPaysOriginal((r1.data ?? []) as PaysCorridor[]);
    setPrixCorridors((r2.data ?? []) as CorridorPrix[]);
    setPrixCorridorsOriginal((r2.data ?? []) as CorridorPrix[]);
    setPrixEnveloppes((r3.data ?? []) as EnveloppePrix[]);
    setPrixEnveloppesOriginal((r3.data ?? []) as EnveloppePrix[]);
    setVilles((r4.data ?? []) as VilleCorridor[]);
    setVillesOriginal((r4.data ?? []) as VilleCorridor[]);
  }

  useEffect(() => { charger(); }, []);

  // Modification purement locale (brouillon) : rien n'est envoye au serveur
  // tant que "Enregistrer" n'est pas clique, pour permettre de cocher/
  // decocher plusieurs pays d'affilee avant de valider.
  function toggle(p: PaysCorridor) {
    setPays((liste) => liste!.map((x) => (x.code === p.code ? { ...x, actif: !x.actif } : x)));
  }

  const paysModifies = pays?.filter((p) => p.actif !== paysOriginal?.find((o) => o.code === p.code)?.actif) ?? [];

  async function enregistrerPays() {
    if (!pays) return;
    setPaysBusy(true);
    for (const p of paysModifies) {
      const { error: rpcError } = await supabase.rpc('admin_definir_pays_corridor', { p_code: p.code, p_actif: p.actif });
      if (rpcError) { alert(rpcError.message); setPaysBusy(false); return; }
    }
    setPaysOriginal(pays);
    setPaysBusy(false);
  }

  function annulerPays() {
    setPays(paysOriginal);
  }

  // Meme principe que pays/prix : modification locale (on peut ouvrir
  // plusieurs pays d'affilee et cocher/decocher des villes), un seul
  // Enregistrer applique tout d'un coup.
  function toggleVille(v: VilleCorridor) {
    setVilles((liste) => liste!.map((x) => (x.pays_code === v.pays_code && x.ville === v.ville ? { ...x, actif: !x.actif } : x)));
  }

  const villesModifiees = villes?.filter((v) => {
    const orig = villesOriginal?.find((o) => o.pays_code === v.pays_code && o.ville === v.ville);
    return orig && v.actif !== orig.actif;
  }) ?? [];

  async function enregistrerVilles() {
    setVillesBusy(true);
    for (const v of villesModifiees) {
      const { error: rpcError } = await supabase.rpc('admin_definir_ville_corridor', { p_pays_code: v.pays_code, p_ville: v.ville, p_actif: v.actif });
      if (rpcError) { alert(rpcError.message); setVillesBusy(false); return; }
    }
    setVillesOriginal(villes);
    setVillesBusy(false);
  }

  function annulerVilles() {
    setVilles(villesOriginal);
  }

  // Un pays decoche en haut (meme pas encore Valide) ferme aussitot son
  // encart de villes en bas : pas de sens a choisir des villes dans un pays
  // qui n'est de toute facon pas autorise. Si son popover etait ouvert au
  // moment ou le pays est decoche, on le referme.
  const paysActifParCode = new Map((pays ?? []).map((p) => [p.code, p.actif]));
  useEffect(() => {
    if (paysOuvert && paysActifParCode.get(paysOuvert) === false) setPaysOuvert(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pays, paysOuvert]);

  // Meme principe que les pays : modification purement locale, un seul
  // bouton Enregistrer (sur la ligne du titre) applique tous les tarifs
  // changes d'un coup, au lieu d'un bouton par carte.
  function modifierPrixLocal(id: string, champ: 'min_price_per_kg' | 'max_price_per_kg', valeur: number) {
    setPrixCorridors((liste) => liste!.map((x) => (x.id === id ? { ...x, [champ]: valeur } : x)));
  }

  const prixCorridorsModifies = prixCorridors?.filter((c) => {
    const orig = prixCorridorsOriginal?.find((o) => o.id === c.id);
    return orig && (c.min_price_per_kg !== orig.min_price_per_kg || c.max_price_per_kg !== orig.max_price_per_kg);
  }) ?? [];

  async function enregistrerPrixCorridors() {
    setPrixBusy(true);
    for (const c of prixCorridorsModifies) {
      const { error: rpcError } = await supabase.rpc('admin_definir_prix_corridor', { p_id: c.id, p_min: c.min_price_per_kg, p_max: c.max_price_per_kg });
      if (rpcError) { alert(rpcError.message); setPrixBusy(false); return; }
    }
    setPrixCorridorsOriginal(prixCorridors);
    setPrixBusy(false);
  }

  function annulerPrixCorridors() {
    setPrixCorridors(prixCorridorsOriginal);
  }

  async function toggleActifCorridor(c: CorridorPrix) {
    setEnCours((s) => new Set(s).add(c.id));
    const nextActif = !c.actif;
    setPrixCorridors((liste) => liste!.map((x) => (x.id === c.id ? { ...x, actif: nextActif } : x)));
    setPrixCorridorsOriginal((liste) => liste!.map((x) => (x.id === c.id ? { ...x, actif: nextActif } : x)));
    const { error: rpcError } = await supabase.rpc('admin_definir_actif_corridor', { p_id: c.id, p_actif: nextActif });
    if (rpcError) {
      setPrixCorridors((liste) => liste!.map((x) => (x.id === c.id ? { ...x, actif: c.actif } : x)));
      setPrixCorridorsOriginal((liste) => liste!.map((x) => (x.id === c.id ? { ...x, actif: c.actif } : x)));
      alert(rpcError.message);
    }
    setEnCours((s) => { const n = new Set(s); n.delete(c.id); return n; });
  }

  function modifierPrixEnveloppeLocal(zone: string, champ: 'prix_min' | 'prix', valeur: number) {
    setPrixEnveloppes((liste) => liste!.map((x) => (x.zone === zone ? { ...x, [champ]: valeur } : x)));
  }

  const prixEnveloppesModifies = prixEnveloppes?.filter((e) => {
    const orig = prixEnveloppesOriginal?.find((o) => o.zone === e.zone);
    return orig && (e.prix_min !== orig.prix_min || e.prix !== orig.prix);
  }) ?? [];

  async function enregistrerPrixEnveloppes() {
    setPrixEnveloppesBusy(true);
    for (const e of prixEnveloppesModifies) {
      const { error: rpcError } = await supabase.rpc('admin_definir_prix_enveloppe', { p_zone: e.zone, p_min: e.prix_min, p_max: e.prix });
      if (rpcError) { alert(rpcError.message); setPrixEnveloppesBusy(false); return; }
    }
    setPrixEnveloppesOriginal(prixEnveloppes);
    setPrixEnveloppesBusy(false);
  }

  function annulerPrixEnveloppes() {
    setPrixEnveloppes(prixEnveloppesOriginal);
  }

  // Meme regle que l'interrupteur d'un corridor : effet immediat, sans
  // Valider. Zone fermee = aucun document, meme si le corridor est ouvert.
  async function toggleActifEnveloppe(e: EnveloppePrix) {
    const cle = `env:${e.zone}`;
    setEnCours((s) => new Set(s).add(cle));
    const nextActif = !e.actif;
    const appliquer = (actif: boolean) => (liste: EnveloppePrix[] | null) => liste!.map((x) => (x.zone === e.zone ? { ...x, actif } : x));
    setPrixEnveloppes(appliquer(nextActif));
    setPrixEnveloppesOriginal(appliquer(nextActif));
    const { error: rpcError } = await supabase.rpc('admin_definir_actif_enveloppe', { p_zone: e.zone, p_actif: nextActif });
    if (rpcError) {
      setPrixEnveloppes(appliquer(e.actif));
      setPrixEnveloppesOriginal(appliquer(e.actif));
      alert(rpcError.message);
    }
    setEnCours((s) => { const n = new Set(s); n.delete(cle); return n; });
  }

  if (error) return <p className="page-error">{error}</p>;
  if (!pays || !prixCorridors || !prixEnveloppes || !villes) return <p className="loading-state">Chargement…</p>;

  const parRegion = ORDRE_REGION
    .map((region) => ({ region, liste: pays.filter((p) => p.region === region).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) }))
    .filter((g) => g.liste.length > 0);
  const nbActifs = pays.filter((p) => p.actif).length;
  // Corridors actifs d'abord, fermes en dernier (au lieu de l'ordre alphabetique).
  const prixCorridorsTries = [...prixCorridors].sort((a, b) => Number(b.actif) - Number(a.actif));

  return (
    <div className="corridors-section">
      <PoidsColisCard />

      <div className="chart-card">
        <div className="chart-head">
          <div className="chart-head-titre">
            <h3>Pays autorisés</h3>
            <span className="badge badge-muted">{nbActifs}/{pays.length}</span>
          </div>
          {paysModifies.length > 0 && (
            <div className="action-row">
              <button type="button" className="btn btn-sm" disabled={paysBusy} onClick={annulerPays}>Annuler</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={paysBusy} onClick={enregistrerPays}>
                {paysBusy ? '…' : `Valider (${paysModifies.length})`}
              </button>
            </div>
          )}
        </div>
        <p className="chart-sub">Cochez, puis Valider.</p>
        <div className="corridors-regions-compact">
          {parRegion.map((g) => (
            <div key={g.region} className="corridors-region-ligne">
              <span className="corridors-region-nom">{LABELS_REGION[g.region] ?? g.region}</span>
              <div className="corridors-pays-pilules">
                {g.liste.map((p) => (
                  <label key={p.code} className={`pays-pilule ${p.actif ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={p.actif} disabled={paysBusy} onChange={() => toggle(p)} />
                    <span className="pays-pilule-dot" />
                    {p.nom}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-head">
          <div className="chart-head-titre">
            <h3>Tarifs des colis, par corridor</h3>
            <span className="badge badge-muted">{prixCorridors.filter((c) => c.actif).length}/{prixCorridors.length}</span>
          </div>
          {prixCorridorsModifies.length > 0 && (
            <div className="action-row">
              <button type="button" className="btn btn-sm" disabled={prixBusy} onClick={annulerPrixCorridors}>Annuler</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={prixBusy} onClick={enregistrerPrixCorridors}>
                {prixBusy ? '…' : `Valider (${prixCorridorsModifies.length})`}
              </button>
            </div>
          )}
        </div>
        <p className="chart-sub">
          Prix au kilo autorisé. L'interrupteur ferme le corridor immédiatement ; les prix attendent Valider.
        </p>
        <div className="corridors-prix-grille">
          {prixCorridorsTries.map((c) => (
            <LignePrixCorridor
              key={c.id}
              corridor={c}
              busy={enCours.has(c.id)}
              onModifier={modifierPrixLocal}
              onToggleActif={toggleActifCorridor}
            />
          ))}
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-head">
          <div className="chart-head-titre">
            <h3>Tarifs des enveloppes, par zone</h3>
            <span className="badge badge-muted">{prixEnveloppes.filter((e) => e.actif).length}/{prixEnveloppes.length}</span>
          </div>
          {prixEnveloppesModifies.length > 0 && (
            <div className="action-row">
              <button type="button" className="btn btn-sm" disabled={prixEnveloppesBusy} onClick={annulerPrixEnveloppes}>Annuler</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={prixEnveloppesBusy} onClick={enregistrerPrixEnveloppes}>
                {prixEnveloppesBusy ? '…' : `Valider (${prixEnveloppesModifies.length})`}
              </button>
            </div>
          )}
        </div>
        <p className="chart-sub">Prix au forfait pour les documents, indépendant du prix au kilo. Une zone fermée n'accepte aucun document, même si son corridor est ouvert ; l'interrupteur agit immédiatement, les prix attendent Valider.</p>
        <div className="corridors-prix-grille">
          {prixEnveloppes.map((e) => (
            <LignePrixEnveloppe key={e.zone} enveloppe={e} busy={enCours.has(`env:${e.zone}`)} onModifier={modifierPrixEnveloppeLocal} onToggleActif={toggleActifEnveloppe} />
          ))}
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-head">
          <div className="chart-head-titre">
            <h3>Villes desservies</h3>
            <span className="badge badge-muted">
              {villes.filter((v) => v.actif && (paysActifParCode.get(v.pays_code) ?? true)).length}/{villes.length}
            </span>
          </div>
          {villesModifiees.length > 0 && (
            <div className="action-row">
              <button type="button" className="btn btn-sm" disabled={villesBusy} onClick={annulerVilles}>Annuler</button>
              <button type="button" className="btn btn-sm btn-primary" disabled={villesBusy} onClick={enregistrerVilles}>
                {villesBusy ? '…' : `Valider (${villesModifiees.length})`}
              </button>
            </div>
          )}
        </div>
        <p className="chart-sub">
          Ferme une ville précise sans fermer tout le pays.
        </p>
        {(() => {
          const parPays = Object.entries(
            villes.reduce<Record<string, VilleCorridor[]>>((acc, v) => {
              (acc[v.pays_code] ??= []).push(v);
              return acc;
            }, {}),
          ).sort(([, a], [, b]) => a[0].pays_nom.localeCompare(b[0].pays_nom, 'fr'));

          return (
            <div className="corridors-villes-grille">
              {parPays.map(([code, liste]) => {
                const nbActivesPays = liste.filter((v) => v.actif).length;
                const paysActif = paysActifParCode.get(code) ?? true;
                return (
                  <VilleBoutonEtPopover
                    key={code}
                    liste={liste}
                    nbActivesPays={nbActivesPays}
                    paysActif={paysActif}
                    ouvert={paysOuvert === code}
                    onOuvrir={() => setPaysOuvert((o) => (o === code ? null : code))}
                    onFermer={() => setPaysOuvert(null)}
                    onToggleVille={toggleVille}
                    disabled={villesBusy}
                  />
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

const PAS = 0.5;

function StepperLigne({
  label, value, unite, disabled, onChange,
}: {
  label: string; value: string; unite: string; disabled?: boolean; onChange: (v: string) => void;
}) {
  function ajuster(delta: number) {
    const actuel = Number(value) || 0;
    const suivant = Math.max(0, Math.round((actuel + delta) * 100) / 100);
    onChange(String(suivant));
  }

  return (
    <div className="corridors-plage-ligne">
      <span className="corridors-borne-label">{label}</span>
      <div className="corridors-stepper">
        <button type="button" className="corridors-stepper-btn" tabIndex={-1} disabled={disabled} onClick={() => ajuster(-PAS)} aria-label={`Diminuer ${label}`}>−</button>
        <input type="number" step={PAS} min="0" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="corridors-stepper-btn" tabIndex={-1} disabled={disabled} onClick={() => ajuster(PAS)} aria-label={`Augmenter ${label}`}>+</button>
        <span className="corridors-stepper-unite">{unite}</span>
      </div>
    </div>
  );
}

function LignePrixCorridor({
  corridor, busy: toggleBusy, onModifier, onToggleActif,
}: {
  corridor: CorridorPrix;
  busy: boolean;
  onModifier: (id: string, champ: 'min_price_per_kg' | 'max_price_per_kg', valeur: number) => void;
  onToggleActif: (c: CorridorPrix) => void;
}) {
  return (
    <div className={`corridors-prix-carte ${!corridor.actif ? 'is-off' : ''}`}>
      <div className="corridors-prix-carte-head">
        <div className="corridors-prix-nom">
          <NomCorridor nom={corridor.nom} />
        </div>
        <label className={`corridor-toggle ${corridor.actif ? 'is-on' : ''}`} title={corridor.actif ? 'Fermer ce corridor' : 'Rouvrir ce corridor'}>
          <input type="checkbox" checked={corridor.actif} disabled={toggleBusy} onChange={() => onToggleActif(corridor)} />
          <span className="corridor-toggle-switch" />
        </label>
      </div>
      <div className="corridors-prix-carte-foot">
        <StepperLigne
          label="Min"
          value={String(corridor.min_price_per_kg)}
          unite={`${corridor.devise}/kg`}
          disabled={!corridor.actif}
          onChange={(v) => onModifier(corridor.id, 'min_price_per_kg', Number(v))}
        />
        <StepperLigne
          label="Max"
          value={String(corridor.max_price_per_kg)}
          unite={`${corridor.devise}/kg`}
          disabled={!corridor.actif}
          onChange={(v) => onModifier(corridor.id, 'max_price_per_kg', Number(v))}
        />
      </div>
    </div>
  );
}

// Bouton pays + popover flottant (portail, ancre sur le bouton) pour ses
// villes, au lieu d'un panneau unique loin en bas de toute la grille : on
// voit tout de suite quel pays on a ouvert, meme dans une grille de 60+.
function VilleBoutonEtPopover({
  liste, nbActivesPays, paysActif, ouvert, onOuvrir, onFermer, onToggleVille, disabled,
}: {
  liste: VilleCorridor[];
  nbActivesPays: number;
  paysActif: boolean;
  ouvert: boolean;
  onOuvrir: () => void;
  onFermer: () => void;
  onToggleVille: (v: VilleCorridor) => void;
  disabled: boolean;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  function toggleOuvert() {
    if (!ouvert && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, left: r.left });
    }
    onOuvrir();
  }

  useEffect(() => {
    if (!ouvert) return;
    function onClickOutside(e: MouseEvent) {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        popRef.current && !popRef.current.contains(e.target as Node)
      ) onFermer();
    }
    function onScrollOrResize(e: Event) {
      // Le defilement interne de la liste de villes (overflow-y: auto) remonte
      // aussi cet ecouteur (capture: true) : ne fermer que sur un scroll qui
      // vient reellement d'ailleurs sur la page.
      if (popRef.current && popRef.current.contains(e.target as Node)) return;
      onFermer();
    }
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [ouvert, onFermer]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`corridors-ville-pays-bouton ${ouvert ? 'is-ouvert' : ''} ${nbActivesPays < liste.length ? 'has-fermees' : ''}`}
        disabled={!paysActif}
        title={paysActif ? undefined : 'Pays non autorisé : ouvrez-le d\'abord dans "Pays autorisés"'}
        onClick={toggleOuvert}
      >
        <span className="corridors-ville-pays-nom">{liste[0].pays_nom}</span>
        <span className="hint">{paysActif ? `${nbActivesPays}/${liste.length}` : 'fermé'}</span>
      </button>
      {ouvert && createPortal(
        <div ref={popRef} className="corridors-villes-panneau" style={{ top: pos.top, left: pos.left }}>
          <ul className="corridors-villes-liste">
            {liste.map((v) => (
              <li key={v.ville}>
                <label>
                  <input
                    type="checkbox"
                    checked={v.actif}
                    disabled={disabled}
                    onChange={() => onToggleVille(v)}
                  />
                  <span>{v.ville}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}

function LignePrixEnveloppe({
  enveloppe, busy: toggleBusy, onModifier, onToggleActif,
}: {
  enveloppe: EnveloppePrix;
  busy: boolean;
  onModifier: (zone: string, champ: 'prix_min' | 'prix', valeur: number) => void;
  onToggleActif: (e: EnveloppePrix) => void;
}) {
  return (
    <div className={`corridors-prix-carte ${!enveloppe.actif ? 'is-off' : ''}`}>
      <div className="corridors-prix-carte-head">
        <div className="corridors-prix-nom">
          <NomZoneEnveloppe nom={LABELS_ZONE_ENVELOPPE[enveloppe.zone] ?? enveloppe.zone} />
        </div>
        <label className={`corridor-toggle ${enveloppe.actif ? 'is-on' : ''}`} title={enveloppe.actif ? 'Fermer cette zone' : 'Ouvrir cette zone'}>
          <input type="checkbox" checked={enveloppe.actif} disabled={toggleBusy} onChange={() => onToggleActif(enveloppe)} />
          <span className="corridor-toggle-switch" />
        </label>
      </div>
      <div className="corridors-prix-carte-foot">
        <StepperLigne
          label="Min"
          value={String(enveloppe.prix_min)}
          unite={enveloppe.devise}
          disabled={!enveloppe.actif}
          onChange={(v) => onModifier(enveloppe.zone, 'prix_min', Number(v))}
        />
        <StepperLigne
          label="Max"
          value={String(enveloppe.prix)}
          unite={enveloppe.devise}
          disabled={!enveloppe.actif}
          onChange={(v) => onModifier(enveloppe.zone, 'prix', Number(v))}
        />
      </div>
    </div>
  );
}
