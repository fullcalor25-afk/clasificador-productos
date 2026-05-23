import { useState, useEffect, useRef } from "react";

// ─── Classification Engine (local, instant, no API needed) ───────────────────

const REPUESTO_KEYWORDS = [
  "repuesto", "rep.", "diafragma", "electrodo", "membrana", "junta", "oring",
  "o-ring", "empaquetadura", "válvula", "valvula", "resistencia", "termocupla",
  "termopar", "piloto", "bujía", "bujia", "bobina", "presostato", "sensor",
  "sonda", "plaqueta", "placa", "display", "perilla", "manija", "bisagra",
  "resorte", "arandela", "tornillo", "tuerca", "bulón", "bulon", "retén",
  "reten", "rodamiento", "ruleman", "correa", "cadena repuesto", "carburador",
  "cigüeñal", "pistón", "piston", "biela", "engranaje", "piñón", "pinon",
  "escobilla", "carbón", "carbon", "capacitor", "condensador", "relay", "relé",
  "rele", "fusible", "interruptor repuesto", "micro", "microswitch",
  "ficha electro", "conector para", "inyector", "quemador rep",
  "unidad magnética", "unidad magnetica", "chicote", "filtro deshidratador",
  "vaina", "encendido para", "conjunto quemador", "divisor", "espada orgon",
];

const ACCESORIO_KEYWORDS = [
  "acc.", "accesorio", "adaptador", "cupla", "racor", "reducción", "reduccion",
  "codo", "tee", "curva", "niple", "brida", "abrazadera", "grampa",
  "conector universal", "detentor", "desfangador",
];

const PRODUCTO_COMPLETO_KEYWORDS = [
  "equipo", "caldera", "salamandra", "estufa", "radiador elemento",
  "bomba", "presurizador", "electrobomba", "compresor",
  "extractor", "ventilador", "aire acondicionado", "split",
  "cortacerco", "motosierra", "desmalezadora", "cortacesped",
  "escalera", "taladro", "amoladora", "soldadora",
  "filtro de agua", "purificador", "ablandador",
  "termotanque", "calefón", "calefon",
  "cortina", "pileta", "tanque",
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

async function classifyBatchWithAI(products, categories) {
  const res = await fetch("/.netlify/functions/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ products, categories: categories || [] }),
  });

  const data = await res.json();

  if (!res.ok) {
    return { error: data.error || ("HTTP " + res.status), status: res.status };
  }

  return { results: data.results };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wait(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
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

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
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
  aprendido: "#06b6d4", aprendidoGlow: "rgba(6,182,212,0.12)",
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

  // Correcciones aprendidas
  const correctionsRef = useRef({});
  const [corrections, setCorrections] = useState({});

  // Historial
  const [historyList, setHistoryList] = useState([]);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyFilter, setHistoryFilter] = useState("ALL");
  const [historySearch, setHistorySearch] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);

  // Guardar análisis
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");
  const [savingAnalysis, setSavingAnalysis] = useState(false);

  // Renombrar / Eliminar en historial
  const [renameId, setRenameId] = useState(null);
  const [renameText, setRenameText] = useState("");
  const [deleteModalId, setDeleteModalId] = useState(null);

  // Categorías
  const [categories, setCategories] = useState([]);
  const categoriesRef = useRef([]);
  const [catModal, setCatModal] = useState(null);
  const [catDeleteModal, setCatDeleteModal] = useState(null);

  // Exportación Tienda Nube
  const [exportStep, setExportStep] = useState(1);
  const [exportSelected, setExportSelected] = useState([]);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichedCount, setEnrichedCount] = useState(0);
  const [enrichStatus, setEnrichStatus] = useState("");
  const enrichAbort = useRef(false);

  // ─── Cargar correcciones al montar ──────────────────────────────────────

  useEffect(() => {
    fetch("/.netlify/functions/corrections")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map = {};
          data.forEach(c => { if (c.codigo) map[c.codigo.toLowerCase()] = c.clasificacion_corregida; });
          correctionsRef.current = map;
          setCorrections(map);
        }
      })
      .catch(e => console.log("Error cargando correcciones", e));

    fetch("/.netlify/functions/categories")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          categoriesRef.current = data;
          setCategories(data);
        }
      })
      .catch(e => console.log("Error cargando categorías", e));
  }, []);

  // ─── Process products when data or AI results change ─────────────────────

  useEffect(() => {
    if (products.length === 0) return;
    setLoading(true);
    setTimeout(() => {
      const corrs = correctionsRef.current;
      const results = products.map((p, idx) => {
        const corrKey = (p.CODIGO || "").toLowerCase();
        if (corrKey && corrs[corrKey]) {
          return {
            ...p, _id: idx,
            _class: { classification: corrs[corrKey], confidence: 100, reasons: ["Corrección aprendida"], score: 100 },
            _source: "APRENDIDO",
          };
        }
        const result = classifyProduct(p);
        return { ...p, _id: idx, _class: result, _source: "REGLAS" };
      });

      if (aiResults) {
        const cats = categoriesRef.current;
        results.forEach(r => {
          if (r._source === "APRENDIDO") return;
          const aiMatch = aiResults.find(a => a.codigo === r.CODIGO);
          if (aiMatch) {
            r._aiClass = { classification: aiMatch.clasificacion, confidence: aiMatch.confianza, reason: aiMatch.razon };
            if (aiMatch.confianza > r._class.confidence) {
              r._class.classification = aiMatch.clasificacion;
              r._class.confidence = aiMatch.confianza;
              r._class.reasons = [aiMatch.razon, ...r._class.reasons];
              r._source = "IA";
            }
            if (aiMatch.categoria) {
              r._categoria = aiMatch.categoria;
              r._subcategoria = aiMatch.subcategoria || null;
              r._tipo = aiMatch.tipo || null;
              const catObj = cats.find(c => c.nombre === aiMatch.categoria);
              r._category_id = catObj ? catObj.id : null;
              const subObj = catObj ? (catObj.subcategories || []).find(s => s.nombre === aiMatch.subcategoria) : null;
              r._subcategory_id = subObj ? subObj.id : null;
            }
          }
        });
      }

      setClassified(results);
      const s = {};
      let aprendidos = 0;
      results.forEach(r => {
        const cls = r._manualClass || r._class.classification;
        s[cls] = (s[cls] || 0) + 1;
        if (r._source === "APRENDIDO") aprendidos++;
      });
      s._aprendidos = aprendidos;
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

  // ─── AI Classification ───────────────────────────────────────────────────

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
    const BASE_DELAY = 8000;

    for (let i = 0; i < totalBatches; i++) {
      if (aiAbort.current) { setAiStatus("Cancelado por el usuario"); break; }

      const batch = products.slice(i * batchSize, (i + 1) * batchSize);
      const batchNum = i + 1;
      setAiStatus("Lote " + batchNum + " de " + totalBatches + " — enviando...");

      if (i > 0) {
        const delayTime = BASE_DELAY + (consecutiveErrors * 15000);
        setAiStatus("Lote " + batchNum + " de " + totalBatches + " — esperando " + Math.round(delayTime / 1000) + "s...");
        await wait(delayTime);
      }

      const response = await classifyBatchWithAI(batch, categoriesRef.current);

      if (response.error) {
        consecutiveErrors++;
        if (response.status === 429 || response.status === 503) {
          const retryWait = Math.min(consecutiveErrors * 20000, 120000);
          setAiStatus("⏳ Limite alcanzado. Esperando " + Math.round(retryWait / 1000) + "s antes de reintentar lote " + batchNum + "...");
          await wait(retryWait);
          i--;
          continue;
        }
        if (response.status === 401) {
          setAiError("API Key invalida. Genera una nueva en aistudio.google.com/apikey y actualizala en Netlify.");
          break;
        }
        if (consecutiveErrors >= 8) {
          setAiError("Se procesaron " + allResults.length + " de " + products.length + " productos. Error persistente: " + response.error + ". Podes hacer click en Re-analizar mas tarde para continuar.");
          break;
        }
        setAiStatus("⚠ Error en lote " + batchNum + ". Reintentando en 30s...");
        await wait(30000);
        i--;
        continue;
      } else {
        consecutiveErrors = 0;
        if (response.results && Array.isArray(response.results)) {
          allResults.push(...response.results);
          setAiProcessed(allResults.length);
          setAiStatus("✓ Lote " + batchNum + "/" + totalBatches + " OK (" + allResults.length + " productos)");
        }
      }
    }

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

  const stopAI = () => { aiAbort.current = true; };

  // ─── Enrich for Tienda Nube ──────────────────────────────────────────────

  const runEnrich = async (selectedProducts) => {
    setEnrichLoading(true);
    setEnrichedCount(0);
    setEnrichStatus("Iniciando...");
    enrichAbort.current = false;

    const batchSize = 15;
    const total = selectedProducts.length;
    let processed = 0;

    for (let i = 0; i < Math.ceil(total / batchSize); i++) {
      if (enrichAbort.current) { setEnrichStatus("Cancelado"); break; }

      const batch = selectedProducts.slice(i * batchSize, (i + 1) * batchSize);
      setEnrichStatus(`Enriqueciendo lote ${i + 1} de ${Math.ceil(total / batchSize)}...`);

      if (i > 0) await new Promise(r => setTimeout(r, 3000));

      try {
        const res = await fetch("/.netlify/functions/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: batch }),
        });
        const data = await res.json();

        if (res.ok && data.results) {
          setClassified(prev => prev.map(p => {
            const match = data.results.find(r => r.codigo === p.CODIGO);
            return match ? { ...p, _enriched: match } : p;
          }));
          processed += batch.length;
          setEnrichedCount(processed);
          setEnrichStatus(`✓ ${processed}/${total} enriquecidos`);
        }
      } catch (e) {
        console.log("Error enriqueciendo lote", e);
      }
    }

    if (!enrichAbort.current) {
      setEnrichStatus(`✅ ${processed} productos enriquecidos`);
      setExportStep(3);
    }
    setEnrichLoading(false);
  };

  // ─── Manual correction ───────────────────────────────────────────────────

  const handleManualClassify = (id, newClass) => {
    setClassified(prev => {
      const updated = prev.map(p => p._id === id
        ? { ...p, _manualClass: newClass, _source: "APRENDIDO" }
        : p);
      const s = {};
      let aprendidos = 0;
      updated.forEach(r => {
        const cls = r._manualClass || r._class.classification;
        s[cls] = (s[cls] || 0) + 1;
        if (r._source === "APRENDIDO") aprendidos++;
      });
      s._aprendidos = aprendidos;
      setStats(s);
      return updated;
    });
    setEditingId(null);

    const product = classified.find(p => p._id === id);
    if (product && product.CODIGO) {
      const key = product.CODIGO.toLowerCase();
      correctionsRef.current[key] = newClass;
      setCorrections(prev => ({ ...prev, [key]: newClass }));

      fetch("/.netlify/functions/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: product.CODIGO,
          producto: product.PRODUCTO || "",
          rubro: product.RUBRO || "",
          sub_rubro: product["SUB RUBRO"] || "",
          clasificacion_corregida: newClass,
        }),
      }).catch(e => console.log("Error guardando correccion", e));
    }
  };

  const handleManualCategory = (id, field, value) => {
    setClassified(prev => prev.map(p => {
      if (p._id !== id) return p;
      const cats = categoriesRef.current;
      if (field === "categoria") {
        const catObj = cats.find(c => c.nombre === value);
        return { ...p, _categoria: value || null, _subcategoria: null, _category_id: catObj ? catObj.id : null, _subcategory_id: null };
      }
      const catObj = cats.find(c => c.nombre === p._categoria);
      const subObj = catObj ? (catObj.subcategories || []).find(s => s.nombre === value) : null;
      return { ...p, _subcategoria: value || null, _subcategory_id: subObj ? subObj.id : null };
    }));
  };

  // ─── Export CSV (análisis actual) ────────────────────────────────────────

  const exportCSV = (filterType = "ALL") => {
    const toExport = filterType === "ALL"
      ? classified
      : classified.filter(p => (p._manualClass || p._class.classification) === filterType);

    if (toExport.length === 0) return alert("No hay productos para exportar en esta categoría.");

    const headers = ["CODIGO", "PRODUCTO", "RUBRO", "SUB RUBRO", "PROVEEDOR", "CLASIFICACION", "CONFIANZA", "FUENTE", "RAZONES", "CATEGORIA", "SUBCATEGORIA", "TIPO"];
    const rows = toExport.map(p => [
      p.CODIGO || "",
      '"' + (p.PRODUCTO || "").replace(/"/g, '""') + '"',
      p.RUBRO || "",
      p["SUB RUBRO"] || "",
      '"' + (p.PROVEEDOR || "").replace(/"/g, '""') + '"',
      p._manualClass || p._class.classification,
      (p._class.confidence || 0) + "%",
      p._manualClass ? "APRENDIDO" : (p._source || "REGLAS"),
      '"' + (p._class.reasons || []).join("; ").replace(/"/g, '""') + '"',
      p._categoria || "",
      p._subcategoria || "",
      p._tipo || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "productos_clasificados.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Export CSV (detalle de historial) ──────────────────────────────────

  const exportHistoryCSV = (productos) => {
    if (!productos || productos.length === 0) return;
    const headers = ["CODIGO", "PRODUCTO", "RUBRO", "SUB RUBRO", "CLASIFICACION", "FUENTE", "CONFIANZA"];
    const rows = productos.map(p => [
      p.codigo || "",
      '"' + (p.producto || "").replace(/"/g, '""') + '"',
      p.rubro || "",
      p.sub_rubro || "",
      p.clasificacion || "",
      p.fuente || "",
      (p.confianza || 0) + "%",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "analisis_exportado.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Tienda Nube helpers ─────────────────────────────────────────────────

  // Adapta productos del historial (campos lowercase, _enriched ya reconstruido)
  // a la forma que acepta exportTiendaNubeCSV (campos uppercase)
  const exportHistoryTiendaNubeCSV = (histProductos) => {
    const enriched = histProductos.filter(p => p._enriched);
    if (enriched.length === 0) {
      alert("Este análisis no tiene productos enriquecidos con IA. Volvé a cargar el análisis en el flujo principal y ejecutá el enriquecimiento antes de guardar.");
      return;
    }
    const mapped = enriched.map(p => ({
      CODIGO: p.codigo || "",
      PRODUCTO: p.producto || "",
      RUBRO: p.rubro || "",
      "SUB RUBRO": p.sub_rubro || "",
      PRECIO: 0,
      _categoria: null,
      _subcategoria: null,
      _enriched: p._enriched,
    }));
    exportTiendaNubeCSV(mapped);
  };

  function slugify(text) {
    return (text || "").toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  }

  function buildCategoriaTN(product) {
    const MAP = {
      "Calefacción":    "Repuestos > Calefacción",
      "Refrigeración":  "Repuestos > Refrigeración",
      "Gas y Agua":     "Repuestos > Gas y Agua",
      "Agua Sanitaria": "Repuestos > Agua Sanitaria",
      "Herramientas":   "Herramientas",
    };
    const base = MAP[product._categoria] || "Repuestos";
    return product._subcategoria ? base + " > " + product._subcategoria : base;
  }

  const exportTiendaNubeCSV = (productos) => {
    const HEADERS = [
      '"Identificador de URL"', "Nombre", "Categorías", "Precio",
      '"Precio promocional"', '"Peso (kg)"', '"Alto (cm)"', '"Ancho (cm)"',
      '"Profundidad (cm)"', "Stock", "SKU", '"Código de barras"',
      '"Mostrar en tienda"', '"Envío sin cargo"', "Descripción", "Tags",
      '"Título para SEO"', '"Descripción para SEO"', "Marca",
      '"Producto Físico"', '"MPN (Número de pieza del fabricante)"',
      "Sexo", '"Rango de edad"', "Costo"
    ];

    const rows = productos.map(p => {
      const e = p._enriched || {};
      const precio = parseFloat((p.PRECIO || 0).toString().replace(",", ".")) || 0;
      const mostrar = precio > 0 ? "SI" : "NO";
      const slug = e.slug || slugify(p.PRODUCTO || "");
      const nombre = e.nombre_limpio || p.PRODUCTO || "";
      const categoria = e.categoria_tiendanube || buildCategoriaTN(p);
      const tags = Array.isArray(e.tags) ? e.tags.join(", ") : (e.tags || "");
      const desc = e.descripcion_html || "";
      const seoT = e.seo_titulo || nombre.substring(0, 70);
      const seoD = e.seo_descripcion || "";
      const marca = e.marca || "";
      const mpn = p["CODIGO EXTERNO"] || "";

      return [
        slug,
        `"${nombre.replace(/"/g, '""')}"`,
        `"${categoria}"`,
        precio > 0 ? precio.toFixed(2).replace(".", ",") : "",
        "",
        e.peso_kg || "", e.alto_cm || "", e.ancho_cm || "", e.profundidad_cm || "",
        "1",
        p.CODIGO || "",
        "",
        mostrar,
        "NO",
        `"${desc.replace(/"/g, '""')}"`,
        `"${tags}"`,
        `"${seoT.replace(/"/g, '""')}"`,
        `"${seoD.replace(/"/g, '""')}"`,
        marca,
        "SI",
        mpn,
        "", "", ""
      ].join(";");
    });

    const csv = [HEADERS.join(";"), ...rows].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tiendanube_repuestos.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ─── Historial functions ─────────────────────────────────────────────────

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryDetail(null);
    setView("history");
    try {
      const res = await fetch("/.netlify/functions/history");
      const data = await res.json();
      setHistoryList(Array.isArray(data) ? data : []);
    } catch (e) { console.log("Error cargando historial", e); }
    setHistoryLoading(false);
  };

  const loadHistoryDetail = async (id) => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/.netlify/functions/history?id=" + id);
      const data = await res.json();
      // Reconstruct _enriched from stored TN flat columns
      if (Array.isArray(data.products)) {
        data.products = data.products.map(p => {
          if (!p.slug && !p.nombre_limpio) return p;
          let parsedTags = p.tags;
          if (typeof p.tags === "string") {
            try { parsedTags = JSON.parse(p.tags); } catch (e) { parsedTags = p.tags; }
          }
          return {
            ...p,
            _enriched: {
              slug: p.slug || null,
              nombre_limpio: p.nombre_limpio || null,
              marca: p.marca || null,
              descripcion_html: p.descripcion_html || null,
              tags: parsedTags || [],
              seo_titulo: p.seo_titulo || null,
              seo_descripcion: p.seo_descripcion || null,
              peso_kg: p.peso_kg || null,
              alto_cm: p.alto_cm || null,
              ancho_cm: p.ancho_cm || null,
              profundidad_cm: p.profundidad_cm || null,
              categoria_tiendanube: p.categoria_tiendanube || null,
            },
          };
        });
      }
      setHistoryDetail(data);
      setHistoryPage(0);
      setHistoryFilter("ALL");
      setHistorySearch("");
      setView("historyDetail");
    } catch (e) { console.log("Error cargando análisis", e); }
    setHistoryLoading(false);
  };

  const saveAnalysis = async () => {
    setSavingAnalysis(true);
    try {
      const productos = classified.map(p => {
        const e = p._enriched || null;
        return {
          codigo: p.CODIGO || "",
          producto: p.PRODUCTO || "",
          rubro: p.RUBRO || "",
          sub_rubro: p["SUB RUBRO"] || "",
          clasificacion: p._manualClass || p._class.classification,
          fuente: p._manualClass ? "APRENDIDO" : (p._source || "REGLAS"),
          confianza: p._class.confidence || 0,
          category_id: p._category_id || null,
          subcategory_id: p._subcategory_id || null,
          tipo: p._tipo || null,
          // Datos enriquecidos de Tienda Nube (null si no se enriqueció con IA)
          slug: e ? (e.slug || null) : null,
          nombre_limpio: e ? (e.nombre_limpio || null) : null,
          marca: e ? (e.marca || null) : null,
          descripcion_html: e ? (e.descripcion_html || null) : null,
          tags: e ? (Array.isArray(e.tags) ? JSON.stringify(e.tags) : (e.tags || null)) : null,
          seo_titulo: e ? (e.seo_titulo || null) : null,
          seo_descripcion: e ? (e.seo_descripcion || null) : null,
          peso_kg: e ? (e.peso_kg || null) : null,
          alto_cm: e ? (e.alto_cm || null) : null,
          ancho_cm: e ? (e.ancho_cm || null) : null,
          profundidad_cm: e ? (e.profundidad_cm || null) : null,
          categoria_tiendanube: e ? (e.categoria_tiendanube || null) : null,
        };
      });
      await fetch("/.netlify/functions/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: saveModalName, productos }),
      });
      setSaveModalOpen(false);
      alert("Análisis guardado correctamente.");
    } catch (e) {
      console.log("Error guardando análisis", e);
      alert("Error al guardar el análisis.");
    }
    setSavingAnalysis(false);
  };

  const deleteAnalysis = async (id) => {
    try {
      await fetch("/.netlify/functions/history?id=" + id, { method: "DELETE" });
      setHistoryList(prev => prev.filter(a => a.id !== id));
      if (historyDetail && historyDetail.id === id) {
        setHistoryDetail(null);
        setView("history");
      }
    } catch (e) { console.log("Error eliminando análisis", e); }
    setDeleteModalId(null);
  };

  const renameAnalysis = async (id) => {
    if (!renameText.trim()) return;
    try {
      await fetch("/.netlify/functions/history?id=" + id, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: renameText }),
      });
      setHistoryList(prev => prev.map(a => a.id === id ? { ...a, nombre: renameText } : a));
      if (historyDetail && historyDetail.id === id) setHistoryDetail(prev => ({ ...prev, nombre: renameText }));
    } catch (e) { console.log("Error renombrando análisis", e); }
    setRenameId(null);
  };

  const resetApp = () => {
    aiAbort.current = true;
    setProducts([]); setClassified([]); setFilter("ALL"); setSearchTerm("");
    setView("upload"); setAiResults(null); setAiError(null); setPasteData("");
    setPage(0); setStats({}); setAiStatus("");
  };

  // ─── Category CRUD ───────────────────────────────────────────────────────

  const reloadCategories = async () => {
    try {
      const res = await fetch("/.netlify/functions/categories");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) { categoriesRef.current = data; setCategories(data); }
      }
    } catch (e) { console.log("Error recargando categorías", e); }
  };

  const saveCategory = async () => {
    if (!catModal || !catModal.data.nombre?.trim()) return;
    const { mode, data, categoryId } = catModal;
    try {
      if (mode === "new-cat") {
        await fetch("/.netlify/functions/categories", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: data.nombre, color: data.color, icono: data.icono, orden: data.orden || 0 }),
        });
      } else if (mode === "edit-cat") {
        await fetch("/.netlify/functions/categories?id=" + data.id + "&type=category", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: data.nombre, color: data.color, icono: data.icono }),
        });
      } else if (mode === "new-sub") {
        await fetch("/.netlify/functions/categories", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "subcategory", category_id: categoryId, nombre: data.nombre, keywords: data.keywords, descripcion: data.descripcion, orden: data.orden || 0 }),
        });
      } else if (mode === "edit-sub") {
        await fetch("/.netlify/functions/categories?id=" + data.id + "&type=subcategory", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: data.nombre, keywords: data.keywords, descripcion: data.descripcion }),
        });
      }
      await reloadCategories();
      setCatModal(null);
    } catch (e) { console.log("Error guardando categoría", e); }
  };

  const deleteCategoryItem = async () => {
    if (!catDeleteModal) return;
    const { id, type } = catDeleteModal;
    try {
      await fetch("/.netlify/functions/categories?id=" + id + "&type=" + type, { method: "DELETE" });
      await reloadCategories();
      setCatDeleteModal(null);
    } catch (e) { console.log("Error eliminando categoría", e); }
  };

  // ─── Filtering & sorting ─────────────────────────────────────────────────

  const lowConfidenceCount = classified.filter(p => !p._manualClass && p._class.confidence < 60).length;

  const filteredProducts = classified
    .filter(p => {
      if (filter === "REVIEW") {
        if (p._manualClass || p._class.confidence >= 60) return false;
      } else {
        const cls = p._manualClass || p._class.classification;
        if (filter !== "ALL" && cls !== filter) return false;
      }
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

  // ─── History detail filtering ────────────────────────────────────────────

  const historyProducts = historyDetail ? (historyDetail.products || []) : [];
  const filteredHistoryProducts = historyProducts.filter(p => {
    const cls = p.clasificacion || "OTRO";
    if (historyFilter !== "ALL" && cls !== historyFilter) return false;
    if (historySearch) {
      const s = historySearch.toLowerCase();
      return (p.producto || "").toLowerCase().includes(s) || (p.codigo || "").toLowerCase().includes(s);
    }
    return true;
  });
  const pagedHistoryProducts = filteredHistoryProducts.slice(historyPage * PAGE_SIZE, (historyPage + 1) * PAGE_SIZE);
  const totalHistoryPages = Math.ceil(filteredHistoryProducts.length / PAGE_SIZE);

  // ─── Components ──────────────────────────────────────────────────────────

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

      {/* ── Header ── */}
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
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Btn active={view === "history" || view === "historyDetail"} onClick={loadHistory}>📋 Historial</Btn>
          <Btn active={view === "categories"} onClick={() => setView("categories")}>🗂 Categorías</Btn>
          {classified.length > 0 && (
            <>
              <Btn active={view === "dashboard"} onClick={() => setView("dashboard")}>Dashboard</Btn>
              <Btn active={view === "table"} onClick={() => setView("table")}>Tabla</Btn>
              <button
                onClick={() => {
                  const today = new Date();
                  const dd = String(today.getDate()).padStart(2, "0");
                  const mm = String(today.getMonth() + 1).padStart(2, "0");
                  const yyyy = today.getFullYear();
                  setSaveModalName("Análisis " + dd + "/" + mm + "/" + yyyy);
                  setSaveModalOpen(true);
                }}
                style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: "1px solid " + C.accent, background: C.accentGlow, color: C.accent,
                  cursor: "pointer",
                }}>💾 Guardar</button>
              <select
                value=""
                onChange={(e) => { if (e.target.value) exportCSV(e.target.value); }}
                style={{
                  padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: "1px solid " + C.success, background: C.success + "18", color: C.success,
                  cursor: "pointer", outline: "none"
                }}
              >
                <option value="" disabled>📥 Exportar...</option>
                <option value="ALL" style={{ background: C.bg, color: C.text }}>Exportar Todos</option>
                <option value="REPUESTO" style={{ background: C.bg, color: C.text }}>Solo Repuestos</option>
                <option value="ACCESORIO" style={{ background: C.bg, color: C.text }}>Solo Accesorios</option>
                <option value="PRODUCTO_COMPLETO" style={{ background: C.bg, color: C.text }}>Solo Productos Completos</option>
                <option value="SERVICIO" style={{ background: C.bg, color: C.text }}>Solo Servicios</option>
                <option value="OTRO" style={{ background: C.bg, color: C.text }}>Solo Otros</option>
              </select>
              {classified.length > 0 && (
                <button
                  onClick={() => {
                    const presel = classified
                      .filter(p => ["REPUESTO", "ACCESORIO"].includes(p._manualClass || p._class.classification))
                      .map(p => p._id);
                    setExportSelected(presel);
                    setExportStep(1);
                    setView("exportTN");
                  }}
                  style={{
                    padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: "1px solid #10b981", background: "rgba(16,185,129,0.1)",
                    color: "#10b981", cursor: "pointer",
                  }}
                >🛒 Tienda Nube</button>
              )}
              <Btn onClick={resetApp} color={C.danger} active>Nueva carga</Btn>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px" }}>

        {/* ── Upload ── */}
        {view === "upload" && (
          <div className="fade-in" style={{ maxWidth: 680, margin: "40px auto" }}>
            <div style={{ textAlign: "center", marginBottom: 36 }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
              <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Cargá tus productos</h2>
              <p style={{ color: C.textMuted, fontSize: 14, lineHeight: 1.6, maxWidth: 480, margin: "0 auto" }}>
                Pegá los datos desde Google Sheets o subí un CSV. El sistema clasifica automáticamente.
              </p>
              {Object.keys(corrections).length > 0 && (
                <div style={{ marginTop: 12, fontSize: 13, color: C.aprendido }}>
                  📚 {Object.keys(corrections).length} correcciones aprendidas cargadas
                </div>
              )}
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

        {/* ── Dashboard ── */}
        {view === "dashboard" && !loading && classified.length > 0 && (
          <div className="fade-in">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, marginBottom: 28 }}>
              {[
                { label: "Total", value: classified.length, color: C.accent, icon: "📊", filter: "ALL" },
                { label: "Repuestos", value: stats.REPUESTO || 0, color: C.repuesto, icon: "⚙️", pct: true, filter: "REPUESTO" },
                { label: "Accesorios", value: stats.ACCESORIO || 0, color: C.accesorio, icon: "🔩", pct: true, filter: "ACCESORIO" },
                { label: "Completos", value: stats.PRODUCTO_COMPLETO || 0, color: C.completo, icon: "📦", pct: true, filter: "PRODUCTO_COMPLETO" },
                { label: "Aprendidos", value: stats._aprendidos || 0, color: C.aprendido, icon: "📚", filter: null },
              ].map(s => (
                <div key={s.label}
                  onClick={() => { if (s.filter) { setFilter(s.filter); setView("table"); setPage(0); } }}
                  style={{
                    cursor: s.filter ? "pointer" : "default",
                    background: C.surface, borderRadius: 14, border: "1px solid " + C.border,
                    padding: "18px 20px", position: "relative", overflow: "hidden", transition: "transform 0.2s",
                  }}
                  onMouseEnter={e => { if (s.filter) e.currentTarget.style.transform = "translateY(-3px)"; }}
                  onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                  <div style={{ position: "absolute", top: -20, right: -10, fontSize: 50, opacity: 0.06 }}>{s.icon}</div>
                  <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 500, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
                  {s.pct && classified.length > 0 && <div style={{ fontSize: 12, color: C.textDim, marginTop: 4 }}>{Math.round(s.value / classified.length * 100)}%</div>}
                </div>
              ))}
            </div>

            {lowConfidenceCount > 0 && (
              <div
                onClick={() => { setFilter("REVIEW"); setView("table"); setPage(0); }}
                style={{
                  background: C.danger + "15", border: "1px solid " + C.danger,
                  borderRadius: 14, padding: "16px 20px", marginBottom: 28,
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  cursor: "pointer", transition: "transform 0.2s"
                }}
                onMouseEnter={e => e.currentTarget.style.transform = "translateY(-3px)"}
                onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 24 }}>⚠️</div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.danger }}>Revisión Sugerida</div>
                    <div style={{ fontSize: 13, color: C.text }}>Hay {lowConfidenceCount} productos con baja confianza ({'< 60%'}).</div>
                  </div>
                </div>
                <button style={{
                  padding: "8px 16px", borderRadius: 8, border: "none", background: C.danger, color: "#fff",
                  fontSize: 13, fontWeight: 600, cursor: "pointer"
                }}>Revisar Ahora</button>
              </div>
            )}

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
                {Object.entries(stats).filter(([k, v]) => v > 0 && !k.startsWith("_")).map(([key, val]) => (
                  <div key={key} style={{ width: (val / classified.length * 100) + "%", background: (CLS[key] || CLS.OTRO).color, transition: "width .5s" }} />
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                {Object.entries(stats).filter(([k, v]) => v > 0 && !k.startsWith("_")).sort((a, b) => b[1] - a[1]).map(([key, val]) => (
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
                const sorted = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
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

            {/* Top categorías */}
            {classified.some(p => p._categoria) && (
              <div style={{ background: C.surface, borderRadius: 14, border: "1px solid " + C.border, padding: 20, marginBottom: 28 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Top Categorías</h3>
                {(() => {
                  const m = {};
                  classified.forEach(p => { if (p._categoria) m[p._categoria] = (m[p._categoria] || 0) + 1; });
                  const sorted = Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5);
                  const max = sorted[0]?.[1] || 1;
                  return sorted.map(([cat, count]) => {
                    const catObj = categories.find(c => c.nombre === cat);
                    return (
                      <div key={cat} style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                          <span style={{ color: C.textMuted }}>{catObj ? catObj.icono + " " : ""}{cat}</span>
                          <span style={{ fontWeight: 600, color: catObj ? catObj.color : C.accent }}>{count}</span>
                        </div>
                        <div style={{ height: 5, background: C.card, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: (count / max * 100) + "%", height: "100%", background: "linear-gradient(90deg," + (catObj ? catObj.color : C.accent) + "," + C.accent + ")", borderRadius: 3 }} />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}

            <button onClick={() => setView("table")} style={{
              width: "100%", padding: 14, borderRadius: 12, border: "1px solid " + C.border,
              background: C.surface, color: C.text, fontSize: 14, fontWeight: 600, cursor: "pointer",
            }}>Ver tabla completa →</button>
          </div>
        )}

        {/* ── Table ── */}
        {view === "table" && !loading && classified.length > 0 && (
          <div className="fade-in">
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <input type="text" placeholder="🔍 Buscar..."
                value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
                style={{ flex: 1, minWidth: 200, padding: "10px 14px", borderRadius: 10, border: "1px solid " + C.border, background: C.surface, color: C.text, fontSize: 13, outline: "none" }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border}
              />
              {["ALL", "REVIEW", "REPUESTO", "ACCESORIO", "PRODUCTO_COMPLETO", "SERVICIO", "OTRO"].map(f => {
                let label, icon, color, count;
                if (f === "ALL") { label = "Todos"; count = classified.length; color = C.accent; }
                else if (f === "REVIEW") { label = "Revisar"; icon = "⚠️"; count = lowConfidenceCount; color = C.danger; }
                else { label = (CLS[f] || {}).label || f; icon = (CLS[f] || {}).icon; count = stats[f] || 0; color = (CLS[f] || {}).color; }
                return (
                  <Btn key={f} active={filter === f} color={color} onClick={() => { setFilter(f); setPage(0); }}>
                    {(icon ? icon + " " : "") + label + " (" + count + ")"}
                  </Btn>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>
              {pagedProducts.length} de {filteredProducts.length} productos
            </div>

            <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid " + C.border }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.surface }}>
                    {[{ k: "producto", l: "Producto" }, { k: "rubro", l: "Rubro" }, { k: "clasificacion", l: "Clasificación" }, { k: "confidence", l: "Confianza" }].map(col => (
                      <th key={col.k} onClick={() => { if (sortBy === col.k) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col.k); setSortDir("desc"); } }} style={{
                        padding: "12px 14px", textAlign: "left", fontWeight: 600,
                        color: sortBy === col.k ? C.accent : C.textMuted, cursor: "pointer",
                        borderBottom: "1px solid " + C.border, fontSize: 11,
                        letterSpacing: "0.04em", textTransform: "uppercase", userSelect: "none",
                      }}>{col.l} {sortBy === col.k && (sortDir === "asc" ? "↑" : "↓")}</th>
                    ))}
                    {categories.length > 0 && (
                      <th style={{ padding: "12px 14px", textAlign: "left", fontWeight: 600, color: C.textMuted, borderBottom: "1px solid " + C.border, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Categoría</th>
                    )}
                    <th style={{ padding: "12px 14px", textAlign: "center", fontWeight: 600, color: C.textMuted, borderBottom: "1px solid " + C.border, fontSize: 11, textTransform: "uppercase" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedProducts.map((p, i) => {
                    const cls = p._manualClass || p._class.classification;
                    const cfg = CLS[cls] || CLS.OTRO;
                    const isAprendido = p._source === "APRENDIDO";
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
                              background: isAprendido ? C.aprendidoGlow : cfg.glow,
                              color: isAprendido ? C.aprendido : cfg.color,
                              border: "1px solid " + (isAprendido ? C.aprendido : cfg.color) + "25",
                            }}>
                              {isAprendido ? "📚" : cfg.icon} {cfg.label}
                              {p._manualClass && <span style={{ fontSize: 10, opacity: 0.7 }}>✎</span>}
                              {p._aiClass && !isAprendido && <span style={{ fontSize: 10, opacity: 0.7 }}>🤖</span>}
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
                        {categories.length > 0 && (
                          <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border, minWidth: 160 }}>
                            {editingId === p._id ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <select value={p._categoria || ""} onChange={e => handleManualCategory(p._id, "categoria", e.target.value)}
                                  style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid " + C.border, background: C.bg, color: C.text, fontSize: 12, outline: "none", width: "100%" }}>
                                  <option value="">Sin categoría</option>
                                  {categories.map(c => <option key={c.id} value={c.nombre}>{c.icono} {c.nombre}</option>)}
                                </select>
                                {p._categoria && (
                                  <select value={p._subcategoria || ""} onChange={e => handleManualCategory(p._id, "subcategoria", e.target.value)}
                                    style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid " + C.border, background: C.bg, color: C.text, fontSize: 12, outline: "none", width: "100%" }}>
                                    <option value="">Sin subcategoría</option>
                                    {(categories.find(c => c.nombre === p._categoria)?.subcategories || []).map(s => (
                                      <option key={s.id} value={s.nombre}>{s.nombre}</option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            ) : (
                              <div>
                                {p._categoria ? (
                                  <>
                                    <div style={{ fontSize: 12, color: C.textMuted }}>{p._categoria}</div>
                                    {p._subcategoria && <div style={{ fontSize: 11, color: C.textDim }}>↳ {p._subcategoria}</div>}
                                    {p._tipo && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: C.accentGlow, color: C.accent, marginTop: 2, display: "inline-block" }}>{p._tipo}</span>}
                                  </>
                                ) : <span style={{ color: C.textDim, fontSize: 12 }}>—</span>}
                              </div>
                            )}
                          </td>
                        )}
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

        {/* ── History List ── */}
        {view === "history" && (
          <div className="fade-in">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>📋 Historial de Análisis</h2>
              {classified.length > 0 && (
                <Btn active onClick={() => setView("dashboard")}>← Volver al análisis</Btn>
              )}
            </div>

            {historyLoading && (
              <div style={{ textAlign: "center", padding: 40, color: C.textMuted }}>
                <div style={{ fontSize: 24, animation: "pulse 1.5s infinite", marginBottom: 8 }}>⏳</div>
                Cargando historial...
              </div>
            )}

            {!historyLoading && historyList.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: C.textDim }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Sin análisis guardados</div>
                <div style={{ fontSize: 13 }}>Cargá productos y usá el botón 💾 Guardar para crear un análisis.</div>
              </div>
            )}

            {!historyLoading && historyList.map(a => (
              <div key={a.id} style={{
                background: C.surface, borderRadius: 14, border: "1px solid " + C.border,
                padding: "18px 20px", marginBottom: 12,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1 }}>
                    {renameId === a.id ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <input
                          value={renameText}
                          onChange={e => setRenameText(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") renameAnalysis(a.id); if (e.key === "Escape") setRenameId(null); }}
                          autoFocus
                          style={{ flex: 1, padding: "6px 10px", borderRadius: 8, border: "1px solid " + C.accent, background: C.bg, color: C.text, fontSize: 14, outline: "none" }}
                        />
                        <button onClick={() => renameAnalysis(a.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12, cursor: "pointer" }}>Guardar</button>
                        <button onClick={() => setRenameId(null)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid " + C.border, background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer" }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{a.nombre}</div>
                    )}
                    <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>{fmtDate(a.created_at)}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      <span style={{ fontSize: 12, color: C.textMuted }}>📊 <strong style={{ color: C.text }}>{a.total}</strong> productos</span>
                      {a.repuestos > 0 && <span style={{ fontSize: 12, color: C.repuesto }}>⚙️ {a.repuestos}</span>}
                      {a.accesorios > 0 && <span style={{ fontSize: 12, color: C.accesorio }}>🔩 {a.accesorios}</span>}
                      {a.completos > 0 && <span style={{ fontSize: 12, color: C.completo }}>📦 {a.completos}</span>}
                      {a.aprendidos > 0 && <span style={{ fontSize: 12, color: C.aprendido }}>📚 {a.aprendidos} aprendidos</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => loadHistoryDetail(a.id)} style={{
                      padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                      border: "1px solid " + C.accent, background: C.accentGlow, color: C.accent, cursor: "pointer",
                    }}>Ver</button>
                    <button onClick={() => { setRenameId(a.id); setRenameText(a.nombre); }} style={{
                      padding: "7px 10px", borderRadius: 8, fontSize: 12,
                      border: "1px solid " + C.border, background: "transparent", color: C.textMuted, cursor: "pointer",
                    }}>✏️</button>
                    <button onClick={() => setDeleteModalId(a.id)} style={{
                      padding: "7px 10px", borderRadius: 8, fontSize: 12,
                      border: "1px solid " + C.danger + "40", background: "transparent", color: C.danger, cursor: "pointer",
                    }}>🗑</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── History Detail ── */}
        {view === "historyDetail" && historyDetail && (
          <div className="fade-in">
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <button onClick={() => { setView("history"); loadHistory(); }} style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 13,
                border: "1px solid " + C.border, background: "transparent", color: C.textMuted, cursor: "pointer",
              }}>← Volver</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{historyDetail.nombre}</div>
                <div style={{ fontSize: 12, color: C.textDim }}>{fmtDate(historyDetail.created_at)}</div>
              </div>
              <button onClick={() => exportHistoryCSV(historyProducts)} style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: "1px solid " + C.success, background: C.success + "18", color: C.success, cursor: "pointer",
              }}>📥 Descargar CSV</button>
              {historyProducts.some(p => p._enriched) && (
                <button onClick={() => exportHistoryTiendaNubeCSV(historyProducts)} style={{
                  padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  border: "1px solid #10b981", background: "rgba(16,185,129,0.1)",
                  color: "#10b981", cursor: "pointer",
                }}>🛒 CSV Tienda Nube</button>
              )}
              <button onClick={() => setDeleteModalId(historyDetail.id)} style={{
                padding: "7px 14px", borderRadius: 8, fontSize: 12,
                border: "1px solid " + C.danger + "40", background: "transparent", color: C.danger, cursor: "pointer",
              }}>🗑 Eliminar</button>
            </div>

            {/* Stats cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginBottom: 24 }}>
              {[
                { label: "Total", value: historyDetail.total || 0, color: C.accent, icon: "📊" },
                { label: "Repuestos", value: historyDetail.repuestos || 0, color: C.repuesto, icon: "⚙️" },
                { label: "Accesorios", value: historyDetail.accesorios || 0, color: C.accesorio, icon: "🔩" },
                { label: "Completos", value: historyDetail.completos || 0, color: C.completo, icon: "📦" },
                { label: "Aprendidos", value: historyDetail.aprendidos || 0, color: C.aprendido, icon: "📚" },
              ].map(s => (
                <div key={s.label} style={{
                  background: C.surface, borderRadius: 12, border: "1px solid " + C.border, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 4 }}>{s.icon} {s.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <input type="text" placeholder="🔍 Buscar..."
                value={historySearch} onChange={e => { setHistorySearch(e.target.value); setHistoryPage(0); }}
                style={{ flex: 1, minWidth: 200, padding: "9px 14px", borderRadius: 10, border: "1px solid " + C.border, background: C.surface, color: C.text, fontSize: 13, outline: "none" }}
                onFocus={e => e.target.style.borderColor = C.accent}
                onBlur={e => e.target.style.borderColor = C.border}
              />
              {["ALL", "REPUESTO", "ACCESORIO", "PRODUCTO_COMPLETO", "SERVICIO", "OTRO"].map(f => {
                const label = f === "ALL" ? "Todos" : (CLS[f] || {}).label || f;
                const color = f === "ALL" ? C.accent : (CLS[f] || {}).color;
                return (
                  <Btn key={f} active={historyFilter === f} color={color} onClick={() => { setHistoryFilter(f); setHistoryPage(0); }}>
                    {label}
                  </Btn>
                );
              })}
            </div>

            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 10 }}>
              {pagedHistoryProducts.length} de {filteredHistoryProducts.length} productos
            </div>

            <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid " + C.border }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.surface }}>
                    {["Producto", "Rubro", "Clasificación", "Fuente"].map(col => (
                      <th key={col} style={{ padding: "11px 14px", textAlign: "left", fontWeight: 600, color: C.textMuted, borderBottom: "1px solid " + C.border, fontSize: 11, textTransform: "uppercase" }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedHistoryProducts.map((p, i) => {
                    const cls = p.clasificacion || "OTRO";
                    const cfg = CLS[cls] || CLS.OTRO;
                    const isAprendido = p.fuente === "APRENDIDO";
                    return (
                      <tr key={p.id || i} style={{ background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border, maxWidth: 360 }}>
                          <div style={{ fontWeight: 500, lineHeight: 1.4 }}>{p.producto || "—"}</div>
                          <div style={{ fontSize: 11, color: C.textDim, fontFamily: "'JetBrains Mono',monospace" }}>{p.codigo}</div>
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border, color: C.textMuted }}>
                          <div>{p.rubro || "—"}</div>
                          {p.sub_rubro && <div style={{ fontSize: 11, color: C.textDim }}>{p.sub_rubro}</div>}
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border }}>
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                            background: isAprendido ? C.aprendidoGlow : cfg.glow,
                            color: isAprendido ? C.aprendido : cfg.color,
                            border: "1px solid " + (isAprendido ? C.aprendido : cfg.color) + "25",
                          }}>
                            {isAprendido ? "📚" : cfg.icon} {cfg.label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid " + C.border }}>
                          <span style={{ fontSize: 11, color: isAprendido ? C.aprendido : p.fuente === "IA" ? C.accent : C.textDim, fontWeight: 500 }}>
                            {p.fuente || "REGLAS"}
                          </span>
                          <div style={{ fontSize: 11, color: C.textDim }}>{p.confianza}%</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalHistoryPages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 18, fontSize: 13 }}>
                <button onClick={() => setHistoryPage(p => Math.max(0, p - 1))} disabled={historyPage === 0} style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid " + C.border,
                  background: "transparent", color: historyPage === 0 ? C.textDim : C.text, cursor: historyPage === 0 ? "default" : "pointer",
                }}>← Anterior</button>
                <span style={{ color: C.textMuted }}>Pág {historyPage + 1}/{totalHistoryPages}</span>
                <button onClick={() => setHistoryPage(p => Math.min(totalHistoryPages - 1, p + 1))} disabled={historyPage >= totalHistoryPages - 1} style={{
                  padding: "6px 14px", borderRadius: 8, border: "1px solid " + C.border,
                  background: "transparent", color: historyPage >= totalHistoryPages - 1 ? C.textDim : C.text, cursor: historyPage >= totalHistoryPages - 1 ? "default" : "pointer",
                }}>Siguiente →</button>
              </div>
            )}
          </div>
        )}

        {/* ── Categories Management ── */}
        {view === "categories" && (
          <div className="fade-in">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>🗂 Gestión de Categorías</h2>
              <button onClick={() => setCatModal({ mode: "new-cat", data: { nombre: "", color: "#3b82f6", icono: "📦", orden: 0 } })} style={{
                padding: "9px 18px", borderRadius: 10, border: "none",
                background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>+ Nueva Categoría</button>
            </div>

            {categories.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: C.textDim, background: C.surface, borderRadius: 14, border: "1px solid " + C.border }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🗂</div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Sin categorías cargadas</div>
                <div style={{ fontSize: 13 }}>Ejecutá el SQL en Supabase y recargá la página.</div>
              </div>
            )}

            {categories.map(cat => (
              <div key={cat.id} style={{
                background: C.surface, borderRadius: 14, border: "1px solid " + C.border,
                padding: "18px 20px", marginBottom: 14,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: (cat.subcategories || []).length > 0 ? 14 : 0 }}>
                  <span style={{ fontSize: 20 }}>{cat.icono}</span>
                  <div style={{ width: 12, height: 12, borderRadius: 3, background: cat.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 700, fontSize: 16, flex: 1, color: C.text }}>{cat.nombre}</span>
                  <span style={{ fontSize: 12, color: C.textDim }}>{(cat.subcategories || []).length} subcategorías</span>
                  <button onClick={() => setCatModal({ mode: "edit-cat", data: { ...cat } })} style={{
                    padding: "5px 10px", borderRadius: 6, border: "1px solid " + C.border,
                    background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 12,
                  }}>✏️</button>
                  <button onClick={() => setCatDeleteModal({ id: cat.id, type: "category", nombre: cat.nombre })} style={{
                    padding: "5px 10px", borderRadius: 6, border: "1px solid " + C.danger + "40",
                    background: "transparent", color: C.danger, cursor: "pointer", fontSize: 12,
                  }}>🗑</button>
                </div>

                <div style={{ paddingLeft: 20 }}>
                  {(cat.subcategories || []).map(sub => (
                    <div key={sub.id} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
                      borderRadius: 8, marginBottom: 4, background: C.card,
                    }}>
                      <span style={{ color: C.textDim, fontSize: 11, flexShrink: 0 }}>├─</span>
                      <span style={{ fontWeight: 600, fontSize: 14, color: C.text, minWidth: 120 }}>{sub.nombre}</span>
                      {sub.keywords && (
                        <span style={{ fontSize: 11, color: C.textDim, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {sub.keywords}
                        </span>
                      )}
                      <button onClick={() => setCatModal({ mode: "edit-sub", data: { ...sub }, categoryId: cat.id })} style={{
                        padding: "4px 8px", borderRadius: 6, border: "1px solid " + C.border,
                        background: "transparent", color: C.textMuted, cursor: "pointer", fontSize: 11, flexShrink: 0,
                      }}>✏️</button>
                      <button onClick={() => setCatDeleteModal({ id: sub.id, type: "subcategory", nombre: sub.nombre })} style={{
                        padding: "4px 8px", borderRadius: 6, border: "1px solid " + C.danger + "40",
                        background: "transparent", color: C.danger, cursor: "pointer", fontSize: 11, flexShrink: 0,
                      }}>🗑</button>
                    </div>
                  ))}
                  <button onClick={() => setCatModal({ mode: "new-sub", data: { nombre: "", keywords: "", descripcion: "", orden: 0 }, categoryId: cat.id })} style={{
                    marginTop: 6, padding: "7px 14px", borderRadius: 8, border: "1px dashed " + C.border,
                    background: "transparent", color: C.textDim, cursor: "pointer", fontSize: 12,
                    width: "100%", textAlign: "left",
                  }}>+ Subcategoría</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Vista: Exportar a Tienda Nube ── */}
      {view === "exportTN" && !loading && (
        <div className="fade-in" style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 0" }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>🛒 Exportar a Tienda Nube</div>
            <div style={{ fontSize: 13, color: C.textMuted }}>Generá el CSV listo para importar en tu tienda</div>
          </div>

          {/* Stepper */}
          <div style={{ display: "flex", gap: 8, marginBottom: 28, alignItems: "center" }}>
            {[
              { n: 1, label: "Seleccionar" },
              { n: 2, label: "Enriquecer con IA" },
              { n: 3, label: "Descargar CSV" },
            ].map((s, i) => (
              <React.Fragment key={s.n}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
                  borderRadius: 8, fontSize: 13, fontWeight: exportStep === s.n ? 600 : 400,
                  background: exportStep === s.n ? C.accentGlow : "transparent",
                  border: "1px solid " + (exportStep === s.n ? C.accent : C.border),
                  color: exportStep >= s.n ? (exportStep === s.n ? C.accent : C.text) : C.textDim,
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%", display: "flex",
                    alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                    background: exportStep > s.n ? C.success : exportStep === s.n ? C.accent : C.card,
                    color: "#fff",
                  }}>{exportStep > s.n ? "✓" : s.n}</span>
                  {s.label}
                </div>
                {i < 2 && <div style={{ flex: 1, height: 1, background: C.border }} />}
              </React.Fragment>
            ))}
          </div>

          {/* PASO 1: Seleccionar */}
          {exportStep === 1 && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>
                  {exportSelected.length} de {classified.length} productos seleccionados
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setExportSelected(classified.map(p => p._id))} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + C.border, background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer" }}>Seleccionar todos</button>
                  <button onClick={() => setExportSelected(classified.filter(p => ["REPUESTO", "ACCESORIO"].includes(p._manualClass || p._class.classification)).map(p => p._id))} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + C.accent, background: C.accentGlow, color: C.accent, fontSize: 12, cursor: "pointer" }}>Solo Repuestos y Accesorios</button>
                  <button onClick={() => setExportSelected([])} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid " + C.border, background: "transparent", color: C.textMuted, fontSize: 12, cursor: "pointer" }}>Ninguno</button>
                </div>
              </div>
              <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid " + C.border, maxHeight: 480, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ position: "sticky", top: 0 }}>
                    <tr style={{ background: C.surface }}>
                      <th style={{ padding: "10px 14px", width: 40 }}>
                        <input type="checkbox"
                          checked={exportSelected.length === classified.length && classified.length > 0}
                          onChange={e => setExportSelected(e.target.checked ? classified.map(p => p._id) : [])}
                        />
                      </th>
                      {["Producto", "Clasificación", "Categoría"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: C.textMuted, borderBottom: "1px solid " + C.border, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {classified.map((p, i) => {
                      const cls = p._manualClass || p._class.classification;
                      const cfg = CLS[cls] || CLS.OTRO;
                      const selected = exportSelected.includes(p._id);
                      return (
                        <tr key={p._id}
                          onClick={() => setExportSelected(prev => prev.includes(p._id) ? prev.filter(id => id !== p._id) : [...prev, p._id])}
                          style={{ background: selected ? C.accentGlow : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)", cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.background = selected ? C.accentGlow : C.surfaceHover}
                          onMouseLeave={e => e.currentTarget.style.background = selected ? C.accentGlow : i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}
                        >
                          <td style={{ padding: "8px 14px", borderBottom: "1px solid " + C.border }}>
                            <input type="checkbox" checked={selected} onChange={() => {}} onClick={e => e.stopPropagation()} />
                          </td>
                          <td style={{ padding: "8px 14px", borderBottom: "1px solid " + C.border }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{p.PRODUCTO || "—"}</div>
                            <div style={{ fontSize: 11, color: C.textDim, fontFamily: "'JetBrains Mono',monospace" }}>{p.CODIGO}</div>
                          </td>
                          <td style={{ padding: "8px 14px", borderBottom: "1px solid " + C.border }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: cfg.glow, color: cfg.color }}>
                              {cfg.icon} {cfg.label}
                            </span>
                          </td>
                          <td style={{ padding: "8px 14px", borderBottom: "1px solid " + C.border, color: C.textMuted, fontSize: 12 }}>
                            {p._categoria ? `${p._categoria}${p._subcategoria ? " > " + p._subcategoria : ""}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button onClick={() => setView("dashboard")} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid " + C.border, background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
                <button
                  onClick={() => setExportStep(2)}
                  disabled={exportSelected.length === 0}
                  style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: exportSelected.length > 0 ? C.accent : C.card, color: "#fff", fontSize: 13, fontWeight: 600, cursor: exportSelected.length > 0 ? "pointer" : "default" }}
                >Siguiente → ({exportSelected.length} productos)</button>
              </div>
            </div>
          )}

          {/* PASO 2: Enriquecer con IA */}
          {exportStep === 2 && (
            <div>
              <div style={{ background: C.surface, borderRadius: 14, border: "1px solid " + C.border, padding: 24, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>🤖 Enriquecer con IA</div>
                <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
                  La IA va a generar para cada producto: nombre normalizado, descripción HTML, tags SEO, marca, peso y dimensiones estimadas, y categoría para Tienda Nube.<br />
                  <strong style={{ color: C.text }}>{exportSelected.length} productos seleccionados.</strong> Procesamiento en lotes de 15 (~3s entre lotes).
                </div>
                {!enrichLoading && enrichedCount === 0 && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      onClick={() => {
                        const sel = classified.filter(p => exportSelected.includes(p._id));
                        runEnrich(sel);
                      }}
                      style={{ padding: "11px 24px", borderRadius: 10, border: "none", background: "linear-gradient(135deg," + C.accent + "," + C.repuesto + ")", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >🚀 Enriquecer con IA</button>
                    <button
                      onClick={() => setExportStep(3)}
                      style={{ padding: "11px 20px", borderRadius: 10, border: "1px solid " + C.border, background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer" }}
                    >Saltar → exportar sin IA</button>
                  </div>
                )}
                {enrichLoading && (
                  <div>
                    <div style={{ fontSize: 13, color: C.accent, marginBottom: 8 }}>{enrichStatus}</div>
                    <div style={{ height: 6, background: C.card, borderRadius: 3, overflow: "hidden", marginBottom: 12 }}>
                      <div style={{ width: (enrichedCount / Math.max(exportSelected.length, 1) * 100) + "%", height: "100%", borderRadius: 3, transition: "width 0.5s", background: "linear-gradient(90deg," + C.accent + "," + C.success + ")" }} />
                    </div>
                    <div style={{ fontSize: 12, color: C.textDim, marginBottom: 12 }}>{enrichedCount} de {exportSelected.length} productos · ~{Math.round((exportSelected.length - enrichedCount) / 15 * 4)}s restantes</div>
                    <button onClick={() => { enrichAbort.current = true; }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid " + C.danger, background: "transparent", color: C.danger, fontSize: 12, cursor: "pointer" }}>⏹ Parar</button>
                  </div>
                )}
                {!enrichLoading && enrichedCount > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ color: C.success, fontSize: 13, fontWeight: 600 }}>✅ {enrichedCount} productos enriquecidos</span>
                    <button onClick={() => setExportStep(3)} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Ver CSV →</button>
                  </div>
                )}
              </div>
              <button onClick={() => setExportStep(1)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid " + C.border, background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer" }}>← Volver</button>
            </div>
          )}

          {/* PASO 3: Descargar */}
          {exportStep === 3 && (
            <div>
              <div style={{ background: C.surface, borderRadius: 14, border: "1px solid " + C.border, padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>✅ CSV listo para importar</div>
                <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
                  {exportSelected.length} productos · {classified.filter(p => exportSelected.includes(p._id) && p._enriched).length} enriquecidos con IA
                </div>
                {/* Preview primeras 3 filas */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Preview (primeras 3 filas):</div>
                  <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid " + C.border }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead>
                        <tr style={{ background: C.card }}>
                          {["URL", "Nombre", "Categoría", "Precio", "SKU", "Mostrar"].map(h => (
                            <th key={h} style={{ padding: "6px 10px", textAlign: "left", color: C.textMuted, whiteSpace: "nowrap", fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {classified.filter(p => exportSelected.includes(p._id)).slice(0, 3).map((p, i) => {
                          const e = p._enriched || {};
                          const precio = parseFloat((p.PRECIO || 0).toString().replace(",", ".")) || 0;
                          return (
                            <tr key={i} style={{ borderTop: "1px solid " + C.border }}>
                              <td style={{ padding: "6px 10px", color: C.textDim, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.slug || slugify(p.PRODUCTO || "")}</td>
                              <td style={{ padding: "6px 10px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.nombre_limpio || p.PRODUCTO}</td>
                              <td style={{ padding: "6px 10px", color: C.textMuted, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.categoria_tiendanube || buildCategoriaTN(p)}</td>
                              <td style={{ padding: "6px 10px", color: C.success }}>{precio > 0 ? "$" + precio.toLocaleString("es-AR") : "—"}</td>
                              <td style={{ padding: "6px 10px", color: C.textDim, fontFamily: "'JetBrains Mono',monospace" }}>{p.CODIGO}</td>
                              <td style={{ padding: "6px 10px" }}><span style={{ color: precio > 0 ? C.success : C.danger, fontWeight: 600 }}>{precio > 0 ? "SI" : "NO"}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={() => exportTiendaNubeCSV(classified.filter(p => exportSelected.includes(p._id)))}
                    style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: C.success, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                  >📥 Descargar CSV para Tienda Nube</button>
                </div>
                <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: C.accentGlow, border: "1px solid " + C.accent + "40", fontSize: 12, color: C.accent }}>
                  📌 En Tienda Nube: <strong>Productos → Importar → seleccionar CSV</strong>. Las imágenes se agregan por separado desde el producto.
                </div>
              </div>
              <button onClick={() => setExportStep(2)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid " + C.border, background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer" }}>← Volver</button>
            </div>
          )}
        </div>
      )}

      {/* ── Modal: Categoría ── */}
      {catModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={e => { if (e.target === e.currentTarget) setCatModal(null); }}>
          <div style={{ background: C.surface, borderRadius: 16, border: "1px solid " + C.border, padding: 28, width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>
              {catModal.mode === "new-cat" ? "+ Nueva Categoría" :
               catModal.mode === "edit-cat" ? "✏️ Editar Categoría" :
               catModal.mode === "new-sub" ? "+ Nueva Subcategoría" : "✏️ Editar Subcategoría"}
            </div>

            <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 6 }}>Nombre</label>
            <input
              autoFocus
              value={catModal.data.nombre || ""}
              onChange={e => setCatModal(m => ({ ...m, data: { ...m.data, nombre: e.target.value } }))}
              onKeyDown={e => { if (e.key === "Enter") saveCategory(); if (e.key === "Escape") setCatModal(null); }}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid " + C.border, background: C.bg, color: C.text, fontSize: 14, outline: "none", marginBottom: 14 }}
            />

            {(catModal.mode === "new-cat" || catModal.mode === "edit-cat") && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 6 }}>Ícono (emoji)</label>
                <input
                  value={catModal.data.icono || ""}
                  onChange={e => setCatModal(m => ({ ...m, data: { ...m.data, icono: e.target.value } }))}
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid " + C.border, background: C.bg, color: C.text, fontSize: 20, outline: "none", marginBottom: 14 }}
                />
                <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 8 }}>Color</label>
                <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                  {["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4"].map(color => (
                    <div key={color} onClick={() => setCatModal(m => ({ ...m, data: { ...m.data, color } }))} style={{
                      width: 28, height: 28, borderRadius: 8, background: color, cursor: "pointer",
                      border: catModal.data.color === color ? "3px solid #fff" : "3px solid transparent",
                      transition: "border 0.1s", boxSizing: "border-box",
                    }} />
                  ))}
                </div>
              </>
            )}

            {(catModal.mode === "new-sub" || catModal.mode === "edit-sub") && (
              <>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 6 }}>Keywords (ayudan a la IA a clasificar)</label>
                <textarea
                  value={catModal.data.keywords || ""}
                  onChange={e => setCatModal(m => ({ ...m, data: { ...m.data, keywords: e.target.value } }))}
                  placeholder="caldera, radiador, termocupla, diafragma..."
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid " + C.border, background: C.bg, color: C.text, fontSize: 13, outline: "none", minHeight: 80, resize: "vertical", marginBottom: 14 }}
                />
              </>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setCatModal(null)} style={{
                padding: "9px 18px", borderRadius: 10, border: "1px solid " + C.border,
                background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer",
              }}>Cancelar</button>
              <button onClick={saveCategory} disabled={!catModal.data.nombre?.trim()} style={{
                padding: "9px 22px", borderRadius: 10, border: "none",
                background: catModal.data.nombre?.trim() ? C.accent : C.card,
                color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: catModal.data.nombre?.trim() ? "pointer" : "default",
              }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Eliminar categoría ── */}
      {catDeleteModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={e => { if (e.target === e.currentTarget) setCatDeleteModal(null); }}>
          <div style={{ background: C.surface, borderRadius: 16, border: "1px solid " + C.border, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>🗑 Eliminar</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.6 }}>
              ¿Eliminar <strong style={{ color: C.text }}>{catDeleteModal.nombre}</strong>?
              {catDeleteModal.type === "category" && (
                <span style={{ color: C.danger }}> Esto también eliminará todas sus subcategorías.</span>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setCatDeleteModal(null)} style={{
                padding: "9px 18px", borderRadius: 10, border: "1px solid " + C.border,
                background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer",
              }}>Cancelar</button>
              <button onClick={deleteCategoryItem} style={{
                padding: "9px 22px", borderRadius: 10, border: "none",
                background: C.danger, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Guardar análisis ── */}
      {saveModalOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={e => { if (e.target === e.currentTarget) setSaveModalOpen(false); }}>
          <div style={{ background: C.surface, borderRadius: 16, border: "1px solid " + C.border, padding: 28, width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>💾 Guardar Análisis</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
              Se guardarán {classified.length} productos con sus clasificaciones actuales.
            </div>
            <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 6 }}>Nombre del análisis</label>
            <input
              value={saveModalName}
              onChange={e => setSaveModalName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && saveModalName.trim()) saveAnalysis(); }}
              autoFocus
              style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid " + C.border, background: C.bg, color: C.text, fontSize: 14, outline: "none", marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setSaveModalOpen(false)} style={{
                padding: "9px 18px", borderRadius: 10, border: "1px solid " + C.border,
                background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer",
              }}>Cancelar</button>
              <button onClick={saveAnalysis} disabled={!saveModalName.trim() || savingAnalysis} style={{
                padding: "9px 22px", borderRadius: 10, border: "none",
                background: saveModalName.trim() ? C.accent : C.card,
                color: "#fff", fontSize: 13, fontWeight: 600, cursor: saveModalName.trim() ? "pointer" : "default",
              }}>{savingAnalysis ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar eliminación ── */}
      {deleteModalId !== null && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
        }} onClick={e => { if (e.target === e.currentTarget) setDeleteModalId(null); }}>
          <div style={{ background: C.surface, borderRadius: 16, border: "1px solid " + C.border, padding: 28, width: "100%", maxWidth: 400 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>🗑 Eliminar Análisis</div>
            <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 24, lineHeight: 1.6 }}>
              ¿Estás seguro que querés eliminar este análisis? Esta acción no se puede deshacer y se borrarán todos los productos asociados.
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setDeleteModalId(null)} style={{
                padding: "9px 18px", borderRadius: 10, border: "1px solid " + C.border,
                background: "transparent", color: C.textMuted, fontSize: 13, cursor: "pointer",
              }}>Cancelar</button>
              <button onClick={() => deleteAnalysis(deleteModalId)} style={{
                padding: "9px 22px", borderRadius: 10, border: "none",
                background: C.danger, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
