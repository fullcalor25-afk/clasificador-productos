import React, { useState, useEffect, useRef } from "react";
import { C, CLS } from "./constants";
import { exportCSV, getProductPrice } from "./utils";

// Components
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import Modal from "./components/Modal";

// Hooks
import useCorrections from "./hooks/useCorrections";
import useCategories from "./hooks/useCategories";
import useHistory from "./hooks/useHistory";
import useClassification from "./hooks/useClassification";

// Views
import HomeView from "./views/HomeView";
import UploadView from "./views/UploadView";
import DashboardView from "./views/DashboardView";
import TableView from "./views/TableView";
import ExportView from "./views/ExportView";
import HistoryView from "./views/HistoryView";
import HistoryDetailView from "./views/HistoryDetailView";
import LearningView from "./views/LearningView";
import CategoriesView from "./views/CategoriesView";
import ClassificationView from "./views/ClassificationView";
import SettingsView from "./views/SettingsView";

const SESSION_KEY = "hvac_session";

export default function ProductClassifier() {
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

  // ─── Custom database / engine hooks ───────────────────────────────────────
  const {
    corrections,
    correctionsList,
    loaded: correctionsLoaded,
    saveCorrection,
    deleteCorrection,
    importBulkCorrections,
    clearAllCorrections,
  } = useCorrections();

  const {
    categories,
    saveCategory,
    deleteCategoryItem,
  } = useCategories();

  const {
    historyList,
    historyDetail,
    setHistoryDetail,
    saveAnalysis,
    deleteAnalysis,
    renameAnalysis,
    updateHistoryProduct,
    loadHistory,
  } = useHistory();

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

  // Restore session on mount
  useEffect(() => {
    const sessionData = loadSession();
    if (sessionData && sessionData.length > 0) {
      setClassified(sessionData);
      recalculateStats(sessionData);
    }
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

    // Save manual correction to database
    saveCorrection({
      CODIGO: product.CODIGO,
      PRODUCTO: product.PRODUCTO || "",
      RUBRO: product.RUBRO || "",
      "SUB RUBRO": product["SUB RUBRO"] || "",
    }, newClass);
  };

  const handleManualCategory = (id, field, value) => {
    const updated = classified.map(p => {
      if (p._id !== id) return p;
      if (field === "categoria") {
        const catObj = categories.find(c => c.nombre === value);
        return {
          ...p,
          _categoria: value || null,
          _subcategoria: null,
          _category_id: catObj ? catObj.id : null,
          _subcategory_id: null
        };
      }
      const catObj = categories.find(c => c.nombre === p._categoria);
      const subObj = catObj ? (catObj.subcategories || []).find(s => s.nombre === value) : null;
      return {
        ...p,
        _subcategoria: value || null,
        _subcategory_id: subObj ? subObj.id : null
      };
    });

    setClassified(updated);
    saveSession(updated);
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

  const handleBulkCategory = (ids, catName) => {
    const catObj = categories.find(c => c.nombre === catName);
    const updated = classified.map(p => {
      if (!ids.includes(p._id)) return p;
      return {
        ...p,
        _categoria: catName || null,
        _subcategoria: null,
        _category_id: catObj ? catObj.id : null,
        _subcategory_id: null
      };
    });

    setClassified(updated);
    saveSession(updated);
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
    
    await runAI(classified, categories, apiKeyOverride, (batchResults) => {
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
            if (aiMatch.categoria) {
              copy[idx]._categoria = aiMatch.categoria;
              copy[idx]._subcategoria = aiMatch.subcategoria || null;
              copy[idx]._tipo = aiMatch.tipo || null;
              const catObj = categories.find(c => c.nombre === aiMatch.categoria);
              copy[idx]._category_id = catObj ? catObj.id : null;
              const subObj = catObj ? (catObj.subcategories || []).find(s => s.nombre === aiMatch.subcategoria) : null;
              copy[idx]._subcategory_id = subObj ? subObj.id : null;
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
  const handleSaveAnalysisSubmit = async () => {
    if (!saveModalName.trim()) return;
    const res = await saveAnalysis(saveModalName, classified);
    if (res.success) {
      setSaveModalOpen(false);
      alert("Análisis guardado con éxito.");
    } else {
      alert("No se pudo guardar el análisis.");
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
          onExport={(filterType) => exportCSV(filterType === "ALL" ? classified : classified.filter(p => (p._manualClass || p._class.classification) === filterType), CLS)}
          onReset={handleResetSession}
          historyDetailName={historyDetail?.nombre}
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
              categories={categories}
              filter={filter}
              setFilter={setFilter}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              page={page}
              setPage={setPage}
              onManualClassify={handleManualClassify}
              onManualCategory={handleManualCategory}
              onBulkClassify={handleBulkClassify}
              onBulkCategory={handleBulkCategory}
              rules={rules}
            />
          )}

          {/* VIEW: EXPORT TN */}
          {!loading && view === "exportTN" && (
            <ExportView
              classifiedProducts={classified}
              categories={categories}
              setView={setView}
              updateProductEnriched={handleUpdateProductEnriched}
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
                    _categoria: p.slug ? p.categoria_tiendanube?.split(" > ")[1] || null : null,
                    _subcategoria: p.slug ? p.categoria_tiendanube?.split(" > ")[2] || null : null,
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
            />
          )}

          {/* VIEW: CATEGORIES */}
          {!loading && view === "categories" && (
            <CategoriesView
              categories={categories}
              onSaveCategory={saveCategory}
              onDeleteCategory={deleteCategoryItem}
              classifiedProducts={classified}
            />
          )}

          {/* VIEW: CLASSIFICATION */}
          {!loading && view === "classificationRules" && (
            <ClassificationView
              rules={rules}
              onSaveRule={saveRule}
              onDeleteRule={deleteRule}
              onResetRules={resetRulesToDefault}
            />
          )}

          {/* VIEW: SETTINGS */}
          {!loading && view === "settings" && (
            <SettingsView
              classifiedProductsCount={classified.length}
              historyCount={historyList.length}
              correctionsCount={correctionsList.length}
              categoriesCount={categories.length}
              onResetSession={() => {
                setProducts([]);
                setClassified([]);
                setStats({});
                localStorage.removeItem(SESSION_KEY);
                alert("Sesión descartada.");
              }}
              onResetRules={resetRulesToDefault}
              onClearHistory={async () => {
                for (const a of historyList) {
                  await deleteAnalysis(a.id);
                }
                loadHistory();
              }}
              onClearCorrections={clearAllCorrections}
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
            <button onClick={handleSaveAnalysisSubmit} disabled={!saveModalName.trim()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: saveModalName.trim() ? C.accent : C.border, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Confirmar y Guardar</button>
          </div>
        </Modal>
      )}

    </div>
  );
}
