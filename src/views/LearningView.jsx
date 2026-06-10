import React, { useState, useMemo } from "react";
import { C, CLS, CLS_COLORS } from "../constants";
import { fmtDate, parseTabular, fetchWithTimeout } from "../utils";
import StatCard from "../components/StatCard";
import Pagination from "../components/Pagination";

export default function LearningView({
  correctionsList,
  onSaveCorrection,
  onDeleteCorrection,
  onClearAllCorrections,
  onImportBulkCorrections,
  classifiedProductsCount = 0,
  toast = null,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editingId, setEditingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  
  // Modals state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearInputConfirm, setClearInputConfirm] = useState("");

  // Distribution counters
  const stats = useMemo(() => {
    const counts = {};
    correctionsList.forEach(c => {
      const cls = c.clasificacion_corregida || "OTRO";
      counts[cls] = (counts[cls] || 0) + 1;
    });
    return counts;
  }, [correctionsList]);

  // Filtering
  const filteredCorrections = useMemo(() => {
    return correctionsList.filter(c => {
      // Class filter
      if (filter !== "ALL") {
        if (c.clasificacion_corregida !== filter) return false;
      }
      
      // Search
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return (
          (c.producto || "").toLowerCase().includes(s) ||
          (c.codigo || "").toLowerCase().includes(s) ||
          (c.rubro || "").toLowerCase().includes(s)
        );
      }
      
      return true;
    });
  }, [correctionsList, filter, searchTerm]);

  // Paged
  const pagedCorrections = useMemo(() => {
    const start = page * pageSize;
    return filteredCorrections.slice(start, start + pageSize);
  }, [filteredCorrections, page, pageSize]);

  const totalPages = Math.ceil(filteredCorrections.length / pageSize);

  // Bulk import submit
  const handleImportSubmit = () => {
    if (!importCsvText.trim()) return;
    const parsed = parseTabular(importCsvText);
    
    // Validate rows: must contain 'codigo' and 'clasificacion_corregida' (case insensitive check)
    const validRows = parsed.map(row => {
      const codigo = row.codigo || row.CODIGO || row.Codigo;
      const clasificacion = row.clasificacion_corregida || row.CLASIFICACION_CORREGIDA || row.clasificacion || row.CLASIFICACION;
      return { codigo, clasificacion_corregida: clasificacion };
    }).filter(row => row.codigo && row.clasificacion_corregida);

    if (validRows.length === 0) {
      toast?.error("No se encontraron filas válidas con las columnas 'codigo' y 'clasificacion_corregida'.");
      return;
    }

    onImportBulkCorrections(validRows);
    setImportCsvText("");
    setShowImportModal(false);
    toast?.success(`Se importaron ${validRows.length} correcciones correctamente.`);
  };

  // Export CSV
  const handleExportCorrections = () => {
    const headers = ["codigo", "producto", "rubro", "sub_rubro", "clasificacion_corregida"];
    const rows = correctionsList.map(c => [
      c.codigo,
      `"${(c.producto || "").replace(/"/g, '""')}"`,
      c.rubro || "",
      c.sub_rubro || "",
      c.clasificacion_corregida
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hvac_correcciones_aprendidas.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Clear confirm submit
  const handleClearSubmit = () => {
    if (clearInputConfirm !== "ELIMINAR") return;
    onClearAllCorrections();
    setShowClearConfirm(false);
    setClearInputConfirm("");
    toast?.success("Se eliminó toda la base de datos de aprendizaje.");
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>
      
      {/* Header Info */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
            🧠 Base de Aprendizaje IA
          </h2>
          <p style={{ fontSize: 13, color: C.textMuted }}>
            Administrá el conocimiento aprendido. Cuando la IA clasifica, estas reglas tienen prioridad 100%.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setShowImportModal(true)}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            📥 Importar CSV
          </button>
          <button
            onClick={handleExportCorrections}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            📤 Exportar CSV
          </button>
          <button
            onClick={() => setShowClearConfirm(true)}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.danger}40`, background: "transparent", color: C.danger, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            💥 Limpiar Todo
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard label="Correcciones memorizadas" value={correctionsList.length} color={C.accent} icon="🧠" />
        <StatCard label="Repuestos corregidos" value={stats.REPUESTO || 0} color="#f59e0b" icon="⚙️" />
        <StatCard label="Accesorios corregidos" value={stats.ACCESORIO || 0} color="#8b5cf6" icon="🔩" />
        <StatCard label="Impacto en memoria" value={classifiedProductsCount} color="#10b981" icon="⚡" />
      </div>

      {/* List Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
        <input
          type="text"
          placeholder="🔍 Buscar por nombre o código en el aprendizaje..."
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", flex: 1 }}
        />

        <div style={{ display: "flex", gap: 4 }}>
          {["ALL", "REPUESTO", "ACCESORIO", "PRODUCTO_COMPLETO", "SERVICIO", "OTRO"].map(f => {
            const isAct = filter === f;
            const lbl = f === "ALL" ? "Todos" : CLS[f]?.label || f;
            const color = f === "ALL" ? C.accent : CLS[f]?.color;
            return (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(0); }}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${isAct ? color : C.border}`,
                  background: isAct ? `${color}15` : "transparent",
                  color: isAct ? color : C.textMuted,
                  cursor: "pointer",
                }}
              >
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {/* Corrections Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "10px 12px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Código</th>
                <th style={{ padding: "10px 12px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Producto</th>
                <th style={{ padding: "10px 12px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Clasificación</th>
                <th style={{ padding: "10px 12px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Categoría TN</th>
                <th style={{ padding: "10px 12px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Marca compatible</th>
                <th style={{ padding: "10px 12px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Medida</th>
                <th style={{ padding: "10px 12px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Fecha</th>
                <th style={{ padding: "10px 12px", textAlign: "center", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagedCorrections.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "40px 20px", textAlign: "center", color: C.textDim }}>
                    No hay correcciones memorizadas.
                  </td>
                </tr>
              ) : (
                pagedCorrections.map((c, idx) => {
                  const cfg = CLS[c.clasificacion_corregida] || CLS.OTRO;
                  const isExpanded = expandedId === (c.id || idx);
                  const hasEnriched = !!(c.nombre_limpio || c.marca || c.prop1_nombre || c.peso_kg || c.categoria_tiendanube);
                  // Último nivel de la categoría TN para mostrar compacto
                  const catLastLevel = c.categoria_tiendanube ? c.categoria_tiendanube.split(" > ").pop() : null;
                  return (
                    <React.Fragment key={c.id || idx}>
                      <tr style={{ borderBottom: isExpanded ? "none" : `1px solid ${C.border}`, background: isExpanded ? `${C.accent}06` : "transparent" }}>
                        <td style={{ padding: "8px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDim }}>
                          {c.codigo}
                        </td>
                        <td style={{ padding: "8px 12px", fontWeight: 600, color: C.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.nombre_limpio || c.producto || "—"}
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          {editingId === c.id ? (
                            <select
                              value={c.clasificacion_corregida}
                              onChange={e => {
                                onSaveCorrection({ CODIGO: c.codigo, PRODUCTO: c.producto, RUBRO: c.rubro, "SUB RUBRO": c.sub_rubro }, e.target.value);
                                setEditingId(null);
                              }}
                              style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.accent}`, background: C.surface, color: C.text, fontSize: 12, outline: "none" }}
                            >
                              {Object.keys(CLS).map(k => (
                                <option key={k} value={k}>{CLS[k].label}</option>
                              ))}
                            </select>
                          ) : (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: `${cfg.color}12`, color: cfg.color, border: `1px solid ${cfg.color}25` }}>
                              {cfg.icon} {cfg.label}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: 11, color: C.textMuted, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {catLastLevel || <span style={{ color: C.textDim }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: 11, color: C.textMuted }}>
                          {c.prop1_valor || <span style={{ color: C.textDim }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: 11, color: C.textMuted }}>
                          {c.prop2_valor || <span style={{ color: C.textDim }}>—</span>}
                        </td>
                        <td style={{ padding: "8px 12px", fontSize: 11, color: C.textDim }}>
                          {fmtDate(c.updated_at)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "center" }}>
                          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                            {hasEnriched && (
                              <button
                                onClick={() => setExpandedId(isExpanded ? null : (c.id || idx))}
                                style={{ background: "transparent", border: `1px solid ${C.border}`, padding: "3px 7px", borderRadius: 6, color: C.accent, cursor: "pointer", fontSize: 10, fontWeight: 700 }}
                                title="Ver detalles"
                              >
                                {isExpanded ? "▲" : "▼"}
                              </button>
                            )}
                            <button
                              onClick={() => setEditingId(editingId === c.id ? null : c.id)}
                              style={{ background: "transparent", border: `1px solid ${C.border}`, padding: "3px 7px", borderRadius: 6, color: C.textMuted, cursor: "pointer", fontSize: 11 }}
                            >
                              {editingId === c.id ? "✕" : "✏️"}
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`¿Eliminar la memoria aprendida para el código ${c.codigo}?`)) {
                                  onDeleteCorrection(c.id, c.codigo);
                                }
                              }}
                              style={{ background: "transparent", border: `1px solid ${C.danger}40`, padding: "3px 7px", borderRadius: 6, color: C.danger, cursor: "pointer", fontSize: 11 }}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td colSpan={8} style={{ padding: "10px 14px", background: `${C.accent}06` }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 12 }}>
                              {c.nombre_limpio && <div><span style={{ color: C.textDim, fontWeight: 600 }}>Nombre: </span><span style={{ color: C.text }}>{c.nombre_limpio}</span></div>}
                              {c.marca && <div><span style={{ color: C.textDim, fontWeight: 600 }}>Marca fab.: </span><span style={{ color: C.text }}>{c.marca}</span></div>}
                              {c.categoria_tiendanube && <div><span style={{ color: C.textDim, fontWeight: 600 }}>Categoría: </span><span style={{ color: C.text }}>{c.categoria_tiendanube}</span></div>}
                              {c.prop1_nombre && <div><span style={{ color: C.textDim, fontWeight: 600 }}>{c.prop1_nombre}: </span><span style={{ color: C.text }}>{c.prop1_valor || "—"}</span></div>}
                              {c.prop2_nombre && <div><span style={{ color: C.textDim, fontWeight: 600 }}>{c.prop2_nombre}: </span><span style={{ color: C.text }}>{c.prop2_valor || "—"}</span></div>}
                              {c.prop3_nombre && <div><span style={{ color: C.textDim, fontWeight: 600 }}>{c.prop3_nombre}: </span><span style={{ color: C.text }}>{c.prop3_valor || "—"}</span></div>}
                              {c.peso_kg && <div><span style={{ color: C.textDim, fontWeight: 600 }}>Peso: </span><span style={{ color: C.text }}>{c.peso_kg} kg</span></div>}
                              {c.alto_cm && <div><span style={{ color: C.textDim, fontWeight: 600 }}>Dims: </span><span style={{ color: C.text }}>{c.alto_cm}×{c.ancho_cm}×{c.profundidad_cm} cm</span></div>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={size => {
            setPageSize(size);
            setPage(0);
          }}
          totalItems={filteredCorrections.length}
        />
      </div>

      {/* CSV IMPORT MODAL OVERLAY */}
      {showImportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
          <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, width: "100%", maxWidth: 460 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>
              📥 Importar Correcciones de Memoria
            </h3>
            <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginBottom: 16 }}>
              Subí un archivo separado por comas o tabuladores. Las columnas requeridas son: <strong style={{ color: C.text }}>codigo</strong> y <strong style={{ color: C.text }}>clasificacion_corregida</strong>.
            </p>
            
            <textarea
              value={importCsvText}
              onChange={e => setImportCsvText(e.target.value)}
              placeholder="codigo,clasificacion_corregida&#10;10542,REPUESTO&#10;84471,ACCESORIO..."
              style={{ width: "100%", height: 160, padding: 12, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: "monospace", outline: "none", resize: "vertical", marginBottom: 16 }}
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowImportModal(false); setImportCsvText(""); }} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleImportSubmit} disabled={!importCsvText.trim()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: importCsvText.trim() ? C.accent : C.border, color: "#fff", fontSize: 12, fontWeight: 600, cursor: importCsvText.trim() ? "pointer" : "default" }}>Importar</button>
            </div>
          </div>
        </div>
      )}

      {/* DOUBLE CLEAR CONFIRMATION MODAL */}
      {showClearConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
          <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, width: "100%", maxWidth: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.danger, marginBottom: 8 }}>
              ⚠️ ¡ADVERTENCIA DE SEGURIDAD!
            </h3>
            <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
              Estás por eliminar completamente **toda la base de correcciones de la base de datos**. Esto borrará permanentemente todo el aprendizaje acumulado por el negocio y no se puede deshacer.
            </p>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.text, display: "block", marginBottom: 6 }}>
              Para confirmar, escribí la palabra <strong style={{ color: C.danger }}>ELIMINAR</strong> abajo:
            </label>
            <input
              type="text"
              placeholder="Escribí ELIMINAR para continuar"
              value={clearInputConfirm}
              onChange={e => setClearInputConfirm(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.danger}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", marginBottom: 20 }}
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowClearConfirm(false); setClearInputConfirm(""); }} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleClearSubmit} disabled={clearInputConfirm !== "ELIMINAR"} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: clearInputConfirm === "ELIMINAR" ? C.danger : C.border, color: "#fff", fontSize: 12, fontWeight: 600, cursor: clearInputConfirm === "ELIMINAR" ? "pointer" : "default" }}>ELIMINAR MEMORIA COMPLETAMENTE</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
