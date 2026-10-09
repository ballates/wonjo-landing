import { useState } from 'react';
import { CommissionsSection } from './CommissionsPage';
import { CorridorsSection } from './CorridorsPage';
import { AnalyseCorridorsSection } from './AnalyseCorridorsSection';

type SousOnglet = 'commissions' | 'corridors' | 'analyse';

export function TarificationPage() {
  const [onglet, setOnglet] = useState<SousOnglet>('commissions');

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Tarification</h1>
          <p className="page-sub">Commissions et plafonds de prix par corridor.</p>
        </div>
      </div>

      <div className="tabs">
        <button className={onglet === 'commissions' ? 'active' : ''} onClick={() => setOnglet('commissions')}>Commissions</button>
        <button className={onglet === 'corridors' ? 'active' : ''} onClick={() => setOnglet('corridors')}>Corridors</button>
        <button className={onglet === 'analyse' ? 'active' : ''} onClick={() => setOnglet('analyse')}>Analyse</button>
      </div>

      {onglet === 'commissions' && <CommissionsSection />}
      {onglet === 'corridors' && <CorridorsSection />}
      {onglet === 'analyse' && <AnalyseCorridorsSection />}
    </div>
  );
}
