import type { ReactNode } from 'react';

function Svg({ size = 18, children }: { size?: number; children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconDashboard = () => <Svg><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Svg>;
export const IconShield = () => <Svg><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" /></Svg>;
export const IconId = () => <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M5 18c0-2 2-3.5 4-3.5s4 1.5 4 3.5" /><path d="M15 9h4M15 13h4" /></Svg>;
export const IconUsers = () => <Svg><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Svg>;
export const IconHistory = () => <Svg><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></Svg>;
export const IconSun = () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Svg>;
export const IconMoon = () => <Svg><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></Svg>;
export const IconLogout = () => <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Svg>;
export const IconPanelClose = () => <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M16 15l-3-3 3-3" /></Svg>;
export const IconPanelOpen = () => <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M14 9l3 3-3 3" /></Svg>;
export const IconClose = () => <Svg size={18}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IconSearch = () => <Svg size={16}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>;
export const IconEye = () => <Svg size={16}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const IconFilter = () => <Svg size={16}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></Svg>;
export const IconSort = ({ dir }: { dir: 'asc' | 'desc' | null }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir !== 'desc' && <polyline points="7 10 12 5 17 10" />}
    {dir !== 'asc' && <polyline points="7 14 12 19 17 14" />}
  </svg>
);
export const IconMail = () => <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>;
export const IconPercent = () => <Svg><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></Svg>;
export const IconChecklist = () => <Svg><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1.5 1.5L7 5" /><path d="m3 12 1.5 1.5L7 11" /><path d="m3 18 1.5 1.5L7 17" /></Svg>;
