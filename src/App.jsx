import React, { useState, useEffect, useRef } from "react";
import { C, CLS } from "./constants";
import { exportCSV, exportTiendaNubeCSV, getProductPrice, apiFetch } from "./utils";

// Components
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Modal from "./components/Modal";
import { useToast, ToastContainer } from "./components/Toast";
import ActionButton from "./components/ActionButton";

// Hooks
import useCorrections from "./hooks/useCorrections";
import useHistory from "./hooks/useHistory";
import useClassification from "./hooks/useClassification";
import useTnCategories from "./hooks/useTnCategories";

// Views
import HomeView from "./views/HomeView";
import UploadView from "./views/UploadView";
import DashboardView from "./views/DashboardView";
import TableView from "./views/TableView";
import ExportView from "./views/ExportView";
import HistoryView from "./views/HistoryView";
import HistoryDetailView from "./views/HistoryDetailView";
import LearningView from "./views/LearningView";
import ClassificationView from "./views/ClassificationView";
import TnCategoriesView from "./views/TnCategoriesView";
import TnLearningView from "./views/TnLearningView";
import SettingsView from "./views/SettingsView";

const SESSION_KEY = "hvac_session";

export default function ProductClassifier() {
  const toast = useToast();

  const [view, setView] = useState(() => {
    return localStorage.getItem("hvac_last_view") || "home";
  });
  
  // Active session products
  const [products, setProducts] = useState([]);
  const [classified, setClassified] = useState([]);
  const [stats, setStats] = useState({});
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [loading, setLoading] = useState(false);

  // Modals state
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalName, setSaveModalName] = useState("");

  // Search & Filter state (for active table workspace)
  const [filter, setFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);

  // Table selection count (lifted for Topbar badge)
  const [tableSelectedCount, setTableSelectedCount] = useState(0);

  // ─── Custom database / engine hooks ───────────────────────────────────────
  const {
    corrections,
    correctionsFull,
    correctionsList,
    loaded: correctionsLoaded,
    saveCorrection,
    deleteCorrection,
    importBulkCorrections,
    clearAllCorrections,
  } = useCorrections();

  const {
    tnCategories,
    loading: tnCatLoading,
    loadTnCategories,
    saveTnCategory,
    deleteTnCategory,
  } = useTnCategories();

  const {
    historyList,
    historyDetail,
    setHistoryDetail,
    saveAnalysis,
    deleteAnalysis,
    renameAnalysis,
    updateHistoryProduct,
    loadHistory,
    loadHistoryDetail,
  } = useHistory();

  // ─── TN Corrections (categoría Tienda Nube aprendida) ──────────────────────
  const [tnCorrections, setTNCorrections] = useState(() => {
    try {
      const cached = localStorage.getItem("tn_corrections_cache");
      return cached ? JSON.parse(cached) : {};
    } catch { return {}; }
  });
  const [tnCorrectionsList, setTNCorrectionsList] = useState([]);

  const {
    rules,
    aiLoading,
    aiStatus,
    aiError,
    aiProcessed,
    saveRule,
    deleteRule,
    resetRulesToDefault,
    processProductsChunked,
    runAI,
    stopAI,
  } = useClassification();

  // ─── Persistencia de Sesión (localStorage) ──────────────────────────────
  const saveSession = (classifiedData) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        classified: classifiedData,
        savedAt: new Date().toISOString(),
      }));
    } catch (e) {
      console.warn("localStorage lleno o bloqueado", e);
    }
  };

  const loadSession = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Expirar sesiones de más de 7 días
      if (new Date() - new Date(data.savedAt) > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return data.classified || [];
    } catch {
      return null;
    }
  };

  // Restore session on mount + load TN corrections
  useEffect(() => {
    // Limpiar cache obsoleto de categorías internas
    localStorage.removeItem("categories_cache");

    const sessionData = loadSession();
    if (sessionData && sessionData.length > 0) {
      setClassified(sessionData);
      recalculateStats(sessionData);
    }

    // Load TN corrections from API (mapa para lookup rápido + lista para vista)
    fetch("/api/tn-corrections")
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const map = {};
          data.forEach(c => { if (c.codigo) map[c.codigo.toLowerCase()] = c.categoria_tiendanube; });
          setTNCorrections(map);
          setTNCorrectionsList(data);
          localStorage.setItem("tn_corrections_cache", JSON.stringify(map));
        }
      })
      .catch(() => {});
  }, []);

  // Recalculate stats helper
  const recalculateStats = (list) => {
    const s = {};
    let aprendidos = 0;
    list.forEach(r => {
      const cls = r._manualClass || r._class.classification;
      s[cls] = (s[cls] || 0) + 1;
      if (r._source === "APRENDIDO") aprendidos++;
    });
    s._aprendidos = aprendidos;
    setStats(s);
  };

  // ─── Process new parsed products chunked ─────────────────────────
  const handleProductsLoaded = async (loadedRawProducts) => {
    setProducts(loadedRawProducts);
    setLoading(true);
    
    // Process items in chunks so browser remains perfectly responsive
    const results = await processProductsChunked(
      loadedRawProducts,
      corrections,
      rules,
      200,
      (current, total) => setProcessingProgress({ current, total })
    );

    // Aplicar datos enriquecidos aprendidos de correcciones completas
    const fullCorrs = correctionsFull;
    results.forEach(r => {
      const key = (r.CODIGO || "").toLowerCase();
      const fc = fullCorrs[key];
      if (fc && (fc.nombre_limpio || fc.marca || fc.prop1_nombre || fc.categoria_tiendanube || fc.peso_kg)) {
        const existing = r._enriched || {};
        r._enriched = {
          ...existing,
          ...(fc.categoria_tiendanube && { categoria_tiendanube: fc.categoria_tiendanube }),
          ...(fc.nombre_limpio  && { nombre_limpio:  fc.nombre_limpio  }),
          ...(fc.marca          && { marca:          fc.marca          }),
          ...(fc.prop1_nombre   && { prop1_nombre:   fc.prop1_nombre   }),
          ...(fc.prop1_valor    && { prop1_valor:    fc.prop1_valor    }),
          ...(fc.prop2_nombre   && { prop2_nombre:   fc.prop2_nombre   }),
          ...(fc.prop2_valor    && { prop2_valor:    fc.prop2_valor    }),
          ...(fc.prop3_nombre   && { prop3_nombre:   fc.prop3_nombre   }),
          ...(fc.prop3_valor    && { prop3_valor:    fc.prop3_valor    }),
          ...(fc.peso_kg        && { peso_kg:        fc.peso_kg        }),
          ...(fc.alto_cm        && { alto_cm:        fc.alto_cm        }),
          ...(fc.ancho_cm       && { ancho_cm:       fc.ancho_cm       }),
          ...(fc.profundidad_cm && { profundidad_cm: fc.profundidad_cm }),
        };
        if (fc.categoria_tiendanube) {
          const parts = fc.categoria_tiendanube.split(" > ").map(x => x.trim());
          r._tn_nivel1 = r._tn_nivel1 || parts[0] || "";
          r._tn_nivel2 = r._tn_nivel2 || parts[1] || "";
          r._tn_nivel3 = r._tn_nivel3 || parts[2] || "";
          r._tn_nivel4 = r._tn_nivel4 || parts[3] || "";
        }
        r._learned = true;
      }
    });

    // Aplicar correcciones TN (categoría Tienda Nube — tiene prioridad)
    const tnCorrs = tnCorrections;
    results.forEach(r => {
      const key = (r.CODIGO || "").toLowerCase();
      if (tnCorrs[key]) {
        const parts = tnCorrs[key].split(" > ").map(x => x.trim());
        r._tn_nivel1 = parts[0] || "";
        r._tn_nivel2 = parts[1] || "";
        r._tn_nivel3 = parts[2] || "";
        r._tn_nivel4 = parts[3] || "";
        r._enriched = { ...(r._enriched || {}), categoria_tiendanube: tnCorrs[key] };
        r._tn_manual = true;
      }
    });

    setClassified(results);
    recalculateStats(results);
    saveSession(results);
    setLoading(false);
    setView("dashboard");
  };

  // ─── Manual overrides updates ──────────────────────────────────────────
  const handleManualClassify = (id, newClass) => {
    const product = classified.find(p => p._id === id);
    if (!product) return;

    const updated = classified.map(p => p._id === id
      ? { ...p, _manualClass: newClass, _source: "APRENDIDO" }
      : p);
    
    setClassified(updated);
    recalculateStats(updated);
    saveSession(updated);

    // Save correction to database (clasif + cualquier dato enriquecido)
    saveCorrection({
      CODIGO: product.CODIGO,
      PRODUCTO: product.PRODUCTO || "",
      RUBRO: product.RUBRO || "",
      "SUB RUBRO": product["SUB RUBRO"] || "",
    }, newClass);
    saveFullCorrection({ ...product, _manualClass: newClass });
  };

  // ─── TN Category correction (Tienda Nube) ──────────────────────────────────
  const saveTNCorrection = async (codigo, categoriaTN, producto) => {
    try {
      await apiFetch("/api/tn-corrections", {
        method: "POST",
        body: JSON.stringify({ codigo, categoria_tiendanube: categoriaTN, producto }),
      });
      setTNCorrections(prev => {
        const updated = { ...prev, [codigo.toLowerCase()]: categoriaTN };
        localStorage.setItem("tn_corrections_cache", JSON.stringify(updated));
        return updated;
      });
      setTNCorrectionsList(prev => {
        const idx = prev.findIndex(c => (c.codigo || "").toLowerCase() === codigo.toLowerCase());
        const entry = { codigo, categoria_tiendanube: categoriaTN, producto, updated_at: new Date().toISOString() };
        if (idx >= 0) return prev.map((c, i) => i === idx ? { ...c, ...entry } : c);
        return [...prev, { id: Date.now(), ...entry, created_at: new Date().toISOString() }];
      });
    } catch (e) {
      console.warn("[saveTNCorrection]", e.message);
    }
  };

  // ─── saveFullCorrection: persiste TODOS los campos del producto en corrections ──
  const saveFullCorrection = (product) => {
    if (!product?.CODIGO) return;
    const e = product._enriched || {};
    apiFetch("/api/corrections", {
      method: "POST",
      body: JSON.stringify({
        codigo:                  product.CODIGO,
        producto:                product.PRODUCTO || "",
        rubro:                   product.RUBRO    || "",
        sub_rubro:               product["SUB RUBRO"] || "",
        clasificacion_corregida: product._manualClass || product._class?.classification || "",
        categoria_tiendanube:    e.categoria_tiendanube || "",
        nombre_limpio:           e.nombre_limpio  || "",
        marca:                   e.marca          || "",
        prop1_nombre:            e.prop1_nombre   || null,
        prop1_valor:             e.prop1_valor    || null,
        prop2_nombre:            e.prop2_nombre   || null,
        prop2_valor:             e.prop2_valor    || null,
        prop3_nombre:            e.prop3_nombre   || null,
        prop3_valor:             e.prop3_valor    || null,
        peso_kg:                 e.peso_kg        || null,
        alto_cm:                 e.alto_cm        || null,
        ancho_cm:                e.ancho_cm       || null,
        profundidad_cm:          e.profundidad_cm || null,
      }),
    }).catch(err => console.warn("[saveFullCorrection]", err.message));
  };

  const deleteTNCorrection = async (id, codigo) => {
    try {
      await apiFetch(`/api/tn-corrections?id=${id}`, { method: "DELETE" });
      setTNCorrectionsList(prev => prev.filter(c => c.id !== id));
      if (codigo) {
        setTNCorrections(prev => {
          const updated = { ...prev };
          delete updated[codigo.toLowerCase()];
          localStorage.setItem("tn_corrections_cache", JSON.stringify(updated));
          return updated;
        });
      }
    } catch (e) {
      console.warn("[deleteTNCorrection]", e.message);
    }
  };

  const clearAllTNCorrections = async () => {
    try {
      await apiFetch("/api/tn-corrections?all=true", { method: "DELETE" });
      setTNCorrections({});
      setTNCorrectionsList([]);
      localStorage.removeItem("tn_corrections_cache");
    } catch (e) {
      console.warn("[clearAllTNCorrections]", e.message);
    }
  };

  const handleTNCategory = (id, nivel, value) => {
    setClassified(prev => prev.map(p => {
      if (p._id !== id) return p;
      let n1 = p._tn_nivel1 !== undefined ? (p._tn_nivel1 || "") : "";
      let n2 = p._tn_nivel2 !== undefined ? (p._tn_nivel2 || "") : "";
      let n3 = p._tn_nivel3 !== undefined ? (p._tn_nivel3 || "") : "";
      let n4 = p._tn_nivel4 !== undefined ? (p._tn_nivel4 || "") : "";
      // Initialize from enriched path if _tn_nivel1 not yet set
      if (p._tn_nivel1 === undefined) {
        const catPath = p._enriched?.categoria_tiendanube || "";
        const parts = catPath.split(" > ").map(x => x.trim());
        n1 = parts[0] || ""; n2 = parts[1] || ""; n3 = parts[2] || ""; n4 = parts[3] || "";
      }
      if (nivel === "nivel1") { n1 = value; n2 = ""; n3 = ""; n4 = ""; }
      if (nivel === "nivel2") { n2 = value; n3 = ""; n4 = ""; }
      if (nivel === "nivel3") { n3 = value; n4 = ""; }
      if (nivel === "nivel4") { n4 = value; }
      const catPath = [n1, n2, n3, n4].filter(Boolean).join(" > ");
      const newEnriched = { ...(p._enriched || {}), categoria_tiendanube: catPath };
      if (p.CODIGO && catPath) {
        saveTNCorrection(p.CODIGO, catPath, p.PRODUCTO || "");
        saveFullCorrection({ ...p, _enriched: newEnriched });
      }
      return { ...p, _tn_nivel1: n1, _tn_nivel2: n2, _tn_nivel3: n3, _tn_nivel4: n4, _enriched: newEnriched, _tn_manual: true };
    }));
  };

  // ─── Bulk overrides updates ─────────────────────────────────────────────
  const handleBulkClassify = (ids, newClass) => {
    const updated = classified.map(p => {
      if (!ids.includes(p._id)) return p;
      
      // Auto-save corrections in background for each product
      saveCorrection({
        CODIGO: p.CODIGO,
        PRODUCTO: p.PRODUCTO || "",
        RUBRO: p.RUBRO || "",
        "SUB RUBRO": p["SUB RUBRO"] || "",
      }, newClass);

      return {
        ...p,
        _manualClass: newClass,
        _source: "APRENDIDO"
      };
    });

    setClassified(updated);
    recalculateStats(updated);
    saveSession(updated);
  };

  // ─── Delete selected from active session ────────────────────────────────
  const handleDeleteSelected = (ids) => {
    const idsSet = ids instanceof Set ? ids : new Set(ids);
    const updated = classified.filter(p => !idsSet.has(p._id));
    setClassified(updated);
    recalculateStats(updated);
    saveSession(updated);
    setTableSelectedCount(0);
    toast.success(`${idsSet.size} producto${idsSet.size !== 1 ? "s" : ""} eliminado${idsSet.size !== 1 ? "s" : ""} del análisis.`);
  };

  const handleUpdateProductEnriched = (id, enrichedFields) => {
    const updated = classified.map(p =>
      p._id === id ? { ...p, _enriched: enrichedFields } : p
    );
    setClassified(updated);
    saveSession(updated);
  };

  // ─── Groq AI trigger ────────────────────────────────────────────────────
  const handleRunAI = async () => {
    const apiKeyOverride = localStorage.getItem("clasificador_groq_key");
    
    await runAI(classified, apiKeyOverride, (batchResults) => {
      // Stream results in live to App state as they resolve
      setClassified(prev => {
        const copy = [...prev];
        batchResults.forEach(aiMatch => {
          const idx = copy.findIndex(p => p.CODIGO === aiMatch.codigo);
          if (idx > -1 && copy[idx]._source !== "APRENDIDO") {
            copy[idx]._aiClass = {
              classification: aiMatch.clasificacion,
              confidence: aiMatch.confianza,
              reason: aiMatch.razon
            };
            if (aiMatch.confianza > copy[idx]._class.confidence) {
              copy[idx]._class.classification = aiMatch.clasificacion;
              copy[idx]._class.confidence = aiMatch.confianza;
              copy[idx]._class.reasons = [aiMatch.razon, ...copy[idx]._class.reasons];
              copy[idx]._source = "IA";
            }
            // Apply TN category from AI result
            if (aiMatch.categoria_tiendanube) {
              const parts = aiMatch.categoria_tiendanube.split(" > ").map(x => x.trim());
              copy[idx]._tn_nivel1 = parts[0] || "";
              copy[idx]._tn_nivel2 = parts[1] || "";
              copy[idx]._tn_nivel3 = parts[2] || "";
              copy[idx]._tn_nivel4 = parts[3] || "";
              copy[idx]._enriched = { ...(copy[idx]._enriched || {}), categoria_tiendanube: aiMatch.categoria_tiendanube };
              if (copy[idx].CODIGO) {
                saveTNCorrection(copy[idx].CODIGO, aiMatch.categoria_tiendanube, copy[idx].PRODUCTO || "");
              }
            }
          }
        });
        recalculateStats(copy);
        saveSession(copy);
        return copy;
      });
    });
  };

  // ─── Reset ──────────────────────────────────────────────────────────────
  const handleResetSession = () => {
    if (confirm("¿Descartar el análisis actual? Esto limpiará la sesión activa de memoria.")) {
      setProducts([]);
      setClassified([]);
      setStats({});
      localStorage.removeItem(SESSION_KEY);
      setView("upload");
    }
  };

  // ─── Save History ───────────────────────────────────────────────────────
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const handleSaveAnalysisSubmit = async () => {
    if (!saveModalName.trim()) return;
    setSavingAnalysis(true);
    const res = await saveAnalysis(saveModalName, classified, tnCategories);
    setSavingAnalysis(false);
    if (res.success) {
      setSaveModalOpen(false);
      toast.success("Análisis guardado con éxito.");
    } else {
      toast.error("No se pudo guardar el análisis. Intentá de nuevo.");
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: C.bg, color: C.text }}>
      
      {/* 220px Fixed Left Sidebar */}
      <Sidebar
        view={view}
        setView={setView}
        hasActiveSession={classified.length > 0}
        historyCount={historyList.length}
        correctionsCount={correctionsList.length}
        tnCorrectionsCount={tnCorrectionsList.length}
      />

      {/* Main content right panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100vh", overflowY: "auto" }}>
        
        {/* top header navigation */}
        <Topbar
          view={view}
          setView={setView}
          hasActiveSession={classified.length > 0}
          onSave={() => {
            const today = new Date();
            const dd = String(today.getDate()).padStart(2, "0");
            const mm = String(today.getMonth() + 1).padStart(2, "0");
            const yyyy = today.getFullYear();
            setSaveModalName(`Análisis ${dd}/${mm}/${yyyy}`);
            setSaveModalOpen(true);
          }}
          onExport={(filterType) => {
            if (filterType === "TN") {
              exportTiendaNubeCSV(classified, tnCategories);
            } else {
              exportCSV(filterType === "ALL" ? classified : classified.filter(p => (p._manualClass || p._class.classification) === filterType), CLS);
            }
          }}
          onReset={handleResetSession}
          historyDetailName={historyDetail?.nombre}
          selectedCount={tableSelectedCount}
          onDeleteSelected={() => {
            // This triggers the delete in TableView via tableSelectedCount → handled there
            // Topbar just shows the badge; deletion is in TableView
          }}
        />

        {/* Content canvas */}
        <div style={{ flex: 1, padding: "24px 30px" }}>
          
          {loading && (
            <div style={{ textAlign: "center", padding: "100px 20px" }}>
              <div className="pulse" style={{ fontSize: 36, marginBottom: 16 }}>⚡</div>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Procesando catálogo HVAC...</h3>
              <p style={{ color: C.textMuted, fontSize: 13, marginTop: 4 }}>
                Clasificados: {processingProgress.current} de {processingProgress.total} productos
              </p>
            </div>
          )}

          {/* VIEW: HOME */}
          {!loading && view === "home" && (
            <HomeView
              setView={setView}
              classifiedProducts={classified}
              stats={stats}
              historyList={historyList}
              onLoadHistoryDetail={async (id) => {
                await setHistoryDetail(null);
                setView("historyDetail");
                loadHistoryDetail(id);
              }}
              onResetSession={() => {
                setProducts([]);
                setClassified([]);
                setStats({});
                localStorage.removeItem(SESSION_KEY);
              }}
            />
          )}

          {/* VIEW: UPLOAD */}
          {!loading && view === "upload" && (
            <UploadView
              onProductsLoaded={handleProductsLoaded}
              hasActiveSession={classified.length > 0}
              correctionsCount={correctionsList.length}
              toast={toast}
            />
          )}

          {/* VIEW: DASHBOARD */}
          {!loading && view === "dashboard" && (
            <DashboardView
              classifiedProducts={classified}
              stats={stats}
              setView={setView}
              setFilter={setFilter}
              setPage={setPage}
              aiLoading={aiLoading}
              aiStatus={aiStatus}
              aiError={aiError}
              aiProcessed={aiProcessed}
              onRunAI={handleRunAI}
              onStopAI={stopAI}
              aiResultsCount={classified.filter(p => p._aiClass).length}
            />
          )}

          {/* VIEW: TABLE */}
          {!loading && view === "table" && (
            <TableView
              classifiedProducts={classified}
              tnCategories={tnCategories}
              filter={filter}
              setFilter={setFilter}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              page={page}
              setPage={setPage}
              onManualClassify={handleManualClassify}
              onTNCategory={handleTNCategory}
              onBulkClassify={handleBulkClassify}
              onDeleteSelected={handleDeleteSelected}
              onSelectionChange={setTableSelectedCount}
              rules={rules}
              toast={toast}
            />
          )}

          {/* VIEW: EXPORT TN */}
          {!loading && view === "exportTN" && (
            <ExportView
              classifiedProducts={classified}
              tnCategories={tnCategories}
              setView={setView}
              updateProductEnriched={handleUpdateProductEnriched}
              onProductCorrected={saveFullCorrection}
              loadTnCategories={loadTnCategories}
              toast={toast}
            />
          )}

          {/* VIEW: HISTORY */}
          {!loading && view === "history" && (
            <HistoryView
              historyList={historyList}
              onLoadDetail={async (id) => {
                await setHistoryDetail(null);
                setView("historyDetail");
                loadHistoryDetail(id);
              }}
              onRename={renameAnalysis}
              onDelete={(id) => {
                if (confirm("¿Estás seguro que querés borrar este análisis permanentemente?")) {
                  deleteAnalysis(id);
                }
              }}
              loading={loading}
            />
          )}

          {/* VIEW: HISTORY DETAIL */}
          {!loading && view === "historyDetail" && historyDetail && (
            <HistoryDetailView
              historyDetail={historyDetail}
              onGoBack={() => setView("history")}
              onLoadIntoActiveSession={(detail) => {
                if (confirm("¿Cargar este historial como tu sesión activa en memoria? Reemplazará cualquier dato actual.")) {
                  // Mapear productos del historial a campos en mayúsculas
                  const restored = detail.products.map((p, idx) => ({
                    CODIGO: p.codigo,
                    PRODUCTO: p.producto,
                    RUBRO: p.rubro,
                    "SUB RUBRO": p.sub_rubro,
                    _id: idx,
                    _manualClass: p.fuente === "APRENDIDO" ? p.clasificacion : null,
                    _source: p.fuente,
                    _class: {
                      classification: p.clasificacion,
                      confidence: p.confianza,
                      reasons: ["Historial cargado"],
                      score: p.confianza
                    },
                    _tn_nivel1: p.categoria_tiendanube?.split(" > ")[0]?.trim() || null,
                    _tn_nivel2: p.categoria_tiendanube?.split(" > ")[1]?.trim() || null,
                    _tn_nivel3: p.categoria_tiendanube?.split(" > ")[2]?.trim() || null,
                    _tn_nivel4: p.categoria_tiendanube?.split(" > ")[3]?.trim() || null,
                    _tn_manual: !!p.tn_manual,
                    _enriched: p._enriched || null
                  }));
                  setClassified(restored);
                  recalculateStats(restored);
                  saveSession(restored);
                  setView("dashboard");
                }
              }}
              onUpdateHistoryClass={updateHistoryProduct}
            />
          )}

          {/* VIEW: LEARNING */}
          {!loading && view === "learning" && (
            <LearningView
              correctionsList={correctionsList}
              onSaveCorrection={saveCorrection}
              onDeleteCorrection={deleteCorrection}
              onClearAllCorrections={clearAllCorrections}
              onImportBulkCorrections={importBulkCorrections}
              classifiedProductsCount={classified.filter(p => p._source === "APRENDIDO").length}
              toast={toast}
            />
          )}

          {/* VIEW: TN LEARNING */}
          {!loading && view === "tnLearning" && (
            <TnLearningView
              tnCorrectionsList={tnCorrectionsList}
              tnCategories={tnCategories}
              onSaveTNCorrection={saveTNCorrection}
              onDeleteTNCorrection={deleteTNCorrection}
              onClearAllTNCorrections={clearAllTNCorrections}
              toast={toast}
            />
          )}

          {/* VIEW: CLASSIFICATION */}
          {!loading && view === "classificationRules" && (
            <ClassificationView
              rules={rules}
              onSaveRule={saveRule}
              onDeleteRule={deleteRule}
              onResetRules={resetRulesToDefault}
              toast={toast}
            />
          )}

          {/* VIEW: TN CATEGORIES */}
          {!loading && view === "tnCategories" && (
            <TnCategoriesView
              tnCategories={tnCategories}
              loading={tnCatLoading}
              onSave={saveTnCategory}
              onDelete={deleteTnCategory}
              classifiedProducts={classified}
            />
          )}

          {/* VIEW: SETTINGS */}
          {!loading && view === "settings" && (
            <SettingsView
              classifiedProductsCount={classified.length}
              historyCount={historyList.length}
              correctionsCount={correctionsList.length}
              categoriesCount={tnCategories.length}
              onResetSession={() => {
                setProducts([]);
                setClassified([]);
                setStats({});
                localStorage.removeItem(SESSION_KEY);
                toast.info("Sesión descartada.");
              }}
              onResetRules={resetRulesToDefault}
              onClearHistory={async () => {
                for (const a of historyList) {
                  await deleteAnalysis(a.id);
                }
                loadHistory();
              }}
              onClearCorrections={clearAllCorrections}
              toast={toast}
            />
          )}

        </div>

      </div>

      {/* SAVE MODAL */}
      {saveModalOpen && (
        <Modal isOpen={saveModalOpen} onClose={() => setSaveModalOpen(false)} title="💾 Guardar Análisis">
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
            Se guardará el catálogo actual de <strong>{classified.length}</strong> productos en tu base de datos Supabase.
          </p>
          <label style={{ fontSize: 11, fontWeight: 700, color: C.text, display: "block", marginBottom: 6 }}>Nombre del Análisis</label>
          <input
            value={saveModalName}
            onChange={e => setSaveModalName(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", marginBottom: 20 }}
          />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setSaveModalOpen(false)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <ActionButton
              onClick={handleSaveAnalysisSubmit}
              loading={savingAnalysis}
              disabled={!saveModalName.trim()}
              style={{ padding: "8px 18px", fontSize: 12 }}
            >
              Confirmar y Guardar
            </ActionButton>
          </div>
        </Modal>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toast.toasts} />

    </div>
  );
}
