// Reconciliation screen — side-by-side diff, the hero of the prototype
// Sources presentation has 4 modes (tweak `sourcesMode`):
//   none    → only diff
//   preview → collapsible source cards above the diff
//   tabs    → tabs: Diff / Doc 1 raw / Doc 2 raw
//   peek    → click a diff row → drawer with that row in CSV context

const fmtMoney = (n) => typeof n === "number" ? `${n.toFixed(2).replace(".", ",")} €` : n;
const fmtMoneyBare = (n) => typeof n === "number" ? `${n.toFixed(2).replace(".", ",")}` : n;

// Source-file column schemas (mimic how the columns looked in the original CSV/OCR output)
const doc1Cols = [
  { key: "sku", label: "Cod. Art.", mono: true, w: "16%" },
  { key: "desc", label: "Descrizione", w: "38%" },
  { key: "qty", label: "Q.tà", align: "right", num: true, w: "8%" },
  { key: "uom", label: "U.M.", w: "8%", muted: true },
  { key: "price", label: "Prezzo unit.", align: "right", num: true, w: "15%", render: (v) => fmtMoney(v) },
  { key: "total", label: "Totale riga", align: "right", num: true, w: "15%", render: (v) => fmtMoney(v) },
];

const doc2Cols = [
  { key: "sku", label: "Cod. art.", mono: true, w: "16%" },
  { key: "desc", label: "Descrizione", w: "34%" },
  { key: "qty", label: "Q.tà", align: "right", num: true, w: "8%" },
  { key: "uom", label: "U.M.", w: "7%", muted: true },
  { key: "price", label: "P.unit. €", align: "right", num: true, w: "12%", render: (v) => fmtMoneyBare(v) },
  { key: "total", label: "Imponibile", align: "right", num: true, w: "13%", render: (v) => fmtMoneyBare(v) },
  { key: "conf", label: "OCR", align: "right", w: "10%", render: (v) => v ? <span className="mono" style={{fontSize: 10.5, color: v < 0.9 ? "var(--warn)" : "var(--text-faint)"}}>{Math.round(v*100)}%</span> : null },
];

// Raw CSV-style table. Renders rows with a leading line number, monospace cells, and
// optional highlight + click handler for peek mode.
const RawCsvTable = ({ lines, columns, accent = false, limit, highlightId, onRowClick, dense = false, startIndex = 0 }) => {
  const visible = limit ? lines.slice(0, limit) : lines;
  const sideClass = accent ? "side-r" : "side-l";
  return (
    <table className="tbl raw-csv" style={{tableLayout: "fixed", width: "100%"}}>
      <colgroup>
        <col style={{width: 36}}/>
        {columns.map((c, i) => <col key={i} style={{width: c.w}}/>)}
      </colgroup>
      <thead>
        <tr>
          <th className={sideClass} style={{textAlign: "center", color: "var(--text-faint)", fontSize: 10}}>#</th>
          {columns.map((c, i) => (
            <th key={i} className={sideClass} style={{textAlign: c.align || "left"}}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {visible.map((row, i) => {
          const isHl = highlightId && row.id === highlightId;
          return (
            <tr
              key={row.id}
              className={isHl ? "row-peek-hl" : ""}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{
                cursor: onRowClick ? "pointer" : "default",
                background: isHl ? "var(--accent-soft)" : undefined,
              }}
            >
              <td className={sideClass + " mono"} style={{textAlign: "center", color: "var(--text-faint)", fontSize: 10.5, padding: dense ? "6px 8px" : undefined}}>{startIndex + i + 1}</td>
              {columns.map((c, k) => {
                const v = c.render ? c.render(row[c.key], row) : row[c.key];
                return (
                  <td
                    key={k}
                    className={sideClass + (c.num ? " num" : "") + (c.mono ? " mono" : "")}
                    style={{
                      textAlign: c.align || "left",
                      color: c.muted ? "var(--text-muted)" : undefined,
                      padding: dense ? "6px 8px" : undefined,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                    title={typeof row[c.key] === "string" ? row[c.key] : undefined}
                  >
                    {v}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

// Single source card with header chip + collapse/expand
const SourceCard = ({ icon, badgeColor, filename, meta, lines, columns, accent }) => {
  const [expanded, setExpanded] = React.useState(false);
  const previewLimit = 3;
  const Ico = window.Icons;
  return (
    <div className="card" style={{
      overflow: "hidden",
      background: accent ? "color-mix(in oklab, var(--accent-soft) 12%, var(--surface))" : "var(--surface)",
    }}>
      <div style={{
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderBottom: "1px solid var(--border)",
        background: accent ? "color-mix(in oklab, var(--accent-soft) 35%, var(--bg-elev))" : "var(--bg-elev)",
      }}>
        <div style={{display: "flex", alignItems: "center", gap: 10, minWidth: 0}}>
          <div style={{width: 24, height: 24, borderRadius: 6, background: "var(--surface)", border: "1px solid var(--border)", display: "grid", placeItems: "center", color: badgeColor, flexShrink: 0}}>{icon}</div>
          <div style={{minWidth: 0}}>
            <div className="mono" style={{fontSize: 12, fontWeight: 500, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{filename}</div>
            <div style={{fontSize: 11, color: "var(--text-muted)"}}>{meta}</div>
          </div>
        </div>
        <button className="btn sm ghost" onClick={() => setExpanded(!expanded)} style={{flexShrink: 0}}>
          {expanded
            ? <><Ico.ChevronDown size={11} style={{transform: "rotate(180deg)"}}/> Comprimi</>
            : <><Ico.ChevronDown size={11}/> Espandi tabella</>}
        </button>
      </div>
      <div style={{maxHeight: expanded ? 260 : "none", overflow: expanded ? "auto" : "visible"}}>
        <RawCsvTable
          lines={lines}
          columns={columns}
          accent={accent}
          limit={expanded ? undefined : previewLimit}
          dense
        />
      </div>
      {!expanded && lines.length > previewLimit && (
        <div style={{
          padding: "6px 14px",
          fontSize: 11,
          color: "var(--text-faint)",
          borderTop: "1px solid var(--border)",
          textAlign: "center",
          background: "var(--bg-elev)",
          fontStyle: "italic",
        }}>
          + altre {lines.length - previewLimit} righe nascoste
        </div>
      )}
    </div>
  );
};

// Two source cards side-by-side (preview mode)
const SourcesPreview = ({ D }) => {
  const Ico = window.Icons;
  return (
    <div className="grid-2" style={{marginBottom: 18}}>
      <SourceCard
        icon={<Ico.Excel size={14}/>}
        badgeColor="var(--accent)"
        filename={D.doc1.filename}
        meta={`${D.doc1.sheet} · ${D.doc1.lines.length} righe · 6 colonne · caricato il 26 apr`}
        lines={D.doc1.lines}
        columns={doc1Cols}
      />
      <SourceCard
        icon={<Ico.Whatsapp size={14}/>}
        badgeColor="#25d366"
        filename={`WA-20260426-0931 · CONF-1184/26 (OCR)`}
        meta={`OCR 91% · ${D.doc2.lines.length} righe · 7 colonne · ricevuto il 26 apr`}
        lines={D.doc2.lines}
        columns={doc2Cols}
        accent
      />
    </div>
  );
};

// Full raw table view (tabs mode, doc1/doc2)
const FullRawTable = ({ doc, columns, accent, title, icon }) => {
  const Ico = window.Icons;
  return (
    <div className="card fade-in" style={{overflow: "hidden"}}>
      <div style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        justifyContent: "space-between",
        borderBottom: "1px solid var(--border)",
        background: accent ? "color-mix(in oklab, var(--accent-soft) 35%, var(--bg-elev))" : "var(--bg-elev)",
      }}>
        <div style={{display: "flex", alignItems: "center", gap: 10, minWidth: 0}}>
          {icon}
          <div style={{minWidth: 0}}>
            <div style={{fontSize: 13, fontWeight: 500}}>{title}</div>
            <div className="mono" style={{fontSize: 11, color: "var(--text-muted)"}}>{doc.filename || doc.id}</div>
          </div>
        </div>
        <div style={{display: "flex", gap: 6, alignItems: "center"}}>
          <span className="pill">{doc.lines.length} righe</span>
          <button className="btn sm ghost"><Ico.Download size={12}/> Esporta</button>
          <button className="btn sm ghost"><Ico.Search size={12}/> Cerca</button>
        </div>
      </div>
      <RawCsvTable lines={doc.lines} columns={columns} accent={accent}/>
      <div style={{
        padding: "10px 16px",
        borderTop: "1.5px solid var(--border-strong)",
        background: "var(--bg-elev)",
        display: "flex",
        justifyContent: "space-between",
        fontSize: 12,
      }}>
        <span style={{color: "var(--text-muted)"}}>
          Totale netto · IVA · lordo
        </span>
        <span className="mono num" style={{fontWeight: 500}}>
          {fmtMoney(doc.totals.net)} · {fmtMoney(doc.totals.vat)} · {fmtMoney(doc.totals.gross)}
        </span>
      </div>
    </div>
  );
};

// Peek drawer — shows the highlighted row in CSV context (2 rows above + below)
const PeekDrawer = ({ D, pairRow, onClose }) => {
  const Ico = window.Icons;
  const peekedL1 = pairRow.l1;
  const peekedL2 = pairRow.l2;

  // Window of context rows around the peeked one in each doc
  const contextWindow = (lines, target) => {
    if (!target) return null;
    const idx = lines.findIndex((l) => l.id === target.id);
    if (idx < 0) return null;
    const start = Math.max(0, idx - 2);
    const end = Math.min(lines.length, idx + 3);
    return { rows: lines.slice(start, end), absStart: start, idx };
  };
  const ctx1 = contextWindow(D.doc1.lines, peekedL1);
  const ctx2 = contextWindow(D.doc2.lines, peekedL2);

  const Column = ({ ctx, title, icon, columns, accent, totalLines, fallback }) => (
    <div style={{display: "flex", flexDirection: "column", minWidth: 0}}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        background: accent ? "color-mix(in oklab, var(--accent-soft) 35%, var(--bg-elev))" : "var(--bg-elev)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        {icon}
        <div style={{fontSize: 12, fontWeight: 500}}>{title}</div>
        {ctx && <div style={{fontSize: 11, color: "var(--text-muted)", marginLeft: "auto"}} className="mono">
          righe {ctx.absStart + 1}–{ctx.absStart + ctx.rows.length} di {totalLines}
        </div>}
      </div>
      {ctx ? (
        <RawCsvTable
          lines={ctx.rows}
          columns={columns}
          accent={accent}
          highlightId={ctx.rows[ctx.idx - ctx.absStart]?.id}
          startIndex={ctx.absStart}
          dense
        />
      ) : (
        <div style={{padding: "20px 16px", color: "var(--text-faint)", fontStyle: "italic", fontSize: 12, textAlign: "center", background: accent ? "color-mix(in oklab, var(--accent-soft) 15%, var(--surface))" : "var(--surface)"}}>
          {fallback}
        </div>
      )}
    </div>
  );

  // RawCsvTable handles line numbers via startIndex — no need to inject _ln columns here.

  return (
    <div className="card fade-in" style={{
      marginTop: 16,
      overflow: "hidden",
      borderColor: "var(--accent-soft)",
      boxShadow: "var(--shadow-lg)",
      border: "1px solid var(--accent-soft)",
    }}>
      <div style={{
        padding: "10px 14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "color-mix(in oklab, var(--accent-soft) 50%, var(--surface))",
        borderBottom: "1px solid var(--accent-soft)",
      }}>
        <div style={{display: "flex", alignItems: "center", gap: 10}}>
          <Ico.Search size={13} style={{color: "var(--accent-ink)"}}/>
          <div>
            <div style={{fontSize: 12.5, fontWeight: 500, color: "var(--accent-ink)"}}>
              Contesto della riga selezionata nei CSV originali
            </div>
            <div style={{fontSize: 11, color: "var(--text-muted)"}}>
              {peekedL1 ? <span className="mono">{peekedL1.sku} · {peekedL1.desc}</span> : <em>—</em>}
              {" "}↔{" "}
              {peekedL2 ? <span className="mono">{peekedL2.sku}</span> : <em>riga assente</em>}
            </div>
          </div>
        </div>
        <button className="btn sm ghost" onClick={onClose}><Ico.X size={12}/> Chiudi</button>
      </div>
      <div style={{display: "grid", gridTemplateColumns: "1fr 1fr"}}>
        <Column
          ctx={ctx1}
          title="Doc 1 · Ordine (Excel)"
          icon={<Ico.Excel size={13} style={{color: "var(--accent)"}}/>}
          columns={[
            { key: "sku", label: "Cod. Art.", mono: true, w: "20%" },
            { key: "desc", label: "Descrizione", w: "44%" },
            { key: "qty", label: "Q.tà", align: "right", num: true, w: "10%" },
            { key: "price", label: "Prezzo", align: "right", num: true, w: "20%", render: (v) => fmtMoney(v) },
          ]}
          totalLines={D.doc1.lines.length}
          fallback="— riga non presente nell'ordine —"
        />
        <Column
          ctx={ctx2}
          title="Doc 2 · Conferma (WhatsApp/OCR)"
          icon={<Ico.Whatsapp size={13} style={{color: "#25d366"}}/>}
          columns={[
            { key: "sku", label: "Cod. art.", mono: true, w: "20%" },
            { key: "desc", label: "Descrizione", w: "40%" },
            { key: "qty", label: "Q.tà", align: "right", num: true, w: "10%" },
            { key: "price", label: "P.unit.", align: "right", num: true, w: "14%", render: (v) => fmtMoneyBare(v) },
            { key: "conf", label: "OCR", align: "right", w: "10%", render: (v) => v ? `${Math.round(v*100)}%` : "" },
          ]}
          accent
          totalLines={D.doc2.lines.length}
          fallback="— riga non confermata in WhatsApp —"
        />
      </div>
      <div style={{padding: "8px 14px", borderTop: "1px solid var(--border)", background: "var(--bg-elev)", fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8}}>
        <Ico.Sparkle size={11} style={{color: "var(--accent)"}}/>
        Utile per capire se la differenza è isolata o parte di un pattern (es. tutte le righe del lotto LC-44xx sono cambiate).
      </div>
    </div>
  );
};

const Reconcile = ({ go, t = {}, setTweak }) => {
  const D = window.QUORO_DATA;
  const Ico = window.Icons;
  const sourcesMode = t.sourcesMode || "preview";

  const [selectedDiscr, setSelectedDiscr] = React.useState("D2");
  const [filter, setFilter] = React.useState("all");
  const [resolvedIds, setResolvedIds] = React.useState({});
  const [decisions, setDecisions] = React.useState({});
  const [showPhoto, setShowPhoto] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("diff"); // tabs mode
  const [peekedKey, setPeekedKey] = React.useState(null);   // peek mode

  // Build pair rows: align doc1 and doc2 lines by SKU (and recognize rename + extra + missing)
  const renameMap = { "LC-4407": "LC-4407A" };
  const pairRows = React.useMemo(() => {
    const rows = [];
    const usedDoc2 = new Set();
    D.doc1.lines.forEach((l1) => {
      const sku2 = renameMap[l1.sku] || l1.sku;
      const l2 = D.doc2.lines.find((x) => x.sku === sku2);
      if (l2) usedDoc2.add(l2.id);
      rows.push({ l1, l2, key: l1.id });
    });
    D.doc2.lines.forEach((l2) => {
      if (!usedDoc2.has(l2.id)) rows.push({ l1: null, l2, key: l2.id });
    });
    return rows;
  }, []);

  const sevPriority = { error: 0, warn: 1, info: 2, ok: 3 };
  const severityFor = (l1, l2) => {
    const discrForRow = D.discrepancies.filter((d) => d.lineId === (l1?.id || l2?.id));
    if (!l1) return "info";
    if (!l2) return "error";
    if (discrForRow.length === 0) return "ok";
    return discrForRow.map((d) => d.severity).sort((a, b) => sevPriority[a] - sevPriority[b])[0];
  };

  const cellQty = (l1, l2) => (!l1 || !l2) ? null : (l1.qty !== l2.qty ? "warn" : null);
  const cellPrice = (l1, l2) => (!l1 || !l2) ? null : (l1.price !== l2.price ? "error" : null);
  const cellSku = (l1, l2) => (!l1 || !l2) ? null : (l1.sku !== l2.sku ? "info" : null);
  const cellDesc = (l1, l2) => (!l1 || !l2) ? null : (l1.desc !== l2.desc ? "ok" : null);

  const totals = D.discrepancies.reduce((acc, d) => { acc[d.severity] = (acc[d.severity] || 0) + 1; return acc; }, {});
  const filterChips = [
    { id: "all", label: "Tutte", count: D.discrepancies.length },
    { id: "error", label: "Errori", count: totals.error || 0, cls: "err" },
    { id: "warn", label: "Avvisi", count: totals.warn || 0, cls: "warn" },
    { id: "info", label: "Info", count: totals.info || 0, cls: "info" },
    { id: "ok", label: "Equivalenti", count: totals.ok || 0, cls: "ok" },
  ];

  const visibleDiscr = filter === "all" ? D.discrepancies : D.discrepancies.filter((d) => d.severity === filter);
  const current = D.discrepancies.find((d) => d.id === selectedDiscr) || D.discrepancies[0];

  const sevPill = (sev) => {
    const map = { error: { cls: "err", label: "Errore" }, warn: { cls: "warn", label: "Avviso" }, info: { cls: "info", label: "Info" }, ok: { cls: "ok", label: "Equivalente" } };
    const m = map[sev];
    return <span className={`pill ${m.cls}`}><span className="dot"></span>{m.label}</span>;
  };

  const decide = (action) => {
    setDecisions({...decisions, [current.id]: action});
    setResolvedIds({...resolvedIds, [current.id]: true});
    const next = D.discrepancies.find((d) => d.id !== current.id && !resolvedIds[d.id]);
    if (next) setSelectedDiscr(next.id);
  };

  const resolvedCount = Object.keys(resolvedIds).length;
  const totalCount = D.discrepancies.length;

  // Row click — only active in peek mode
  const handleRowClick = sourcesMode === "peek" ? ((pairRow) => setPeekedKey(pairRow.key)) : null;
  const peekedPair = peekedKey ? pairRows.find((p) => p.key === peekedKey) : null;

  // tab definitions
  const tabs = [
    { id: "diff", label: "Riconciliazione", icon: <Ico.Diff size={13}/>, count: D.discrepancies.length, badge: "warn" },
    { id: "doc1", label: "Doc 1 · Ordine", icon: <Ico.Excel size={13} style={{color: "var(--accent)"}}/>, count: D.doc1.lines.length },
    { id: "doc2", label: "Doc 2 · Conferma", icon: <Ico.Whatsapp size={13} style={{color: "#25d366"}}/>, count: D.doc2.lines.length },
  ];

  const showDiff = sourcesMode !== "tabs" || activeTab === "diff";
  const showDoc1Raw = sourcesMode === "tabs" && activeTab === "doc1";
  const showDoc2Raw = sourcesMode === "tabs" && activeTab === "doc2";

  return (
    <div className="content tight fade-in" style={{display: "flex", flexDirection: "column", height: "100%", minHeight: 600}}>
      {/* Header */}
      <div style={{padding: "18px 28px 14px", borderBottom: "1px solid var(--border)", background: "var(--bg)"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap"}}>
          <div style={{flex: 1, minWidth: 0}}>
            <div style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 6}}>
              <span className="mono" style={{fontSize: 12, color: "var(--text-faint)"}}>ORD-2026-04-218 ↔ WA-20260426-0931</span>
              <span className="pill warn"><span className="dot"></span>Da revisionare</span>
              <span className="pill"><Ico.Sparkle size={10}/> match auto · score 0.97</span>
            </div>
            <h1 className="display" style={{fontSize: 22}}>Ordine fornitore vs. conferma WhatsApp</h1>
            <div style={{fontSize: 13, color: "var(--text-muted)", marginTop: 2}}>
              <strong style={{color: "var(--text)"}}>{D.supplier.name}</strong> · ricevuto 26 apr 2026 · {D.discrepancies.length} discrepanze rilevate
            </div>
          </div>
          <div style={{display: "flex", gap: 8, alignItems: "center", flexShrink: 0}}>
            <div style={{fontSize: 12, color: "var(--text-muted)", marginRight: 6}}>
              <span className="num" style={{color: "var(--text)", fontWeight: 500}}>{resolvedCount}/{totalCount}</span> risolte
            </div>
            <button className="btn"><Ico.Edit size={13}/> Correggi manualmente</button>
            <button className="btn danger"><Ico.X size={13}/> Rifiuta</button>
            <button className="btn primary"><Ico.Check size={13} stroke={2.5}/> Approva ({resolvedCount}/{totalCount})</button>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{display: "flex", gap: 6, marginTop: 14, alignItems: "center"}}>
          <span style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 4}}>Filtra</span>
          {filterChips.map((c) => (
            <button key={c.id} onClick={() => setFilter(c.id)} className={`pill ${filter === c.id ? "accent" : ""}`} style={{
              border: filter === c.id ? "1px solid var(--accent)" : "1px solid var(--border)",
              cursor: "pointer",
              padding: "4px 10px",
              fontSize: 12,
            }}>
              {c.cls && filter !== c.id && <span className="dot" style={{color: `var(--${c.cls === "err" ? "err" : c.cls === "warn" ? "warn" : c.cls === "info" ? "info" : "ok"})`}}></span>}
              {c.label} <span className="num" style={{opacity: 0.7, marginLeft: 2}}>{c.count}</span>
            </button>
          ))}
          <div style={{flex: 1}}></div>
          <span className="pill" style={{fontSize: 11}} title="Cambia da Tweaks → Sorgenti CSV">
            <Ico.Settings size={10}/> sorgenti: <strong style={{color: "var(--text)", marginLeft: 2}}>{ {none:"nascoste", preview:"preview", tabs:"tabs", peek:"peek"}[sourcesMode] }</strong>
          </span>
          <button className="btn ghost sm" onClick={() => setShowPhoto(!showPhoto)}>
            <Ico.Photo size={13}/> {showPhoto ? "Nascondi" : "Mostra"} foto doc2
          </button>
        </div>

        {/* Tabs bar — only in tabs mode */}
        {sourcesMode === "tabs" && (
          <div style={{display: "flex", gap: 0, marginTop: 14, marginBottom: -14, borderBottom: "1px solid var(--border)", marginLeft: -28, marginRight: -28, paddingLeft: 28, paddingRight: 28}}>
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "10px 16px 12px",
                    background: "transparent",
                    border: "none",
                    borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
                    marginBottom: -1,
                    color: active ? "var(--text)" : "var(--text-muted)",
                    fontSize: 13,
                    fontWeight: active ? 500 : 400,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}>
                  {tab.icon}
                  {tab.label}
                  <span className="num pill" style={{
                    fontSize: 10.5,
                    padding: "1px 6px",
                    background: active ? "var(--accent-soft)" : "var(--bg-sunken)",
                    color: active ? "var(--accent-ink)" : "var(--text-muted)",
                    border: "none",
                  }}>{tab.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main body: comparison + discrepancy rail */}
      <div style={{display: "grid", gridTemplateColumns: "1fr 360px", flex: 1, minHeight: 0}}>
        {/* Comparison */}
        <div style={{overflow: "auto", padding: "18px 28px 80px", background: "var(--bg)"}}>

          {/* Doc 1 raw (tabs mode) */}
          {showDoc1Raw && (
            <FullRawTable
              doc={D.doc1}
              columns={doc1Cols}
              title="Ordine fornitore — file Excel originale"
              icon={<Ico.Excel size={14} style={{color: "var(--accent)"}}/>}
            />
          )}

          {/* Doc 2 raw (tabs mode) */}
          {showDoc2Raw && (
            <FullRawTable
              doc={D.doc2}
              columns={doc2Cols}
              accent
              title="Conferma WhatsApp — risultato OCR"
              icon={<Ico.Whatsapp size={14} style={{color: "#25d366"}}/>}
            />
          )}

          {/* Diff view + metadata + optional sources preview */}
          {showDiff && (
            <>
              {/* Metadata side-by-side */}
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18}}>
                <div className="card" style={{padding: 14}}>
                  <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 10}}>
                    <Ico.Excel size={14} style={{color: "var(--accent)"}}/>
                    <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em"}}>Doc 1 · Ordine (CSV/Excel)</div>
                  </div>
                  <div style={{fontSize: 14, fontWeight: 500, marginBottom: 2}}>ORD-2026-04-218</div>
                  <div style={{fontSize: 12, color: "var(--text-muted)", marginBottom: 12}}>caricato il 26 apr · da Marta Conti</div>
                  <div style={{display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6, fontSize: 12.5}}>
                    <div style={{color: "var(--text-muted)"}}>Data ordine</div><div>22/04/2026</div>
                    <div style={{color: "var(--text-muted)"}}>Consegna richiesta</div><div className="hl-cell-warn">29/04/2026</div>
                    <div style={{color: "var(--text-muted)"}}>Pagamento</div><div>30 gg DF</div>
                    <div style={{color: "var(--text-muted)"}}>Righe</div><div>{D.doc1.lines.length}</div>
                    <div style={{color: "var(--text-muted)"}}>Totale lordo</div><div className="hl-cell-warn num" style={{fontWeight: 500}}>{fmtMoney(D.doc1.totals.gross)}</div>
                  </div>
                </div>
                <div className="card" style={{padding: 14}}>
                  <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 10}}>
                    <Ico.Whatsapp size={14} style={{color: "#25d366"}}/>
                    <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em"}}>Doc 2 · Conferma (foto WhatsApp)</div>
                  </div>
                  <div style={{fontSize: 14, fontWeight: 500, marginBottom: 2}}>CONF-1184/26</div>
                  <div style={{fontSize: 12, color: "var(--text-muted)", marginBottom: 12}}>ricevuto il 26 apr · OCR 91%</div>
                  <div style={{display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6, fontSize: 12.5}}>
                    <div style={{color: "var(--text-muted)"}}>Data conferma</div><div>26/04/2026</div>
                    <div style={{color: "var(--text-muted)"}}>Consegna prevista</div><div className="hl-cell-warn">30/04/2026 <span style={{fontSize: 10, marginLeft: 4, opacity: 0.7}}>+1g</span></div>
                    <div style={{color: "var(--text-muted)"}}>Pagamento</div><div>30 gg fine mese <span className="pill ok" style={{marginLeft: 4, fontSize: 10, padding: "0 4px"}}>≡</span></div>
                    <div style={{color: "var(--text-muted)"}}>Righe</div><div>{D.doc2.lines.length}</div>
                    <div style={{color: "var(--text-muted)"}}>Totale lordo</div><div className="hl-cell-warn num" style={{fontWeight: 500}}>{fmtMoney(D.doc2.totals.gross)} <span style={{fontSize: 10, marginLeft: 4, opacity: 0.7}}>−323,40</span></div>
                  </div>
                </div>
              </div>

              {/* Optional photo */}
              {showPhoto && (
                <div className="card" style={{marginBottom: 18, padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "240px 1fr"}}>
                  <div className="photo" style={{minHeight: 200, position: "relative"}}>
                    <div style={{position: "absolute", inset: 16, background: "white", borderRadius: 2, transform: "rotate(-0.8deg)", padding: 10, fontSize: 7, lineHeight: 1.3, color: "#444"}}>
                      <div style={{textAlign: "center", fontWeight: 700, fontSize: 10, marginBottom: 4}}>LOMBARDIA CARNI</div>
                      <div style={{textAlign: "center", fontSize: 6, color: "#888", marginBottom: 6}}>P.IVA IT 02845710984</div>
                      <div style={{borderTop: "0.5px solid #999", paddingTop: 3, marginBottom: 4}}>CONFERMA n° 1184/26</div>
                      {[1,2,3,4,5,6].map((i) => <div key={i} style={{height: 8, borderBottom: "0.5px dotted #ccc", marginBottom: 2}}></div>)}
                      <div style={{marginTop: 4, textAlign: "right"}}><strong>TOT 4.665,10€</strong></div>
                    </div>
                  </div>
                  <div style={{padding: 14, fontSize: 12.5}}>
                    <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 8}}>
                      <strong>Foto originale</strong>
                      <span className="pill"><Ico.Brain size={10}/> Claude vision · 1.8s</span>
                    </div>
                    <div style={{color: "var(--text-muted)", marginBottom: 8}}>"Buongiorno Marta, conferma ordine 218. Saluti, Pino"</div>
                    <div style={{display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: "var(--text-muted)"}}>
                      <div>• Ricevuto da +39 348 552 09 81 alle 09:31</div>
                      <div>• Bounding box: 28 aree di testo rilevate</div>
                      <div>• Tabella: 8 righe + intestazione + totali</div>
                      <div>• Confidence per riga visibile a destra</div>
                    </div>
                    <div style={{marginTop: 10, display: "flex", gap: 6}}>
                      <button className="btn sm">Apri originale</button>
                      <button className="btn sm ghost">Vedi bounding box</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Sources preview cards (preview mode only) */}
              {sourcesMode === "preview" && <SourcesPreview D={D}/>}

              {/* Lines diff */}
              <div className="card" style={{overflow: "hidden"}}>
                <div style={{padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-elev)"}}>
                  <div style={{display: "flex", alignItems: "center", gap: 10}}>
                    <h2 className="display" style={{fontSize: 15}}>Righe documento</h2>
                    <span className="pill">{pairRows.length} righe allineate</span>
                    {sourcesMode === "peek" && (
                      <span className="pill accent" style={{fontSize: 11}}>
                        <Ico.Search size={10}/> Clicca una riga per vedere il contesto nel CSV
                      </span>
                    )}
                  </div>
                  <div style={{fontSize: 11, color: "var(--text-faint)", display: "flex", gap: 12, alignItems: "center"}}>
                    <span><span className="dot" style={{color: "var(--err)"}}></span> errore</span>
                    <span><span className="dot" style={{color: "var(--warn)"}}></span> avviso</span>
                    <span><span className="dot" style={{color: "var(--info)"}}></span> info</span>
                    <span><span className="dot" style={{color: "var(--ok)"}}></span> equivalente</span>
                  </div>
                </div>
                <DiffTable
                  pairRows={pairRows}
                  cellQty={cellQty}
                  cellPrice={cellPrice}
                  cellSku={cellSku}
                  cellDesc={cellDesc}
                  severityFor={severityFor}
                  fmtMoney={fmtMoney}
                  onRowClick={handleRowClick}
                  peekedKey={peekedKey}
                />
                {/* Totals row */}
                <div style={{display: "grid", gridTemplateColumns: "1fr 1px 1fr", borderTop: "1.5px solid var(--border-strong)", background: "var(--bg-elev)"}}>
                  <div style={{padding: "12px 16px", display: "flex", justifyContent: "space-between"}}>
                    <span style={{fontSize: 11, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: "0.05em"}}>Totale lordo doc 1</span>
                    <span className="num" style={{fontWeight: 600, fontSize: 15}}>{fmtMoney(D.doc1.totals.gross)}</span>
                  </div>
                  <div style={{background: "var(--border)"}}></div>
                  <div style={{padding: "12px 16px", display: "flex", justifyContent: "space-between"}}>
                    <span style={{fontSize: 11, textTransform: "uppercase", color: "var(--text-faint)", letterSpacing: "0.05em"}}>Totale lordo doc 2</span>
                    <span className="num hl-cell-warn" style={{fontWeight: 600, fontSize: 15}}>{fmtMoney(D.doc2.totals.gross)} <span style={{fontSize: 10, opacity: 0.7, marginLeft: 4}}>Δ −323,40</span></span>
                  </div>
                </div>
              </div>

              {/* Peek drawer (peek mode only) */}
              {sourcesMode === "peek" && peekedPair && (
                <PeekDrawer D={D} pairRow={peekedPair} onClose={() => setPeekedKey(null)}/>
              )}
            </>
          )}
        </div>

        {/* Discrepancy rail */}
        <div style={{borderLeft: "1px solid var(--border)", background: "var(--bg-elev)", display: "flex", flexDirection: "column", minHeight: 0}}>
          <div style={{padding: "14px 16px", borderBottom: "1px solid var(--border)"}}>
            <h2 className="display" style={{fontSize: 14}}>Discrepanze ({visibleDiscr.length})</h2>
            <div style={{fontSize: 11.5, color: "var(--text-muted)", marginTop: 2}}>Clicca una riga per vedere le azioni</div>
          </div>
          <div style={{flex: 1, overflow: "auto"}}>
            {visibleDiscr.map((d) => {
              const sev = d.severity;
              const active = d.id === selectedDiscr;
              const resolved = resolvedIds[d.id];
              return (
                <div key={d.id} onClick={() => setSelectedDiscr(d.id)} style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border)",
                  borderLeft: `3px solid ${active ? "var(--accent)" : "transparent"}`,
                  background: active ? "var(--surface)" : "transparent",
                  cursor: "pointer",
                  opacity: resolved ? 0.55 : 1,
                }}>
                  <div style={{display: "flex", alignItems: "center", gap: 8, marginBottom: 4}}>
                    {sevPill(sev)}
                    {resolved && <span className="pill ok" style={{fontSize: 10}}><Ico.Check size={9} stroke={2.5}/> risolta</span>}
                  </div>
                  <div style={{fontSize: 13, fontWeight: 500, marginBottom: 2}}>{d.title}</div>
                  <div style={{fontSize: 11.5, color: "var(--text-muted)"}}>{d.hint}</div>
                  {d.lineId !== "*" && d.field !== "row" && (
                    <div style={{marginTop: 8, display: "flex", gap: 6, alignItems: "center", fontSize: 11}}>
                      <span className="hl-cell-warn mono">{typeof d.doc1 === "number" ? d.doc1 : String(d.doc1).slice(0, 14)}</span>
                      <span style={{color: "var(--text-faint)"}}>→</span>
                      <span className="hl-cell-err mono">{typeof d.doc2 === "number" ? d.doc2 : String(d.doc2).slice(0, 14)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Detail/actions */}
          {current && (
            <div style={{padding: "14px 16px", background: "var(--surface)", borderTop: "1px solid var(--border)"}}>
              <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8}}>
                <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em"}}>Azioni operatore</div>
                {decisions[current.id] && <span className="pill ok" style={{fontSize: 10}}>{decisions[current.id]}</span>}
              </div>
              <div style={{fontSize: 12.5, color: "var(--text-muted)", marginBottom: 10}}>{current.title} — {current.hint}</div>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6}}>
                <button className="btn sm" onClick={() => decide("accept_doc1")}>Tieni doc 1 <span className="mono" style={{fontSize: 10, opacity: 0.6}}>{String(current.doc1).slice(0, 8)}</span></button>
                <button className="btn sm" onClick={() => decide("accept_doc2")}>Tieni doc 2 <span className="mono" style={{fontSize: 10, opacity: 0.6}}>{String(current.doc2).slice(0, 8)}</span></button>
                <button className="btn sm" onClick={() => decide("equivalent")}>Marca equivalente</button>
                <button className="btn sm" onClick={() => decide("custom")}>Valore custom…</button>
              </div>
              <div style={{display: "flex", gap: 6}}>
                <button className="btn sm ghost" style={{flex: 1}}>+ Nota</button>
                <button className="btn sm ghost" onClick={() => decide("ignore")} style={{flex: 1}}>Ignora riga</button>
              </div>
              <div style={{marginTop: 10, fontSize: 11, color: "var(--text-faint)", padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: 6}}>
                <Ico.Sparkle size={10}/> <strong>Suggerimento LLM:</strong> il fornitore ha aumentato il prezzo dello stesso articolo del +4,1% rispetto agli ultimi 3 ordini. Consigliato contattare prima di approvare.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Unified diff table — both sides as a single <tr> so heights stay aligned
const DiffTable = ({ pairRows, cellQty, cellPrice, cellSku, cellDesc, severityFor, fmtMoney, onRowClick, peekedKey }) => {
  const cols = [
    { w: "13%", label: "SKU", align: "left" },
    { w: "20%", label: "Descrizione", align: "left" },
    { w: "7%", label: "Qty", align: "right" },
    { w: "10%", label: "Prezzo", align: "right" },
  ];

  const Cell = ({ line, kind, p }) => {
    if (!line) return null;
    const skuC = cellSku(p.l1, p.l2);
    const descC = cellDesc(p.l1, p.l2);
    const qtyC = cellQty(p.l1, p.l2);
    const priceC = cellPrice(p.l1, p.l2);
    const hl = (c) => c ? `hl-cell-${c === "error" ? "err" : c}` : "";
    return (
      <>
        <td className="side-l"><span className={`${hl(skuC)} mono`}>{line.sku}</span></td>
        <td className="side-l"><span className={hl(descC)} title={line.desc}>{line.desc}</span></td>
        <td className="side-l num" style={{textAlign: "right"}}><span className={hl(qtyC)}>{line.qty}{line.uom !== "pz" && <span style={{fontSize: 10, color: "var(--text-faint)", marginLeft: 2}}>{line.uom}</span>}</span></td>
        <td className="side-l num" style={{textAlign: "right"}}><span className={hl(priceC)}>{fmtMoney(line.price)}</span></td>
      </>
    );
  };
  const CellR = ({ line, p }) => {
    if (!line) return null;
    const skuC = cellSku(p.l1, p.l2);
    const descC = cellDesc(p.l1, p.l2);
    const qtyC = cellQty(p.l1, p.l2);
    const priceC = cellPrice(p.l1, p.l2);
    const hl = (c) => c ? `hl-cell-${c === "error" ? "err" : c}` : "";
    return (
      <>
        <td className="side-r"><span className={`${hl(skuC)} mono`}>{line.sku}</span></td>
        <td className="side-r"><span className={hl(descC)} title={line.desc}>{line.desc}</span></td>
        <td className="side-r num" style={{textAlign: "right"}}><span className={hl(qtyC)}>{line.qty}{line.uom !== "pz" && <span style={{fontSize: 10, color: "var(--text-faint)", marginLeft: 2}}>{line.uom}</span>}</span></td>
        <td className="side-r num" style={{textAlign: "right"}}><span className={hl(priceC)}>{fmtMoney(line.price)}</span></td>
      </>
    );
  };

  const Empty = ({ label, side }) => (
    <>
      <td colSpan={4} className={`side-${side}`} style={{textAlign: "center", color: "var(--text-faint)", fontStyle: "italic"}}>— {label} —</td>
    </>
  );

  return (
    <table className="tbl diff-tbl" style={{tableLayout: "fixed", width: "100%"}}>
      <colgroup>
        {cols.map((c, i) => <col key={`L${i}`} style={{width: c.w}}/>)}
        <col style={{width: "16px"}}/>
        {cols.map((c, i) => <col key={`R${i}`} style={{width: c.w}}/>)}
      </colgroup>
      <thead>
        <tr>
          <th colSpan={4} className="side-banner l">
            <span style={{display: "inline-flex", alignItems: "center", gap: 6}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></svg>
              Doc 1 · Ordine (Excel)
            </span>
          </th>
          <th className="diff-sep"></th>
          <th colSpan={4} className="side-banner r">
            <span style={{display: "inline-flex", alignItems: "center", gap: 6}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3a9 9 0 0 0-7.5 14L3 21l4.2-1.4A9 9 0 1 0 12 3z"/></svg>
              Doc 2 · Conferma (WhatsApp)
            </span>
          </th>
        </tr>
        <tr>
          {cols.map((c, i) => <th key={`hl${i}`} className="side-l" style={{textAlign: c.align}}>{c.label}</th>)}
          <th className="diff-sep"></th>
          {cols.map((c, i) => <th key={`hr${i}`} className="side-r" style={{textAlign: c.align}}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {pairRows.map((p) => {
          const sev = severityFor(p.l1, p.l2);
          const sevClass = sev === "ok" ? "" : `hl-${sev === "error" ? "err" : sev}`;
          const isPeeked = peekedKey === p.key;
          return (
            <tr
              key={p.key}
              className={sevClass + (isPeeked ? " row-peeked" : "")}
              onClick={onRowClick ? () => onRowClick(p) : undefined}
              style={{
                cursor: onRowClick ? "pointer" : "default",
                outline: isPeeked ? "2px solid var(--accent)" : "none",
                outlineOffset: -2,
              }}
            >
              {p.l1 ? <Cell line={p.l1} kind="left" p={p}/> : <Empty side="l" label="riga assente nell'ordine"/>}
              <td className="diff-sep"></td>
              {p.l2 ? <CellR line={p.l2} p={p}/> : <Empty side="r" label="riga non confermata"/>}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

window.Reconcile = Reconcile;
