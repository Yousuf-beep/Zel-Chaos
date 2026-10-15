// Line icons for the chat, 24px grid, drawn with currentColor.
type P = { className?: string };
const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const IconMenu = (p: P) => <svg {...base} {...p}><path d="M4 8h16M4 16h10" /></svg>;
export const IconHome = (p: P) => <svg {...base} {...p}><path d="M4 10.5L12 4l8 6.5V18.5a1.5 1.5 0 0 1-1.5 1.5H15v-5.5h-6V20H5.5A1.5 1.5 0 0 1 4 18.5z" /></svg>;
export const IconNew = (p: P) => (
  <svg {...base} {...p}><path d="M12 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12" /><path d="M17.6 3.6a1.9 1.9 0 0 1 2.8 2.8L13 13.8l-3.5.7.7-3.5z" /></svg>
);
export const IconMore = (p: P) => <svg {...base} {...p}><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></svg>;
export const IconMic = (p: P) => <svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
export const IconWave = (p: P) => <svg {...base} {...p}><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></svg>;
export const IconSend = (p: P) => <svg {...base} strokeWidth={2.2} {...p}><path d="M12 19V5M6 11l6-6 6 6" /></svg>;
export const IconStop = (p: P) => <svg {...base} {...p}><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" /></svg>;
export const IconCopy = (p: P) => <svg {...base} {...p}><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" /></svg>;
export const IconCheck = (p: P) => <svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
export const IconSpeaker = (p: P) => <svg {...base} {...p}><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z" /><path d="M16 9a4.5 4.5 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" /></svg>;
export const IconClose = (p: P) => <svg {...base} {...p}><path d="M6 6l12 12M18 6L6 18" /></svg>;
export const IconSearch = (p: P) => <svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></svg>;
export const IconReport = (p: P) => (
  <svg {...base} {...p}><path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>
);
export const IconTrash = (p: P) => <svg {...base} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7" /></svg>;
export const IconEdit = (p: P) => <svg {...base} {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" /></svg>;
export const IconMicOff = (p: P) => <svg {...base} {...p}><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18" /></svg>;
export const IconCaptions = (p: P) => <svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 10.5a2 2 0 1 0 0 3M16.5 10.5a2 2 0 1 0 0 3" /></svg>;
export const IconDownload = (p: P) => <svg {...base} {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
export const IconShare = (p: P) => <svg {...base} {...p}><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" /></svg>;
