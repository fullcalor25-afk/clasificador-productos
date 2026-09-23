import React, { useState, useMemo, useRef } from "react";
import { C, CLS } from "../constants";
import { getProductPrice, slugify, getCategoriaTN, buildCategoriaTN, exportTiendaNubeCSV, exportImagenesZip, fetchWithTimeout, apiFetch } from "../utils";
import useIsNarrow from "../hooks/useIsNarrow";

const GROQ_KEY_STORAGE = "clasificador_groq_key";

// Enriquece un lote vía /api/enrich con reintento y backoff creciente en 429/503
// (mismo patrón que useClassification.js:runAI, adaptado a un solo lote por llamada).
async function enrichBatchWithRetry(body, { maxAttempts = 4, baseDelay = 8000 } = {}) {
  const groqKeyOverride = localStorage.getItem(GROQ_KEY_STORAGE);
  const headers = { "Content-Type": "application/json" };
  if (groqKeyOverride) headers["x-groq-key"] = groqKeyOverride;

  let lastError = "Error desconocido enriqueciendo lote";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchWithTimeout("/api/enrich", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (res.ok) {
        return await res.json();
      }
      if (res.status === 429 || res.status === 503) {
        lastError = `Límite de Groq excedido (HTTP ${res.status})`;
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, baseDelay * attempt));
          continue;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        lastError = errData.error || `Error ${res.status}`;
        break;
      }
    } catch (e) {
      lastError = e.message;
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, baseDelay));
        continue;
      }
    }
  }
  throw new Error(lastError);
}

export default function ExportView({
  classifiedProducts,
  tnCategories = [],
  setView,
  updateProductEnriched,
  onProductCorrected = null,
  loadTnCategories = null,
  toast = null,
}) {
  const isNarrow = useIsNarrow();
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
  const [showExportWarning, setShowExportWarning] = useState(false);
  const [marcandoPublicado, setMarcandoPublicado] = useState(false);
  const [sinNivel4, setSinNivel4] = useState([]);
  const [nivel4Loading, setNivel4Loading] = useState(false);
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
    const totalBatches = Math.ceil(total / batchSize);
    let processed = 0;
    let failedBatches = 0;
    // Lotes que respondió Gemini porque Groq estaba saturado. Se avisa porque
    // enriquecer con Gemini consume del plan pago, no de la cuota de Groq.
    const lotesGemini = [];

    // Códigos OEM leídos de las fotos de placa y confirmados a mano. Es el
    // codigo_confirmado el que alimenta el tag oem:, nunca el OCR crudo.
    const oemPorCodigo = await cargarOemConfirmados(selectedProducts);

    for (let i = 0; i < totalBatches; i++) {
      if (enrichAbortRef.current) {
        setEnrichStatus("Cancelado por el usuario.");
        break;
      }

      const batch = selectedProducts
        .slice(i * batchSize, (i + 1) * batchSize)
        .map(p => conOem(p, oemPorCodigo));
      setEnrichStatus(`Procesando lote ${i + 1} de ${totalBatches}...`);

      if (i > 0) await new Promise(r => setTimeout(r, 6000));

      try {
        const data = await enrichBatchWithRetry({ products: batch, tnCategories });

        if (data.results) {
          data.results.forEach(result => {
            const originalProduct = classifiedProducts.find(p => p.CODIGO === result.codigo);
            if (originalProduct && updateProductEnriched) {
              updateProductEnriched(originalProduct._id, result);
            }
          });
          processed += batch.length;
          setEnrichProcessed(processed);
          if (data.provider === "gemini") {
            // Solo el primero avisa por toast; el resumen del final cuenta todos.
            if (lotesGemini.length === 0) {
              toast?.info?.(`Groq saturado, se usó Gemini en el lote ${i + 1}. Consume de tu plan de Gemini.`);
            }
            lotesGemini.push(i + 1);
            setEnrichStatus(`✓ ${processed}/${total} completados — lote ${i + 1} con Gemini`);
          } else {
            setEnrichStatus(`✓ ${processed}/${total} completados`);
          }

          // ── Auto-crear nivel4 sugeridos en este lote (doble validación) ──────
          if (loadTnCategories) {
            const nuevasSugerencias = {};
            data.results.forEach(r => {
              if (!r.es_categoria_nueva || !r.categoria_tiendanube) return;
              const cat = r.categoria_tiendanube.trim();
              const parts = cat.split(" > ").map(p => p.trim());
              if (parts.length !== 4) return;
              if (parts[0] !== "Repuestos y Accesorios") return;
              const nivel2Existe = tnCategories.some(c => c.nivel2 === parts[1]);
              if (!nivel2Existe) return;
              const nivel3Existe = tnCategories.some(c => c.nivel2 === parts[1] && c.nivel3 === parts[2]);
              if (!nivel3Existe) return;
              const nivel4Existe = tnCategories.some(c =>
                c.nivel2 === parts[1] && c.nivel3 === parts[2] &&
                c.nivel4?.toLowerCase() === parts[3].toLowerCase()
              );
              if (nivel4Existe) return;
              if (parts[3].split(" ").length > 4) return;
              if (!nuevasSugerencias[cat]) nuevasSugerencias[cat] = { count: 0, keywords: r.keywords_sugeridas || "", parts };
              nuevasSugerencias[cat].count++;
            });

            const toCreate = Object.entries(nuevasSugerencias).filter(([, d]) => d.count >= 2);
            for (const [catPath, catData] of toCreate) {
              try {
                await apiFetch("/api/tn-categories", {
                  method: "POST",
                  body: JSON.stringify({
                    nivel1: catData.parts[0],
                    nivel2: catData.parts[1],
                    nivel3: catData.parts[2],
                    nivel4: catData.parts[3],
                    keywords: catData.keywords || null,
                  }),
                });
                console.log("[runEnrich] Nivel4 creado:", catPath);
              } catch (e) {
                console.log("[runEnrich] Error creando nivel4:", catPath, e.message);
              }
            }
            if (toCreate.length > 0) {
              await loadTnCategories();
              const nombres = toCreate.map(([cat]) => cat.split(" > ").pop()).join(", ");
              toast?.success(`✨ Nuevas subcategorías: ${nombres}`);
            }
          }
        }
      } catch (e) {
        failedBatches++;
        console.error("Error enriqueciendo lote", i, e);
        toast?.error?.(`⚠️ Lote ${i + 1}/${totalBatches} falló: ${e.message}`);
      }
    }

    // ── Detectar productos sin nivel4 (para banner de completar) ─────────────
    const productosSinNivel4 = classifiedProducts.filter(p => {
      if (!selectedIds.includes(p._id)) return false;
      const cat = p._enriched?.categoria_tiendanube || p._tn_manual || "";
      const parts = cat.split(" > ").filter(Boolean);
      return parts.length < 4;
    });
    setSinNivel4(productosSinNivel4);

    setEnrichLoading(false);
    if (!enrichAbortRef.current) {
      const avisoGemini = lotesGemini.length
        ? ` · ${lotesGemini.length} ${lotesGemini.length === 1 ? "lote" : "lotes"} con Gemini (Groq saturado): ${lotesGemini.join(", ")}`
        : "";
      setEnrichStatus(
        (failedBatches > 0
          ? `⚠️ Enriquecimiento finalizado con ${failedBatches} de ${totalBatches} lote(s) fallido(s).`
          : `✅ Enriquecimiento finalizado con éxito.`) + avisoGemini
      );
      setStep(3);
    }
  };

  const handleIndividualSave = (id, fields) => {
    if (updateProductEnriched) {
      updateProductEnriched(id, fields);
    }
    // Persistir en Supabase
    if (onProductCorrected) {
      const product = classifiedProducts.find(p => p._id === id);
      if (product) onProductCorrected({ ...product, _enriched: fields });
    }
    setIndividualEditingProduct(null);
  };

  const handleCompletarNivel4 = async () => {
    if (sinNivel4.length === 0) return;
    setNivel4Loading(true);
    toast?.info?.(`Completando nivel4 para ${sinNivel4.length} productos...`);
    const batchSize = 15;
    const totalBatches = Math.ceil(sinNivel4.length / batchSize);
    let failedBatches = 0;
    for (let i = 0; i < totalBatches; i++) {
      const batch = sinNivel4.slice(i * batchSize, (i + 1) * batchSize);
      if (i > 0) await new Promise(r => setTimeout(r, 6000));
      try {
        const data = await enrichBatchWithRetry({ products: batch.map(p => conOem(p, oemPorCodigo)), tnCategories, force_nivel4: true });
        if (data.results) {
          data.results.forEach(result => {
            if (!result.categoria_tiendanube) return;
            const parts = result.categoria_tiendanube.split(" > ").filter(Boolean);
            if (parts.length < 4) return;
            const orig = classifiedProducts.find(p => p.CODIGO === result.codigo);
            if (orig && updateProductEnriched) {
              const merged = { ...(orig._enriched || {}), categoria_tiendanube: result.categoria_tiendanube };
              updateProductEnriched(orig._id, merged);
            }
          });
        }
      } catch (e) {
        failedBatches++;
        console.error("Error completando nivel4 lote", i, e);
      }
    }
    setSinNivel4([]);
    setNivel4Loading(false);
    if (failedBatches > 0) {
      toast?.error?.(`⚠️ ${failedBatches} de ${totalBatches} lote(s) no se pudieron completar.`);
    } else {
      toast?.success?.("✅ nivel4 completado en todos los productos.");
    }
  };

  // Descarga de las fotos del lote como .zip, para la app de carga masiva de
  // imágenes de Tienda Nube (el CSV de productos no acepta imágenes por URL).
  const [zipProgress, setZipProgress] = useState(null);

  const handleDescargarZip = async () => {
    setZipProgress({ hechas: 0, total: 0 });
    try {
      const total = await exportImagenesZip(selectedProducts, (hechas, t) => setZipProgress({ hechas, total: t }));
      if (total === 0) {
        toast?.info?.("Ninguno de los productos de este lote tiene fotos cargadas todavía.");
      } else {
        toast?.success?.(`✅ ${total} ${total === 1 ? "imagen" : "imágenes"} en el .zip.`);
      }
    } catch (e) {
      toast?.error?.(`No se pudo armar el .zip: ${e.message}`);
    } finally {
      setZipProgress(null);
    }
  };

  // Slug tal como lo va a escribir el CSV — misma resolución que exportTiendaNubeCSV()
  const slugDeProducto = (p) => (p._enriched?.slug || slugify(p.PRODUCTO || p.producto || ""));

  // Chequeo contra lo ya publicado en lotes anteriores. El chequeo intra-lote
  // vive en exportTiendaNubeCSV(); este cubre lo que la app no puede ver: lo
  // que ya está arriba en Tienda Nube.
  const avisarSiYaPublicados = async () => {
    const slugs = [...new Set(selectedProducts.map(slugDeProducto).filter(Boolean))];
    if (slugs.length === 0) return;
    try {
      const data = await apiFetch("/api/published", {
        method: "POST",
        body: JSON.stringify({ check: slugs }),
      });
      const publicados = data?.publicados || [];
      if (publicados.length === 0) return;

      const detalle = publicados
        .map(p => `  - "${p.slug}" ← ya publicado${p.lote ? ` en lote "${p.lote}"` : ""}`)
        .join("\n");
      console.warn(`[ExportView] ${publicados.length} slug(s) ya publicados:\n${detalle}`);
      alert(`Atención: ${publicados.length} producto(s) de este lote ya fueron publicados antes.\n\nSi es una actualización intencional, seguí. Si no, revisá — al importar, un slug repetido pisa el producto anterior.\n\n${detalle}`);
    } catch (e) {
      // Que falle el chequeo no debe impedir exportar
      console.warn("[ExportView] No se pudo chequear productos publicados:", e.message);
    }
  };

  const handleDownloadClick = async () => {
    await avisarSiYaPublicados();
    const { withoutPrice, withoutCat, withoutDesc } = stats;
    if (withoutPrice > 0 || withoutCat > 0 || withoutDesc > 0) {
      setShowExportWarning(true);
    } else {
      exportTiendaNubeCSV(selectedProducts, tnCategories);
    }
  };

  // Se llama a mano DESPUÉS de confirmar que la importación en Tienda Nube
  // salió bien — la app no tiene forma de saberlo sola.
  const handleMarcarPublicado = async () => {
    const hoy = new Date();
    const sugerido = `lote-${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
    const lote = prompt(
      `Nombre del lote (para poder identificarlo después):\n\nSe van a marcar ${selectedProducts.length} productos como ya publicados en Tienda Nube.`,
      sugerido
    );
    if (lote === null) return;

    setMarcandoPublicado(true);
    try {
      const mark = selectedProducts.map(p => ({
        slug: slugDeProducto(p),
        codigo: p.CODIGO || p.codigo || "",
        categoria_tiendanube: getCategoriaTN(p, tnCategories),
      })).filter(m => m.slug);

      const data = await apiFetch("/api/published", {
        method: "POST",
        body: JSON.stringify({ mark, lote: lote.trim() }),
      });
      toast?.success?.(`✅ ${data?.marked ?? mark.length} productos marcados como publicados.`);
    } catch (e) {
      toast?.error?.(`No se pudo marcar el lote: ${e.message}`);
    } finally {
      setMarcandoPublicado(false);
    }
  };

  const stats = useMemo(() => {
    let withPrice = 0, withoutPrice = 0, withCat = 0, withoutCat = 0, withEnrich = 0, withoutDesc = 0;
    selectedProducts.forEach(p => {
      const price = getProductPrice(p);
      if (price > 0) withPrice++; else withoutPrice++;
      const cat = getCategoriaTN(p, tnCategories);
      if (cat !== "Repuestos y Accesorios") withCat++; else withoutCat++;
      if (p._enriched) withEnrich++;
      if (!p._enriched?.descripcion_html) withoutDesc++;
    });
    return { withPrice, withoutPrice, withCat, withoutCat, withEnrich, withoutDesc };
  }, [selectedProducts, tnCategories]);

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
      <div style={{ display: "flex", flexDirection: isNarrow ? "column" : "row", gap: 8, alignItems: isNarrow ? "flex-start" : "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: isNarrow ? "12px 14px" : "12px 20px" }}>
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
              {i < 2 && !isNarrow && <div style={{ flex: 1, height: 1, background: C.border }} />}
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
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                {sinNivel4.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: `${C.warning}12`, border: `1px solid ${C.warning}40`, borderRadius: 10 }}>
                    <span style={{ fontSize: 12, color: C.warning, fontWeight: 600 }}>
                      ⚠️ {sinNivel4.length} productos con categoría incompleta (sin nivel4)
                    </span>
                    <button
                      onClick={handleCompletarNivel4}
                      disabled={nivel4Loading}
                      style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: nivel4Loading ? C.border : C.warning, color: nivel4Loading ? C.textDim : "#fff", fontSize: 11, fontWeight: 700, cursor: nivel4Loading ? "default" : "pointer" }}
                    >
                      {nivel4Loading ? "Completando..." : "Completar nivel4 con IA"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Enriched items editor list */}
          {selectedProducts.some(p => p._enriched) && (
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                Productos enriquecidos (Edición Manual disponible):
              </h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 14 }}>
                {selectedProducts.filter(p => p._enriched).map(p => (
                  <div
                    key={p._id}
                    style={{
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      borderRadius: 12,
                      padding: 14,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Header */}
                    <div>
                      <div style={{ fontSize: 10, color: C.textDim, fontWeight: 700, textTransform: "uppercase" }}>{p.CODIGO}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
                        {p._enriched.nombre_limpio}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted }}>
                        Marca fab: <strong>{p._enriched.marca || "—"}</strong>
                      </div>
                    </div>

                    {/* Propiedades inline editables */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                      {[
                        { nKey: "prop1_nombre", vKey: "prop1_valor", placeholder: "Marca compatible" },
                        { nKey: "prop2_nombre", vKey: "prop2_valor", placeholder: "Medida/Capacidad" },
                        { nKey: "prop3_nombre", vKey: "prop3_valor", placeholder: "Tipo/Modelo/Conexión" },
                      ].map(({ nKey, vKey, placeholder }) => {
                        const handlePropChange = (key, val) => {
                          const newEnriched = { ...p._enriched, [key]: val };
                          if (updateProductEnriched) updateProductEnriched(p._id, newEnriched);
                        };
                        const handlePropBlur = () => {
                          // Persistir en Supabase al salir del campo
                          if (onProductCorrected) onProductCorrected({ ...p });
                        };
                        return (
                          <div key={nKey} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                            <input
                              value={p._enriched[nKey] || ""}
                              onChange={e => handlePropChange(nKey, e.target.value)}
                              onBlur={handlePropBlur}
                              placeholder={placeholder}
                              style={{ flex: "0 0 110px", padding: "3px 6px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 10 }}
                            />
                            <span style={{ fontSize: 10, color: C.textDim }}>:</span>
                            <input
                              value={p._enriched[vKey] || ""}
                              onChange={e => handlePropChange(vKey, e.target.value)}
                              onBlur={handlePropBlur}
                              placeholder="valor..."
                              style={{ flex: 1, padding: "3px 6px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 10 }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Dims + edit modal */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
                      <div style={{ display: "flex", gap: 4, fontSize: 10 }}>
                        <span style={{ padding: "1px 5px", background: C.surface2, borderRadius: 4, color: C.textMuted }}>
                          {p._enriched.peso_kg || "?"}kg
                        </span>
                        <span style={{ padding: "1px 5px", background: C.surface2, borderRadius: 4, color: C.textMuted }}>
                          {p._enriched.alto_cm}x{p._enriched.ancho_cm}cm
                        </span>
                      </div>
                      <button
                        onClick={() => setIndividualEditingProduct(p)}
                        style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.accent, fontSize: 10, cursor: "pointer" }}
                      >
                        ✏️ Más campos
                      </button>
                    </div>
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
            <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
              CSV UTF-8 con BOM, separado por punto y coma, <strong>{selectedProducts.length}</strong> productos.
            </p>

            {/* Resumen */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20, padding: "10px 14px", background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, alignItems: "center" }}>
              <span style={{ color: C.success }}>✅ Con precio: {stats.withPrice}</span>
              <span style={{ color: C.textDim }}>|</span>
              <span style={{ color: C.danger }}>⚠️ Sin precio: {stats.withoutPrice}</span>
              <span style={{ color: C.textDim }}>|</span>
              <span style={{ color: C.text }}>📁 Con categoría: {stats.withCat}</span>
              <span style={{ color: C.textDim }}>|</span>
              <span style={{ color: C.accent }}>🤖 Enriquecidos: {stats.withEnrich}</span>
            </div>

            {/* Advertencias + botón de descarga */}
            {showExportWarning ? (
              <div style={{ marginBottom: 20, padding: 16, background: `${C.warning}10`, border: `1px solid ${C.warning}40`, borderRadius: 10 }}>
                <div style={{ fontWeight: 700, color: C.warning, marginBottom: 10, fontSize: 13 }}>Advertencias antes de exportar:</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: C.text, marginBottom: 14 }}>
                  {stats.withoutPrice > 0 && (
                    <div>⚠️ <strong>{stats.withoutPrice} productos sin precio</strong> → se exportarán como "Mostrar en tienda: NO"</div>
                  )}
                  {stats.withoutCat > 0 && (
                    <div>⚠️ <strong>{stats.withoutCat} productos sin categoría</strong> → usarán "Repuestos y Accesorios" como fallback</div>
                  )}
                  {stats.withoutDesc > 0 && (
                    <div>⚠️ <strong>{stats.withoutDesc} productos sin descripción</strong> → la ficha quedará vacía en Tienda Nube</div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => { exportTiendaNubeCSV(selectedProducts, tnCategories); setShowExportWarning(false); }}
                    style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.success, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    📥 Exportar de todas formas
                  </button>
                  <button
                    onClick={() => setShowExportWarning(false)}
                    style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 24 }}>
                <button
                  onClick={handleDownloadClick}
                  style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: C.success, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 6px -1px rgba(16,185,129,0.2)", width: isNarrow ? "100%" : undefined }}
                >
                  📥 Descargar CSV Tienda Nube (24 columnas)
                </button>
                <button
                  onClick={handleDescargarZip}
                  disabled={!!zipProgress}
                  title="Tienda Nube no acepta imágenes por URL en el CSV: las fotos van aparte, nombradas por SKU, para la app de carga masiva del marketplace."
                  style={{ padding: "12px 24px", borderRadius: 10, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accent, fontSize: 14, fontWeight: 700, cursor: zipProgress ? "default" : "pointer", width: isNarrow ? "100%" : undefined }}
                >
                  {zipProgress
                    ? (zipProgress.total ? `Armando .zip ${zipProgress.hechas}/${zipProgress.total}...` : "Buscando fotos...")
                    : "🖼️ Exportar imágenes del lote (.zip)"}
                </button>
                <button
                  onClick={handleMarcarPublicado}
                  disabled={marcandoPublicado || selectedProducts.length === 0}
                  title="Marcar estos productos como ya publicados, DESPUÉS de confirmar que la importación en Tienda Nube salió bien"
                  style={{ padding: "12px 20px", borderRadius: 10, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 13, fontWeight: 600, cursor: marcandoPublicado ? "default" : "pointer" }}
                >
                  {marcandoPublicado ? "Marcando..." : "✓ Marcar lote como publicado"}
                </button>
              </div>
            )}

            {/* Preview tabla completa */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", marginBottom: 8 }}>
                Vista previa — {Math.min(selectedProducts.length, 50)} de {selectedProducts.length} productos
              </div>
              <div style={{ overflowX: "auto", borderRadius: 8, border: `1px solid ${C.border}`, maxHeight: 380, overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead style={{ position: "sticky", top: 0, background: C.surface2, zIndex: 1 }}>
                    <tr>
                      {["URL", "Nombre", "Categorías", "Precio", "Peso", "SKU", "Mostrar", "Descripción"].map(h => (
                        <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: C.textMuted, fontSize: 10, textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selectedProducts.slice(0, 50).map((p, i) => {
                      const e = p._enriched || {};
                      const precio = getProductPrice(p);
                      const cat = getCategoriaTN(p, tnCategories);
                      const noCat = cat === "Repuestos y Accesorios";
                      const noDesc = !e.descripcion_html;
                      const slug = e.slug || slugify(p.PRODUCTO || "");
                      const descText = (e.descripcion_html || "").replace(/<[^>]+>/g, "");
                      return (
                        <tr key={p._id || i} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 10, color: C.textDim, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{slug || "—"}</td>
                          <td style={{ padding: "6px 10px", fontWeight: 600, color: C.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {e.nombre_limpio || p.PRODUCTO || "—"}
                          </td>
                          <td style={{ padding: "6px 10px", color: noCat ? C.warning : C.textMuted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {noCat ? "Sin categoría" : cat.split(" > ").slice(-2).join(" > ")}
                          </td>
                          <td style={{ padding: "6px 10px", color: precio > 0 ? C.success : C.danger, fontWeight: 600, whiteSpace: "nowrap" }}>
                            {precio > 0 ? `$${precio.toLocaleString("es-AR")}` : "Sin precio"}
                          </td>
                          <td style={{ padding: "6px 10px", color: C.textMuted, whiteSpace: "nowrap" }}>
                            {e.peso_kg ? `${e.peso_kg}kg` : "—"}
                          </td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 10, color: C.textDim }}>{p.CODIGO || "—"}</td>
                          <td style={{ padding: "6px 10px", fontWeight: 700, fontSize: 10, color: precio > 0 ? C.success : C.danger }}>
                            {precio > 0 ? "SI" : "NO"}
                          </td>
                          <td style={{ padding: "6px 10px", color: noDesc ? C.textDim : C.text, fontStyle: noDesc ? "italic" : "normal", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {noDesc ? "Sin descripción" : descText.substring(0, 100) + (descText.length > 100 ? "…" : "")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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
                      <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Marca (fabricante)</label>
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
                        defaultValue={e.categoria_tiendanube || buildCategoriaTN(p, tnCategories)}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                      />
                    </div>
                  </div>

                  {/* Propiedades variables */}
                  <div style={{ background: `${C.accent}08`, borderRadius: 8, padding: 12, border: `1px solid ${C.accent}20` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 8 }}>Propiedades Tienda Nube</div>
                    {[
                      { nId: "edit-p1n", vId: "edit-p1v", nDef: e.prop1_nombre || "", vDef: e.prop1_valor || "", label: "Propiedad 1 (Marca compatible)", ph: "ej: Orbis / Longvie" },
                      { nId: "edit-p2n", vId: "edit-p2v", nDef: e.prop2_nombre || "", vDef: e.prop2_valor || "", label: "Propiedad 2 (Medida / Capacidad)", ph: "ej: 76mm" },
                      { nId: "edit-p3n", vId: "edit-p3v", nDef: e.prop3_nombre || "", vDef: e.prop3_valor || "", label: "Propiedad 3 (Tipo / Modelo)", ph: "ej: Botonera grande" },
                    ].map(({ nId, vId, nDef, vDef, label, ph }) => (
                      <div key={nId} style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>{label}</label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 6 }}>
                          <input id={nId} defaultValue={nDef} placeholder="nombre..." style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }} />
                          <input id={vId} defaultValue={vDef} placeholder={ph} style={{ padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12 }} />
                        </div>
                      </div>
                    ))}
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
                        prop1_nombre: document.getElementById("edit-p1n").value || null,
                        prop1_valor:  document.getElementById("edit-p1v").value || null,
                        prop2_nombre: document.getElementById("edit-p2n").value || null,
                        prop2_valor:  document.getElementById("edit-p2v").value || null,
                        prop3_nombre: document.getElementById("edit-p3n").value || null,
                        prop3_valor:  document.getElementById("edit-p3v").value || null,
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

/**
 * Trae los códigos ya confirmados a mano de producto_imagenes, indexados por
 * código de producto. Una consulta por tanda, no una por producto.
 */
async function cargarOemConfirmados(productos) {
  const codigos = [...new Set(
    (productos || []).map(p => String(p.CODIGO || p.codigo || "").trim()).filter(Boolean)
  )];
  const mapa = {};
  for (let i = 0; i < codigos.length; i += 100) {
    const tanda = codigos.slice(i, i + 100);
    try {
      const filas = await apiFetch(`/api/product-images?codigos=${encodeURIComponent(tanda.join(","))}`);
      (filas || []).forEach(f => {
        if (!f.ocr_confirmado || !f.codigo_confirmado) return;
        if (!mapa[f.codigo]) mapa[f.codigo] = [];
        if (!mapa[f.codigo].includes(f.codigo_confirmado)) mapa[f.codigo].push(f.codigo_confirmado);
      });
    } catch {
      // Sin fotos el enriquecimiento sigue igual, solo sin tags oem: extra
      return mapa;
    }
  }
  return mapa;
}

function conOem(producto, oemPorCodigo) {
  const codigo = String(producto.CODIGO || producto.codigo || "").trim();
  const oem = oemPorCodigo[codigo];
  return oem && oem.length ? { ...producto, codigos_oem: oem } : producto;
}
