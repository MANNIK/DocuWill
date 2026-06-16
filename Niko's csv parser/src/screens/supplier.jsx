// Supplier detail — list + selected supplier with header cache
const Supplier = ({ go }) => {
  const D = window.QUORO_DATA;
  const Ico = window.Icons;
  const [sel, setSel] = React.useState(D.suppliers[0].name);
  const s = D.suppliers.find((x) => x.name === sel);

  return (
    <div className="content fade-in">
      <header style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end"}}>
        <div>
          <h1 className="display">Fornitori</h1>
          <p className="subtitle">{D.suppliers.length} fornitori attivi · cache di mappatura header e match rate per fornitore</p>
        </div>
        <button className="btn"><Ico.Plus size={13}/> Nuovo fornitore</button>
      </header>

      <div style={{display: "grid", gridTemplateColumns: "360px 1fr", gap: 18}}>
        <div className="card" style={{padding: 0, overflow: "hidden"}}>
          <div style={{padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, background: "var(--bg-elev)"}}>
            <Ico.Search size={14} style={{color: "var(--text-faint)"}}/>
            <input placeholder="Cerca fornitore…" style={{border: "none", background: "transparent", outline: "none", fontFamily: "inherit", fontSize: 13, flex: 1}}/>
          </div>
          <div>
            {D.suppliers.map((sup) => {
              const active = sup.name === sel;
              return (
                <div key={sup.name} onClick={() => setSel(sup.name)} style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid var(--border)",
                  borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                  background: active ? "var(--accent-soft)" : "transparent",
                  cursor: "pointer",
                }}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline"}}>
                    <div style={{fontWeight: 500, fontSize: 13.5}}>{sup.name}</div>
                    <div className="num" style={{fontSize: 11, color: "var(--text-faint)"}}>{sup.lastDoc}</div>
                  </div>
                  <div style={{display: "flex", gap: 12, marginTop: 4, fontSize: 11.5, color: "var(--text-muted)"}}>
                    <span><span className="num">{sup.docs}</span> doc</span>
                    <span>·</span>
                    <span style={{color: sup.match > 0.9 ? "var(--ok)" : sup.match > 0.8 ? "var(--warn)" : "var(--err)"}}>match {(sup.match * 100).toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{display: "flex", flexDirection: "column", gap: 14}}>
          {/* Supplier header card */}
          <div className="card" style={{padding: 18}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18}}>
              <div>
                <h2 className="display" style={{fontSize: 20}}>{s.name}</h2>
                <div style={{fontSize: 12.5, color: "var(--text-muted)", marginTop: 4}}>
                  P.IVA IT 02845710984 · Roncadelle (BS) · Cat. carni e salumi
                </div>
                <div style={{display: "flex", gap: 8, marginTop: 10}}>
                  <span className="pill"><Ico.Whatsapp size={11}/> +39 348 552 09 81</span>
                  <span className="pill"><Ico.Inbox size={11}/> ordini@lombardiacarni.it</span>
                  <span className="pill ok"><span className="dot"></span>attivo</span>
                </div>
              </div>
              <div style={{display: "grid", gridTemplateColumns: "auto auto auto", gap: 16, textAlign: "right"}}>
                <div>
                  <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em"}}>Documenti</div>
                  <div className="num" style={{fontSize: 22, fontWeight: 600}}>{s.docs}</div>
                </div>
                <div>
                  <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em"}}>Match rate</div>
                  <div className="num" style={{fontSize: 22, fontWeight: 600, color: "var(--ok)"}}>{(s.match * 100).toFixed(0)}%</div>
                </div>
                <div>
                  <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em"}}>Cache header</div>
                  <div className="num" style={{fontSize: 22, fontWeight: 600}}>{D.headerCacheEntries.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Header cache */}
          <div className="card" style={{overflow: "hidden"}}>
            <div style={{padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between"}}>
              <div style={{display: "flex", alignItems: "center", gap: 10}}>
                <h2 className="display" style={{fontSize: 15}}>Cache mappatura header</h2>
                <span className="pill"><Ico.Sparkle size={11}/> apprendimento attivo</span>
              </div>
              <div style={{fontSize: 12, color: "var(--text-muted)"}}>Velocizza ingestion +47% sui file ricorrenti</div>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Header sorgente (CSV)</th>
                  <th></th>
                  <th>Campo canonico</th>
                  <th style={{textAlign: "right"}}>Hits</th>
                  <th style={{textAlign: "right"}}>Confidence</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {D.headerCacheEntries.map((h, i) => (
                  <tr key={i}>
                    <td className="mono">"{h.source}"</td>
                    <td style={{color: "var(--text-faint)", width: 30, textAlign: "center"}}>→</td>
                    <td><span className="mono" style={{background: "var(--accent-soft)", color: "var(--accent-ink)", padding: "2px 6px", borderRadius: 4, fontSize: 11}}>{h.mapped}</span></td>
                    <td className="num" style={{textAlign: "right", color: "var(--text-muted)"}}>{h.hits}</td>
                    <td style={{textAlign: "right"}}>
                      <div style={{display: "inline-flex", alignItems: "center", gap: 6}}>
                        <div style={{width: 60, height: 4, background: "var(--bg-sunken)", borderRadius: 999}}>
                          <div style={{width: `${h.confidence * 100}%`, height: "100%", background: h.confidence > 0.95 ? "var(--ok)" : "var(--warn)", borderRadius: 999}}></div>
                        </div>
                        <span className="num" style={{fontSize: 11, color: "var(--text-muted)", width: 30}}>{(h.confidence * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td style={{textAlign: "right"}}><button className="btn sm ghost"><Ico.Edit size={12}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

window.Supplier = Supplier;
