import React, { useState, useMemo, useRef } from "react";
import { C, CLS } from "../constants";
import { getProductPrice, slugify, buildCategoriaTN, exportTiendaNubeCSV, fetchWithTimeout } from "../utils";

export default function ExportView({
  classifiedProducts,
  categories,
  setView,
  updateProductEnriched
}) {
  const [step, setStep] = useState(1);
  const [selectedIds, setSelectedIds] = useState(() => {
    // Smart preselection: REPUESTO and ACCESORIO by default
    return classifiedProducts
      .filter(p => ["REPUESTO", "ACCESORIO"].includes(p._manualClass || p._class.classification))
      .map(p => p._id);
  });

  // Filter selection state
  const [filterSel, setFilterSel] = useState("ALL"); // ALL, NO_PRICE, NO_CAT, NO_ENRICH
  const [searchTerm, setSearchTerm] = useState("");

  // Enrichment state
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState("");
  const [enrichProcessed, setEnrichProcessed] = useState(0);
  const [individualEditingProduct, setIndividualEditingProduct] = useState(null);
  const enrichAbortRef = useRef(false);

  // Filtered selection list
  const filteredSelectionProducts = useMemo(() => {
    return classifiedProducts.filter(p => {
      // Search
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        if (!(p.PRODUCTO || "").toLowerCase().includes(s) && !(p.CODIGO || "").toLowerCase().includes(s)) {
          return false;
        }
      }
      
      // Quick filter selectors
      if (filterSel === "NO_PRICE") {
        return getProductPrice(p) === 0;
      }
      if (filterSel === "NO_CAT") {
        return !p._categoria;
      }
      if (filterSel === "NO_ENRICH") {
        return !p._enriched;
      }
      return true;
    });
  }, [classifiedProducts, filterSel, searchTerm]);

  const selectedProducts = useMemo(() => {
    return classifiedProducts.filter(p => selectedIds.includes(p._id));
  }, [classifiedProducts, selectedIds]);

  const toggleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(filteredSelectionProducts.map(p => p._id));
    } else {
      setSelectedIds([]);
    }
  };

  // Run bulk enrichment
  const handleRunEnrich = async () => {
    setEnrichLoading(true);
    setEnrichProcessed(0);
    setEnrichStatus("Iniciando enriquecimiento...");
    enrichAbortRef.current = false;

    const batchSize = 15;
    const total = selectedProducts.length;
    let processed = 0;

    for (let i = 0; i < Math.ceil(total / batchSize); i++) {
      if (enrichAbortRef.current) {
        setEnrichStatus("Cancelado por el usuario.");
        break;
      }

      const batch = selectedProducts.slice(i * batchSize, (i + 1) * batchSize);
      setEnrichStatus(`Procesando lote ${i + 1} de ${Math.ceil(total / batchSize)}...`);

      if (i > 0) await new Promise(r => setTimeout(r, 3000));

      try {
        const res = await fetchWithTimeout("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ products: batch }),
        });
        const data = await res.json();

        if (res.ok && data.results) {
          // Push enriched data back into App state
          data.results.forEach(result => {
            const originalProduct = classifiedProducts.find(p => p.CODIGO === result.codigo);
            if (originalProduct && updateProductEnriched) {
              updateProductEnriched(originalProduct._id, result);
            }
          });
          processed += batch.length;
          setEnrichProcessed(processed);
          setEnrichStatus(`✓ ${processed}/${total} completados`);
        }
      } catch (e) {
        console.error("Error enriqueciendo lote", i, e);
      }
    }

    setEnrichLoading(false);
    if (!enrichAbortRef.current) {
      setEnrichStatus(`✅ Enriquecimiento finalizado con éxito.`);
      setStep(3);
    }
  };

  const handleIndividualSave = (id, fields) => {
    if (updateProductEnriched) {
      updateProductEnriched(id, fields);
    }
    setIndividualEditingProduct(null);
  };

  // CSV generate and download
  const handleDownload = () => {
    exportTiendaNubeCSV(selectedProducts);
  };

  // Pricing stats
  const stats = useMemo(() => {
    let withPrice = 0;
    let withoutPrice = 0;
    selectedProducts.forEach(p => {
      if (getProductPrice(p) > 0) withPrice++;
      else withoutPrice++;
    });
    return { withPrice, withoutPrice };
  }, [selectedProducts]);

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          🛒 Exportación E-commerce (Tienda Nube)
        </h2>
        <p style={{ fontSize: 13, color: C.textMuted }}>
          Prepará tus productos con metadatos optimizados para SEO, pesos y descripciones profesionales.
        </p>
      </div>

      {/* Stepper Header */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 20px" }}>
        {[
          { n: 1, label: "Selección de productos" },
          { n: 2, label: "Enriquecimiento IA" },
          { n: 3, label: "Descarga de catálogo CSV" },
        ].map((s, i) => {
          const isAct = step === s.n;
          const isPassed = step > s.n;
          return (
            <React.Fragment key={s.n}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: isAct ? 700 : 500,
                color: isAct ? C.accent : isPassed ? C.text : C.textDim,
              }}>
                <span style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  background: isPassed ? C.success : isAct ? C.accent : C.surface2,
                  color: isPassed || isAct ? "#fff" : C.textDim,
                }}>
                  {isPassed ? "✓" : s.n}
                </span>
                {s.label}
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: C.border }} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* STEP 1: SELECT */}
      {step === 1 && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          
          {/* Quick Selectors Bar */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <input
              type="text"
              placeholder="🔍 Buscar por nombre o código..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none" }}
            />
            
            <div style={{ display: "flex", gap: 4 }}>
              {[
                { id: "ALL", label: "Todos los productos" },
                { id: "NO_PRICE", label: "⚠️ Sin Precio" },
                { id: "NO_CAT", label: "📁 Sin Categoría" },
                { id: "NO_ENRICH", label: "🤖 Sin Enriquecer" },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setFilterSel(opt.id)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    border: `1px solid ${filterSel === opt.id ? C.accent : C.border}`,
                    background: filterSel === opt.id ? C.accentBg : "transparent",
                    color: filterSel === opt.id ? C.accent : C.textMuted,
                    cursor: "pointer",
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button onClick={() => setSelectedIds(classifiedProducts.map(p => p._id))} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Seleccionar todos</button>
              <button onClick={() => setSelectedIds(classifiedProducts.filter(p => ["REPUESTO", "ACCESORIO"].includes(p._manualClass || p._class.classification)).map(p => p._id))} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Solo Repuestos / Accesorios</button>
              <button onClick={() => setSelectedIds([])} style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Ninguno</button>
            </div>
          </div>

          <div style={{ fontSize: 12, color: C.textMuted }}>
            Seleccionados: <strong>{selectedIds.length}</strong> de <strong>{classifiedProducts.length}</strong> productos
          </div>

          {/* Table list */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, maxHeight: 400, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1, background: C.surface2 }}>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ padding: "10px 14px", width: 40 }}>
                    <input
                      type="checkbox"
                      checked={filteredSelectionProducts.length > 0 && selectedIds.length === filteredSelectionProducts.length}
                      onChange={e => toggleSelectAll(e.target.checked)}
                    />
                  </th>
                  <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Código</th>
                  <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Producto</th>
                  <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Precio</th>
                  <th style={{ padding: "10px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Categoría</th>
                </tr>
              </thead>
              <tbody>
                {filteredSelectionProducts.map((p, idx) => {
                  const isSelected = selectedIds.includes(p._id);
                  const price = getProductPrice(p);
                  return (
                    <tr
                      key={p._id}
                      onClick={() => toggleSelectOne(p._id)}
                      style={{
                        background: isSelected ? `${C.accent}05` : "transparent",
                        borderBottom: `1px solid ${C.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "8px 14px" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      <td style={{ padding: "8px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDim }}>
                        {p.CODIGO}
                      </td>
                      <td style={{ padding: "8px 14px", fontWeight: 600, color: C.text }}>
                        {p.PRODUCTO}
                      </td>
                      <td style={{ padding: "8px 14px", color: price > 0 ? C.success : C.danger, fontWeight: 600 }}>
                        {price > 0 ? `$${price.toLocaleString("es-AR")}` : "Sin precio ⚠️"}
                      </td>
                      <td style={{ padding: "8px 14px", color: C.textMuted, fontSize: 12 }}>
                        {p._categoria ? `${p._categoria} > ${p._subcategoria || ""}` : "Sin Categorizar"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button
              onClick={() => setView("dashboard")}
              style={{ padding: "10px 20px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Cancelar
            </button>
            <button
              onClick={() => setStep(2)}
              disabled={selectedIds.length === 0}
              style={{
                padding: "10px 24px",
                borderRadius: 10,
                border: "none",
                background: selectedIds.length > 0 ? C.accent : C.border,
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: selectedIds.length > 0 ? "pointer" : "default",
              }}
            >
              Siguiente → ({selectedIds.length} productos)
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: ENRICH */}
      {step === 2 && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              🤖 Enriquecimiento de contenido con IA
            </h3>
            <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
              La IA generará de forma masiva nombres normalizados capitalizados, fichas de descripciones HTML detalladas, tags SEO, marcas recomendadas y pesos físicos.
              Procesando en lotes rápidos de 15 productos.
            </p>

            {/* Run Button Panel */}
            {!enrichLoading && enrichProcessed === 0 && (
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleRunEnrich}
                  style={{
                    padding: "10px 22px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg, var(--accent), var(--success))",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    boxShadow: "0 4px 6px -1px rgba(37,99,235,0.2)",
                  }}
                >
                  🚀 Iniciar Enriquecimiento Masivo
                </button>
                <button
                  onClick={() => setStep(3)}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 10,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    color: C.textMuted,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Saltar enriquecimiento e ir a descarga
                </button>
              </div>
            )}

            {/* Progress Bar */}
            {enrichLoading && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.accent, fontWeight: 600, marginBottom: 6 }}>
                  <span>{enrichStatus}</span>
                  <span>{enrichProcessed} / {selectedProducts.length} enriquecidos</span>
                </div>
                <div style={{ height: 8, background: C.surface2, borderRadius: 4, overflow: "hidden", marginBottom: 12 }}>
                  <div
                    style={{
                      width: `${(enrichProcessed / selectedProducts.length) * 100}%`,
                      height: "100%",
                      background: `linear-gradient(90deg, ${C.accent}, ${C.success})`,
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
                <button
                  onClick={() => { enrichAbortRef.current = true; }}
                  style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.danger}`, background: "transparent", color: C.danger, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  ⏹ Cancelar enriquecimiento
                </button>
              </div>
            )}

            {/* Finished view */}
            {!enrichLoading && enrichProcessed > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ color: C.success, fontSize: 14, fontWeight: 700 }}>
                  ✅ {enrichProcessed} productos enriquecidos correctamente con IA
                </span>
                <button
                  onClick={() => setStep(3)}
                  style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                >
                  Siguiente → Ver Catálogo CSV
                </button>
              </div>
            )}
          </div>

          {/* Enriched items editor list */}
          {selectedProducts.some(p => p._enriched) && (
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                Productos enriquecidos (Edición Manual disponible):
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {selectedProducts.filter(p => p._enriched).map(p => (
                  <div
                    key={p._id}
                    style={{
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      padding: 16,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase" }}>
                        {p.CODIGO}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        {p._enriched.nombre_limpio}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>
                        Marca: <strong>{p._enriched.marca || "No especificada"}</strong>
                      </div>
                    </div>
                    
                    <div style={{ display: "flex", gap: 6, fontSize: 11 }}>
                      <span style={{ padding: "2px 6px", background: C.surface2, borderRadius: 4, color: C.textMuted }}>
                        ⚖️ {p._enriched.peso_kg || 0.1} kg
                      </span>
                      <span style={{ padding: "2px 6px", background: C.surface2, borderRadius: 4, color: C.textMuted }}>
                        📐 {p._enriched.alto_cm}x{p._enriched.ancho_cm} cm
                      </span>
                    </div>

                    <button
                      onClick={() => setIndividualEditingProduct(p)}
                      style={{
                        marginTop: 4,
                        padding: "6px 12px",
                        borderRadius: 6,
                        border: `1px solid ${C.border}`,
                        background: "transparent",
                        color: C.accent,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      ✏️ Editar Campos Enriquecidos
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => setStep(1)}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" }}
          >
            ← Volver al Paso 1
          </button>
        </div>
      )}

      {/* STEP 3: EXPORT AND PREVIEW */}
      {step === 3 && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              Descarga tu Catálogo de Tienda Nube
            </h3>
            <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
              Generá tu archivo CSV en formato exacto UTF-8 con BOM, separado por punto y coma (`;`).
              El archivo contendrá <strong>{selectedProducts.length}</strong> productos listos para la importación directa.
            </p>

            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", minWidth: 150 }}>
                <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700 }}>PRECIO ACTIVADO</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.success }}>{stats.withPrice} productos</div>
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", minWidth: 150 }}>
                <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700 }}>SIN PRECIO (OCULTOS)</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.danger }}>{stats.withoutPrice} productos</div>
              </div>
              <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 16px", minWidth: 150 }}>
                <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700 }}>ENRIQUECIDOS POR IA</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.accent }}>{selectedProducts.filter(p => p._enriched).length} productos</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleDownload}
                style={{
                  padding: "12px 24px",
                  borderRadius: 10,
                  border: "none",
                  background: C.success,
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 6px -1px rgba(16,185,129,0.2)",
                }}
              >
                📥 Descargar CSV Tienda Nube
              </button>
            </div>
            
            <div style={{ marginTop: 16, padding: 12, borderRadius: 8, background: `${C.accent}12`, border: `1px solid ${C.accent}30`, fontSize: 12, color: C.accent, fontWeight: 500 }}>
              💡 <strong>Instrucciones:</strong> Entrá a tu administrador de <strong>Tienda Nube → Productos → Importar desde CSV</strong> y subí el archivo descargado. ¡Eso es todo!
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start" }}
          >
            ← Volver al Paso 2
          </button>
        </div>
      )}

      {/* INDIVIDUAL EDIT MODAL OVERLAY */}
      {individualEditingProduct && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 350,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            backdropFilter: "blur(4px)",
          }}
        >
          {(() => {
            const p = individualEditingProduct;
            const e = p._enriched || {};
            return (
              <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 24, width: "100%", maxWidth: 540, maxHeight: "90vh", overflowY: "auto" }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 14 }}>
                  Editar Enriquecimiento: {p.CODIGO}
                </h3>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Nombre limpio capitalizado</label>
                    <input
                      id="edit-nl"
                      defaultValue={e.nombre_limpio || p.PRODUCTO}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Marca</label>
                      <input
                        id="edit-ma"
                        defaultValue={e.marca || ""}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Categoría Tienda Nube</label>
                      <input
                        id="edit-ctn"
                        defaultValue={e.categoria_tiendanube || buildCategoriaTN(p)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Peso (kg)</label>
                      <input
                        id="edit-pe"
                        defaultValue={e.peso_kg || ""}
                        type="number"
                        step="0.01"
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Alto (cm)</label>
                      <input
                        id="edit-al"
                        defaultValue={e.alto_cm || ""}
                        type="number"
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Ancho (cm)</label>
                      <input
                        id="edit-an"
                        defaultValue={e.ancho_cm || ""}
                        type="number"
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Profundidad (cm)</label>
                      <input
                        id="edit-pr"
                        defaultValue={e.profundidad_cm || ""}
                        type="number"
                        style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Descripción (Ficha HTML)</label>
                    <textarea
                      id="edit-de"
                      defaultValue={e.descripcion_html || ""}
                      style={{ width: "100%", height: 100, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, fontFamily: "monospace", resize: "vertical" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Título SEO</label>
                      <input
                        id="edit-seot"
                        defaultValue={e.seo_titulo || ""}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Etiquetas (separadas por coma)</label>
                      <input
                        id="edit-seotags"
                        defaultValue={Array.isArray(e.tags) ? e.tags.join(",") : (e.tags || "")}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
                  <button
                    onClick={() => setIndividualEditingProduct(null)}
                    style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Descartar
                  </button>
                  <button
                    onClick={() => {
                      const nl = document.getElementById("edit-nl").value;
                      const ma = document.getElementById("edit-ma").value;
                      const ctn = document.getElementById("edit-ctn").value;
                      const pe = parseFloat(document.getElementById("edit-pe").value) || null;
                      const al = parseInt(document.getElementById("edit-al").value) || null;
                      const an = parseInt(document.getElementById("edit-an").value) || null;
                      const pr = parseInt(document.getElementById("edit-pr").value) || null;
                      const de = document.getElementById("edit-de").value;
                      const seot = document.getElementById("edit-seot").value;
                      const seotags = document.getElementById("edit-seotags").value.split(",").map(t => t.trim()).filter(Boolean);

                      handleIndividualSave(p._id, {
                        ...e,
                        nombre_limpio: nl,
                        marca: ma,
                        categoria_tiendanube: ctn,
                        peso_kg: pe,
                        alto_cm: al,
                        ancho_cm: an,
                        profundidad_cm: pr,
                        descripcion_html: de,
                        seo_titulo: seot,
                        tags: seotags
                      });
                    }}
                    style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Guardar Cambios
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

    </div>
  );
}
