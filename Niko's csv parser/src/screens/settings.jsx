// Settings — connectors (WhatsApp, OCR, LLM) + system config
const Settings = ({ go }) => {
  const Ico = window.Icons;

  const Section = ({ title, subtitle, children }) => (
    <div className="card" style={{padding: 18}}>
      <div style={{marginBottom: 14}}>
        <h2 className="display" style={{fontSize: 15}}>{title}</h2>
        <div style={{fontSize: 12, color: "var(--text-muted)", marginTop: 2}}>{subtitle}</div>
      </div>
      {children}
    </div>
  );

  const Row = ({ label, hint, children, last }) => (
    <div style={{display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: last ? "none" : "1px solid var(--border)"}}>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{fontSize: 13, fontWeight: 500}}>{label}</div>
        {hint && <div style={{fontSize: 12, color: "var(--text-muted)", marginTop: 2}}>{hint}</div>}
      </div>
      <div style={{flexShrink: 0}}>{children}</div>
    </div>
  );

  return (
    <div className="content fade-in">
      <header>
        <h1 className="display">Impostazioni</h1>
        <p className="subtitle">Connettori, motori OCR/LLM, regole di matching e webhook.</p>
      </header>

      <div className="grid-2" style={{alignItems: "flex-start"}}>
        <div style={{display: "flex", flexDirection: "column", gap: 14}}>
          <Section title="WhatsApp" subtitle="Webhook che riceve foto e media dai fornitori">
            <Row label="Provider" hint="Sandbox gratuita, setup in 10 minuti — adatta al challenge">
              <div style={{display: "flex", gap: 6}}>
                <button className="btn sm" style={{background: "var(--accent-soft)", color: "var(--accent-ink)", borderColor: "transparent"}}>Twilio Sandbox</button>
                <button className="btn sm ghost">Meta Cloud API</button>
                <button className="btn sm ghost">Mock locale</button>
              </div>
            </Row>
            <Row label="Webhook URL" hint="Endpoint Django che riceve i POST dal provider">
              <code className="mono" style={{fontSize: 11.5, color: "var(--text-muted)", background: "var(--bg-sunken)", padding: "4px 8px", borderRadius: 6}}>https://api.quoro.it/webhook/whatsapp/</code>
            </Row>
            <Row label="Account SID" hint="Configurato 12 g fa">
              <code className="mono" style={{fontSize: 11.5, color: "var(--text-muted)"}}>AC••••••••••••••••3a</code>
            </Row>
            <Row label="Numero verificato" hint="Sandbox — 'join brave-cat' per aggiungere fornitori" last>
              <span className="pill ok"><span className="dot"></span>+1 415 523 8886</span>
            </Row>
          </Section>

          <Section title="Motore OCR" subtitle="Estrazione testo da foto e PDF">
            <Row label="Engine primario" hint="Multimodale, ottimo su layout complessi e modulistica">
              <select className="btn sm" style={{paddingRight: 24}} defaultValue="claude">
                <option value="claude">Claude 3.5 Sonnet (vision)</option>
                <option value="gpt">GPT-4o vision</option>
                <option value="gemini">Gemini 1.5 Pro</option>
                <option value="docai">Google Document AI</option>
              </select>
            </Row>
            <Row label="Fallback" hint="Usato in caso di rate limit o fallimento JSON">
              <select className="btn sm" style={{paddingRight: 24}} defaultValue="tesseract">
                <option value="tesseract">Tesseract 5 (locale)</option>
                <option value="gpt">GPT-4o vision</option>
                <option value="none">Nessuno</option>
              </select>
            </Row>
            <Row label="Preprocessing immagine" hint="Deskew, denoise, contrast">
              <label className="pill" style={{cursor: "pointer"}}><input type="checkbox" defaultChecked style={{margin: 0, marginRight: 4}}/>attivo</label>
            </Row>
            <Row label="Soglia confidence minima" hint="Sotto questa soglia → revisione obbligatoria" last>
              <div style={{display: "flex", alignItems: "center", gap: 10}}>
                <input type="range" min="0.5" max="1" step="0.01" defaultValue="0.85" style={{width: 120}}/>
                <span className="mono num" style={{fontSize: 12, color: "var(--text-muted)", width: 32}}>0.85</span>
              </div>
            </Row>
          </Section>
        </div>

        <div style={{display: "flex", flexDirection: "column", gap: 14}}>
          <Section title="LLM per strutturazione" subtitle="Trasforma OCR grezzo in JSON canonico + classifica tipologia">
            <Row label="Modello" hint="Bilanciato costo/qualità per estrazione strutturata">
              <select className="btn sm" defaultValue="claude" style={{paddingRight: 24}}>
                <option value="claude">Claude 3.5 Haiku</option>
                <option value="sonnet">Claude 3.5 Sonnet</option>
                <option value="gpt">GPT-4.1-mini</option>
              </select>
            </Row>
            <Row label="Temperature" hint="Tieni bassa per output deterministico">
              <input className="btn sm mono" type="number" defaultValue="0.1" step="0.1" style={{width: 70, textAlign: "right"}}/>
            </Row>
            <Row label="Max retry su JSON malformato" hint="Con repair via JSON-mode">
              <input className="btn sm mono num" type="number" defaultValue="2" style={{width: 70, textAlign: "right"}}/>
            </Row>
            <Row label="Cache prompt per fornitore" hint="Riusa istruzioni system stabili — taglia il 60% dei token" last>
              <label className="pill" style={{cursor: "pointer"}}><input type="checkbox" defaultChecked style={{margin: 0, marginRight: 4}}/>attiva</label>
            </Row>
          </Section>

          <Section title="Logica di matching" subtitle="Come collegare doc 2 al doc 1 corrispondente">
            <Row label="Ordine di tentativo" hint="Trascina per riordinare">
              <div style={{display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end"}}>
                {["1. Numero riferimento esatto", "2. Match fornitore + finestra temporale", "3. Match semantico LLM su intestazione"].map((r, i) => (
                  <div key={i} className="pill" style={{fontSize: 11}}>{r}</div>
                ))}
              </div>
            </Row>
            <Row label="Finestra temporale max" hint="Doc 2 deve arrivare entro N giorni dal doc 1">
              <input className="btn sm mono num" type="number" defaultValue="14" style={{width: 70, textAlign: "right"}}/>
            </Row>
            <Row label="Fuzzy match nomi fornitori" hint="Threshold Levenshtein normalizzato">
              <div style={{display: "flex", alignItems: "center", gap: 10}}>
                <input type="range" min="0.5" max="1" step="0.01" defaultValue="0.82" style={{width: 120}}/>
                <span className="mono num" style={{fontSize: 12, color: "var(--text-muted)", width: 32}}>0.82</span>
              </div>
            </Row>
            <Row label="Auto-approva se 0 discrepanze" hint="Salta revisione operatore per match perfetti" last>
              <label className="pill" style={{cursor: "pointer"}}><input type="checkbox" style={{margin: 0, marginRight: 4}}/>disattiva</label>
            </Row>
          </Section>

          <Section title="Infrastruttura" subtitle="Stack tecnico in esecuzione">
            <Row label="Backend Django"><span className="pill ok"><span className="dot"></span>4.2.11 · OK</span></Row>
            <Row label="Microservizio FastAPI"><span className="pill ok"><span className="dot"></span>OK · 12 worker</span></Row>
            <Row label="PostgreSQL"><span className="pill ok"><span className="dot"></span>15.4 · 184 GB</span></Row>
            <Row label="Celery + Redis"><span className="pill ok"><span className="dot"></span>3 worker · 2 queue</span></Row>
            <Row label="Docker Compose" last><span className="pill"><span className="dot" style={{color: "var(--info)"}}></span>7 servizi</span></Row>
          </Section>
        </div>
      </div>
    </div>
  );
};

window.Settings = Settings;
