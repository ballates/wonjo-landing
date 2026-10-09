import { useState } from 'react';
import { CommissionsSection } from './CommissionsPage';
import { CorridorsSection } from './CorridorsPage';
import { AnalyseCorridorsSection } from './AnalyseCorridorsSection';
import { ReglagesEnAttente } from '../components/ReglagesEnAttente';
import { SimulateurCard } from '../components/SimulateurCard';
import { useAuth } from '../auth/AuthContext';
import { peutGererAdmins } from '../lib/permissions';

type SousOnglet = 'commissions' | 'corridors' | 'analyse' | 'simulateur';

export function TarificationPage() {
  const { roles } = useAuth();
  const [onglet, setOnglet] = useState<SousOnglet>('commissions');
  // Incrémenté quand un changement en attente est décidé : les sections se rechargent
  // et affichent les nouveaux réglages.
  const [rev, setRev] = useState(0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tarification</h1>
          <p className="page-sub">Commissions, plafonds de prix par corridor, protections et simulateur d'envoi.</p>
        </div>
      </div>

      <ReglagesEnAttente onChange={() => setRev((r) => r + 1)} />

      <div className="tabs">
        <button className={onglet === 'commissions' ? 'active' : ''} onClick={() => setOnglet('commissions')}>Commissions</button>
        <button className={onglet === 'corridors' ? 'active' : ''} onClick={() => setOnglet('corridors')}>Corridors</button>
        <button className={onglet === 'analyse' ? 'active' : ''} onClick={() => setOnglet('analyse')}>Analyse</button>
        {peutGererAdmins(roles) && (
          <button className={onglet === 'simulateur' ? 'active' : ''} onClick={() => setOnglet('simulateur')}>Simulateur</button>
        )}
      </div>

      {onglet === 'commissions' && <CommissionsSection key={rev} />}
      {onglet === 'corridors' && <CorridorsSection key={rev} />}
      {onglet === 'analyse' && <AnalyseCorridorsSection />}
      {onglet === 'simulateur' && peutGererAdmins(roles) && <SimulateurCard />}
    </div>
  );
}
