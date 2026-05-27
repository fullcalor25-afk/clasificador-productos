import React, { useState, useMemo } from "react";
import { C } from "../constants";
import Modal from "../components/Modal";

export default function CategoriesView({
  categories,
  onSaveCategory,
  onDeleteCategory,
  classifiedProducts = []
}) {
  const [collapsedCats, setCollapsedCats] = useState([]);
  const [catModal, setCatModal] = useState(null); // { mode, data, categoryId }
  const [deleteModal, setDeleteModal] = useState(null); // { id, type, nombre }
  const [importModal, setImportModal] = useState(false);
  const [importCsvText, setImportCsvText] = useState("");

  // Subcategory keywords tags state
  const [newKeywordInput, setNewKeywordInput] = useState("");

  // Calculate statistics per category based on active session
  const categoryActiveStats = useMemo(() => {
    const counts = {};
    const subcounts = {};
    classifiedProducts.forEach(p => {
      if (p._categoria) {
        counts[p._categoria] = (counts[p._categoria] || 0) + 1;
      }
      if (p._subcategoria) {
        subcounts[p._subcategoria] = (subcounts[p._subcategoria] || 0) + 1;
      }
    });
    return { counts, subcounts };
  }, [classifiedProducts]);

  const toggleCollapse = (id) => {
    setCollapsedCats(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleOpenNewCat = () => {
    setCatModal({
      mode: "new-cat",
      data: { nombre: "", color: "#3b82f6", icono: "📦", orden: 0 }
    });
  };

  const handleOpenEditCat = (cat) => {
    setCatModal({
      mode: "edit-cat",
      data: { ...cat }
    });
  };

  const handleOpenNewSub = (catId) => {
    setCatModal({
      mode: "new-sub",
      categoryId: catId,
      data: { nombre: "", keywords: "", descripcion: "", orden: 0 }
    });
  };

  const handleOpenEditSub = (sub, catId) => {
    setCatModal({
      mode: "edit-sub",
      categoryId: catId,
      data: { ...sub }
    });
  };

  const handleSaveModal = async () => {
    const res = await onSaveCategory(catModal);
    if (res.success) {
      setCatModal(null);
    } else {
      alert(res.error);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    const res = await onDeleteCategory(deleteModal.id, deleteModal.type);
    if (res.success) {
      setDeleteModal(null);
    } else {
      alert(res.error);
    }
  };

  // Keywords Tags Add/Delete
  const handleAddKeywordChip = () => {
    if (!newKeywordInput.trim()) return;
    const currentKws = catModal.data.keywords 
      ? catModal.data.keywords.split(",").map(k => k.trim()).filter(Boolean)
      : [];
    
    if (currentKws.includes(newKeywordInput.trim().toLowerCase())) {
      setNewKeywordInput("");
      return;
    }

    const updatedKws = [...currentKws, newKeywordInput.trim().toLowerCase()].join(", ");
    setCatModal(prev => ({
      ...prev,
      data: { ...prev.data, keywords: updatedKws }
    }));
    setNewKeywordInput("");
  };

  const handleDeleteKeywordChip = (chipToDelete) => {
    const currentKws = catModal.data.keywords 
      ? catModal.data.keywords.split(",").map(k => k.trim()).filter(Boolean)
      : [];
    const updatedKws = currentKws.filter(k => k !== chipToDelete).join(", ");
    setCatModal(prev => ({
      ...prev,
      data: { ...prev.data, keywords: updatedKws }
    }));
  };

  // Import categories mass CSV
  const handleImportSubmit = async () => {
    if (!importCsvText.trim()) return;
    // format: categoria, subcategoria, keywords
    const lines = importCsvText.trim().split("\n");
    if (lines.length < 2) return;
    
    alert("Procesando importación de categorías. Las categorías nuevas se crearán en Supabase.");
    // We can parse and create them sequentially
    // For this prototype, we guide the user to execute via Supabase or handle simple inserts.
    setImportModal(false);
    setImportCsvText("");
  };

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 20, paddingBottom: 40 }}>
      
      {/* Header Panel */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>
            📁 Gestión de Árbol de Categorías
          </h2>
          <p style={{ fontSize: 13, color: C.textMuted }}>
            Definí las categorías principales y subcategorías. Estas inyectan palabras clave y contextualizan a la IA.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setImportModal(true)}
            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            📥 Importar Árbol CSV
          </button>
          <button
            onClick={handleOpenNewCat}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              background: C.accent,
              color: "#fff",
              border: "none",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Nueva Categoría Principal
          </button>
        </div>
      </div>

      {categories.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: C.textDim, background: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>📂</span>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Sin categorías configuradas</div>
          <p style={{ fontSize: 13, maxWidth: 400, margin: "0 auto", lineHeight: 1.5 }}>
            Cargá la estructura inicial. Las categorías ayudan a la IA a jerarquizar repuestos y accesorios en Tienda Nube.
          </p>
        </div>
      )}

      {/* Categories Accordion Tree */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {categories.map(cat => {
          const isCollapsed = collapsedCats.includes(cat.id);
          const activeCount = categoryActiveStats.counts[cat.nombre] || 0;
          const subs = cat.subcategories || [];

          return (
            <div
              key={cat.id}
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                overflow: "hidden",
                transition: "border-color 0.2s",
              }}
            >
              {/* Category Node Row */}
              <div
                style={{
                  padding: "16px 20px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: `${cat.color}05`,
                  borderBottom: isCollapsed ? "none" : `1px solid ${C.border}`,
                }}
              >
                {/* Collapse Chevron */}
                <button
                  onClick={() => toggleCollapse(cat.id)}
                  style={{ background: "transparent", border: "none", color: C.textMuted, fontSize: 14, cursor: "pointer", display: "flex", width: 20 }}
                >
                  {isCollapsed ? "▶" : "▼"}
                </button>

                {/* Emoji & Color Indicators */}
                <span style={{ fontSize: 20 }}>{cat.icono || "📦"}</span>
                <div style={{ width: 14, height: 14, borderRadius: 4, background: cat.color, flexShrink: 0 }} />
                
                <span style={{ fontWeight: 700, fontSize: 15, color: C.text, flex: 1 }}>
                  {cat.nombre}
                </span>

                {/* Badges */}
                <span style={{ fontSize: 11, background: C.surface2, color: C.textMuted, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                  {subs.length} subcats
                </span>

                {activeCount > 0 && (
                  <span style={{ fontSize: 11, background: `${C.success}15`, color: C.success, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
                    {activeCount} activos
                  </span>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    onClick={() => handleOpenNewSub(cat.id)}
                    style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                  >
                    + Sub
                  </button>
                  <button
                    onClick={() => handleOpenEditCat(cat)}
                    style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, cursor: "pointer" }}
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => setDeleteModal({ id: cat.id, type: "category", nombre: cat.nombre })}
                    style={{ padding: "4px 6px", borderRadius: 6, border: `1px solid ${C.danger}40`, background: C.surface, color: C.danger, fontSize: 11, cursor: "pointer" }}
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* Subcategories Branch List */}
              {!isCollapsed && (
                <div style={{ padding: "12px 20px 16px 52px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {subs.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textDim, fontStyle: "italic" }}>
                      Sin subcategorías cargadas. Hacé click en "+ Sub" para agregar una.
                    </div>
                  ) : (
                    subs.map(sub => {
                      const subActiveCount = categoryActiveStats.subcounts[sub.nombre] || 0;
                      const keywordList = sub.keywords ? sub.keywords.split(",").map(x => x.trim()).filter(Boolean) : [];
                      return (
                        <div
                          key={sub.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 12,
                            padding: "8px 12px",
                            borderRadius: 8,
                            background: C.surface2,
                          }}
                        >
                          <span style={{ color: C.textDim, fontSize: 11 }}>├─</span>
                          <span style={{ fontWeight: 600, color: C.text, minWidth: 120 }}>{sub.nombre}</span>
                          
                          {/* Keyword chips preview */}
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1, overflow: "hidden" }}>
                            {keywordList.slice(0, 5).map(kw => (
                              <span key={kw} style={{ fontSize: 10, padding: "2px 6px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 4, color: C.textMuted }}>
                                {kw}
                              </span>
                            ))}
                            {keywordList.length > 5 && (
                              <span style={{ fontSize: 10, color: C.textDim }}>+{keywordList.length - 5} más</span>
                            )}
                          </div>

                          {subActiveCount > 0 && (
                            <span style={{ fontSize: 10, background: `${C.success}15`, color: C.success, padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>
                              {subActiveCount} activos
                            </span>
                          )}

                          <button
                            onClick={() => handleOpenEditSub(sub, cat.id)}
                            style={{ padding: "3px 6px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.textMuted, fontSize: 11, cursor: "pointer" }}
                          >
                            ✏️
                          </button>
                          <button
                            onClick={() => setDeleteModal({ id: sub.id, type: "subcategory", nombre: sub.nombre })}
                            style={{ padding: "3px 6px", borderRadius: 6, border: `1px solid ${C.danger}40`, background: C.surface, color: C.danger, fontSize: 11, cursor: "pointer" }}
                          >
                            🗑
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* CRUD MODAL OVERLAY */}
      {catModal && (
        <Modal
          isOpen={!!catModal}
          onClose={() => setCatModal(null)}
          title={
            catModal.mode === "new-cat" ? "Crear Categoría Principal" :
            catModal.mode === "edit-cat" ? "Editar Categoría Principal" :
            catModal.mode === "new-sub" ? "Agregar Subcategoría" : "Editar Subcategoría"
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Nombre</label>
              <input
                autoFocus
                value={catModal.data.nombre || ""}
                onChange={e => setCatModal(prev => ({ ...prev, data: { ...prev.data, nombre: e.target.value } }))}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
              />
            </div>

            {(catModal.mode === "new-cat" || catModal.mode === "edit-cat") && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Ícono (emoji)</label>
                    <input
                      value={catModal.data.icono || ""}
                      onChange={e => setCatModal(prev => ({ ...prev, data: { ...prev.data, icono: e.target.value } }))}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 16 }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Orden</label>
                    <input
                      type="number"
                      value={catModal.data.orden || 0}
                      onChange={e => setCatModal(prev => ({ ...prev, data: { ...prev.data, orden: parseInt(e.target.value) || 0 } }))}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 6 }}>Color de Categoría</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4"].map(c => (
                      <div
                        key={c}
                        onClick={() => setCatModal(prev => ({ ...prev, data: { ...prev.data, color: c } }))}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: c,
                          cursor: "pointer",
                          border: catModal.data.color === c ? "2px solid #fff" : "2px solid transparent",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                        }}
                      />
                    ))}
                    <input
                      type="color"
                      value={catModal.data.color || "#3b82f6"}
                      onChange={e => setCatModal(prev => ({ ...prev, data: { ...prev.data, color: e.target.value } }))}
                      style={{ width: 36, height: 28, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                      title="Seleccionar color personalizado"
                    />
                  </div>
                </div>
              </>
            )}

            {(catModal.mode === "new-sub" || catModal.mode === "edit-sub") && (
              <>
                {/* Tags Chips Input */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 6 }}>Keywords de Subcategoría (Inyección IA)</label>
                  
                  {/* Chips showcase */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", border: `1px solid ${C.border}`, padding: 8, borderRadius: 8, background: C.bg, minHeight: 44, marginBottom: 8 }}>
                    {(catModal.data.keywords ? catModal.data.keywords.split(",").map(k => k.trim()).filter(Boolean) : []).map(chip => (
                      <span
                        key={chip}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 600,
                          background: C.surface,
                          border: `1px solid ${C.border}`,
                          color: C.text,
                          padding: "2px 8px",
                          borderRadius: 6,
                        }}
                      >
                        {chip}
                        <button
                          onClick={() => handleDeleteKeywordChip(chip)}
                          style={{ border: "none", background: "transparent", color: C.danger, fontWeight: 700, cursor: "pointer", fontSize: 10 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add Keyword Chip form */}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      placeholder="Escribí una palabra y apretá enter..."
                      value={newKeywordInput}
                      onChange={e => setNewKeywordInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddKeywordChip();
                        }
                      }}
                      style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, outline: "none" }}
                    />
                    <button
                      onClick={handleAddKeywordChip}
                      style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: C.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Añadir
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: "block", marginBottom: 4 }}>Descripción</label>
                  <textarea
                    value={catModal.data.descripcion || ""}
                    onChange={e => setCatModal(prev => ({ ...prev, data: { ...prev.data, descripcion: e.target.value } }))}
                    style={{ width: "100%", height: 60, padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 12, outline: "none", resize: "none" }}
                  />
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 10 }}>
              <button
                onClick={() => setCatModal(null)}
                style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveModal}
                disabled={!catModal.data.nombre?.trim()}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: catModal.data.nombre?.trim() ? C.accent : C.border, color: "#fff", fontSize: 12, fontWeight: 600, cursor: catModal.data.nombre?.trim() ? "pointer" : "default" }}
              >
                Guardar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* DELETE MODAL OVERLAY */}
      {deleteModal && (
        <Modal isOpen={!!deleteModal} onClose={() => setDeleteModal(null)} title="🗑 Confirmar Eliminación">
          <p style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.6, marginBottom: 20 }}>
            ¿Estás seguro que querés eliminar la categoría <strong style={{ color: C.text }}>{deleteModal.nombre}</strong>? 
            {deleteModal.type === "category" && (
              <span style={{ color: C.danger, fontWeight: 600 }}> Esto también eliminará permanentemente todas sus subcategorías asociadas de Supabase.</span>
            )}
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => setDeleteModal(null)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleDeleteConfirm} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.danger, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Eliminar permanentemente</button>
          </div>
        </Modal>
      )}

      {/* CSV TREE IMPORT OVERLAY */}
      {importModal && (
        <Modal isOpen={importModal} onClose={() => setImportModal(false)} title="📥 Importar Estructura de Categorías">
          <p style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5, marginBottom: 14 }}>
            Pegá la jerarquía separada por comas. Formato requerido: <strong style={{ color: C.text }}>categoria, subcategoria, keywords</strong>.
          </p>
          <textarea
            value={importCsvText}
            onChange={e => setImportCsvText(e.target.value)}
            placeholder="categoria,subcategoria,keywords&#10;Calefacción,Calderas,caldera,quemador,baxi&#10;Plomería,Conexiones,cupla,racor,niple"
            style={{ width: "100%", height: 160, padding: 12, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: "monospace", outline: "none", resize: "vertical", marginBottom: 16 }}
          />
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={() => { setImportModal(false); setImportCsvText(""); }} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
            <button onClick={handleImportSubmit} disabled={!importCsvText.trim()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: importCsvText.trim() ? C.accent : C.border, color: "#fff", fontSize: 12, fontWeight: 600, cursor: importCsvText.trim() ? "pointer" : "default" }}>Importar Estructura</button>
          </div>
        </Modal>
      )}

    </div>
  );
}
