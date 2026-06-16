// Upload screen — file picker, parsing pipeline, classified preview
const Upload = ({ go }) => {
  const D = window.QUORO_DATA;
  const Ico = window.Icons;
  const [stage, setStage] = React.useState("done"); // idle | parsing | done
  const [showRaw, setShowRaw] = React.useState(false);

  // Pipeline steps
  const pipeline = [
    { label: "File caricato", detail: "ordine_lombardia_carni_220426.xlsx · 24 KB", done: true, ms: 0 },
    { label: "Parsing Excel (multi-sheet)", detail: "1 foglio · 14 righe · 7 colonne", done: true, ms: 120 },
    { label: "Detection header non standard", detail: "Header riga 4 · 3 righe di metadati saltate", done: true, ms: 80 },
    { label: "Classificazione tipologia (LLM)", detail: "Ordine fornitore · confidence 0.98", done: true, ms: 420, llm: true },
    { label: "Mappatura colonne → schema canonico", detail: "7/7 colonne mappate · cache fornitore HIT", done: true, ms: 90 },
    { label: "Normalizzazione formati", detail: "Numerici IT 1.234,56 → 1234.56 · date DD/MM/YYYY", done: true, ms: 60 },
    { label: "Persistenza su PostgreSQL", detail: "Documento + 8 righe · indicizzato", done: true, ms: 40 },
  ];

  return (
    <div className="content fade-in">
      <header>
        <h1 className="display">Carica documento tabulare</h1>
        <p className="subtitle">CSV, XLS, XLSX. Header non standard, fogli multipli e formati numerici europei sono gestiti automaticamente.</p>
      </header>

      <div className="grid-2" style={{gridTemplateColumns: "1fr 1.6fr"}}>
        {/* Drop zone */}
        <div className="card" style={{padding: 18, display: "flex", flexDirection: "column", gap: 14}}>
          <div style={{
            border: "1.5px dashed var(--border-strong)",
            borderRadius: "var(--radius-lg)",
            padding: "32px 18px",
            textAlign: "center",
            background: "var(--bg-elev)",
          }}>
            <div style={{width: 48, height: 48, margin: "0 auto 12px", borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent-strong)", display: "grid", placeItems: "center"}}>
              <Ico.Upload size={22}/>
            </div>
            <div style={{fontWeight: 500, marginBottom: 4}}>Trascina un file qui</div>
            <div style={{color: "var(--text-muted)", fontSize: 12.5, marginBottom: 14}}>oppure</div>
            <button className="btn primary" onClick={() => setStage("done")}>Seleziona dal computer</button>
            <div style={{marginTop: 14, fontSize: 11.5, color: "var(--text-faint)"}}>CSV · XLS · XLSX · max 50 MB</div>
          </div>

          <div style={{display: "flex", flexDirection: "column", gap: 8}}>
            <div style={{fontSize: 12, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em"}}>Caricamenti recenti</div>
            {[
              { name: "ordine_lombardia_carni_220426.xlsx", time: "ora", state: "ok" },
              { name: "tariffario_caseificio_Q2.csv", time: "ieri", state: "ok" },
              { name: "export_gestionale_aprile.xlsx", time: "2 g fa", state: "ok" },
            ].map((f, i) => (
              <div key={i} style={{display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: "var(--bg-elev)"}}>
                <Ico.Excel size={16}/>
                <div style={{flex: 1, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{f.name}</div>
                <div style={{fontSize: 11.5, color: "var(--text-faint)"}}>{f.time}</div>
                <Ico.Check size={14} stroke={2} style={{color: "var(--ok)"}}/>
              </div>
            ))}
          </div>
        </div>

        {/* Pipeline */}
        <div className="card" style={{padding: 18}}>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14}}>
            <div>
              <h2 className="display">Pipeline di estrazione</h2>
              <div style={{fontSize: 12, color: "var(--text-faint)", marginTop: 2}}>FastAPI + Celery · totale 810ms</div>
            </div>
            <span className="pill ok"><Ico.Check size={11} stroke={2.5}/> Completato</span>
          </div>
          <div style={{display: "flex", flexDirection: "column", gap: 0}}>
            {pipeline.map((p, i) => (
              <div key={i} style={{display: "flex", gap: 12, padding: "10px 0", borderBottom: i < pipeline.length - 1 ? "1px dashed var(--border)" : "none"}}>
                <div style={{position: "relative", width: 18}}>
                  <div style={{width: 18, height: 18, borderRadius: 999, background: p.llm ? "var(--accent-soft)" : "var(--ok-soft)", color: p.llm ? "var(--accent-strong)" : "var(--ok)", display: "grid", placeItems: "center"}}>
                    {p.llm ? <Ico.Sparkle size={10} stroke={2.5}/> : <Ico.Check size={11} stroke={2.5}/>}
                  </div>
                  {i < pipeline.length - 1 && <div style={{position: "absolute", left: 8.5, top: 18, width: 1, height: "100%", background: "var(--border)"}}></div>}
                </div>
                <div style={{flex: 1}}>
                  <div style={{fontSize: 13, fontWeight: 500}}>{p.label}</div>
                  <div style={{fontSize: 12, color: "var(--text-muted)"}}>{p.detail}</div>
                </div>
                <div className="mono num" style={{fontSize: 11, color: "var(--text-faint)"}}>{p.ms}ms</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Extraction result */}
      <div className="card" style={{overflow: "hidden"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--border)"}}>
          <div style={{display: "flex", alignItems: "center", gap: 12}}>
            <Ico.Excel size={18} style={{color: "var(--accent)"}}/>
            <div>
              <div style={{fontWeight: 500, fontSize: 14}}>{D.doc1.filename}</div>
              <div style={{fontSize: 12, color: "var(--text-muted)"}}>{D.doc1.kind} · {D.doc1.sheet} · {D.doc1.lines.length} righe estratte</div>
            </div>
            <span className="pill accent"><Ico.Sparkle size={11}/> Confidence {(D.doc1.confidence * 100).toFixed(0)}%</span>
          </div>
          <div style={{display: "flex", gap: 6, alignItems: "center"}}>
            <div style={{display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden"}}>
              <button onClick={() => setShowRaw(false)} className="btn ghost sm" style={{borderRadius: 0, background: !showRaw ? "var(--bg-sunken)" : "transparent", color: !showRaw ? "var(--text)" : "var(--text-muted)"}}>Strutturato</button>
              <button onClick={() => setShowRaw(true)} className="btn ghost sm" style={{borderRadius: 0, background: showRaw ? "var(--bg-sunken)" : "transparent", color: showRaw ? "var(--text)" : "var(--text-muted)"}}>Raw</button>
            </div>
            <button className="btn sm"><Ico.Download size={13}/> JSON</button>
            <button className="btn primary sm" onClick={() => go("reconcile")}>Apri riconciliazione <Ico.Chevron size={12}/></button>
          </div>
        </div>

        {/* Metadata strip */}
        <div style={{display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 0, padding: "14px 18px", background: "var(--bg-elev)", borderBottom: "1px solid var(--border)"}}>
          {Object.entries(D.doc1.metadata).map(([k, v]) => (
            <div key={k}>
              <div style={{fontSize: 10.5, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em"}}>{k}</div>
              <div style={{fontSize: 13, marginTop: 2, fontWeight: 500}}>{v}</div>
            </div>
          ))}
        </div>

        {showRaw ? (
          <div style={{padding: 18, background: "var(--bg-sunken)", maxHeight: 360, overflow: "auto"}}>
            <pre className="mono" style={{margin: 0, fontSize: 11.5, lineHeight: 1.6, color: "var(--text-muted)"}}>{`# riga 1-3: metadati ignorati
Numero ordine,ORD-2026-04-218,,,
Data,22/04/2026,,,
Fornitore,Lombardia Carni S.r.l.,,,,

# riga 4: header rilevato
Cod. Art.,Descrizione,Q.tà,U.M.,Prezzo unit.,Aliquota IVA,Totale riga
LC-7001,Lonza di suino disossata IGP 800g,50,pz,"12,50",10%,"625,00"
LC-7042,Pancetta arrotolata stagionata 1kg,30,pz,"18,20",10%,"546,00"
LC-3318,Salame Milano 500g sottovuoto,80,pz,"7,40",10%,"592,00"
...
# riga 13: riepilogo (escluso da righe)
Totale imponibile,,,,,"4.535,00"
IVA 10%,,,,,"453,50"
TOTALE,,,,,"4.988,50"`}</pre>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width: 36}}>#</th>
                <th>SKU <span style={{color: "var(--accent)", fontSize: 10}}>← Cod. Art.</span></th>
                <th>Descrizione</th>
                <th style={{textAlign: "right"}}>Qty <span style={{color: "var(--accent)", fontSize: 10}}>← Q.tà</span></th>
                <th>UM</th>
                <th style={{textAlign: "right"}}>Prezzo unit.</th>
                <th style={{textAlign: "right"}}>Totale</th>
              </tr>
            </thead>
            <tbody>
              {D.doc1.lines.map((l, i) => (
                <tr key={l.id}>
                  <td style={{color: "var(--text-faint)"}} className="num">{i + 1}</td>
                  <td className="mono">{l.sku}</td>
                  <td>{l.desc}</td>
                  <td className="num" style={{textAlign: "right"}}>{l.qty}</td>
                  <td style={{color: "var(--text-muted)"}}>{l.uom}</td>
                  <td className="num" style={{textAlign: "right"}}>{l.price.toFixed(2).replace(".", ",")} €</td>
                  <td className="num" style={{textAlign: "right", fontWeight: 500}}>{l.total.toFixed(2).replace(".", ",")} €</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} style={{textAlign: "right", fontSize: 12, color: "var(--text-muted)", paddingTop: 14}}>Totale imponibile</td>
                <td className="num" style={{textAlign: "right", paddingTop: 14}}>{D.doc1.totals.net.toFixed(2).replace(".", ",")} €</td>
              </tr>
              <tr>
                <td colSpan={6} style={{textAlign: "right", fontSize: 12, color: "var(--text-muted)"}}>IVA 10%</td>
                <td className="num" style={{textAlign: "right"}}>{D.doc1.totals.vat.toFixed(2).replace(".", ",")} €</td>
              </tr>
              <tr>
                <td colSpan={6} style={{textAlign: "right", fontWeight: 600}}>Totale lordo</td>
                <td className="num" style={{textAlign: "right", fontWeight: 600, fontSize: 14}}>{D.doc1.totals.gross.toFixed(2).replace(".", ",")} €</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        <div style={{fontSize: 12, color: "var(--text-faint)"}}>In attesa del documento di contropartita — il sistema collegherà automaticamente la foto WhatsApp in arrivo.</div>
        <div style={{display: "flex", gap: 8}}>
          <button className="btn">Salva bozza</button>
          <button className="btn primary" onClick={() => go("reconcile")}>Vai alla riconciliazione</button>
        </div>
      </div>
    </div>
  );
};

window.Upload = Upload;
