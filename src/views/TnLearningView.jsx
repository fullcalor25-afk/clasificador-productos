import React, { useState, useMemo } from "react";
import { C } from "../constants";
import { fmtDate } from "../utils";
import StatCard from "../components/StatCard";
import Pagination from "../components/Pagination";

export default function TnLearningView({
  tnCorrectionsList = [],
  tnCategories = [],
  onSaveTNCorrection = null,
  onDeleteTNCorrection = null,
  onClearAllTNCorrections = null,
  toast = null,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [editingId, setEditingId] = useState(null);
  const [editLevels, setEditLevels] = useState({ n1: "", n2: "", n3: "", n4: "" });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");

  const selectStyle = {
    padding: "4px 8px", borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: C.bg, color: C.text,
    fontSize: 12, outline: "none", width: "100%",
  };

  // Filtering
  const filteredList = useMemo(() => {
    if (!searchTerm) return tnCorrectionsList;
    const s = searchTerm.toLowerCase();
    return tnCorrectionsList.filter(c =>
      (c.codigo || "").toLowerCase().includes(s) ||
      (c.producto || "").toLowerCase().includes(s) ||
      (c.categoria_tiendanube || "").toLowerCase().includes(s)
    );
  }, [tnCorrectionsList, searchTerm]);

  const pagedList = useMemo(() => {
    const start = page * pageSize;
    return filteredList.slice(start, start + pageSize);
  }, [filteredList, page, pageSize]);

  const totalPages = Math.ceil(filteredList.length / pageSize);

  // Start editing: parse existing levels from the stored path
  const startEdit = (c) => {
    const parts = (c.categoria_tiendanube || "").split(" > ").map(p => p.trim());
    setEditLevels({ n1: parts[0] || "", n2: parts[1] || "", n3: parts[2] || "", n4: parts[3] || "" });
    setEditingId(c.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditLevels({ n1: "", n2: "", n3: "", n4: "" });
  };

  const saveEdit = async (c) => {
    const catPath = [editLevels.n1, editLevels.n2, editLevels.n3, editLevels.n4].filter(Boolean).join(" > ");
    if (!catPath) { toast?.error("Seleccioná al menos una categoría."); return; }
    if (onSaveTNCorrection) {
      await onSaveTNCorrection(c.codigo, catPath, c.producto);
      toast?.success("Corrección TN actualizada.");
    }
    cancelEdit();
  };

  const handleDelete = (c) => {
    if (onDeleteTNCorrection) {
      onDeleteTNCorrection(c.id, c.codigo);
      toast?.success(`Corrección TN eliminada para ${c.codigo}.`);
    }
  };

  const handleClearAll = () => {
    if (clearConfirmText !== "ELIMINAR") return;
    if (onClearAllTNCorrections) {
      onClearAllTNCorrections();
      toast?.success("Se eliminaron todas las correcciones TN.");
    }
    setShowClearConfirm(false);
    setClearConfirmText("");
  };

  const handleExport = () => {
    const headers = ["codigo", "producto", "categoria_tiendanube", "updated_at"];
    const rows = tnCorrectionsList.map(c => [
      c.codigo,
      `"${(c.producto || "").replace(/"/g, '""')}"`,
      `"${(c.categoria_tiendanube || "").replace(/"/g, '""')}"`,
      c.updated_at || "",
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "hvac_correcciones_tn.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Format path for display
  const PathDisplay = ({ path, isManual }) => {
    const parts = (path || "").split(" > ").filter(Boolean);
    if (parts.length === 0) return <span style={{ color: C.textDim }}>—</span>;
    return (
      <span style={{ fontSize: 12 }}>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: C.textDim, margin: "0 2px", fontSize: 10 }}>›</span>}
            {i === parts.length - 1
              ? <strong style={{ color: C.text }}>{part}</strong>
              : <span style={{ color: C.textMuted }}>{part}</span>
            }
          </React.Fragment>
        ))}
      </span>
    );
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>🏷 Aprendizaje Categorías TN</h2>
          <p style={{ fontSize: 13, color: C.textMuted }}>
            Correcciones manuales de categoría Tienda Nube. Se aplican automáticamente al cargar productos.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleExport}
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

      {/* Stats */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <StatCard label="Correcciones TN" value={tnCorrectionsList.length} color={C.accent} icon="🏷" />
        <StatCard label="Categorías distintas" value={new Set(tnCorrectionsList.map(c => c.categoria_tiendanube)).size} color={C.success} icon="📂" />
      </div>

      {/* Search */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
        <input
          type="text"
          placeholder="🔍 Buscar por código, producto o categoría..."
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
          style={{ padding: "6px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", width: "100%" }}
        />
      </div>

      {/* Table */}
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "12px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Código</th>
                <th style={{ padding: "12px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Producto</th>
                <th style={{ padding: "12px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Categoría TN asignada</th>
                <th style={{ padding: "12px 14px", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Fecha</th>
                <th style={{ padding: "12px 14px", textAlign: "center", color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagedList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "40px 20px", textAlign: "center", color: C.textDim }}>
                    No hay correcciones TN memorizadas.
                  </td>
                </tr>
              ) : (
                pagedList.map((c, idx) => (
                  <tr key={c.id || idx} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "8px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDim }}>
                      {c.codigo}
                    </td>
                    <td style={{ padding: "8px 14px", fontWeight: 600, color: C.text }}>
                      {c.producto || "—"}
                    </td>
                    <td style={{ padding: "8px 14px", maxWidth: 300 }}>
                      {editingId === c.id ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {/* nivel1 */}
                          <select value={editLevels.n1} onChange={e => setEditLevels(prev => ({ ...prev, n1: e.target.value, n2: "", n3: "", n4: "" }))} style={selectStyle}>
                            <option value="">Sin categoría principal</option>
                            {[...new Set(tnCategories.map(cat => cat.nivel1).filter(Boolean))].map(v =>
                              <option key={v} value={v}>{v}</option>
                            )}
                          </select>
                          {editLevels.n1 && (
                            <select value={editLevels.n2} onChange={e => setEditLevels(prev => ({ ...prev, n2: e.target.value, n3: "", n4: "" }))} style={selectStyle}>
                              <option value="">Sin categoría</option>
                              {[...new Set(tnCategories.filter(cat => cat.nivel1 === editLevels.n1 && cat.nivel2).map(cat => cat.nivel2))].map(v =>
                                <option key={v} value={v}>{v}</option>
                              )}
                            </select>
                          )}
                          {editLevels.n2 && (
                            <select value={editLevels.n3} onChange={e => setEditLevels(prev => ({ ...prev, n3: e.target.value, n4: "" }))} style={selectStyle}>
                              <option value="">Sin subcategoría</option>
                              {[...new Set(tnCategories.filter(cat => cat.nivel1 === editLevels.n1 && cat.nivel2 === editLevels.n2 && cat.nivel3).map(cat => cat.nivel3))].map(v =>
                                <option key={v} value={v}>{v}</option>
                              )}
                            </select>
                          )}
                          {editLevels.n3 && (
                            <select value={editLevels.n4} onChange={e => setEditLevels(prev => ({ ...prev, n4: e.target.value }))} style={selectStyle}>
                              <option value="">Sin tipo</option>
                              {[...new Set(tnCategories.filter(cat => cat.nivel1 === editLevels.n1 && cat.nivel2 === editLevels.n2 && cat.nivel3 === editLevels.n3 && cat.nivel4).map(cat => cat.nivel4))].map(v =>
                                <option key={v} value={v}>{v}</option>
                              )}
                            </select>
                          )}
                          <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                            <button
                              onClick={() => saveEdit(c)}
                              style={{ flex: 1, padding: "4px", borderRadius: 5, border: "none", background: C.accent, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                            >Guardar</button>
                            <button
                              onClick={cancelEdit}
                              style={{ flex: 1, padding: "4px", borderRadius: 5, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 11, cursor: "pointer" }}
                            >Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <PathDisplay path={c.categoria_tiendanube} />
                      )}
                    </td>
                    <td style={{ padding: "8px 14px", fontSize: 11, color: C.textDim }}>
                      {fmtDate(c.updated_at || c.created_at)}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        {editingId !== c.id && (
                          <button
                            onClick={() => startEdit(c)}
                            style={{ background: "transparent", border: `1px solid ${C.border}`, padding: "4px 8px", borderRadius: 6, color: C.textMuted, cursor: "pointer", fontSize: 11 }}
                          >✏️</button>
                        )}
                        <button
                          onClick={() => handleDelete(c)}
                          style={{ background: "transparent", border: `1px solid ${C.danger}40`, padding: "4px 8px", borderRadius: 6, color: C.danger, cursor: "pointer", fontSize: 11 }}
                        >🗑</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={size => { setPageSize(size); setPage(0); }}
          totalItems={filteredList.length}
        />
      </div>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
          <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, width: "100%", maxWidth: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.danger, marginBottom: 8 }}>⚠️ Eliminar correcciones TN</h3>
            <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
              Esto borrará permanentemente todas las correcciones de categoría TN. No se puede deshacer.
            </p>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.text, display: "block", marginBottom: 6 }}>
              Escribí <strong style={{ color: C.danger }}>ELIMINAR</strong> para confirmar:
            </label>
            <input
              type="text"
              value={clearConfirmText}
              onChange={e => setClearConfirmText(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.danger}`, background: C.bg, color: C.text, fontSize: 13, outline: "none", marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowClearConfirm(false); setClearConfirmText(""); }} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={handleClearAll} disabled={clearConfirmText !== "ELIMINAR"} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: clearConfirmText === "ELIMINAR" ? C.danger : C.border, color: "#fff", fontSize: 12, fontWeight: 600, cursor: clearConfirmText === "ELIMINAR" ? "pointer" : "default" }}>Eliminar todo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
