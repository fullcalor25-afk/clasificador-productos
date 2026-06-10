import { useState, useEffect } from "react";
import { fetchWithTimeout, getCategoriaTN } from "../utils";

export default function useHistory() {
  const [historyList, setHistoryList] = useState([]);
  const [historyDetail, setHistoryDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/history");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistoryList(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Error cargando historial", e);
      setError("No se pudo cargar el historial de análisis.");
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryDetail = async (id) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout(`/api/history?id=${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
              prop1_nombre: p.prop1_nombre || null,
              prop1_valor:  p.prop1_valor  || null,
              prop2_nombre: p.prop2_nombre || null,
              prop2_valor:  p.prop2_valor  || null,
              prop3_nombre: p.prop3_nombre || null,
              prop3_valor:  p.prop3_valor  || null,
            },
          };
        });
      }
      setHistoryDetail(data);
    } catch (e) {
      console.error("Error cargando análisis detallado", e);
      setError("No se pudo cargar el detalle del análisis.");
    } finally {
      setLoading(false);
    }
  };

  const saveAnalysis = async (nombre, classifiedProducts, tnCategories = []) => {
    setLoading(true);
    try {
      const productos = classifiedProducts.map(p => {
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
          categoria_tiendanube: getCategoriaTN(p, tnCategories) || null,
          tn_manual: p._tn_manual || false,
          prop1_nombre: e ? (e.prop1_nombre || null) : null,
          prop1_valor:  e ? (e.prop1_valor  || null) : null,
          prop2_nombre: e ? (e.prop2_nombre || null) : null,
          prop2_valor:  e ? (e.prop2_valor  || null) : null,
          prop3_nombre: e ? (e.prop3_nombre || null) : null,
          prop3_valor:  e ? (e.prop3_valor  || null) : null,
        };
      });
      
      const res = await fetchWithTimeout("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, productos }),
      });
      if (!res.ok) throw new Error("Error en servidor al guardar");
      
      await loadHistory();
      return { success: true };
    } catch (e) {
      console.error("Error guardando análisis", e);
      return { success: false, error: "No se pudo guardar el análisis." };
    } finally {
      setLoading(false);
    }
  };

  const deleteAnalysis = async (id) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/history?id=${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar");
      setHistoryList(prev => prev.filter(a => a.id !== id));
      if (historyDetail && historyDetail.id === id) {
        setHistoryDetail(null);
      }
      return { success: true };
    } catch (e) {
      console.error("Error eliminando análisis", e);
      return { success: false, error: "No se pudo eliminar el análisis." };
    } finally {
      setLoading(false);
    }
  };

  const renameAnalysis = async (id, nuevoNombre) => {
    if (!nuevoNombre?.trim()) return { success: false, error: "Nombre inválido." };
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/history?id=${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nuevoNombre }),
      });
      if (!res.ok) throw new Error("Error al renombrar");
      setHistoryList(prev => prev.map(a => a.id === id ? { ...a, nombre: nuevoNombre } : a));
      if (historyDetail && historyDetail.id === id) {
        setHistoryDetail(prev => ({ ...prev, nombre: nuevoNombre }));
      }
      return { success: true };
    } catch (e) {
      console.error("Error renombrando análisis", e);
      return { success: false, error: "No se pudo renombrar el análisis." };
    } finally {
      setLoading(false);
    }
  };

  const updateHistoryProduct = async (prodId, patchData) => {
    try {
      const res = await fetchWithTimeout(`/api/history?id=${historyDetail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: prodId, ...patchData }),
      });
      if (!res.ok) throw new Error("Error al actualizar");
      
      setHistoryDetail(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          products: prev.products.map(p => p.id === prodId ? { ...p, ...patchData } : p)
        };
      });
      return { success: true };
    } catch (e) {
      console.error("Error actualizando producto del historial", e);
      return { success: false, error: "No se pudo guardar la modificación del producto." };
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  return {
    historyList,
    historyDetail,
    setHistoryDetail,
    loading,
    error,
    loadHistory,
    loadHistoryDetail,
    saveAnalysis,
    deleteAnalysis,
    renameAnalysis,
    updateHistoryProduct,
  };
}
