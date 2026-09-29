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
export const IconExchange = () => <Svg><path d="M17 3l4 4-4 4" /><path d="M3 7h18" /><path d="M7 21l-4-4 4-4" /><path d="M21 17H3" /></Svg>;
export const IconSun = () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Svg>;
export const IconMoon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconLogout = () => <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Svg>;
export const IconPanelClose = () => <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M16 15l-3-3 3-3" /></Svg>;
export const IconPanelOpen = () => <Svg><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /><path d="M14 9l3 3-3 3" /></Svg>;
export const IconClose = () => <Svg size={18}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IconSearch = () => <Svg size={16}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></Svg>;
export const IconEye = () => <Svg size={16}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const IconEyeOff = () => <Svg size={16}><path d="M2 12s3.5-7 10-7c1.7 0 3.2.4 4.5 1M22 12s-3.5 7-10 7c-1.7 0-3.2-.4-4.5-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /><path d="M2 2l20 20" /></Svg>;
export const IconFilter = () => <Svg size={16}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" /></Svg>;
export const IconFacebook = () => <Svg size={18}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></Svg>;
export const IconLinkedin = () => <Svg size={18}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></Svg>;
export const IconSort = ({ dir }: { dir: 'asc' | 'desc' | null }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir !== 'desc' && <polyline points="7 10 12 5 17 10" />}
    {dir !== 'asc' && <polyline points="7 14 12 19 17 14" />}
  </svg>
);
export const IconMail = () => <Svg><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Svg>;
export const IconTrash = () => <Svg size={16}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></Svg>;
export const IconRestore = () => <Svg size={16}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Svg>;
export const IconWmail = () => (
  <svg width="18" height="18" viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6,10 L13,30 L20,14 L27,30 L34,10" />
  </svg>
);
export const IconPercent = () => <Svg><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></Svg>;
export const IconChecklist = () => <Svg><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3 6 1.5 1.5L7 5" /><path d="m3 12 1.5 1.5L7 11" /><path d="m3 18 1.5 1.5L7 17" /></Svg>;
export const IconStar = () => <Svg><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 21 12 17.5 5.5 21 7 14.5 2 9.5 9 9 12 2" /></Svg>;
export const IconChevronRight = () => <Svg size={14}><polyline points="9 6 15 12 9 18" /></Svg>;
export const IconArrowLeftRight = () => <Svg size={14}><path d="m8 3-4 4 4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></Svg>;
export const IconChevronLeft = () => <Svg size={14}><polyline points="15 6 9 12 15 18" /></Svg>;
export const IconSend = () => <Svg size={16}><path d="m22 2-20 8 9 3 3 9z" /><path d="M22 2 11 13" /></Svg>;
export const IconGlobe = () => <Svg><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z" /></Svg>;
export const IconTag = () => (
  <Svg>
    <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
    <circle cx="7.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
  </Svg>
);
export const IconSquarePencil = () => (
  <Svg size={16}>
    <path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    <path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L11 15.6 7 17l1.4-4L18.4 2.6z" />
  </Svg>
);
