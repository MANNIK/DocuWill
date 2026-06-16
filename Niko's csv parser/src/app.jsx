// App shell — sidebar nav + topbar + screen routing + Tweaks panel
const { useState, useEffect } = React;

const TWEAK_DEFAULS = /*EDITMODE-BEGIN*/{
  "variant": "lavender",
  "density": "comfortable",
  "sourcesMode": "preview"
}/*EDITMODE-END*/;

const App = () => {
  const Ico = window.Icons;
  const [screen, setScreen] = useState("reconcile");
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULS);

  // Apply variant to root
  useEffect(() => {
    document.body.setAttribute("data-variant", t.variant);
  }, [t.variant]);

  const nav = [
    { section: "lavoro" },
    { id: "dashboard", label: "Dashboard", icon: "Home" },
    { id: "upload", label: "Carica documento", icon: "Upload" },
    { id: "inbox", label: "Inbox WhatsApp", icon: "Whatsapp", count: 6 },
    { id: "reconcile", label: "Riconciliazioni", icon: "Diff", count: 6, badge: "pulse" },
    { section: "configurazione" },
    { id: "suppliers", label: "Fornitori", icon: "Suppliers" },
    { id: "settings", label: "Impostazioni", icon: "Settings" },
  ];

  const titles = {
    dashboard: ["Lavoro", "Dashboard"],
    upload: ["Lavoro", "Nuovo documento"],
    inbox: ["Lavoro", "Inbox WhatsApp"],
    reconcile: ["Lavoro", "Riconciliazione · ORD-2026-04-218"],
    suppliers: ["Configurazione", "Fornitori"],
    settings: ["Configurazione", "Impostazioni"],
  };

  const Screen = {
    dashboard: window.Dashboard,
    upload: window.Upload,
    inbox: window.Inbox,
    reconcile: window.Reconcile,
    suppliers: window.Supplier,
    settings: window.Settings,
  }[screen];

  const crumbs = titles[screen];

  return (
    <div className="app" data-screen-label={`${screen}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">Q</div>
          <div>
            <div className="logo-name">Quoro <span>· beta</span></div>
            <div style={{fontSize: 10.5, color: "var(--text-faint)", marginTop: 1}}>WeWill · riconciliazione</div>
          </div>
        </div>

        <nav className="nav">
          {nav.map((n, i) => {
            if (n.section) return <div key={`s${i}`} className="section-label">{n.section}</div>;
            const IconComp = Ico[n.icon];
            return (
              <button key={n.id} className={screen === n.id ? "active" : ""} onClick={() => setScreen(n.id)}>
                <IconComp className="nav-icon"/>
                <span>{n.label}</span>
                {n.count != null && <span className="count">{n.badge === "pulse" ? <span className="dot pulse" style={{color: "var(--accent)", marginRight: 4}}></span> : null}{n.count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">MC</div>
          <div style={{flex: 1, minWidth: 0}}>
            <div style={{fontSize: 12.5, fontWeight: 500, color: "var(--text)"}}>Marta Conti</div>
            <div style={{fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>Ufficio acquisti</div>
          </div>
          <Ico.ChevronDown size={14}/>
        </div>
      </aside>

      {/* Main */}
      <main className="main">
        <div className="topbar">
          <div className="breadcrumbs">
            <Ico.Home size={13}/>
            <span>{crumbs[0]}</span>
            <span className="sep">/</span>
            <strong>{crumbs[1]}</strong>
          </div>
          <div style={{display: "flex", gap: 8, alignItems: "center"}}>
            <button className="btn ghost sm"><Ico.Search size={14}/> Cerca <span className="kbd">⌘K</span></button>
            <button className="btn ghost sm" style={{position: "relative"}}>
              <Ico.Bell size={14}/>
              <span style={{position: "absolute", top: 4, right: 4, width: 7, height: 7, background: "var(--accent)", borderRadius: 999}}></span>
            </button>
            <div style={{width: 1, height: 18, background: "var(--border)"}}></div>
            <span className="pill"><span className="dot" style={{color: "var(--ok)"}}></span> tutto OK</span>
          </div>
        </div>

        <div data-screen-label={`${screen}`} key={screen} style={{flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column"}}>
          {Screen ? <Screen go={setScreen} t={t} setTweak={setTweak}/> : <div style={{padding: 40}}>Schermata non trovata</div>}
        </div>
      </main>

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="Estetica">
          <window.TweakColor
            label="Variante"
            value={t.variant}
            onChange={(v) => setTweak("variant", v)}
            options={[
              ["#7b5cf5", "#efeaff", "#ffffff"], // lavender
              ["#5b2bd9", "#e3d8ff", "#f6f3fc"], // deep
              ["#6a4cd1", "#ece4ff", "#faf7f0"], // editorial
            ]}
          />
          <window.TweakRadio
            label=""
            value={t.variant}
            onChange={(v) => setTweak("variant", v)}
            options={[
              { value: "lavender", label: "Lavender" },
              { value: "deep", label: "Deep" },
              { value: "editorial", label: "Editorial" },
            ]}
          />
        </window.TweakSection>

        <window.TweakSection label="Sorgenti CSV nella riconciliazione">
          <window.TweakRadio
            label="Modalità"
            value={t.sourcesMode}
            onChange={(v) => setTweak("sourcesMode", v)}
            options={[
              { value: "none", label: "Nascoste" },
              { value: "preview", label: "Preview" },
              { value: "tabs", label: "Tab" },
              { value: "peek", label: "Peek" },
            ]}
          />
          <div style={{fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4, padding: "4px 2px 2px"}}>
            {{
              none: "Solo il diff. Le sorgenti grezze sono nascoste.",
              preview: "Card collassabile sopra il diff con le prime righe + bottone Espandi.",
              tabs: "Tre tab in alto: Riconciliazione / Doc 1 / Doc 2.",
              peek: "Click su una riga del diff apre un drawer col contesto nel CSV originale.",
            }[t.sourcesMode]}
          </div>
        </window.TweakSection>

        <window.TweakSection label="Naviga">
          <window.TweakSelect
            label="Schermata"
            value={screen}
            onChange={setScreen}
            options={[
              { value: "dashboard", label: "Dashboard" },
              { value: "upload", label: "Carica documento" },
              { value: "inbox", label: "Inbox WhatsApp" },
              { value: "reconcile", label: "Riconciliazione (hero)" },
              { value: "suppliers", label: "Fornitori + cache" },
              { value: "settings", label: "Impostazioni" },
            ]}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
