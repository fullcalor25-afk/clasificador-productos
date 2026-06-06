import React, { useState, useMemo } from "react";
import { C, CLS, CLS_COLORS } from "../constants";
import { buildCategoriaTN } from "../utils";
import ClassificationBadge from "../components/ClassificationBadge";
import Pagination from "../components/Pagination";

export default function TableView({
  classifiedProducts,
  tnCategories = [],
  filter,
  setFilter,
  searchTerm,
  setSearchTerm,
  page,
  setPage,
  onManualClassify,
  onTNCategory = null,
  onBulkClassify,
  rules = [],
  toast = null,
}) {
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState("confidence");
  const [sortDir, setSortDir] = useState("desc");
  const [editingId, setEditingId] = useState(null);
  
  // Filters state
  const [catFilter, setCatFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [confFilter, setConfFilter] = useState("ALL");
  
  // Configurable columns state
  const [visibleColumns, setVisibleColumns] = useState({
    CODIGO: true,
    PRODUCTO: true,
    RUBRO: true,
    SUB_RUBRO: true,
    PROVEEDOR: false,
    CLASIFICACION: true,
    CONFIANZA: true,
    FUENTE: true,
    CATEGORIA: true,
    SUBCATEGORIA: true,
    TIPO: false,
    CATEGORIA_TN: true,
  });
  const [showColPicker, setShowColPicker] = useState(false);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkClass, setBulkClass] = useState("");

  // Sidebar Drawer state
  const [drawerProduct, setDrawerProduct] = useState(null);

  // Filter & Sort Logic using useMemo (Performance Improvement 2)
  const filteredProducts = useMemo(() => {
    return classifiedProducts
      .filter(p => {
        // Classification/Review filter
        if (filter === "REVIEW") {
          if (p._manualClass || p._class.confidence >= 60) return false;
        } else if (filter !== "ALL") {
          const cls = p._manualClass || p._class.classification;
          if (cls !== filter) return false;
        }

        // Category filter
        if (catFilter !== "ALL") {
          if (p._categoria !== catFilter) return false;
        }

        // Source filter
        if (sourceFilter !== "ALL") {
          const src = p._manualClass ? "APRENDIDO" : (p._source || "REGLAS");
          if (src !== sourceFilter) return false;
        }

        // Confidence filter
        if (confFilter !== "ALL") {
          const conf = p._class.confidence;
          if (confFilter === "HIGH" && conf < 80) return false;
          if (confFilter === "MED" && (conf < 40 || conf >= 80)) return false;
          if (confFilter === "LOW" && conf >= 40) return false;
        }

        // Text search
        if (searchTerm) {
          const s = searchTerm.toLowerCase();
          return (
            (p.PRODUCTO || "").toLowerCase().includes(s) ||
            (p.CODIGO || "").toLowerCase().includes(s) ||
            (p.RUBRO || "").toLowerCase().includes(s) ||
            (p.PROVEEDOR || "").toLowerCase().includes(s) ||
            (p["SUB RUBRO"] || "").toLowerCase().includes(s)
          );
        }

        return true;
      })
      .sort((a, b) => {
        let va, vb;
        if (sortBy === "confidence") {
          va = a._class.confidence;
          vb = b._class.confidence;
        } else if (sortBy === "producto") {
          va = a.PRODUCTO || "";
          vb = b.PRODUCTO || "";
        } else if (sortBy === "rubro") {
          va = a.RUBRO || "";
          vb = b.RUBRO || "";
        } else if (sortBy === "clasificacion") {
          va = a._manualClass || a._class.classification;
          vb = b._manualClass || b._class.classification;
        } else if (sortBy === "codigo") {
          va = a.CODIGO || "";
          vb = b.CODIGO || "";
        }

        if (typeof va === "string") {
          return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
        }
        return sortDir === "asc" ? va - vb : vb - va;
      });
  }, [classifiedProducts, filter, catFilter, sourceFilter, confFilter, searchTerm, sortBy, sortDir]);

  // Page split
  const pagedProducts = useMemo(() => {
    const start = page * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, page, pageSize]);

  const totalPages = Math.ceil(filteredProducts.length / pageSize);

  const toggleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(pagedProducts.map(p => p._id));
    } else {
      setSelectedIds([]);
    }
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkClassifySubmit = () => {
    if (!bulkClass || selectedIds.length === 0) return;
    onBulkClassify(selectedIds, bulkClass);
    setBulkClass("");
    setSelectedIds([]);
    toast?.success("Clasificación aplicada en masa.");
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
    setPage(0);
  };

  // Reset page when search or filters change (Bug 7)
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(0);
  };

  const handleFilterChange = (filterVal) => {
    setFilter(filterVal);
    setPage(0);
    setSelectedIds([]);
  };

  // ── TN cascade helpers ──────────────────────────────────────────────────
  const tnSelectStyle = {
    padding: "4px 8px", borderRadius: 6,
    border: `1px solid ${C.border}`,
    background: C.bg, color: C.text,
    fontSize: 12, outline: "none", width: "100%",
  };

  // Derive current TN levels from product state or parse from stored path
  const getTNLevels = (p) => {
    if (p._tn_nivel1 !== undefined) {
      return { n1: p._tn_nivel1 || "", n2: p._tn_nivel2 || "", n3: p._tn_nivel3 || "", n4: p._tn_nivel4 || "" };
    }
    const catPath = p._enriched?.categoria_tiendanube || buildCategoriaTN(p, tnCategories);
    const parts = (catPath || "").split(" > ").map(x => x.trim());
    return { n1: parts[0] || "", n2: parts[1] || "", n3: parts[2] || "", n4: parts[3] || "" };
  };

  // Format category path with separators, last part bold
  const TNCategoryCell = ({ p }) => {
    const { n1, n2, n3, n4 } = getTNLevels(p);
    const parts = [n1, n2, n3, n4].filter(Boolean);
    if (parts.length === 0) return <span style={{ color: C.textDim }}>—</span>;
    const isManual = p._tn_manual;
    const isSuggested = !isManual && !p._enriched?.categoria_tiendanube;
    return (
      <span style={{ fontSize: 12, opacity: isSuggested ? 0.6 : 1 }}>
        {parts.map((part, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color: C.textDim, margin: "0 2px", fontSize: 10 }}>›</span>}
            {i === parts.length - 1
              ? <strong style={{ color: isManual ? C.accent : C.text }}>{part}</strong>
              : <span style={{ color: C.textMuted }}>{part}</span>
            }
          </React.Fragment>
        ))}
        {isManual && <span style={{ marginLeft: 4, fontSize: 10, color: C.accent }} title="Categoría corregida manualmente">✎</span>}
      </span>
    );
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 14, paddingBottom: 40, position: "relative" }}>
      
      {/* Filters Bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
        
        {/* Search */}
        <input
          type="text"
          placeholder="🔍 Buscar por nombre, código, rubro, proveedor..."
          value={searchTerm}
          onChange={handleSearchChange}
          style={{
            flex: "1 1 240px",
            padding: "9px 14px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: C.bg,
            color: C.text,
            fontSize: 13,
            outline: "none",
            transition: "border-color 0.2s",
          }}
          onFocus={e => e.target.style.borderColor = C.accent}
          onBlur={e => e.target.style.borderColor = C.border}
        />

        {/* Dynamic Class filter pills */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {["ALL", "REVIEW", "REPUESTO", "ACCESORIO", "PRODUCTO_COMPLETO", "SERVICIO"].map(f => {
            const isAct = filter === f;
            let lbl = f === "ALL" ? "Todos" : f === "REVIEW" ? "Revisar ⚠️" : (CLS[f]?.label || f);
            let color = f === "ALL" ? C.accent : f === "REVIEW" ? C.danger : (CLS[f]?.color || C.textMuted);
            return (
              <button
                key={f}
                onClick={() => handleFilterChange(f)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  border: `1px solid ${isAct ? color : C.border}`,
                  background: isAct ? `${color}15` : "transparent",
                  color: isAct ? color : C.textMuted,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {lbl}
              </button>
            );
          })}
        </div>

        {/* Dropdown Filters */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
          {/* Source Filter */}
          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setPage(0); }}
            style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", cursor: "pointer" }}
          >
            <option value="ALL">⚙️ Todas las Fuentes</option>
            <option value="REGLAS">REGLAS locales</option>
            <option value="IA">IA (Gemini/Groq)</option>
            <option value="APRENDIDO">APRENDIDO manual</option>
          </select>

          {/* Confidence Filter */}
          <select
            value={confFilter}
            onChange={e => { setConfFilter(e.target.value); setPage(0); }}
            style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", cursor: "pointer" }}
          >
            <option value="ALL">🎯 Confianza (Todas)</option>
            <option value="HIGH">Alta (&gt;80%)</option>
            <option value="MED">Media (40% - 80%)</option>
            <option value="LOW">Baja (&lt;40%)</option>
          </select>

          {/* Columns Picker */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowColPicker(!showColPicker)}
              style={{
                padding: "7px 12px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                background: showColPicker ? C.accentBg : C.surface,
                color: showColPicker ? C.accent : C.text,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Columna ☰
            </button>
            {showColPicker && (
              <div style={{ position: "absolute", right: 0, top: "110%", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 10px 15px -3px rgba(0,0,0,0.1)", zIndex: 110, padding: 12, display: "flex", flexDirection: "column", gap: 8, width: 180 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", marginBottom: 4 }}>Columnas visibles</div>
                {Object.keys(visibleColumns).map(col => (
                  <label key={col} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.text, cursor: "pointer", fontWeight: 500 }}>
                    <input
                      type="checkbox"
                      checked={visibleColumns[col]}
                      onChange={e => setVisibleColumns(prev => ({ ...prev, [col]: e.target.checked }))}
                    />
                    {col.replace("_", " ")}
                  </label>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Bulk Actions Panel (Only visible when items are selected) */}
      {selectedIds.length > 0 && (
        <div className="fade-in" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, background: C.accentBg, border: `1px solid ${C.accent}30`, borderRadius: 12, padding: "10px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.accent }}>
            {selectedIds.length} productos seleccionados
          </div>
          
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            {/* Bulk Classify */}
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                value={bulkClass}
                onChange={e => setBulkClass(e.target.value)}
                style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12 }}
              >
                <option value="">Clasificar en masa...</option>
                {Object.keys(CLS).map(k => <option key={k} value={k}>{CLS[k].label}</option>)}
              </select>
              <button
                onClick={handleBulkClassifySubmit}
                disabled={!bulkClass}
                style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: bulkClass ? C.accent : C.border, color: "#fff", fontSize: 11, fontWeight: 600, cursor: bulkClass ? "pointer" : "default" }}
              >
                Aplicar
              </button>
            </div>

            
            <button
              onClick={() => setSelectedIds([])}
              style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              Deseleccionar
            </button>
          </div>
        </div>
      )}

      {/* Main Table Content */}
      <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.01)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
            <thead>
              <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                <th style={{ padding: "12px 14px", width: 40 }}>
                  <input
                    type="checkbox"
                    checked={pagedProducts.length > 0 && selectedIds.length === pagedProducts.length}
                    onChange={e => toggleSelectAll(e.target.checked)}
                  />
                </th>
                {visibleColumns.CODIGO && <th onClick={() => handleSort("codigo")} style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}>Código</th>}
                {visibleColumns.PRODUCTO && <th onClick={() => handleSort("producto")} style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}>Producto</th>}
                {visibleColumns.RUBRO && <th onClick={() => handleSort("rubro")} style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}>Rubro</th>}
                {visibleColumns.SUB_RUBRO && <th style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Sub Rubro</th>}
                {visibleColumns.PROVEEDOR && <th style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Proveedor</th>}
                {visibleColumns.CLASIFICACION && <th onClick={() => handleSort("clasificacion")} style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}>Clasificación</th>}
                {visibleColumns.CONFIANZA && <th onClick={() => handleSort("confidence")} style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}>Confianza</th>}
                {visibleColumns.FUENTE && <th style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Fuente</th>}
                {visibleColumns.CATEGORIA && <th style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Categoría</th>}
                {visibleColumns.SUBCATEGORIA && <th style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Subcategoría</th>}
                {visibleColumns.TIPO && <th style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Tipo</th>}
                {visibleColumns.CATEGORIA_TN && tnCategories.length > 0 && (
                  <th style={{ padding: "12px 14px", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase", minWidth: 200 }}>Categoría TN</th>
                )}
                <th style={{ padding: "12px 14px", textAlign: "center", fontWeight: 700, color: C.textMuted, fontSize: 11, textTransform: "uppercase" }}>Acción</th>
              </tr>
            </thead>
            <tbody>
              {pagedProducts.length === 0 ? (
                <tr>
                  <td colSpan={12} style={{ padding: "40px 20px", textAlign: "center", color: C.textDim }}>
                    Ningún producto coincide con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                pagedProducts.map((p, idx) => {
                  const cls = p._manualClass || p._class.classification;
                  const isManual = p._source === "APRENDIDO" || p._manualClass;
                  const isLowConf = !isManual && p._class.confidence < 60;
                  const hasTN = !!p._enriched;
                  const isSelected = selectedIds.includes(p._id);

                  return (
                    <tr
                      key={p._id}
                      style={{
                        background: isSelected ? `${C.accent}07` : idx % 2 === 0 ? "transparent" : `${C.surface2}15`,
                        borderBottom: `1px solid ${C.border}`,
                        transition: "background 0.15s ease",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = isSelected ? `${C.accent}0a` : C.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = isSelected ? `${C.accent}07` : idx % 2 === 0 ? "transparent" : `${C.surface2}15`}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: "10px 14px" }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(p._id)}
                        />
                      </td>

                      {/* CODIGO */}
                      {visibleColumns.CODIGO && (
                        <td style={{ padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDim }}>
                          {p.CODIGO || "—"}
                        </td>
                      )}

                      {/* PRODUCTO */}
                      {visibleColumns.PRODUCTO && (
                        <td style={{ padding: "10px 14px", maxWidth: 280 }}>
                          <div
                            onClick={() => setDrawerProduct(p)}
                            style={{ fontWeight: 600, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "color 0.2s" }}
                            onMouseEnter={e => e.currentTarget.style.color = C.accent}
                            onMouseLeave={e => e.currentTarget.style.color = C.text}
                          >
                            {p.PRODUCTO || "—"}
                            {hasTN && <span style={{ color: C.success, fontSize: 11, cursor: "help" }} title="Enriquecido para Tienda Nube ✓">✓</span>}
                          </div>
                        </td>
                      )}

                      {/* RUBRO */}
                      {visibleColumns.RUBRO && (
                        <td style={{ padding: "10px 14px", color: C.textMuted }}>
                          {p.RUBRO || "—"}
                        </td>
                      )}

                      {/* SUB RUBRO */}
                      {visibleColumns.SUB_RUBRO && (
                        <td style={{ padding: "10px 14px", color: C.textDim }}>
                          {p["SUB RUBRO"] || "—"}
                        </td>
                      )}

                      {/* PROVEEDOR */}
                      {visibleColumns.PROVEEDOR && (
                        <td style={{ padding: "10px 14px", color: C.textDim }}>
                          {p.PROVEEDOR || "—"}
                        </td>
                      )}

                      {/* CLASIFICACION */}
                      {visibleColumns.CLASIFICACION && (
                        <td style={{ padding: "10px 14px" }}>
                          {editingId === p._id ? (
                            <select
                              value={cls}
                              onChange={e => {
                                onManualClassify(p._id, e.target.value);
                                setEditingId(null);
                              }}
                              style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.accent}`, background: C.surface, color: C.text, fontSize: 12, outline: "none" }}
                            >
                              {Object.keys(CLS).map(k => (
                                <option key={k} value={k}>{CLS[k].label}</option>
                              ))}
                            </select>
                          ) : (
                            <ClassificationBadge
                              classification={cls}
                              source={p._source}
                              isManual={!!p._manualClass}
                              confidence={p._class.confidence}
                            />
                          )}
                        </td>
                      )}

                      {/* CONFIANZA */}
                      {visibleColumns.CONFIANZA && (
                        <td style={{ padding: "10px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 40, height: 6, background: C.surface2, borderRadius: 3, overflow: "hidden" }}>
                              <div
                                style={{
                                  width: `${p._class.confidence}%`,
                                  height: "100%",
                                  background: isLowConf ? C.danger : p._class.confidence > 80 ? C.success : C.warning,
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isLowConf ? C.danger : C.textMuted, display: "flex", alignItems: "center", gap: 2 }}>
                              {p._class.confidence}%
                              {isLowConf && <span title="Baja confianza, requiere revisión ⚠️">⚠️</span>}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* FUENTE */}
                      {visibleColumns.FUENTE && (
                        <td style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, color: isManual ? C.accent : p._source === "IA" ? C.success : C.textDim }}>
                          {isManual ? "APRENDIDO" : (p._source || "REGLAS")}
                        </td>
                      )}

                      {/* CATEGORIA — derivada de TN nivel2 */}
                      {visibleColumns.CATEGORIA && (
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: C.textMuted }}>
                            {p._tn_nivel2 || p._enriched?.categoria_tiendanube?.split(' > ')[1] || p._categoria || "—"}
                          </span>
                        </td>
                      )}

                      {/* SUBCATEGORIA — derivada de TN nivel3 */}
                      {visibleColumns.SUBCATEGORIA && (
                        <td style={{ padding: "10px 14px" }}>
                          <span style={{ fontSize: 12, color: C.textDim }}>
                            {p._tn_nivel3 || p._enriched?.categoria_tiendanube?.split(' > ')[2] || p._subcategoria || "—"}
                          </span>
                        </td>
                      )}

                      {/* TIPO */}
                      {visibleColumns.TIPO && (
                        <td style={{ padding: "10px 14px", color: C.textDim }}>
                          {p._tipo || "—"}
                        </td>
                      )}

                      {/* CATEGORIA TN */}
                      {visibleColumns.CATEGORIA_TN && tnCategories.length > 0 && (
                        <td style={{ padding: "10px 14px", maxWidth: 260 }}>
                          {editingId === p._id && onTNCategory ? (() => {
                            const { n1, n2, n3, n4 } = getTNLevels(p);
                            return (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <div style={{ fontSize: 10, color: C.textDim, marginBottom: 1, fontWeight: 600 }}>Categoría Tienda Nube:</div>
                                {/* nivel1 */}
                                <select value={n1} onChange={e => onTNCategory(p._id, "nivel1", e.target.value)} style={tnSelectStyle}>
                                  <option value="">Sin categoría principal</option>
                                  {[...new Set(tnCategories.map(c => c.nivel1).filter(Boolean))].map(v =>
                                    <option key={v} value={v}>{v}</option>
                                  )}
                                </select>
                                {/* nivel2 */}
                                {n1 && (
                                  <select value={n2} onChange={e => onTNCategory(p._id, "nivel2", e.target.value)} style={tnSelectStyle}>
                                    <option value="">Sin categoría</option>
                                    {[...new Set(tnCategories.filter(c => c.nivel1 === n1 && c.nivel2).map(c => c.nivel2))].map(v =>
                                      <option key={v} value={v}>{v}</option>
                                    )}
                                  </select>
                                )}
                                {/* nivel3 */}
                                {n2 && (
                                  <select value={n3} onChange={e => onTNCategory(p._id, "nivel3", e.target.value)} style={tnSelectStyle}>
                                    <option value="">Sin subcategoría</option>
                                    {[...new Set(tnCategories.filter(c => c.nivel1 === n1 && c.nivel2 === n2 && c.nivel3).map(c => c.nivel3))].map(v =>
                                      <option key={v} value={v}>{v}</option>
                                    )}
                                  </select>
                                )}
                                {/* nivel4 */}
                                {n3 && (
                                  <select value={n4} onChange={e => onTNCategory(p._id, "nivel4", e.target.value)} style={tnSelectStyle}>
                                    <option value="">Sin tipo</option>
                                    {[...new Set(tnCategories.filter(c => c.nivel1 === n1 && c.nivel2 === n2 && c.nivel3 === n3 && c.nivel4).map(c => c.nivel4))].map(v =>
                                      <option key={v} value={v}>{v}</option>
                                    )}
                                  </select>
                                )}
                              </div>
                            );
                          })() : (
                            <TNCategoryCell p={p} />
                          )}
                        </td>
                      )}

                      {/* ACTION BUTTON */}
                      <td style={{ padding: "10px 14px", textAlign: "center" }}>
                        <button
                          onClick={() => setEditingId(editingId === p._id ? null : p._id)}
                          style={{
                            background: "transparent",
                            border: `1px solid ${C.border}`,
                            color: C.textMuted,
                            padding: "4px 8px",
                            borderRadius: 6,
                            cursor: "pointer",
                            fontSize: 11,
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                        >
                          {editingId === p._id ? "✕" : "✏️"}
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pager */}
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={size => {
            setPageSize(size);
            setPage(0);
          }}
          totalItems={filteredProducts.length}
        />
      </div>

      {/* SIDEBAR DRAWER VIEW */}
      {drawerProduct && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 150,
            display: "flex",
            justifyContent: "flex-end",
            backdropFilter: "blur(2px)",
          }}
          onClick={e => { if (e.target === e.currentTarget) setDrawerProduct(null); }}
        >
          <div
            className="fade-in"
            style={{
              width: "100%",
              maxWidth: 400,
              height: "100vh",
              background: C.surface,
              borderLeft: `1px solid ${C.border}`,
              padding: 24,
              display: "flex",
              flexDirection: "column",
              gap: 20,
              overflowY: "auto",
              boxShadow: "-10px 0 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase" }}>
                Detalles del Producto
              </div>
              <button
                onClick={() => setDrawerProduct(null)}
                style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 16, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>
                {drawerProduct.PRODUCTO}
              </h3>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: C.textDim }}>
                Código: {drawerProduct.CODIGO}
              </div>
            </div>

            <div style={{ height: 1, background: C.border }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              <div>
                <div style={{ color: C.textDim, fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Rubro</div>
                <div style={{ color: C.text, fontWeight: 500 }}>{drawerProduct.RUBRO || "—"}</div>
              </div>
              <div>
                <div style={{ color: C.textDim, fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Sub Rubro</div>
                <div style={{ color: C.text, fontWeight: 500 }}>{drawerProduct["SUB RUBRO"] || "—"}</div>
              </div>
              <div>
                <div style={{ color: C.textDim, fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Proveedor</div>
                <div style={{ color: C.text, fontWeight: 500 }}>{drawerProduct.PROVEEDOR || "—"}</div>
              </div>
              <div>
                <div style={{ color: C.textDim, fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>Clasificación asignada</div>
                <ClassificationBadge
                  classification={drawerProduct._manualClass || drawerProduct._class.classification}
                  source={drawerProduct._source}
                  isManual={!!drawerProduct._manualClass}
                  confidence={drawerProduct._class.confidence}
                />
              </div>
              
              {(drawerProduct._tn_nivel2 || drawerProduct._enriched?.categoria_tiendanube) && (
                <div>
                  <div style={{ color: C.textDim, fontSize: 11, fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>Categoría Tienda Nube</div>
                  <div style={{ color: C.text, fontSize: 12 }}>
                    {drawerProduct._enriched?.categoria_tiendanube
                      || [drawerProduct._tn_nivel2, drawerProduct._tn_nivel3].filter(Boolean).join(" > ")
                      || "—"}
                  </div>
                </div>
              )}

              {/* Rules Engine Log */}
              <div style={{ marginTop: 10, padding: 12, borderRadius: 8, background: C.surface2, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: "uppercase", marginBottom: 6 }}>
                  Explicación del Motor
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: C.text }}>
                  {(drawerProduct._class.reasons || []).map((reason, rIdx) => (
                    <div key={rIdx} style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                      <span>•</span>
                      <span>{reason}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 6, fontSize: 11, color: C.textDim }}>
                    Puntaje neto de reglas: <strong>{drawerProduct._class.score}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Enriched parameters showcase if TN active */}
            {drawerProduct._enriched && (
              <>
                <div style={{ height: 1, background: C.border }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase" }}>
                    Enriquecimiento Tienda Nube (IA)
                  </div>
                  <div>
                    <div style={{ color: C.textDim, fontSize: 10, fontWeight: 600 }}>Nombre Normalizado</div>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 600 }}>{drawerProduct._enriched.nombre_limpio}</div>
                  </div>
                  {drawerProduct._enriched.marca && (
                    <div>
                      <div style={{ color: C.textDim, fontSize: 10, fontWeight: 600 }}>Marca</div>
                      <div style={{ color: C.text, fontSize: 12 }}>{drawerProduct._enriched.marca}</div>
                    </div>
                  )}
                  {drawerProduct._enriched.tags && drawerProduct._enriched.tags.length > 0 && (
                    <div>
                      <div style={{ color: C.textDim, fontSize: 10, fontWeight: 600 }}>Etiquetas SEO</div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
                        {drawerProduct._enriched.tags.map(t => (
                          <span key={t} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: C.bg, border: `1px solid ${C.border}`, color: C.textMuted }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {drawerProduct._enriched.peso_kg !== undefined && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <div style={{ color: C.textDim, fontSize: 10, fontWeight: 600 }}>Peso estimado</div>
                        <div style={{ color: C.text, fontSize: 12 }}>{drawerProduct._enriched.peso_kg} kg</div>
                      </div>
                      <div>
                        <div style={{ color: C.textDim, fontSize: 10, fontWeight: 600 }}>Dimensiones</div>
                        <div style={{ color: C.text, fontSize: 12 }}>
                          {drawerProduct._enriched.alto_cm}x{drawerProduct._enriched.ancho_cm}x{drawerProduct._enriched.profundidad_cm} cm
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
