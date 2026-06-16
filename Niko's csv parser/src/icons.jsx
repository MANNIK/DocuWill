// Inline SVG icons — line style, 16px, stroke 1.5
const I = ({ d, size = 16, stroke = 1.5, fill = "none", ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {d}
  </svg>
);

const Icons = {
  Home: (p) => <I {...p} d={<><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/></>} />,
  Upload: (p) => <I {...p} d={<><path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M4 17v3h16v-3"/></>} />,
  Inbox: (p) => <I {...p} d={<><path d="M3 13V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7"/><path d="M3 13h5l1.5 3h5L16 13h5v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></>} />,
  Diff: (p) => <I {...p} d={<><path d="M9 4v16"/><path d="M15 4v16"/><path d="M5 9h2"/><path d="M5 14h2"/><path d="M17 9h2"/><path d="M17 14h2"/></>} />,
  Suppliers: (p) => <I {...p} d={<><path d="M3 7h18l-2 12H5z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>} />,
  Settings: (p) => <I {...p} d={<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></>} />,
  Search: (p) => <I {...p} d={<><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>} />,
  Plus: (p) => <I {...p} d={<><path d="M12 5v14"/><path d="M5 12h14"/></>} />,
  Check: (p) => <I {...p} d={<><path d="m5 12 5 5L20 7"/></>} />,
  X: (p) => <I {...p} d={<><path d="M6 6l12 12"/><path d="m18 6-12 12"/></>} />,
  Chevron: (p) => <I {...p} d={<><path d="m9 6 6 6-6 6"/></>} />,
  ChevronDown: (p) => <I {...p} d={<><path d="m6 9 6 6 6-6"/></>} />,
  Doc: (p) => <I {...p} d={<><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></>} />,
  Photo: (p) => <I {...p} d={<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-9 9"/></>} />,
  Whatsapp: (p) => <I {...p} d={<><path d="M12 3a9 9 0 0 0-7.5 14L3 21l4.2-1.4A9 9 0 1 0 12 3z"/><path d="M8.5 9c0 4 2.5 6.5 6.5 6.5l1.5-1.5-2-1-1 1c-1.5-.5-2.5-1.5-3-3l1-1-1-2z"/></>} />,
  Excel: (p) => <I {...p} d={<><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></>} />,
  Bell: (p) => <I {...p} d={<><path d="M6 8a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 19a2 2 0 0 0 4 0"/></>} />,
  Link: (p) => <I {...p} d={<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5"/></>} />,
  Sparkle: (p) => <I {...p} d={<><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/><path d="m6 6 2.5 2.5"/><path d="m15.5 15.5 2.5 2.5"/><path d="M6 18l2.5-2.5"/><path d="m15.5 8.5 2.5-2.5"/></>} />,
  Brain: (p) => <I {...p} d={<><path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 2 3v2a3 3 0 0 0 4 3 3 3 0 0 0 3-3V5z"/><path d="M15 5a3 3 0 0 1 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-2 3v2a3 3 0 0 1-4 3 3 3 0 0 1-3-3V5z"/></>} />,
  Filter: (p) => <I {...p} d={<><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>} />,
  Clock: (p) => <I {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />,
  Warning: (p) => <I {...p} d={<><path d="M12 3 2 20h20z"/><path d="M12 10v4"/><path d="M12 17v.5"/></>} />,
  Edit: (p) => <I {...p} d={<><path d="M14 4 20 10 8 22H2v-6z"/><path d="m13 5 6 6"/></>} />,
  Download: (p) => <I {...p} d={<><path d="M12 4v12"/><path d="m7 11 5 5 5-5"/><path d="M4 20h16"/></>} />,
  Refresh: (p) => <I {...p} d={<><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></>} />,
};

window.Icons = Icons;
