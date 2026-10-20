import { ChampMontant } from '../components/ChampMontant';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';
import { DataTable, type Column } from '../components/DataTable';
import { Drapeau } from '../components/Drapeau';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import { Badge } from '../components/Badge';
import { Person } from '../components/Avatar';
import { IconSquarePencil } from '../components/Icons';
import { ChampTelephone } from '../components/ChampTelephone';
import { ChampVille } from '../components/ChampVille';
import { ChampAdresse } from '../components/ChampAdresse';
import { ChampHoraires } from '../components/ChampHoraires';
import { useConfirmation } from '../components/Confirmation';
import { AEncaisserSection } from '../components/pointsRelais/AEncaisserSection';
import { DepotsSection } from '../components/pointsRelais/DepotsSection';
import { GuichetSection } from '../components/pointsRelais/GuichetSection';
import { VoyageursSection } from '../components/pointsRelais/VoyageursSection';
import { RemboursementsSection } from '../components/pointsRelais/RemboursementsSection';
import { CaisseSection } from '../components/pointsRelais/CaisseSection';
import { RecusSection } from '../components/pointsRelais/RecusSection';
import { SiegeVoyageursSection } from '../components/pointsRelais/SiegeVoyageursSection';
import { InterrupteurPointsRelais, useInterrupteursPointsRelais } from '../components/pointsRelais/InterrupteurPointsRelais';
import { decomposerNumero, numeroComplet } from '../lib/telephone';
import { peutGererAdmins, peutGererReseau } from '../lib/permissions';
import type { AdminRow } from '../lib/adminTypes';
import {
  LABEL_OPERATEUR, LABEL_PERMISSION, OPERATEURS, PERMISSIONS, montantLocal,
  type CompteMobileMoney, type MonPoint, type Operateur, type Permission, type PointRelais,
} from '../lib/pointsRelais';

// Points relais (docs/POINTS_RELAIS.md du depot wonjo). Sous-onglets :
//  - A encaisser (396-397) : paiements de l'app a valider, pour les agents qui en ont le droit et le super_admin ;
//  - Depots et remises (398), Guichet (400-404), Voyageurs a payer (405), A rembourser (406-408) : idem, selon la permission ;
//  - Caisse (409) : agents du point (toute permission), finance et super_admin ;
//  - Reseau : points, comptes mobile money, plafonds, agents (super_admin ; finance en lecture) ;
//  - Mon point : la fiche de l'agent et ses droits.
// Le serveur controle tout : cette page n'affiche que ce que les fonctions admin_* renvoient.

interface Agent {
  user_id: string;
  email: string;
  nom_affiche: string | null;
  avatar_url: string | null;
  permissions: Permission[];
  actif: boolean;
  compte_actif: boolean;
}

// Zones franc CFA : monnaie imposee (le serveur refuse autre chose).
const UEMOA = ['BF', 'BJ', 'CI', 'GW', 'ML', 'NE', 'SN', 'TG'];
const CEMAC = ['CM', 'CF', 'CG', 'GA', 'GQ', 'TD'];
function deviseImposee(pays: string): string | null {
  if (UEMOA.includes(pays)) return 'XOF';
  if (CEMAC.includes(pays)) return 'XAF';
  return null;
}
// Plafonds proposes pour le pilote (docs/POINTS_RELAIS.md § 14), en franc CFA.
const PLAFONDS_CFA = { dossier: '150000', jour: '500000', especes: '300000' };

type Onglet = 'encaisser' | 'depots' | 'guichet' | 'voyageurs' | 'rembourser' | 'recus' | 'caisse' | 'reseau' | 'monpoint';

export function PointsRelaisPage() {
  const { roles, profil } = useAuth();
  const superAdmin = peutGererAdmins(roles);
  // Reseau (438) : tous les points, creer / modifier / fermer / agents ; la suppression d'un point reste a l'Admin.
  const reseau = peutGererReseau(roles);
  // « Mon point » : seulement pour qui a le role Agent relais ATTRIBUE (le Reseau et l'Admin l'heritent sans etre agents d'un point).
  const agent = (profil?.roles_attribues ?? roles).includes('point_relais');
  const finance = roles.includes('finance');
  const [points, setPoints] = useState<PointRelais[] | null>(null);
  const [mesPoints, setMesPoints] = useState<MonPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [edition, setEdition] = useState<PointRelais | 'nouveau' | null>(null);
  const [agentsDe, setAgentsDe] = useState<PointRelais | null>(null);
  const [onglet, setOnglet] = useState<Onglet | null>(null);
  const { etats: interrupteurs } = useInterrupteursPointsRelais();
  const [pointEncaisser, setPointEncaisser] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const { confirmer, informer, fenetre } = useConfirmation();

  async function creerProfil(p: PointRelais) {
    setError(null);
    setMessage(null);
    const { error: e } = await supabase.rpc('admin_creer_profil_point_relais', { p_point_id: p.id });
    if (e) { setError(e.message); return; }
    await informer({
      titre: `Compte du point « ${p.nom} » prêt`,
      libelleOui: 'Compris',
      texte: (
        <>
          <p style={{ margin: '0 0 8px' }}>Quand un agent confie un colis au guichet, la demande part dans l'app <strong>au nom du point</strong> : le voyageur voit « Wonjo {p.ville} », avec le badge « vérifié par Wonjo ».</p>
          <p style={{ margin: '0 0 8px' }}>Ce compte vient d'être créé, ou existait déjà : cliquer de nouveau ne change rien. Personne ne peut s'y connecter, il sert seulement à porter ces demandes.</p>
          <p style={{ margin: 0 }}>Rien d'autre à faire : l'onglet Guichet peut maintenant confier des colis pour ce point.</p>
        </>
      ),
    });
  }

  // [414] Fermer : plus de nouveau dossier, ceux en cours se terminent. Rouvrir a tout moment.
  async function changerEtat(p: PointRelais, actif: boolean) {
    setError(null);
    setMessage(null);
    const ok = await confirmer(actif
      ? { titre: `Rouvrir « ${p.nom} » ?`, texte: 'Le point pourra de nouveau recevoir des colis et encaisser des paiements.', libelleOui: 'Rouvrir' }
      : { titre: `Fermer « ${p.nom} » ?`, libelleOui: 'Fermer le point', danger: true,
          texte: 'Plus aucun nouveau dossier ne passera par ce point, ni dans l\'app ni au guichet. Les dossiers en cours se terminent normalement (paiements, remises, versements). Vous pourrez le rouvrir quand vous voudrez.' });
    if (!ok) return;
    const { data, error: e } = await supabase.rpc('admin_definir_etat_point_relais', { p_point_id: p.id, p_actif: actif });
    if (e) { setError(e.message); return; }
    const enCours = (data as { dossiers_en_cours?: number } | null)?.dossiers_en_cours ?? 0;
    setMessage(actif ? `« ${p.nom} » est rouvert.`
      : `« ${p.nom} » est fermé.${enCours ? ` ${enCours} dossier${enCours > 1 ? 's' : ''} en cours se termine${enCours > 1 ? 'nt' : ''} normalement.` : ''}`);
    charger();
  }

  // [414] Supprimer : seulement un point ferme et sans historique ; sinon il reste ferme.
  async function supprimer(p: PointRelais) {
    setError(null);
    setMessage(null);
    const { data, error: e } = await supabase.rpc('admin_historique_point_relais', { p_point_id: p.id });
    if (e) { setError(e.message); return; }
    const h = data as { dossiers: number; mouvements: number; operations: number; rapprochements: number; agents: number };
    if (h.dossiers + h.mouvements + h.operations + h.rapprochements > 0) {
      await informer({ titre: `« ${p.nom} » ne peut pas être supprimé`,
        texte: `Ce point a un historique (${h.dossiers} dossier${h.dossiers > 1 ? 's' : ''}, ${h.mouvements} mouvement${h.mouvements > 1 ? 's' : ''} de caisse). Le supprimer effacerait la trace de l'argent : il reste fermé, et vous pouvez le rouvrir plus tard.` });
      return;
    }
    const ok = await confirmer({ titre: `Supprimer « ${p.nom} » ?`, danger: true, libelleOui: 'Supprimer définitivement',
      texte: `Le point n'a aucun historique. Il sera supprimé définitivement${h.agents ? `, et ses ${h.agents} agent${h.agents > 1 ? 's' : ''} retiré${h.agents > 1 ? 's' : ''}` : ''}. Impossible à annuler.` });
    if (!ok) return;
    const { error: e2 } = await supabase.rpc('admin_supprimer_point_relais', { p_point_id: p.id });
    if (e2) { setError(e2.message); return; }
    setMessage(`« ${p.nom} » est supprimé.`);
    charger();
  }

  function charger() {
    supabase.rpc('admin_lister_points_relais').then(({ data, error: e }) => {
      if (e) { setError(e.message); setPoints([]); return; }
      setPoints((data ?? []) as PointRelais[]);
    });
    if (agent) {
      supabase.rpc('admin_mes_points_relais').then(({ data, error: e }) => {
        if (e) { setError(e.message); return; }
        setMesPoints((data ?? []) as MonPoint[]);
      });
    }
  }
  useEffect(charger, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Points ou l'on peut agir avec une permission : tous les points actifs pour le super_admin, sinon ceux de l'agent.
  const pointsAvec = (permission: Permission) => {
    if (!points) return [];
    if (superAdmin) return points.filter((p) => p.actif);
    const autorises = new Set(mesPoints.filter((m) => m.permissions.includes(permission)).map((m) => m.point_id));
    return points.filter((p) => autorises.has(p.id));
  };
  const pointsEncaissement = useMemo(() => pointsAvec('valider_paiement'), [points, mesPoints, superAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const pointsDepots = useMemo(() => pointsAvec('remise'), [points, mesPoints, superAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const pointsGuichet = useMemo(() => pointsAvec('confier_colis'), [points, mesPoints, superAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const pointsVoyageurs = useMemo(() => pointsAvec('payer_voyageur'), [points, mesPoints, superAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  const pointsRembourser = useMemo(() => pointsAvec('rembourser'), [points, mesPoints, superAdmin]); // eslint-disable-line react-hooks/exhaustive-deps
  // Caisse : tous les points pour la finance et le super_admin, sinon ceux de l'agent (quelle que soit sa permission).
  const pointsCaisse = useMemo(() => {
    if (!points) return [];
    if (superAdmin || finance) return points;
    const miens = new Set(mesPoints.map((m) => m.point_id));
    return points.filter((p) => miens.has(p.id));
  }, [points, mesPoints, superAdmin, finance]);
  const [nomsPays, setNomsPays] = useState<Record<string, string>>({});
  useEffect(() => {
    supabase.rpc('admin_lister_pays_corridors').then(({ data }) => {
      setNomsPays(Object.fromEntries(((data ?? []) as { code: string; nom: string }[]).map((p) => [p.code.trim(), p.nom])));
    });
  }, []);

  // Ce qui attend une action du point, par onglet : pastille sur chaque onglet (rafraîchie toutes les 30 s et à chaque changement d'onglet).
  //  - À encaisser : demandes de l'app dont l'échéance n'est pas dépassée ;
  //  - Dépôts et remises : colis à déposer + colis prêts à remettre (QR à scanner par le voyageur) ;
  //  - Guichet : dossiers à encaisser ou à régler par carte, codes de livraison à saisir, messages non lus des voyageurs ;
  //  - Voyageurs à payer ; À rembourser ; Caisse : opérations déclarées par un autre, à valider.
  const [aFaire, setAFaire] = useState<Partial<Record<Onglet, number>>>({});
  const [detailGuichet, setDetailGuichet] = useState('');
  const idsParOnglet = {
    encaisser: pointsEncaissement.map((p) => p.id).join(','), depots: pointsDepots.map((p) => p.id).join(','), guichet: pointsGuichet.map((p) => p.id).join(','),
    voyageurs: pointsVoyageurs.map((p) => p.id).join(','), rembourser: pointsRembourser.map((p) => p.id).join(','), caisse: pointsCaisse.map((p) => p.id).join(','),
  };
  const cleIds = JSON.stringify(idsParOnglet);
  const rafraichirAFaire = useRef<() => void>(() => {});
  useEffect(() => {
    let actif = true;
    const ids = JSON.parse(cleIds) as Record<string, string>;
    const parPoint = async <T,>(liste: string, f: (id: string) => Promise<T>): Promise<T[]> => Promise.all(liste.split(',').filter(Boolean).map(f));
    const somme = (xs: number[]) => xs.reduce((a, n) => a + n, 0);
    async function compter() {
      const lignes = async (rpc: string, id: string) => ((await supabase.rpc(rpc, { p_point_id: id })).data ?? []) as Record<string, unknown>[];
      const [encaisser, depots, guichet, voyageurs, siege, rembourser, caisse] = await Promise.all([
        parPoint(ids.encaisser, async (id) => (await lignes('admin_pr_a_encaisser', id)).filter((r) => !r.expire).length),
        parPoint(ids.depots, async (id) => (await lignes('admin_pr_depots', id)).filter((r) => !r.depot_at || r.statut_colis === 'accepte').length),
        parPoint(ids.guichet, async (id) => {
          const dossiers = await lignes('admin_pr_dossiers_guichet', id);
          const aEncaisser = dossiers.filter((r) => !r.paiement_valide_at && r.statut_colis === 'en_attente').length;
          const codes = dossiers.filter((r) => r.statut_colis === 'arrive').length;
          const nonLus = somme((await lignes('admin_pr_chats_non_lus', id)).map((r) => Number(r.non_lus)));
          return { aEncaisser, codes, nonLus };
        }),
        parPoint(ids.voyageurs, async (id) => (await lignes('admin_pr_voyageurs_a_payer', id)).length),
        // Finance centrale : voyageurs à payer par mobile money (hors contestation).
        (superAdmin || finance) ? supabase.rpc('admin_siege_voyageurs_a_payer').then(({ data }) => ((data ?? []) as { contestation: boolean }[]).filter((r) => !r.contestation).length) : Promise.resolve(0),
        parPoint(ids.rembourser, async (id) => (await lignes('admin_pr_a_rembourser', id)).length),
        parPoint(ids.caisse, async (id) => {
          const { data } = await supabase.rpc('admin_pr_caisse', { p_point_id: id });
          return ((data as { attente?: { de_moi: boolean }[] } | null)?.attente ?? []).filter((a) => !a.de_moi).length;
        }),
      ]);
      const g = { aEncaisser: somme(guichet.map((x) => x.aEncaisser)), codes: somme(guichet.map((x) => x.codes)), nonLus: somme(guichet.map((x) => x.nonLus)) };
      if (actif) {
        setAFaire({ encaisser: somme(encaisser), depots: somme(depots), guichet: g.aEncaisser + g.codes + g.nonLus, voyageurs: somme(voyageurs) + siege, rembourser: somme(rembourser), caisse: somme(caisse) });
        // Le détail de la pastille du Guichet, au survol : de quoi se compose le chiffre.
        setDetailGuichet([g.aEncaisser && `${g.aEncaisser} à encaisser`, g.codes && `${g.codes} code${g.codes > 1 ? 's' : ''} à saisir`, g.nonLus && `${g.nonLus} message${g.nonLus > 1 ? 's' : ''} non lu${g.nonLus > 1 ? 's' : ''}`].filter(Boolean).join(' · '));
      }
    }
    rafraichirAFaire.current = compter;
    compter();
    const t = window.setInterval(compter, 30_000);
    return () => { actif = false; window.clearInterval(t); };
  }, [cleIds, superAdmin, finance]);

  // Ordre des sous-onglets = ordre du travail : d'abord on monte le réseau (points et agents), puis on suit la vie d'un colis (accueil au
  // guichet, paiements à encaisser, dépôt et remise au voyageur, paiement du voyageur après la livraison, remboursements), puis les pièces
  // et l'argent (reçus, caisse). « Mon point » (fiche de l'agent) ferme la liste.
  const onglets: { cle: Onglet; label: string }[] = [
    ...(reseau || finance ? [{ cle: 'reseau' as const, label: 'Réseau' }] : []),
    ...(pointsGuichet.length > 0 ? [{ cle: 'guichet' as const, label: 'Guichet' }] : []),
    ...(pointsEncaissement.length > 0 ? [{ cle: 'encaisser' as const, label: 'À encaisser' }] : []),
    ...(pointsDepots.length > 0 ? [{ cle: 'depots' as const, label: 'Dépôts et remises' }] : []),
    ...(pointsVoyageurs.length > 0 || superAdmin || finance ? [{ cle: 'voyageurs' as const, label: 'Voyageurs à payer' }] : []),
    ...(pointsRembourser.length > 0 ? [{ cle: 'rembourser' as const, label: 'À rembourser' }] : []),
    ...(pointsCaisse.length > 0 ? [{ cle: 'recus' as const, label: 'Reçus' }, { cle: 'caisse' as const, label: 'Caisse' }] : []),
    ...(agent ? [{ cle: 'monpoint' as const, label: mesPoints.length > 1 ? 'Mes points' : 'Mon point' }] : []),
  ];
  // À l'ouverture : le premier onglet de travail (le réseau se configure une fois, on n'y arrive pas à chaque visite) ; sans point encore, le réseau.
  const premierDeTravail = onglets.find((o) => o.cle !== 'reseau' && o.cle !== 'monpoint') ?? onglets[0];
  const actif: Onglet | undefined = onglet && onglets.some((o) => o.cle === onglet) ? onglet : premierDeTravail?.cle;
  // Un seul point choisi pour tous les sous-onglets operationnels, pris dans la liste du sous-onglet ouvert.
  const pointsOnglet = actif === 'depots' ? pointsDepots : actif === 'guichet' ? pointsGuichet : actif === 'voyageurs' ? pointsVoyageurs : actif === 'rembourser' ? pointsRembourser : (actif === 'caisse' || actif === 'recus') ? pointsCaisse : pointsEncaissement;
  const pointChoisi = pointsOnglet.find((p) => p.id === pointEncaisser) ?? pointsOnglet[0];

  const columns: Column<PointRelais>[] = [
    { key: 'nom', label: 'Point', value: (p) => p.nom, render: (p) => <strong className="pr-nowrap">{p.nom}</strong> },
    { key: 'pays', label: 'Pays', value: (p) => p.pays_nom ?? p.pays_code, filter: 'options',
      render: (p) => <span className="pr-nowrap">{p.pays_nom ?? p.pays_code}</span> },
    { key: 'encaissement', label: 'Encaissement', value: (p) => p.comptes_mobile_money.length,
      render: (p) => (
        <span className="hint">
          {p.comptes_mobile_money.map((c) => LABEL_OPERATEUR[c.operateur]).join(', ') || 'Aucun mobile money'}
          {p.accepte_especes ? ' · espèces' : ''}
        </span>
      ) },
    { key: 'plafond', label: 'Plafond / dossier', value: (p) => p.plafond_dossier ?? 0, render: (p) => montantLocal(p.plafond_dossier, p.devise) },
    { key: 'agents', label: 'Agents', value: (p) => p.nb_agents, width: 90 },
    { key: 'statut', label: 'Statut', value: (p) => (p.actif ? 'Ouvert' : 'Fermé'), filter: 'options', width: 110,
      render: (p) => <Badge tone={p.actif ? 'green' : 'muted'}>{p.actif ? 'Ouvert' : 'Fermé'}</Badge> },
    ...(reseau ? [{
      key: 'actions', label: '', width: 540,
      render: (p: PointRelais) => (
        <div className="action-row">
          <button className="btn btn-soft btn-sm" onClick={() => setEdition(p)}><IconSquarePencil /> Modifier</button>
          <button className="btn btn-soft btn-sm" onClick={() => setAgentsDe(p)}>Agents</button>
          <button className="btn btn-soft btn-sm" title="Crée (une seule fois) le compte Wonjo du point : le nom sous lequel les demandes du guichet arrivent chez les voyageurs" onClick={() => creerProfil(p)}>Compte du point</button>
          {p.actif
            ? <button className="btn btn-sm btn-danger-outline" onClick={() => changerEtat(p, false)}>Fermer</button>
            : <>
                <button className="btn btn-soft btn-sm" onClick={() => changerEtat(p, true)}>Rouvrir</button>
                {superAdmin && <button className="btn btn-sm btn-danger-outline" onClick={() => supprimer(p)}>Supprimer</button>}
              </>}
        </div>
      ),
    }] : []),
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Points relais</h1>
          <p className="page-sub">
            {reseau
              ? 'Guichets Wonjo en Afrique : paiements à encaisser, comptes mobile money, plafonds et agents.'
              : agent ? 'Votre point relais : paiements à encaisser et ce que vous pouvez y faire.' : 'Guichets Wonjo en Afrique (consultation).'}
          </p>
        </div>
        {reseau && actif === 'reseau' && <button className="btn btn-primary" onClick={() => setEdition('nouveau')}>Nouveau point relais</button>}
      </div>

      {interrupteurs && !interrupteurs.points_relais_actif.actif && (
        <div className="insight-banner insight-banner--compact">
          <strong>Points relais éteints</strong>
          <span>Les points relais ne sont pas proposés dans l'app (interrupteur éteint, onglet Réseau) : aucune demande n'arrive.</span>
        </div>
      )}

      {error && <p className="page-error">{error}</p>}
      {message && <p className="success-text" style={{ marginBottom: 12 }}>{message}</p>}
      {fenetre}

      {onglets.length > 1 && (
        <div className="tabs">
          {onglets.map((o) => (
            <button key={o.cle} className={actif === o.cle ? 'active' : ''} onClick={() => { setOnglet(o.cle); rafraichirAFaire.current(); }}>{o.label}{(aFaire[o.cle] ?? 0) > 0 ? <span className="pr-badge-non-lu" title={o.cle === 'guichet' && detailGuichet ? detailGuichet : 'À faire'}>{aFaire[o.cle]}</span> : null}</button>
          ))}
        </div>
      )}

      {actif === 'voyageurs' && (superAdmin || finance) && <SiegeVoyageursSection />}

      {(actif === 'encaisser' || actif === 'depots' || actif === 'guichet' || actif === 'voyageurs' || actif === 'rembourser' || actif === 'recus' || actif === 'caisse') && pointChoisi && (
        <>
          {pointsOnglet.length > 1 && (
            <div className="pr-tabs-point">
              <span className="hint">Point relais :</span>
              <Select
                ariaLabel="Point relais"
                value={pointChoisi.id}
                onChange={setPointEncaisser}
                minWidth={240}
                options={pointsOnglet.map((p) => ({ value: p.id, label: p.nom, hint: `${p.ville} · ${p.pays_nom ?? p.pays_code}` }))}
              />
            </div>
          )}
          {actif === 'encaisser' && <AEncaisserSection key={pointChoisi.id} point={pointChoisi} />}
          {actif === 'depots' && <DepotsSection key={pointChoisi.id} point={pointChoisi} />}
          {actif === 'guichet' && <GuichetSection key={pointChoisi.id} point={pointChoisi} nomsPays={nomsPays} />}
          {actif === 'voyageurs' && <VoyageursSection key={pointChoisi.id} point={pointChoisi} />}
          {actif === 'rembourser' && <RemboursementsSection key={pointChoisi.id} point={pointChoisi} />}
          {actif === 'recus' && <RecusSection key={pointChoisi.id} point={pointChoisi} />}
          {actif === 'caisse' && <CaisseSection key={pointChoisi.id} point={pointChoisi} finance={superAdmin || finance} />}
        </>
      )}

      {actif === 'monpoint' && (
        <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
          {mesPoints.length === 0 && <p className="empty-state">Vous n'êtes rattaché à aucun point relais pour le moment. Demandez à un administrateur.</p>}
          {mesPoints.map((m) => {
            const p = points?.find((x) => x.id === m.point_id);
            return (
              <div key={m.point_id} className="panel">
                <h3>{m.nom} <Badge tone={m.actif ? 'green' : 'muted'}>{m.actif ? 'Actif' : 'Inactif'}</Badge></h3>
                {p && <p className="hint">{p.adresse || 'Adresse à renseigner'} · {p.ville} · {p.telephone || 'Téléphone à renseigner'}{p.horaires ? ` · ${p.horaires}` : ''}</p>}
                {p && p.comptes_mobile_money.length > 0 && (
                  <p className="hint" style={{ marginTop: 6 }}>
                    Comptes : {p.comptes_mobile_money.map((c) => `${LABEL_OPERATEUR[c.operateur]} ${c.numero}`).join(' · ')}
                  </p>
                )}
                <p className="hint" style={{ marginTop: 8 }}>
                  Vos droits : {m.permissions.length ? m.permissions.map((x) => LABEL_PERMISSION[x]).join(', ') : 'aucun pour l\'instant'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {actif === 'reseau' && (reseau || finance) && (
        <InterrupteurPointsRelais
          cle="points_relais_actif"
          titre="Points relais dans l'app"
          sousTitre="Allumé, les points relais apparaissent dans l'app et les expéditeurs peuvent leur confier des colis. Éteint, tout redevient invisible : les dossiers déjà ouverts restent en base."
          avertissementAllumer="Allumé, les clients voient les points relais et peuvent payer en espèces ou en mobile money. Vérifiez que les points sont ouverts et que leurs agents sont prêts."
        />
      )}

      {actif === 'reseau' && (
        !points ? <p className="loading-state">Chargement…</p> : (
          <DataTable
            rows={points}
            columns={columns}
            rowKey={(p) => p.id}
            emptyText="Aucun point relais pour l'instant."
            searchPlaceholder="Rechercher un point ou une ville…"
          />
        )
      )}

      {!actif && points && <p className="empty-state">Rien à afficher pour vos droits actuels.</p>}

      {edition && reseau && (
        <PointModal point={edition === 'nouveau' ? null : edition} onClose={() => setEdition(null)} onSaved={() => { setEdition(null); charger(); }} />
      )}
      {agentsDe && reseau && (
        <AgentsModal point={agentsDe} onClose={() => { setAgentsDe(null); charger(); }} />
      )}
    </div>
  );
}

// ── Creation / modification d'un point ───────────────────────────────────────────────────────────
interface Pays { code: string; nom: string; region: string; actif: boolean }

function PointModal({ point, onClose, onSaved }: { point: PointRelais | null; onClose: () => void; onSaved: () => void }) {
  const [pays, setPays] = useState<Pays[]>([]);
  const [tousPays, setTousPays] = useState<Pays[]>([]);
  const [villes, setVilles] = useState<{ pays_code: string; ville: string; actif: boolean }[]>([]);
  const [nom, setNom] = useState(point?.nom ?? '');
  const [paysCode, setPaysCode] = useState(point?.pays_code?.trim() ?? '');
  const [ville, setVille] = useState(point?.ville ?? '');
  const [adresse, setAdresse] = useState(point?.adresse ?? '');
  const [telephone, setTelephone] = useState(point?.telephone ?? '');
  const [horaires, setHoraires] = useState(point?.horaires ?? '');
  const [devise, setDevise] = useState(point?.devise ?? '');
  const [comptes, setComptes] = useState<CompteMobileMoney[]>(point?.comptes_mobile_money ?? []);
  const [especes, setEspeces] = useState(point?.accepte_especes ?? true);
  const [plDossier, setPlDossier] = useState(point?.plafond_dossier != null ? String(point.plafond_dossier) : '');
  const [plJour, setPlJour] = useState(point?.plafond_jour_agent != null ? String(point.plafond_jour_agent) : '');
  const [plEspeces, setPlEspeces] = useState(point?.plafond_especes != null ? String(point.plafond_especes) : '');
  const [actif, setActif] = useState(point?.actif ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.rpc('admin_lister_pays_corridors').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      const liste = (data ?? []) as Pays[];
      setTousPays(liste);
      setPays(liste.filter((p) => p.actif && (p.region.startsWith('afrique_') || p.region === 'maghreb')));
    });
    // Villes retenues en base (corridor_villes) : suggerees selon le pays choisi.
    supabase.rpc('admin_lister_villes_corridors').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setVilles((data ?? []) as { pays_code: string; ville: string; actif: boolean }[]);
    });
  }, []);

  const nomsPays = useMemo(() => Object.fromEntries(tousPays.map((p) => [p.code.trim(), p.nom])), [tousPays]);
  const villesDuPays = useMemo(
    () => [...new Set(villes.filter((v) => v.actif && v.pays_code.trim() === paysCode).map((v) => v.ville))],
    [villes, paysCode],
  );

  const imposee = deviseImposee(paysCode);
  function choisirPays(code: string) {
    // Changer de pays vide une ville qui n'appartient pas au nouveau pays.
    if (code !== paysCode && ville && !villes.some((v) => v.pays_code.trim() === code && v.ville === ville)) setVille('');
    setPaysCode(code);
    const d = deviseImposee(code);
    if (d) {
      setDevise(d);
      // Nouveau point en zone CFA : on propose les plafonds du pilote, modifiables.
      if (!point) {
        if (!plDossier) setPlDossier(PLAFONDS_CFA.dossier);
        if (!plJour) setPlJour(PLAFONDS_CFA.jour);
        if (!plEspeces) setPlEspeces(PLAFONDS_CFA.especes);
      }
    }
  }

  const paysOptions = useMemo(
    () => [
      { value: '', label: 'Choisir un pays' },
      ...pays.map((p) => ({ value: p.code.trim(), label: p.nom, icon: <Drapeau iso={p.code} /> }))
        .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    ],
    [pays],
  );

  function nombre(v: string): number | null {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return v.trim() === '' || !Number.isFinite(n) ? null : n;
  }

  async function enregistrer() {
    setError(null);
    if (!nom.trim() || !paysCode || !ville.trim() || !devise.trim()) { setError('Nom, pays, ville et monnaie sont obligatoires.'); return; }
    if (telephone && !numeroComplet(decomposerNumero(telephone, paysCode).iso, telephone)) { setError('Le numéro de téléphone du point semble incomplet.'); return; }
    if (comptes.some((c) => !c.numero.trim() || !c.titulaire.trim())) { setError('Chaque compte mobile money doit avoir un numéro et un titulaire.'); return; }
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_enregistrer_point_relais', {
      p_id: point?.id ?? null,
      p_nom: nom.trim(), p_pays_code: paysCode, p_ville: ville.trim(), p_adresse: adresse.trim(), p_telephone: telephone.trim(),
      p_horaires: horaires.trim(), p_devise: devise.trim().toUpperCase(),
      p_comptes_mobile_money: comptes.map((c) => ({ operateur: c.operateur, numero: c.numero.trim(), titulaire: c.titulaire.trim() })),
      p_accepte_especes: especes,
      p_plafond_dossier: nombre(plDossier), p_plafond_jour_agent: nombre(plJour), p_plafond_especes: nombre(plEspeces),
      p_actif: actif,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    onSaved();
  }

  const unite = devise === 'XOF' || devise === 'XAF' ? 'FCFA' : devise || 'monnaie locale';

  return (
    <Modal onClose={onClose} wide>
      <h2 className="modal-title">{point ? `Modifier « ${point.nom} »` : 'Nouveau point relais'}</h2>
      <div className="modal-body">
        <div className="form-grid">
          <div className="field-row">
            <label>Nom du point<input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. Wonjo Dakar Plateau" /></label>
            <label>Téléphone<ChampTelephone valeur={telephone} onChange={setTelephone} pays={paysCode} nomsPays={nomsPays} ariaLabel="Téléphone du point" /></label>
          </div>
          <div className="field-row">
            <label>Pays<Select ariaLabel="Pays" value={paysCode} onChange={choisirPays} options={paysOptions} /></label>
            <label>Ville<ChampVille valeur={ville} onChange={setVille} villes={villesDuPays} disabled={!paysCode} placeholder={paysCode ? 'Ex. Dakar' : 'Choisissez d\'abord le pays'} /></label>
          </div>
          <label>Adresse<ChampAdresse valeur={adresse} onChange={setAdresse} pays={paysCode} ville={ville} placeholder="Rue, quartier, repère : des suggestions s'affichent" /></label>
          <div className="champ-horaires-bloc"><span className="champ-horaires-titre">Horaires d'ouverture</span><ChampHoraires valeur={horaires} onChange={setHoraires} /></div>
          <div className="field-row">
            <label>
              Monnaie
              <input type="text" value={devise} disabled={!!imposee} maxLength={3} onChange={(e) => setDevise(e.target.value.toUpperCase())} placeholder="Ex. MAD" />
              {imposee && <span className="hint">Imposée : franc CFA, taux fixe avec l'euro.</span>}
            </label>
          </div>

          <div>
            <strong style={{ fontSize: 13 }}>Comptes mobile money du point</strong>
            <p className="hint">Ce que l'expéditeur verra pour payer. Le titulaire est le nom affiché par l'opérateur au moment du transfert.</p>
            {comptes.map((c, i) => (
              <div key={i} className="compte-mm">
                <Select
                  ariaLabel="Opérateur"
                  value={c.operateur}
                  onChange={(v) => setComptes((l) => l.map((x, j) => (j === i ? { ...x, operateur: v as Operateur } : x)))}
                  options={OPERATEURS.map((o) => ({ value: o.value, label: o.label, icon: <span className="moyen-pastille" style={{ background: o.couleur }} aria-hidden="true" /> }))}
                />
                <input type="text" className="compte-mm-titulaire" value={c.titulaire} placeholder="Titulaire (nom affiché par l'opérateur)" aria-label="Titulaire"
                       onChange={(e) => setComptes((l) => l.map((x, j) => (j === i ? { ...x, titulaire: e.target.value } : x)))} />
                <div className="compte-mm-tel">
                  <ChampTelephone key={`${i}-${paysCode}`} valeur={c.numero} pays={paysCode} nomsPays={nomsPays} ariaLabel={`Numéro ${LABEL_OPERATEUR[c.operateur]}`}
                                  onChange={(v) => setComptes((l) => l.map((x, j) => (j === i ? { ...x, numero: v } : x)))} />
                </div>
                <button className="btn btn-sm" onClick={() => setComptes((l) => l.filter((_, j) => j !== i))}>Retirer</button>
              </div>
            ))}
            {comptes.length < 5 && (
              <button className="btn btn-soft btn-sm" style={{ marginTop: 8 }} onClick={() => setComptes((l) => [...l, { operateur: 'orange_money', numero: '', titulaire: '' }])}>
                Ajouter un compte
              </button>
            )}
          </div>

          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={especes} onChange={(e) => setEspeces(e.target.checked)} /> Accepte les paiements en espèces au guichet
          </label>

          <div>
            <strong style={{ fontSize: 13 }}>Plafonds ({unite})</strong>
            <p className="hint">Montants au-delà desquels le serveur refuse l'opération, pour limiter la perte en cas d'erreur ou de fraude.</p>
            <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginTop: 8 }}>
              <label>Par dossier<ChampMontant valeur={plDossier} onChange={setPlDossier} unite={unite} ariaLabel="Plafond par dossier" /></label>
              <label>Par agent et par jour<ChampMontant valeur={plJour} onChange={setPlJour} unite={unite} ariaLabel="Plafond par agent et par jour" /></label>
              <label>Espèces détenues<ChampMontant valeur={plEspeces} onChange={setPlEspeces} unite={unite} ariaLabel="Plafond d'espèces détenues" /></label>
            </div>
          </div>

          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Point actif
          </label>
          <p className="hint">Un point actif doit avoir une adresse, un téléphone, au moins un moyen d'encaissement et ses trois plafonds.</p>
        </div>
        {error && <p className="page-error">{error}</p>}
        <div className="action-row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Annuler</button>
          <button className="btn btn-primary" onClick={enregistrer} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Agents d'un point ────────────────────────────────────────────────────────────────────────────
function AgentsModal({ point, onClose }: { point: PointRelais; onClose: () => void }) {
  const { confirmer, fenetre } = useConfirmation();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [candidats, setCandidats] = useState<AdminRow[]>([]);
  const [nouveau, setNouveau] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function charger() {
    supabase.rpc('admin_lister_agents_point_relais', { p_point_id: point.id }).then(({ data, error: e }) => {
      if (e) { setError(e.message); setAgents([]); return; }
      setAgents((data ?? []) as Agent[]);
    });
  }
  useEffect(() => {
    charger();
    // Candidats : administrateurs actifs qui ont le role Agent relais attribue (admin_lister_comptes_agents, lisible par le Reseau).
    supabase.rpc('admin_lister_comptes_agents').then(({ data, error: e }) => {
      if (e) { setError(e.message); return; }
      setCandidats(((data ?? []) as AdminRow[]).filter((a) => a.actif));
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function definir(userId: string, permissions: Permission[], actif: boolean) {
    setBusy(true);
    setError(null);
    const { error: e } = await supabase.rpc('admin_definir_agent_point_relais', {
      p_point_id: point.id, p_user_id: userId, p_permissions: permissions, p_actif: actif,
    });
    setBusy(false);
    if (e) { setError(e.message); return; }
    charger();
  }

  async function retirer(a: Agent) {
    if (!(await confirmer({ titre: `Retirer ${a.nom_affiche ?? a.email} ?`, texte: `Cette personne n'aura plus accès à « ${point.nom} ».`, libelleOui: 'Retirer', danger: true }))) return;
    setBusy(true);
    const { error: e } = await supabase.rpc('admin_retirer_agent_point_relais', { p_point_id: point.id, p_user_id: a.user_id });
    setBusy(false);
    if (e) { setError(e.message); return; }
    charger();
  }

  const disponibles = candidats.filter((c) => !agents?.some((a) => a.user_id === c.user_id));

  const nbActifs = agents?.filter((a) => a.actif && a.compte_actif).length ?? 0;

  return (
    <>
    <Modal onClose={onClose} wide>
      <h2 className="modal-title">Agents de « {point.nom} »</h2>
      <div className="modal-body">
        <p className="hint pr-agents-intro">Un agent n'agit que sur ce point, avec ses droits et la double authentification{agents && agents.length > 0 ? ` · ${nbActifs} actif${nbActifs > 1 ? 's' : ''}` : ''}.</p>

        {!agents ? <p className="loading-state">Chargement…</p> : agents.length === 0 ? (
          <p className="empty-state">Aucun agent sur ce point. Ajoutez-en un ci-dessous.</p>
        ) : agents.map((a) => {
          const suspendu = !a.actif || !a.compte_actif;
          return (
            <article key={a.user_id} className={`pr-agent ${suspendu ? 'pr-agent--suspendu' : ''}`}>
              <header className="pr-agent-tete">
                <Person src={a.avatar_url} nom={a.nom_affiche ?? a.email} sub={a.nom_affiche ? a.email : null} size={40} />
                <div className="pr-agent-etat">
                  {!a.compte_actif
                    ? <Badge tone="danger">Compte admin désactivé</Badge>
                    : <Badge tone={a.actif ? 'green' : 'amber'}>{a.actif ? 'Actif' : 'Suspendu'}</Badge>}
                  <button type="button" role="switch" aria-checked={a.actif} aria-label={a.actif ? 'Suspendre cet agent' : 'Réactiver cet agent'}
                          title={a.actif ? 'Suspendre : plus aucun droit tant qu\'il n\'est pas réactivé' : 'Réactiver'}
                          className={`champ-horaires-switch ${a.actif ? 'on' : ''}`} disabled={busy}
                          onClick={() => definir(a.user_id, a.permissions, !a.actif)}><span /></button>
                  <button type="button" className="pr-agent-retirer" disabled={busy} onClick={() => retirer(a)}>Retirer</button>
                </div>
              </header>

              <div className="pr-agent-droits-tete">
                <strong>Droits</strong>
                <span className="hint">{a.permissions.length} sur {PERMISSIONS.length}</span>
                <span className="pr-agent-rapide">
                  <button type="button" disabled={busy || a.permissions.length === PERMISSIONS.length} onClick={() => definir(a.user_id, PERMISSIONS.map((x) => x.cle), a.actif)}>Tout activer</button>
                  <button type="button" disabled={busy || a.permissions.length === 0} onClick={() => definir(a.user_id, [], a.actif)}>Tout retirer</button>
                </span>
              </div>
              <div className="pr-agent-droits">
                {PERMISSIONS.map((p) => {
                  const on = a.permissions.includes(p.cle);
                  return (
                    <button
                      key={p.cle}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      className={`pr-droit ${on ? 'on' : ''}`}
                      disabled={busy}
                      onClick={() => definir(a.user_id, on ? a.permissions.filter((x) => x !== p.cle) : [...a.permissions, p.cle], a.actif)}
                    >
                      <span className="pr-droit-case" aria-hidden="true">{on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}</span>
                      <span className="pr-droit-texte"><strong>{p.label}</strong><small>{p.aide}</small></span>
                    </button>
                  );
                })}
              </div>
              {!a.actif && <p className="hint" style={{ marginTop: 8 }}>Suspendu : aucun droit tant qu'il n'est pas réactivé.</p>}
            </article>
          );
        })}

        <div className="pr-agent-ajout">
          <strong>Ajouter un agent</strong>
          {disponibles.length === 0 ? (
            <p className="hint">Aucun administrateur disponible avec le rôle « Point relais ». Invitez la personne dans Administrateurs avec ce rôle, puis revenez ici.</p>
          ) : (
            <>
              <div className="action-row" style={{ alignItems: 'center', marginTop: 8 }}>
                <Select
                  ariaLabel="Administrateur"
                  value={nouveau}
                  onChange={setNouveau}
                  minWidth={280}
                  options={[{ value: '', label: 'Choisir un administrateur' }, ...disponibles.map((c) => ({ value: c.user_id, label: c.nom_affiche ?? c.email, hint: c.nom_affiche ? c.email : undefined }))]}
                />
                <button className="btn btn-primary btn-sm" disabled={busy || !nouveau} onClick={() => { definir(nouveau, [], true); setNouveau(''); }}>
                  Ajouter
                </button>
              </div>
              <p className="hint" style={{ marginTop: 6 }}>Il est ajouté sans aucun droit : activez ensuite ce qu'il peut faire.</p>
            </>
          )}
        </div>
        {error && <p className="page-error">{error}</p>}
      </div>
    </Modal>
    {fenetre}
    </>
  );
}
