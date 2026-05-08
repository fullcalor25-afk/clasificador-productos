import { useState, useEffect, useRef } from "react";

// ─── Classification Engine (local, instant, no API needed) ───────────────────

const REPUESTO_KEYWORDS = [
  "repuesto","rep.","diafragma","electrodo","membrana","junta","oring",
  "o-ring","empaquetadura","válvula","valvula","resistencia","termocupla",
  "termopar","piloto","bujía","bujia","bobina","presostato","sensor",
  "sonda","plaqueta","placa","display","perilla","manija","bisagra",
  "resorte","arandela","tornillo","tuerca","bulón","bulon","retén",
  "reten","rodamiento","ruleman","correa","cadena repuesto","carburador",
  "cigüeñal","pistón","piston","biela","engranaje","piñón","pinon",
  "escobilla","carbón","carbon","capacitor","condensador","relay","relé",
  "rele","fusible","interruptor repuesto","micro","microswitch",
  "ficha electro","conector para","inyector","quemador rep",
  "unidad magnética","unidad magnetica","chicote","filtro deshidratador",
  "vaina","encendido para","conjunto quemador","divisor","espada orgon",
];

const ACCESORIO_KEYWORDS = [
  "acc.","accesorio","adaptador","cupla","racor","reducción","reduccion",
  "codo","tee","curva","niple","brida","abrazadera","grampa",
  "conector universal","detentor","desfangador",
];

const PRODUCTO_COMPLETO_KEYWORDS = [
  "equipo","caldera","salamandra","estufa","radiador elemento",
  "bomba","presurizador","electrobomba","compresor",
  "extractor","ventilador","aire acondicionado","split",
  "cortacerco","motosierra","desmalezadora","cortacesped",
  "escalera","taladro","amoladora","soldadora",
  "filtro de agua","purificador","ablandador",
  "termotanque","calefón","calefon",
  "cortina","pileta","tanque",
];

const RUBRO_REPUESTO_PATTERNS = [/^rep\./i, /repuesto/i, /^acc\./i];
const SUBRUBRO_REPUESTO_PATTERNS = [/^acc\./i, /^rep\./i, /diafragma/i, /electrodo/i, /plaqueta/i, /sensor/i, /membrana/i, /filtro/i];

function classifyProduct(product) {
  const nombre = (product.PRODUCTO || "").toLowerCase();
  const rubro = (product.RUBRO || "").toLowerCase();
  const subRubro = (product["SUB RUBRO"] || "").toLowerCase();

  let score = 0;
  let reasons = [];

  if (RUBRO_REPUESTO_PATTERNS.some(p => p.test(rubro))) {
    score += 40;
    reasons.push("Rubro indica repuesto/accesorio");
  }
  if (SUBRUBRO_REPUESTO_PATTERNS.some(p => p.test(subRubro))) {
    score += 30;
    reasons.push("Sub Rubro indica repuesto");
  }

  const matchedRepuesto = REPUESTO_KEYWORDS.filter(kw => nombre.includes(kw));
  if (matchedRepuesto.length > 0) {
    score += Math.min(matchedRepuesto.length * 15, 45);
    reasons.push("Palabras clave: " + matchedRepuesto.slice(0, 3).join(", "));
  }

  const matchedAcc = ACCESORIO_KEYWORDS.filter(kw => nombre.includes(kw));
  if (matchedAcc.length > 0) {
    score += Math.min(matchedAcc.length * 10, 25);
    reasons.push("Accesorios: " + matchedAcc.slice(0, 3).join(", "));
  }

  const matchedCompleto = PRODUCTO_COMPLETO_KEYWORDS.filter(kw => nombre.includes(kw));
  if (matchedCompleto.length > 0 && score < 50) {
    score -= Math.min(matchedCompleto.length * 20, 40);
    reasons.push("Producto completo: " + matchedCompleto.slice(0, 2).join(", "));
  }

  if (/\bpara\b/.test(nombre) && score > 0) {
    score += 10;
    reasons.push('Contiene "para" (parte de otro equipo)');
  }

  if (rubro === "service" || nombre.includes("instalacion")) {
    score = -50;
    reasons = ["Es un servicio"];
  }

  if (nombre.includes("materiales para") || nombre.includes("articulos de")) {
    score = 0;
    reasons = ["Categoria generica"];
  }

  score = Math.max(-100, Math.min(100, score));
  const confidence = Math.abs(score);

  let classification;
  if (score >= 30) classification = "REPUESTO";
  else if (score >= 10) classification = "ACCESORIO";
  else if (score <= -20) classification = "SERVICIO";
  else if (score <= 0 && matchedCompleto.length > 0) classification = "PRODUCTO_COMPLETO";
  else classification = "OTRO";

  return { classification, confidence: Math.min(confidence, 100), reasons, score };
}

// ─── AI call (one batch at a time) ───────────────────────────────────────────

async function classifyBatchWithAI(products) {
  const res = await fetch("/.netlify/functions/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { error: data.error || ("HTTP " + res.status), status: res.status };
  }

  return { results: data.results };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wait(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function parseTabular(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const first = lines[0];
  const tabCount = (first.match(/\t/g) || []).length;
  const commaCount = (first.match(/,/g) || []).length;
  const semicolonCount = (first.match(/;/g) || []).length;
  const delimiter = tabCount >= commaCount && tabCount >= semicolonCount ? "\t"
    : semicolonCount > commaCount ? ";" : ",";
  const headers = first.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const values = line.split(delimiter);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (values[i] || "").trim().replace(/^"|"$/g, ""); });
    return obj;
  });
}

// ─── Theme ───────────────────────────────────────────────────────────────────

const C = {
  bg: "#0a0c10", surface: "#12151c", surfaceHover: "#1a1e28", card: "#161a24",
  border: "#252a36", text: "#e2e8f0", textMuted: "#8892a6", textDim: "#5a6478",
  accent: "#3b82f6", accentGlow: "rgba(59,130,246,0.15)",
  repuesto: "#f59e0b", repuestoGlow: "rgba(245,158,11,0.12)",
  accesorio: "#8b5cf6", accesorioGlow: "rgba(139,92,246,0.12)",
  completo: "#10b981", completoGlow: "rgba(16,185,129,0.12)",
  servicio: "#6366f1", servicioGlow: "rgba(99,102,241,0.12)",
  otro: "#64748b", otroGlow: "rgba(100,116,139,0.12)",
  danger: "#ef4444", success: "#10b981",
};

const CLS = {
  REPUESTO: { color: C.repuesto, glow: C.repuestoGlow, icon: "⚙️", label: "Repuesto" },
  ACCESORIO: { color: C.accesorio, glow: C.accesorioGlow, icon: "🔩", label: "Accesorio" },
  PRODUCTO_COMPLETO: { color: C.completo, glow: C.completoGlow, icon: "📦", label: "Prod. Completo" },
  SERVICIO: { color: C.servicio, glow: C.servicioGlow, icon: "🔧", label: "Servicio" },
  OTRO: { color: C.otro, glow: C.otroGlow, icon: "📋", label: "Otro" },
};

const PAGE_SIZE = 50;

// ─── Main App ────────────────────────────────────────────────────────────────

export default function ProductClassifier() {
  const [products, setProducts] = useState([]);
  const [classified, setClassified] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [view, setView] = useState("upload");
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResults, setAiResults] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [stats, setStats] = useState({});
  const [sortBy, setSortBy] = useState("confidence");
  const [sortDir, setSortDir] = useState("desc");
  const [pasteData, setPasteData] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [page, setPage] = useState(0);
  const [aiProcessed, setAiProcessed] = useState(0);
  const [aiStatus, setAiStatus] = useState("");
  const aiAbort = useRef(false);
  const fileInputRef = useRef(null);

  // ─── Process products when data or AI results change ─────────────────────

  useEffect(() => {
    if (products.length === 0) return;
    setLoading(true);
    setTimeout(() => {
      const results = products.map((p, idx) => {
        const result = classifyProduct(p);
        return { ...p, _id: idx, _class: result };
      });

      if (aiResults) {
        results.forEach(r => {
          const aiMatch = aiResults.find(a => a.codigo === r.CODIGO);
          if (aiMatch) {
            r._aiClass = { classification: aiMatch.clasificacion, confidence: aiMatch.confianza, reason: aiMatch.razon };
            if (aiMatch.confianza > r._class.confidence) {
              r._class.classification = aiMatch.clasificacion;
              r._class.confidence = aiMatch.confianza;
              r._class.reasons = [aiMatch.razon, ...r._class.reasons];
            }
          }
        });
      }

      setClassified(results);
      const s = {};
      results.forEach(r => { const cls = r._manualClass || r._class.classification; s[cls] = (s[cls] || 0) + 1; });
      setStats(s);
      setLoading(false);
      setView("dashboard");
      setPage(0);
    }, 200);
  }, [products, aiResults]);

  // ─── File & paste handlers ───────────────────────────────────────────────

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = parseTabular(ev.target.result);
      if (data.length > 0) setProducts(data);
    };
    reader.readAsText(file);
  };

  const handlePaste = () => {
    if (!pasteData.trim()) return;
    const data = parseTabular(pasteData);
    if (data.length > 0) setProducts(data);
  };

  // ─── AI Classification - SEQUENTIAL, ONE AT A TIME ───────────────────────
  // This is the key fix: we send ONE request, wait for the FULL response,
  // then wait a delay, then send the next. No parallel requests.

  const runAI = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiProcessed(0);
    setAiStatus("Iniciando...");
    aiAbort.current = false;

    const allResults = [];
    const batchSize = 50;
    const totalBatches = Math.ceil(products.length / batchSize);
    let consecutiveErrors = 0;

    // Base delay between successful requests (8 seconds)
    const BASE_DELAY = 8000;

    for (let i = 0; i < totalBatches; i++) {
      // Check if user cancelled
      if (aiAbort.current) {
        setAiStatus("Cancelado por el usuario");
        break;
      }

      const batch = products.slice(i * batchSize, (i + 1) * batchSize);
      const batchNum = i + 1;

      setAiStatus("Lote " + batchNum + " de " + totalBatches + " — enviando...");

      // Wait between requests (not before the first one)
      if (i > 0) {
        const delayTime = BASE_DELAY + (consecutiveErrors * 15000);
        setAiStatus("Lote " + batchNum + " de " + totalBatches + " — esperando " + Math.round(delayTime / 1000) + "s...");
        await wait(delayTime);
      }

      // Send ONE request and wait for response
      const response = await classifyBatchWithAI(batch);

      if (response.error) {
        consecutiveErrors++;
        console.log("Error en lote " + batchNum + ":", response.error);

        // If it's a rate limit, wait longer and retry this batch
        if (response.status === 429 || response.status === 503) {
          const retryWait = Math.min(consecutiveErrors * 20000, 120000); // Max 2 min wait
          setAiStatus("⏳ Limite alcanzado. Esperando " + Math.round(retryWait / 1000) + "s antes de reintentar lote " + batchNum + "...");
          await wait(retryWait);
          i--; // Retry this same batch
          continue;
        }

        // If it's an API key error, stop immediately
        if (response.status === 401) {
          setAiError("API Key invalida. Genera una nueva en aistudio.google.com/apikey y actualizala en Netlify.");
          break;
        }

        // Other error - retry up to 8 times total
        if (consecutiveErrors >= 8) {
          setAiError(
            "Se procesaron " + allResults.length + " de " + products.length + " productos. " +
            "Error persistente: " + response.error + ". " +
            "Podes hacer click en Re-analizar mas tarde para continuar."
          );
          break;
        }

        // Wait and retry
        setAiStatus("⚠ Error en lote " + batchNum + ". Reintentando en 30s...");
        await wait(30000);
        i--; // Retry
        continue;

      } else {
        // SUCCESS
        consecutiveErrors = 0;
        if (response.results && Array.isArray(response.results)) {
          allResults.push(...response.results);
          setAiProcessed(allResults.length);
          setAiStatus("✓ Lote " + batchNum + "/" + totalBatches + " OK (" + allResults.length + " productos)");
        }
      }
    }

    // Apply results
    if (allResults.length > 0) {
      setAiResults(allResults);
      if (consecutiveErrors === 0 || allResults.length >= products.length * 0.8) {
        setAiError(null);
        setAiStatus("✅ Completado: " + allResults.length + " productos clasificados con IA");
      }
    } else if (!aiAbort.current && !allResults.length) {
      setAiError("No se pudo clasificar ningun producto. Verifica tu API Key de Gemini en Netlify.");
    }

    setAiLoading(false);
  };

  const stopAI = () => {
    aiAbort.current = true;
  };

  const handleManualClassify = (id, newClass) => {
    setClassified(prev => {
      const updated = prev.map(p => p._id === id ? { ...p, _manualClass: newClass } : p);
      const s = {};
      updated.forEach(r => { const cls = r._manualClass || r._class.classification; s[cls] = (s[cls] || 0) + 1; });
      setStats(s);

      // Guardar corrección en la base de datos para que la IA aprenda (Fire and forget)
      const product = updated.find(p => p._id === id);
      if (product && product.CODIGO) {
        fetch("/.netlify/functions/update-correction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo: product.CODIGO,
            producto: product.PRODUCTO,
            rubro: product.RUBRO,
            subRubro: product["SUB RUBRO"],
            clasificacion_manual: newClass
          })
        }).catch(e => console.log("Error guardando correccion", e));
      }

      return updated;
    });
    setEditingId(null);
  };

  const exportCSV = () => {
    const headers = ["CODIGO","PRODUCTO","RUBRO","SUB RUBRO","PROVEEDOR","CLASIFICACION","CONFIANZA","RAZONES"];
    const rows = filteredProducts.map(p => [
      p.CODIGO || "",
      '"' + (p.PRODUCTO || "").replace(/"/g, '""') + '"',
      p.RUBRO || "",
      p["SUB RUBRO"] || "",
      '"' + (p.PROVEEDOR || "").replace(/"/g, '""') + '"',
      p._manualClass || p._class.classification,
      (p._class.confidence || 0) + "%",
      '"' + (p._class.reasons || []).join("; ").replace(/"/g, '""') + '"',
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "productos_clasificados.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const resetApp = () => {
    aiAbort.current = true;
    setProducts([]); setClassified([]); setFilter("ALL"); setSearchTerm("");
    setView("upload"); setAiResults(null); setAiError(null); setPasteData("");
    setPage(0); setStats({}); setAiStatus("");
  };

  // ─── Filtering & sorting ─────────────────────────────────────────────────

  const filteredProducts = classified
    .filter(p => {
      const cls = p._manualClass || p._class.classification;
      if (filter !== "ALL" && cls !== filter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (p.PRODUCTO || "").toLowerCase().includes(s) ||
               (p.CODIGO || "").toLowerCase().includes(s) ||
               (p.RUBRO || "").toLowerCase().includes(s) ||
               (p.PROVEEDOR || "").toLowerCase().includes(s);
      }
      return true;
    })
    .sort((a, b) => {
      let va, vb;
      if (sortBy === "confidence") { va = a._class.confidence; vb = b._class.confidence; }
      else if (sortBy === "producto") { va = a.PRODUCTO || ""; vb = b.PRODUCTO || ""; }
      else if (sortBy === "rubro") { va = a.RUBRO || ""; vb = b.RUBRO || ""; }
      else if (sortBy === "clasificacion") { va = a._manualClass || a._class.classification; vb = b._manualClass || b._class.classification; }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });

  const pagedProducts = filteredProducts.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);

  const Btn = ({ children, active, color, onClick }) => (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500,
      border: "1px solid " + (active ? (color || C.accent) : C.border),
      background: active ? (color ? color + "18" : C.accentGlow) : "transparent",
      color: active ? (color || C.accent) : C.textMuted,
      cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap",
    }}>{children}</button>
  );

  // ─── RENDER ──────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", background: C.bg, color: C.text, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:${C.bg}}
        ::-webkit-scrollbar-thumb{background:${C.border};border-radius:3px}
        input,textarea,select{font-family:inherit}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        .fade-in{animation:fadeIn .4s ease forwards}
      `}</style>

      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg," + C.surface + "," + C.bg + ")",
        borderBottom: "1px solid " + C.border, padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 100, backdropFilter: "blur(16px)",
        flexWrap: "wrap", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg," + C.accent + "," + C.repuesto + ")",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 700, color: "#fff",
          }}>⚡</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Clasificador de Productos</div>
            <div style={{ fontSize: 11, color: C.textDim }}>Sistema inteligente con IA</div>
          </div>
        </div>
        {classified.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <Btn active={view === "dashboard"} onClick={() => setView("dashboard")}>Dashboard</Btn>
            <Btn active={view === "table"} onClick={() => setView("table")}>Tabla</Btn>
            <Btn onClick={exportCSV} color={C.success} active>📥 Exportar CSV</Btn>
            <Btn onClick={resetApp} color={C.danger} active>Nueva carga</Btn>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px" }}>

        {/* Upload */}
        {view === "upload" && (
          <div className="fade-in" style={{ maxWidth: 680, margin: "40px auto" }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Cargá tus productos</h2>
              <p style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
                Pegá los datos desde Google Sheets o subí un CSV. El sistema clasifica automáticamente.
              </p>
            </div>

            <div style={{ background: C.surface, borderRadius: 14, border: "1px solid " + C.border, padding: 20, marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, marginBottom: 10, display: "block" }}>📋 Pegar desde Google Sheets</label>
              <textarea value={pasteData} onChange={e => setPasteData(e.target.value)}
                placeholder="Seleccioná todo en Google Sheets (Ctrl+A), copiá (Ctrl+C) y pegá acá..."
                style={{ width: "100%", minHeight: 160, padding: 14, borderRadius: 10, background: C.bg, border: "1px solid " + C.border, color: C.text, fontSize: 12, fontFamily: "'JetBrains Mono',monospace", resize: "vertical", outline: "none", lineHeight: 1.6 }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border}
              />
              <button onClick={handlePaste} disabled={!pasteData.trim()} style={{
                marginTop: 12, width: "100%", padding: "12px 20px", borderRadius: 10, border: "none",
                background: pasteData.trim() ? "linear-gradient(135deg," + C.accent + ",#2563eb)" : C.card,
                color: pasteData.trim() ? "#fff" : C.textDim, fontSize: 14, fontWeight: 600,
                cursor: pasteData.trim() ? "pointer" : "default",
              }}>🚀 Analizar Productos</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "20px 0", color: C.textDim, fontSize: 12 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />o bien<div style={{ flex: 1, height: 1, background: C.border }} />
            </div>

            <div onClick={() => fileInputRef.current?.click()} style={{
              background: C.surface, borderRadius: 14, border: "2px dashed " + C.border,
              padding: "36px 20px", textAlign: "center", cursor: "pointer",
            }}>
              <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} style={{ display: "none" }} />
              <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Subir archivo CSV o TSV</div>
              <div style={{ fontSize: 12, color: C.textDim }}>Click para seleccionar</div>
            </div>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontSize: 32, animation: "pulse 1.5s infinite", marginBottom: 16 }}>⚡</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>Analizando {products.length} productos...</div>
          </div>
        )}

        {/* Dashboard */}
        {view === "dashboard" && !loading && classified.length > 0 && (
          <div className="fade-in">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 28 }}>
              {[
                { label: "Total", value: classified.length, color: C.accent, icon: "📊" },
                { label: "Repuestos", value: stats.REPUESTO || 0, color: C.repuesto, icon: "⚙️", pct: true },
                { label: "Accesorios", value: stats.ACCESORIO || 0, color: C.accesorio, icon: "🔩", pct: true },
                { label: "Completos", value: stats.PRODUCTO_COMPLETO || 0, color: C.completo, icon: "📦", pct: true },
              ].map(s => (
                <div key={s.label} style={{ background: C.surface, borderRadius: 14, border: "1px solid " + C.border, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -20, right: -10, fontSize: 50, opacity: 0.06 }}>{s.icon}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
                  {s.pct && classified.length > 0 && <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{Math.round(s.value / classified.length * 100)}%</div>}
                </div>
              ))}
            </div>

            {/* AI Section */}
            <div style={{
              background: "linear-gradient(135deg,rgba(59,130,246,0.06),rgba(245,158,11,0.06))",
              borderRadius: 14, border: "1px solid " + C.border, padding: 20, marginBottom: 28,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🤖 Mejorar con Gemini IA</div>
                  <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.5 }}>
                    Analiza productos ambiguos con inteligencia artificial para mejorar la precisión.
                    {aiResults && !aiLoading && <span style={{ color: C.success, marginLeft: 8 }}>✓ {aiResults.length} productos mejorados</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {aiLoading && (
                    <button onClick={stopAI} style={{
                      padding: "10px 18px", borderRadius: 10, border: "1px solid " + C.danger,
                      background: "transparent", color: C.danger, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}>⏹ Parar</button>
                  )}
                  <button onClick={runAI} disabled={aiLoading} style={{
                    padding: "10px 22px", borderRadius: 10, border: "none",
                    background: aiLoading ? C.card : "linear-gradient(135deg," + C.accent + "," + C.repuesto + ")",
                    color: "#fff", fontSize: 13, fontWeight: 600,
                    cursor: aiLoading ? "wait" : "pointer", minWidth: 140,
                  }}>
                    {aiLoading ? "⏳ Procesando..." : aiResults ? "🔄 Re-analizar" : "🚀 Activar IA"}
                  </button>
                </div>
              </div>

              {/* Progress */}
              {aiLoading && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: C.accent, marginBottom: 6 }}>
                    {aiStatus} — {aiProcessed}/{products.length}
                  </div>
                  <div style={{ height: 6, background: C.card, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      width: (aiProcessed / products.length * 100) + "%",
                      height: "100%", borderRadius: 3, transition: "width 0.5s",
                      background: "linear-gradient(90deg," + C.accent + "," + C.success + ")",
                    }} />
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 6 }}>
                    ⏱ Tiempo estimado restante: ~{Math.round((products.length - aiProcessed) / 50 * 12)} segundos
                  </div>
                </div>
              )}

              {aiError && <div style={{ fontSize: 12, color: C.danger, marginTop: 10 }}>⚠ {aiError}</div>}
            </div>

            {/* Distribution */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Distribución</h3>
              <div style={{ display: "flex", height: 10, borderRadius: 6, overflow: "hidden", background: C.card, marginBottom: 12 }}>
                {Object.entries(stats).filter(([,v]) => v > 0).map(([key, val]) => (
                  <div key={key} style={{ width: (val / classified.length * 100) + "%", background: (CLS[key] || CLS.OTRO).color, transition: "width .5s" }} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {Object.entries(stats).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]).map(([key, val]) => (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: (CLS[key] || CLS.OTRO).color }} />
                    <span style={{ color: C.textMuted }}>{(CLS[key] || CLS.OTRO).label}: <span style={{ color: C.text, fontWeight: 600 }}>{val}</span></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top rubros */}
            <div style={{ background: C.surface, borderRadius: 14, border: "1px solid " + C.border, padding: 20, marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Rubros con más Repuestos</h3>
              {(() => {
                const m = {};
                classified.filter(p => (p._manualClass || p._class.classification) === "REPUESTO").forEach(p => {
                  const r = p.RUBRO || "Sin Rubro"; m[r] = (m[r] || 0) + 1;
                });
                const sorted = Object.entries(m).sort((a,b) => b[1]-a[1]).slice(0, 8);
                const max = sorted[0]?.[1] || 1;
                return sorted.length === 0
                  ? <div style={{ color: C.textDim, fontSize: 13 }}>Sin repuestos detectados</div>
                  : sorted.map(([rubro, count]) => (
                    <div key={rubro} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ color: C.textMuted }}>{rubro}</span>
                        <span style={{ fontWeight: 600, color: C.repuesto }}>{count}</span>
                      </div>
                      <div style={{ height: 5, background: C.card, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: (count / max * 100) + "%", height: "100%", background: "linear-gradient(90deg," + C.repuesto + "," + C.accent + ")", borderRadius: 3 }} />
                      </div>
                    </div>
                  ));
              })()}
            </div>

            <button onClick={() => setView("table")} style={{
              width: "100%", padding: 14, borderRadius: 12, border: "1px solid " + C.border,
              background: C.surface, color: C.text, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>Ver tabla completa →</button>
          </div>
        )}

        {/* Table */}
        {view === "table" && !loading && classified.length > 0 && (
          <div className="fade-in">
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <input type="text" placeholder="🔍 Buscar..."
                value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
                style={{ flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10, border: "1px solid " + C.border, background: C.surface, color: C.text, fontSize: 13, outline: "none" }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border}
              />
              {["ALL","REPUESTO","ACCESORIO","PRODUCTO_COMPLETO","SERVICIO","OTRO"].map(f => (
                <Btn key={f} active={filter === f} color={(CLS[f] || {}).color} onClick={() => { setFilter(f); setPage(0); }}>
                  {f === "ALL" ? "Todos (" + classified.length + ")" : ((CLS[f] || {}).icon || "") + " " + ((CLS[f] || {}).label || f) + " (" + (stats[f] || 0) + ")"}
                </Btn>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>
              {pagedProducts.length} de {filteredProducts.length} productos
            </div>

            <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid " + C.border }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.surface }}>
                    {[{k:"producto",l:"Producto"},{k:"rubro",l:"Rubro"},{k:"clasificacion",l:"Clasificación"},{k:"confidence",l:"Confianza"}].map(col => (
                      <th key={col.k} onClick={() => { if (sortBy === col.k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col.k); setSortDir("desc"); }}} style={{
                        padding: "12px 14px", textAlign: "left", fontWeight: 600,
                        color: sortBy === col.k ? C.accent : C.textMuted, cursor: "pointer",
                        borderBottom: "1px solid " + C.border, fontSize: 11,
                        letterSpacing: "0.04em", textTransform: "uppercase", userSelect: "none",
                      }}>{col.l} {sortBy === col.k && (sortDir === "asc" ? "↑" : "↓")}</th>
                    ))}
                    <th style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.textMuted, borderBottom: "1px solid " + C.border, fontSize: 11, textTransform: "uppercase" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((p, i) => {
                    const cls = p._manualClass || p._class.classification;
                    const cfg = CLS[cls] || CLS.OTRO;
                    return (
                      <tr key={p._id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}
                      >
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border, maxWidth: 360 }}>
                          <div style={{ fontWeight: 500, marginBottom: 2, lineHeight: 1.4 }}>{p.PRODUCTO || "—"}</div>
                          <div style={{ fontSize: 11, color: C.textDim, fontFamily: "'JetBrains Mono',monospace" }}>{p.CODIGO}</div>
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border, color: C.textMuted }}>
                          <div>{p.RUBRO || "—"}</div>
                          {p["SUB RUBRO"] && <div style={{ fontSize: 11, color: C.textDim }}>{p["SUB RUBRO"]}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border }}>
                          {editingId === p._id ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {Object.keys(CLS).map(k => (
                                <button key={k} onClick={() => handleManualClassify(p._id, k)} style={{
                                  padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 500,
                                  border: "1px solid " + CLS[k].color + "30",
                                  background: cls === k ? CLS[k].glow : "transparent",
                                  color: CLS[k].color, cursor: "pointer", textAlign: "left",
                                }}>{CLS[k].icon} {CLS[k].label}</button>
                              ))}
                            </div>
                          ) : (
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                              background: cfg.glow, color: cfg.color, border: "1px solid " + cfg.color + "25",
                            }}>
                              {cfg.icon} {cfg.label}
                              {p._manualClass && <span style={{ fontSize: 10, opacity: 0.7 }}>✎</span>}
                              {p._aiClass && <span style={{ fontSize: 10, opacity: 0.7 }}>🤖</span>}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 48, height: 5, background: C.card, borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ width: p._class.confidence + "%", height: "100%", background: p._class.confidence > 60 ? C.success : p._class.confidence > 30 ? C.repuesto : C.danger, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.textMuted }}>{p._class.confidence}%</span>
                          </div>
                          {p._class.reasons?.[0] && <div style={{ fontSize: 10, color: C.textDim, marginTop: 3 }}>{p._class.reasons[0]}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border, textAlign: "center" }}>
                          <button onClick={() => setEditingId(editingId === p._id ? null : p._id)} style={{
                            padding: "5px 10px", borderRadius: 6, fontSize: 11,
                            border: "1px solid " + C.border, background: "transparent", color: C.textMuted, cursor: "pointer",
                          }}>{editingId === p._id ? "✕" : "✏️"}</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 18, fontSize: 13 }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid " + C.border,
                  background: "transparent", color: page === 0 ? C.textDim : C.text, cursor: page === 0 ? "default" : "pointer",
                }}>← Anterior</button>
                <span style={{ color: C.textMuted }}>Pág {page + 1}/{totalPages}</span>
                <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid " + C.border,
                  background: "transparent", color: page >= totalPages - 1 ? C.textDim : C.text, cursor: page >= totalPages - 1 ? "default" : "pointer",
                }}>Siguiente →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
