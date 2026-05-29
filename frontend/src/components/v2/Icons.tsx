interface IconProps { size?: number; className?: string; style?: React.CSSProperties }

const icon = (path: string) => ({ size = 16, className, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    {path.split('|').map((d, i) => <path key={i} d={d} />)}
  </svg>
)

export const Home = icon('M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z|M9 21V12h6v9')
export const Upload = icon('M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4|M17 8l-5-5-5 5|M12 3v12')
export const Whatsapp = icon('M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.37 5.07L2 22l5.1-1.33A9.94 9.94 0 0012 22c5.52 0 10-4.48 10-10S17.52 2 12 2z|M16 13.5c-.28-.14-1.65-.81-1.9-.9-.26-.1-.44-.14-.63.14-.18.28-.72.9-.88 1.08-.16.18-.33.2-.61.07-.28-.14-1.18-.44-2.25-1.4-.83-.74-1.4-1.65-1.56-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.33.42-.5.14-.17.18-.28.28-.47.09-.2.05-.37-.02-.51-.07-.14-.63-1.52-.86-2.08-.23-.55-.46-.47-.63-.48-.16 0-.35-.02-.53-.02-.18 0-.47.07-.72.33-.25.26-.95.93-.95 2.27s.97 2.63 1.1 2.81c.14.18 1.9 2.9 4.61 4.07.64.28 1.14.44 1.53.56.64.2 1.23.17 1.69.1.52-.08 1.6-.65 1.82-1.28.23-.63.23-1.17.16-1.28-.07-.11-.25-.18-.53-.32z')
export const Diff = icon('M16 3h5v5|M4 20L21 3|M21 16v5h-5|M15 15l5.1 5.1|M4 4l5 5')
export const Suppliers = icon('M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2|M9 11a4 4 0 100-8 4 4 0 000 8z|M23 21v-2a4 4 0 00-3-3.87|M16 3.13a4 4 0 010 7.75')
export const Settings = icon('M12 15a3 3 0 100-6 3 3 0 000 6z|M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z')
export const Search = icon('M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z')
export const Bell = icon('M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9|M13.73 21a2 2 0 01-3.46 0')
export const ChevronDown = icon('M6 9l6 6 6-6')
export const ChevronRight = icon('M9 18l6-6-6-6')
export const Check = icon('M20 6L9 17l-5-5')
export const X = ({ size = 16, className, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
)
export const AlertCircle = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M12 8v4|M12 16h.01')
export const Trash = icon('M3 6h18|M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2')
export const FileText = icon('M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z|M14 2v6h6|M16 13H8|M16 17H8|M10 9H8')
export const Camera = icon('M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z|M12 17a4 4 0 100-8 4 4 0 000 8z')
export const Sparkle = icon('M12 3v1|M12 20v1|M4.22 4.22l.7.7|M19.07 19.07l.7.7|M3 12h1|M20 12h1|M4.22 19.78l.7-.7|M19.07 4.93l.7-.7|M12 8a4 4 0 000 8 4 4 0 000-8z')
export const Database = icon('M12 2C6.48 2 2 4.02 2 6.5S6.48 11 12 11s10-2.02 10-4.5S17.52 2 12 2z|M2 6.5v5C2 13.98 6.48 16 12 16s10-2.02 10-4.5v-5|M2 11.5v5C2 18.98 6.48 21 12 21s10-2.02 10-4.5v-5')
export const Filter = icon('M22 3H2l8 9.46V19l4 2v-8.54L22 3z')
export const Eye = icon('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z|M12 15a3 3 0 100-6 3 3 0 000 6z')
export const ArrowRight = icon('M5 12h14|M12 5l7 7-7 7')
export const Clock = icon('M12 22a10 10 0 100-20 10 10 0 000 20z|M12 6v6l4 2')
export const TrendingUp = icon('M23 6l-9.5 9.5-5-5L1 18|M17 6h6v6')
export const Tag = icon('M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z|M7 7h.01')
export const Hash = icon('M4 9h16|M4 15h16|M10 3L8 21|M16 3l-2 18')
export const GitMerge = icon('M18 21a3 3 0 100-6 3 3 0 000 6z|M6 3a3 3 0 100 6 3 3 0 000-6z|M6 9v5c0 1.1.4 2.1 1.2 2.8l1.8 1.6|M18 15V9')
export const User = icon('M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2|M12 11a4 4 0 100-8 4 4 0 000 8z')
export const LogOut = icon('M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4|M16 17l5-5-5-5|M21 12H9')
export const UploadCloud = icon('M16 16l-4-4-4 4|M12 12v9|M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3')
export const Loader = ({ size = 16, className, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`q-spin ${className ?? ''}`} style={style}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
)
