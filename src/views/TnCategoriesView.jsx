import React, { useMemo, useState } from "react";
import { C } from "../constants";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTree(rows) {
  const tree = {};
  rows.forEach(row => {
    const groupKey = `${row.nivel1 || ""}||${row.nivel2 || ""}`;
    if (!tree[groupKey]) {
      tree[groupKey] = { nivel1: row.nivel1, nivel2: row.nivel2, byN3: {} };
    }
    const n3key = row.nivel3 || "__none__";
    if (!tree[groupKey].byN3[n3key]) {
      tree[groupKey].byN3[n3key] = [];
    }
    tree[groupKey].byN3[n3key].push(row);
  });
  return tree;
}

// ─── Small button — defined at module level (stable reference) ────────────────
const BTN = ({ onClick, danger, small, children, style = {} }) => (
  <button
    onClick={onClick}
    style={{
      padding: small ? "3px 8px" : "6px 12px",
      borderRadius: 6,
      border: `1px solid ${danger ? C.danger : C.border}`,
      background: "transparent",
      color: danger ? C.danger : C.textMuted,
      fontSize: small ? 11 : 12,
      fontWeight: 600,
      cursor: "pointer",
      ...style,
    }}
  >
    {children}
  </button>
);

// ─── InputField — at module level so React never recreates it ─────────────────
const InputField = ({ label, value, onChange, placeholder }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" }}>
      {label}
    </label>
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        padding: "7px 10px", borderRadius: 7,
        border: `1px solid ${C.border}`, background: C.bg,
        color: C.text, fontSize: 13, outline: "none",
      }}
    />
  </div>
);

// ─── Form Modal — own state so parent never re-renders on keystrokes ──────────
const BLANK = { id: null, nivel1: "", nivel2: "", nivel3: "", nivel4: "", keywords: "" };

function TnCategoryFormModal({ initialData, onSave, onClose }) {
  const [form, setForm]     = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const set = field => e => setForm(p => ({ ...p, [field]: e.target.value }));

  const pathPreview = [form.nivel1, form.nivel2, form.nivel3, form.nivel4]
    .filter(Boolean).join(" > ") || "(vacío)";

  const handleSave = async () => {
    if (!form.nivel1.trim()) { setError("nivel1 es obligatorio."); return; }
    setSaving(true);
    const result = await onSave(form);
    setSaving(false);
    if (!result.success) setError(result.error || "Error al guardar.");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
      <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: 28, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 18 }}>
          {form.id ? "✏️ Editar categoría" : "+ Nueva categoría"}
        </h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InputField label="Nivel 1 *"  value={form.nivel1}  onChange={set("nivel1")}  placeholder="Repuestos y Accesorios" />
            <InputField label="Nivel 2"    value={form.nivel2}  onChange={set("nivel2")}  placeholder="Calefaccion" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <InputField label="Nivel 3"    value={form.nivel3}  onChange={set("nivel3")}  placeholder="Calderas" />
            <InputField label="Nivel 4"    value={form.nivel4}  onChange={set("nivel4")}  placeholder="Plaquetas" />
          </div>

          <div style={{ padding: "8px 12px", borderRadius: 8, background: `${C.accent}10`, fontSize: 12, color: C.accent }}>
            <strong>Ruta:</strong> {pathPreview}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase" }}>
              Keywords (separadas por coma)
            </label>
            <textarea
              value={form.keywords}
              onChange={set("keywords")}
              placeholder="plaqueta, electronica, circuito impreso, ..."
              rows={3}
              style={{
                padding: "8px 10px", borderRadius: 7,
                border: `1px solid ${C.border}`, background: C.bg,
                color: C.text, fontSize: 12, resize: "vertical", outline: "none",
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: C.danger, padding: "6px 10px", borderRadius: 6, background: C.dangerBg }}>
              {error}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <BTN onClick={onClose}>Cancelar</BTN>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "8px 20px", borderRadius: 8, border: "none",
              background: saving ? C.border : C.accent,
              color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main view ─────────────────────────────────────────────────────────────────

export default function TnCategoriesView({ tnCategories = [], loading, onSave, onDelete }) {
  const [openGroups, setOpenGroups] = useState({});
  const [openN3, setOpenN3]         = useState({});
  const [formData, setFormData]     = useState(null);   // null = closed; object = open
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting]     = useState(false);

  const tree = useMemo(() => buildTree(tnCategories), [tnCategories]);

  const toggleGroup = key => setOpenGroups(p => ({ ...p, [key]: !p[key] }));
  const toggleN3    = key => setOpenN3(p => ({ ...p, [key]: !p[key] }));

  const openAdd  = (prefill = {}) => setFormData({ ...BLANK, ...prefill });
  const openEdit = row => setFormData({
    id: row.id, nivel1: row.nivel1 || "", nivel2: row.nivel2 || "",
    nivel3: row.nivel3 || "", nivel4: row.nivel4 || "", keywords: row.keywords || "",
  });

  const handleSave = async data => {
    const result = await onSave(data);
    if (result.success) setFormData(null);
    return result;
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    await onDelete(deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 860, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>
            🛒 Categorías Tienda Nube
          </h2>
          <p style={{ fontSize: 13, color: C.textMuted, margin: "4px 0 0" }}>
            {tnCategories.length} categorías configuradas · hasta 4 niveles de jerarquía
          </p>
        </div>
        <button
          onClick={() => openAdd()}
          style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
        >
          + Nueva categoría
        </button>
      </div>

      {loading && <div style={{ color: C.textMuted, fontSize: 13 }}>Cargando...</div>}

      {/* Tree */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {Object.entries(tree).map(([groupKey, group]) => {
          const isOpen = !!openGroups[groupKey];
          const label  = [group.nivel1, group.nivel2].filter(Boolean).join(" > ");
          return (
            <div key={groupKey} style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
              {/* nivel1+nivel2 header */}
              <div
                onClick={() => toggleGroup(groupKey)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 16px", cursor: "pointer",
                  background: isOpen ? C.surface2 : C.surface,
                  borderBottom: isOpen ? `1px solid ${C.border}` : "none",
                }}
              >
                <span style={{ fontSize: 11, color: C.textDim }}>{isOpen ? "▼" : "▶"}</span>
                <span style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{label || "(sin nombre)"}</span>
                <span style={{ fontSize: 11, color: C.textDim, marginLeft: 4 }}>
                  ({Object.keys(group.byN3).length} subgrupos)
                </span>
                <span style={{ marginLeft: "auto" }} />
                <BTN small onClick={e => { e.stopPropagation(); openAdd({ nivel1: group.nivel1, nivel2: group.nivel2 }); }}>
                  + nivel3
                </BTN>
              </div>

              {/* nivel3 groups */}
              {isOpen && (
                <div style={{ padding: "8px 12px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {Object.entries(group.byN3).map(([n3key, rows]) => {
                    const n3label    = n3key === "__none__" ? "(sin nivel3)" : n3key;
                    const n3OpenKey  = `${groupKey}||${n3key}`;
                    const isN3Open   = openN3[n3OpenKey] !== false;
                    const hasN4      = rows.some(r => r.nivel4);

                    return (
                      <div key={n3key} style={{ borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, overflow: "hidden" }}>
                        {/* nivel3 header */}
                        <div
                          onClick={() => toggleN3(n3OpenKey)}
                          style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 14px", cursor: "pointer",
                            background: isN3Open ? `${C.accent}08` : "transparent",
                            borderBottom: isN3Open ? `1px solid ${C.border}` : "none",
                          }}
                        >
                          <span style={{ fontSize: 10, color: C.textDim }}>{isN3Open ? "▼" : "▶"}</span>
                          <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{n3label}</span>
                          <span style={{ fontSize: 10, color: C.textDim }}>({rows.length} {hasN4 ? "nivel4" : "entradas"})</span>
                          <span style={{ marginLeft: "auto" }} />
                          <BTN
                            small
                            onClick={e => {
                              e.stopPropagation();
                              openAdd({ nivel1: group.nivel1, nivel2: group.nivel2, nivel3: n3key === "__none__" ? "" : n3key });
                            }}
                          >
                            + Sub
                          </BTN>
                        </div>

                        {/* leaf rows */}
                        {isN3Open && (
                          <div style={{ padding: "4px 0" }}>
                            {rows.map(row => (
                              <div
                                key={row.id}
                                style={{
                                  display: "flex", alignItems: "center", gap: 10,
                                  padding: "7px 14px 7px 28px",
                                  borderBottom: `1px solid ${C.border}`, fontSize: 13,
                                }}
                              >
                                <span style={{ fontSize: 12, color: C.textDim }}>├</span>
                                <span style={{ fontWeight: 600, color: C.text, minWidth: 140 }}>
                                  {row.nivel4 || row.nivel3 || "(sin nombre)"}
                                </span>
                                {row.keywords && (
                                  <span style={{ flex: 1, fontSize: 11, color: C.textDim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={row.keywords}>
                                    {row.keywords}
                                  </span>
                                )}
                                <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexShrink: 0 }}>
                                  <BTN small onClick={() => openEdit(row)}>✏️</BTN>
                                  <BTN small danger onClick={() => setDeleteTarget(row)}>🗑</BTN>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {Object.keys(group.byN3).length === 0 && (
                    <div style={{ color: C.textDim, fontSize: 12, padding: "4px 8px" }}>Sin subgrupos todavía.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {Object.keys(tree).length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "60px 20px", background: C.surface, borderRadius: 14, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🗂</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>Sin categorías configuradas</div>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
              Creá tu árbol de categorías Tienda Nube para mejorar la exportación de productos.
            </p>
            <button onClick={() => openAdd()} style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: C.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              + Crear primera categoría
            </button>
          </div>
        )}
      </div>

      {/* Form modal — separate component: state changes don't re-render TnCategoriesView */}
      {formData && (
        <TnCategoryFormModal
          key={formData.id ?? "new"}
          initialData={formData}
          onSave={handleSave}
          onClose={() => setFormData(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`, padding: 26, width: "100%", maxWidth: 400 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 10 }}>🗑 ¿Eliminar categoría?</h3>
            <p style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>
              <strong>{[deleteTarget.nivel1, deleteTarget.nivel2, deleteTarget.nivel3, deleteTarget.nivel4].filter(Boolean).join(" > ")}</strong><br />
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <BTN onClick={() => setDeleteTarget(null)}>Cancelar</BTN>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: C.danger, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                {deleting ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
