// Inbox screen — WhatsApp incoming media, linking status
const Inbox = ({ go }) => {
  const D = window.QUORO_DATA;
  const Ico = window.Icons;
  const [selected, setSelected] = React.useState(D.inbox[0].id);
  const item = D.inbox.find((x) => x.id === selected);

  const statusMap = {
    linked: { label: "Collegato", cls: "info" },
    matched: { label: "Riconciliato", cls: "ok" },
    unmatched: { label: "Da collegare", cls: "warn" },
    rejected: { label: "Rifiutato", cls: "err" },
  };

  return (
    <div className="content tight fade-in" style={{display: "grid", gridTemplateColumns: "380px 1fr", height: "100%", minHeight: 600}}>
      {/* List */}
      <div style={{borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0}}>
        <div style={{padding: "16px 18px", borderBottom: "1px solid var(--border)"}}>
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10}}>
            <h2 className="display">Inbox WhatsApp</h2>
            <span className="pill"><span className="dot" style={{color: "var(--ok)"}}></span> webhook attivo</span>
          </div>
          <div style={{display: "flex", alignItems: "center", gap: 8, background: "var(--bg-elev)", padding: "6px 10px", borderRadius: 8}}>
            <Ico.Search size={14} style={{color: "var(--text-faint)"}}/>
            <input placeholder="Cerca per fornitore, numero, didascalia…" style={{border: "none", background: "transparent", outline: "none", fontFamily: "inherit", fontSize: 13, flex: 1}}/>
          </div>
        </div>

        <div style={{flex: 1, overflow: "auto"}}>
          {D.inbox.map((m) => {
            const s = statusMap[m.status];
            const active = m.id === selected;
            return (
              <div key={m.id} onClick={() => setSelected(m.id)} style={{
                padding: "12px 18px",
                borderBottom: "1px solid var(--border)",
                borderLeft: active ? "3px solid var(--accent)" : "3px solid transparent",
                background: active ? "var(--accent-soft)" : "transparent",
                cursor: "pointer",
                display: "flex",
                gap: 12,
              }}>
                <div className="photo" style={{width: 44, height: 44, borderRadius: 8, flexShrink: 0}}>
                  {m.thumb === "photo" ? <Ico.Photo size={18}/> : <Ico.Doc size={18}/>}
                </div>
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8}}>
                    <div style={{fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{m.supplier}</div>
                    <div style={{fontSize: 11, color: "var(--text-faint)", flexShrink: 0}}>{m.time}</div>
                  </div>
                  <div className="mono" style={{fontSize: 10.5, color: "var(--text-faint)", marginTop: 1}}>{m.from}</div>
                  <div style={{fontSize: 12.5, color: "var(--text-muted)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"}}>{m.caption}</div>
                  <div style={{marginTop: 6, display: "flex", gap: 6, alignItems: "center"}}>
                    <span className={`pill ${s.cls}`} style={{fontSize: 11, padding: "1px 6px"}}><span className="dot"></span>{s.label}</span>
                    {m.linkedTo && <span className="mono" style={{fontSize: 10.5, color: "var(--text-faint)"}}>→ {m.linkedTo}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail */}
      {item && (
        <div style={{padding: 28, overflow: "auto"}}>
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18}}>
            <div>
              <div style={{display: "flex", alignItems: "center", gap: 10, marginBottom: 6}}>
                <Ico.Whatsapp size={18} style={{color: "#25d366"}}/>
                <h1 className="display" style={{fontSize: 20}}>Messaggio da {item.supplier}</h1>
              </div>
              <div className="mono" style={{fontSize: 12, color: "var(--text-faint)"}}>{item.id} · {item.from} · {item.time}</div>
            </div>
            <div style={{display: "flex", gap: 8}}>
              <button className="btn"><Ico.Download size={13}/> Media</button>
              {item.status === "linked" && <button className="btn primary" onClick={() => go("reconcile")}>Apri riconciliazione <Ico.Chevron size={12}/></button>}
              {item.status === "unmatched" && <button className="btn primary"><Ico.Link size={13}/> Collega a documento</button>}
            </div>
          </div>

          <div className="grid-2" style={{gridTemplateColumns: "1.2fr 1fr"}}>
            <div className="card photo" style={{height: 420, position: "relative", overflow: "hidden"}}>
              {/* Mock receipt look */}
              <div style={{position: "absolute", inset: 24, background: "white", borderRadius: 4, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: 24, fontSize: 11, color: "#333", lineHeight: 1.5, transform: "rotate(-0.6deg)"}}>
                <div style={{textAlign: "center", marginBottom: 14}}>
                  <div style={{fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "0.05em"}}>LOMBARDIA CARNI</div>
                  <div style={{fontSize: 9, color: "#888", marginTop: 2}}>Distribuzione carni e salumi · Via dell'Industria 14, 25030 Roncadelle (BS) · P.IVA IT 02845710984</div>
                </div>
                <div style={{borderTop: "1px solid #ccc", borderBottom: "1px solid #ccc", padding: "8px 0", marginBottom: 10, display: "flex", justifyContent: "space-between", fontSize: 10}}>
                  <span><strong>CONFERMA D'ORDINE</strong> n° 1184/26</span>
                  <span>26/04/2026</span>
                </div>
                <div style={{fontSize: 10, marginBottom: 8}}><strong>Spett.le</strong> Marta Conti · <strong>Rif.</strong> Vs. ord. n° 218 del 22/04</div>
                <table style={{width: "100%", fontSize: 9, borderCollapse: "collapse"}}>
                  <thead>
                    <tr style={{borderBottom: "1px solid #999"}}>
                      <th style={{textAlign: "left", padding: "4px 2px"}}>Cod.</th>
                      <th style={{textAlign: "left"}}>Descrizione</th>
                      <th style={{textAlign: "right"}}>Q.tà</th>
                      <th style={{textAlign: "right"}}>P.U.</th>
                      <th style={{textAlign: "right"}}>Tot.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {D.doc2.lines.slice(0, 7).map((l) => (
                      <tr key={l.id} style={{borderBottom: "1px dotted #ddd"}}>
                        <td style={{padding: "3px 2px", fontFamily: "monospace"}}>{l.sku}</td>
                        <td style={{fontSize: 8.5}}>{l.desc}</td>
                        <td style={{textAlign: "right"}}>{l.qty}</td>
                        <td style={{textAlign: "right"}}>{l.price.toFixed(2)}</td>
                        <td style={{textAlign: "right"}}>{l.total.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{marginTop: 10, textAlign: "right", fontSize: 10}}>
                  <div>Imponibile <strong>4.241,00</strong></div>
                  <div>IVA 10% <strong>424,10</strong></div>
                  <div style={{fontSize: 12, marginTop: 2}}><strong>TOTALE 4.665,10 €</strong></div>
                </div>
                <div style={{marginTop: 12, fontSize: 9, color: "#666"}}>Consegna prevista: 30/04/2026 — Pagamento: 30 gg fine mese</div>
                <div style={{marginTop: 8, fontStyle: "italic", fontSize: 9, color: "#555", borderTop: "1px dashed #ccc", paddingTop: 6}}>Firma / timbro<br/><br/><span style={{fontFamily: "cursive", fontSize: 14}}>Pino R.</span></div>
              </div>
              <div style={{position: "absolute", bottom: 10, left: 10, fontSize: 10, color: "var(--text-faint)", fontFamily: "var(--font-mono)"}}>IMG_20260426_0931.jpg · 2.4 MB</div>
            </div>

            <div className="card" style={{padding: 18}}>
              <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14}}>
                <h2 className="display">Estrazione OCR + LLM</h2>
                <span className="pill accent"><Ico.Brain size={11}/> {(D.doc2.ocrConfidence * 100).toFixed(0)}%</span>
              </div>

              <div style={{display: "flex", flexDirection: "column", gap: 12, fontSize: 12.5}}>
                <div>
                  <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4}}>Pipeline</div>
                  <div style={{display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-muted)"}}>
                    <div>✓ Webhook Twilio ricevuto · 09:31:02</div>
                    <div>✓ Media scaricato (2.4 MB)</div>
                    <div>✓ Preprocessing (rotate −0.6°, deskew)</div>
                    <div>✓ OCR Claude vision · 1.8s</div>
                    <div>✓ Strutturazione LLM → JSON · 0.6s</div>
                    <div>✓ Match con ORD-2026-04-218 (rif. testuale + fornitore)</div>
                  </div>
                </div>

                <div style={{borderTop: "1px solid var(--border)", paddingTop: 12}}>
                  <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8}}>Metadati estratti</div>
                  {Object.entries(D.doc2.metadata).map(([k, v]) => (
                    <div key={k} style={{display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px dashed var(--border)"}}>
                      <span style={{color: "var(--text-muted)"}}>{k}</span>
                      <span style={{fontWeight: 500}}>{v}</span>
                    </div>
                  ))}
                </div>

                <div style={{borderTop: "1px solid var(--border)", paddingTop: 12}}>
                  <div style={{fontSize: 11, color: "var(--text-faint)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8}}>Logica di matching</div>
                  <div style={{fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 4}}>
                    <div>• Riferimento testuale: <span className="mono" style={{background: "var(--bg-sunken)", padding: "1px 4px", borderRadius: 3}}>"Vs. ord. n° 218"</span> → match esatto</div>
                    <div>• Fornitore (fuzzy): <strong>Lombardia Carni S.r.l.</strong> · score 1.00</div>
                    <div>• Finestra temporale: 4 giorni · OK</div>
                    <div>• Decisione: <strong style={{color: "var(--ok)"}}>linked automatico</strong></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

window.Inbox = Inbox;
