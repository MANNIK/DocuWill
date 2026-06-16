// Dashboard screen — overview + recent docs queue
const Dashboard = ({ go }) => {
  const D = window.QUORO_DATA;
  const Ico = window.Icons;

  const statusMap = {
    matched: { label: "Riconciliato", cls: "ok" },
    to_review: { label: "Da revisionare", cls: "warn" },
    awaiting_doc2: { label: "Attesa conferma", cls: "info" },
    rejected: { label: "Rifiutato", cls: "err" },
  };

  const kpis = [
    { label: "In attesa di revisione", val: 6, hint: "+2 rispetto a ieri", emph: true },
    { label: "Documenti elaborati oggi", val: 42, hint: "Media settimanale 38" },
    { label: "Tasso match automatico", val: "94%", hint: "↑ 3pt vs. settimana scorsa" },
    { label: "Tempo medio revisione", val: "1m 42s", hint: "Su 12 revisioni odierne" },
  ];

  return (
    <div className="content fade-in">
      <header style={{display: "flex", justifyContent: "space-between", alignItems: "flex-end"}}>
        <div>
          <h1 className="display">Buongiorno, Marta</h1>
          <p className="subtitle">Hai <strong style={{color: "var(--text)"}}>6 documenti</strong> da revisionare e 1 nuova foto in arrivo da Lombardia Carni.</p>
        </div>
        <div style={{display: "flex", gap: 8}}>
          <button className="btn" onClick={() => go("inbox")}><Ico.Inbox size={14}/> Inbox WhatsApp</button>
          <button className="btn primary" onClick={() => go("upload")}><Ico.Plus size={14}/> Nuovo documento</button>
        </div>
      </header>

      <div className="grid-4">
        {kpis.map((k, i) => (
          <div key={i} className="card" style={{padding: "16px 18px"}}>
            <div style={{fontSize: 12, color: "var(--text-muted)", marginBottom: 6}}>{k.label}</div>
            <div style={{fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em", color: k.emph ? "var(--accent-strong)" : "var(--text)"}} className="num">{k.val}</div>
            <div style={{fontSize: 11.5, color: "var(--text-faint)", marginTop: 4}}>{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{overflow: "hidden"}}>
        <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)"}}>
          <div style={{display: "flex", alignItems: "center", gap: 10}}>
            <h2 className="display">Coda riconciliazione</h2>
            <span className="pill">8 documenti</span>
          </div>
          <div style={{display: "flex", gap: 6, alignItems: "center"}}>
            <button className="btn ghost sm"><Ico.Filter size={13}/> Filtra</button>
            <button className="btn ghost sm"><Ico.Refresh size={13}/></button>
          </div>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width: 30}}></th>
              <th>Documento</th>
              <th>Tipo</th>
              <th>Fornitore</th>
              <th>Stato</th>
              <th style={{textAlign: "right"}}>Discrepanze</th>
              <th>Aggiornato</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {D.recent.map((r) => {
              const s = statusMap[r.status];
              return (
                <tr key={r.id} onClick={() => r.hero && go("reconcile")} style={{cursor: r.hero ? "pointer" : "default"}}>
                  <td>{r.hero && <span className="dot pulse" style={{color: "var(--accent)"}}></span>}</td>
                  <td><span className="mono" style={{fontSize: 12.5}}>{r.id}</span></td>
                  <td>{r.kind}</td>
                  <td>{r.supplier}</td>
                  <td><span className={`pill ${s.cls}`}><span className="dot"></span>{s.label}</span></td>
                  <td style={{textAlign: "right"}} className="num">{r.discr === null ? "—" : r.discr === 0 ? <span style={{color: "var(--text-faint)"}}>0</span> : <span style={{color: "var(--err)", fontWeight: 500}}>{r.discr}</span>}</td>
                  <td style={{color: "var(--text-muted)"}}>{r.when}</td>
                  <td style={{textAlign: "right"}}>
                    {r.hero ? (
                      <button className="btn sm primary" onClick={() => go("reconcile")}>Apri <Ico.Chevron size={12}/></button>
                    ) : (
                      <button className="btn sm ghost"><Ico.Chevron size={14}/></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card" style={{padding: "16px 18px"}}>
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12}}>
            <h2 className="display">Pipeline di ingestion</h2>
            <span className="pill"><Ico.Sparkle size={11}/> live</span>
          </div>
          <div style={{display: "flex", flexDirection: "column", gap: 8}}>
            {[
              { stage: "Upload ricevuto", count: 2, color: "var(--info)" },
              { stage: "Classificazione tipologia", count: 1, color: "var(--accent)" },
              { stage: "Estrazione dati (FastAPI)", count: 1, color: "var(--accent)" },
              { stage: "OCR + LLM su foto WhatsApp", count: 1, color: "var(--warn)" },
              { stage: "Matching doc1 ↔ doc2", count: 3, color: "var(--accent-strong)" },
              { stage: "In attesa revisione operatore", count: 6, color: "var(--text-muted)" },
            ].map((s, i) => (
              <div key={i} style={{display: "flex", alignItems: "center", gap: 10}}>
                <div style={{width: 8, height: 8, borderRadius: 999, background: s.color}}></div>
                <div style={{flex: 1, fontSize: 13}}>{s.stage}</div>
                <div className="num" style={{fontSize: 13, color: "var(--text-muted)", minWidth: 24, textAlign: "right"}}>{s.count}</div>
                <div style={{width: 80, height: 4, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden"}}>
                  <div style={{width: `${Math.min(100, s.count * 16)}%`, height: "100%", background: s.color, borderRadius: 999}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{padding: "16px 18px"}}>
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12}}>
            <h2 className="display">Tipologie discrepanze (7 giorni)</h2>
            <span className="pill">28 totali</span>
          </div>
          <div style={{display: "flex", flexDirection: "column", gap: 10}}>
            {[
              { t: "Quantità diversa", n: 9, cls: "warn" },
              { t: "Prezzo cambiato", n: 7, cls: "err" },
              { t: "Riga mancante in conferma", n: 5, cls: "err" },
              { t: "Riga extra in conferma", n: 3, cls: "info" },
              { t: "Descrizione equivalente", n: 12, cls: "ok" },
              { t: "Codice articolo rinominato", n: 4, cls: "info" },
              { t: "Data consegna differente", n: 6, cls: "warn" },
            ].map((d, i) => (
              <div key={i} style={{display: "flex", alignItems: "center", gap: 12}}>
                <span className={`pill ${d.cls}`} style={{minWidth: 28, justifyContent: "center"}}>{d.n}</span>
                <div style={{flex: 1, fontSize: 13}}>{d.t}</div>
                <div style={{flex: 1.5, height: 6, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden"}}>
                  <div style={{width: `${(d.n / 12) * 100}%`, height: "100%", background: `var(--${d.cls === "err" ? "err" : d.cls === "warn" ? "warn" : d.cls === "info" ? "info" : "ok"})`, opacity: 0.75, borderRadius: 999}}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

window.Dashboard = Dashboard;
