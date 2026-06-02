import { useState, useEffect, useRef } from "react";
import { fetchWithTimeout } from "../utils";

const CAT_CACHE_KEY = "categories_cache";

export default function useCategories() {
  // Initialize from cache to avoid empty flash
  const [categories, setCategories] = useState(() => {
    try {
      const cached = localStorage.getItem(CAT_CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const categoriesRef = useRef([]);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithTimeout("/api/categories");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        categoriesRef.current = data;
        setCategories(data);
        localStorage.setItem(CAT_CACHE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error("Error cargando categorías", e);
      setError("No se pudieron cargar las categorías.");
      // Fallback: restore from cache
      try {
        const cached = localStorage.getItem(CAT_CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          categoriesRef.current = data;
          setCategories(data);
        }
      } catch {}
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const saveCategory = async (modalData) => {
    const { mode, data, categoryId } = modalData;
    const name = data.nombre?.trim();
    if (!name) return { success: false, error: "El nombre es requerido." };

    // Bug 5 check: Name uniqueness validation
    if (mode === "new-cat" || mode === "edit-cat") {
      const isDuplicate = categories.some(
        c => c.nombre.toLowerCase() === name.toLowerCase() && c.id !== data.id
      );
      if (isDuplicate) {
        return { success: false, error: `Ya existe una categoría con el nombre "${name}".` };
      }
    } else if (mode === "new-sub" || mode === "edit-sub") {
      const parentCat = categories.find(c => c.id === categoryId);
      if (parentCat) {
        const subcategories = parentCat.subcategories || [];
        const isDuplicate = subcategories.some(
          s => s.nombre.toLowerCase() === name.toLowerCase() && s.id !== data.id
        );
        if (isDuplicate) {
          return { success: false, error: `Ya existe una subcategoría con el nombre "${name}" dentro de "${parentCat.nombre}".` };
        }
      }
    }

    setLoading(true);
    try {
      let res;
      if (mode === "new-cat") {
        res = await fetchWithTimeout("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: name, color: data.color, icono: data.icono, orden: data.orden || 0 }),
        });
      } else if (mode === "edit-cat") {
        res = await fetchWithTimeout(`/api/categories?id=${data.id}&type=category`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: name, color: data.color, icono: data.icono, orden: data.orden || 0 }),
        });
      } else if (mode === "new-sub") {
        res = await fetchWithTimeout("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "subcategory", category_id: categoryId, nombre: name, keywords: data.keywords, descripcion: data.descripcion, orden: data.orden || 0 }),
        });
      } else if (mode === "edit-sub") {
        res = await fetchWithTimeout(`/api/categories?id=${data.id}&type=subcategory`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: name, keywords: data.keywords, descripcion: data.descripcion, orden: data.orden || 0 }),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      await loadCategories();
      return { success: true };
    } catch (e) {
      console.error("Error al guardar categoría", e);
      return { success: false, error: e.message || "Error al comunicarse con el servidor." };
    } finally {
      setLoading(false);
    }
  };

  const deleteCategoryItem = async (id, type) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/categories?id=${id}&type=${type}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error en servidor al eliminar");
      await loadCategories();
      return { success: true };
    } catch (e) {
      console.error("Error eliminando categoría", e);
      return { success: false, error: "No se pudo eliminar la categoría de la base de datos." };
    } finally {
      setLoading(false);
    }
  };

  return {
    categories,
    categoriesRef,
    loading,
    error,
    loadCategories,
    saveCategory,
    deleteCategoryItem,
  };
}
