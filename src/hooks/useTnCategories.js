import { useState, useEffect } from "react";
import { fetchWithTimeout } from "../utils";

const CACHE_KEY = "tn_categories_cache";

export default function useTnCategories() {
  // Initialize from cache immediately to avoid empty flash
  const [tnCategories, setTnCategories] = useState(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      return cached ? JSON.parse(cached) : [];
    } catch { return []; }
  });
  const [loading, setLoading] = useState(false);

  const loadTnCategories = async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/tn-categories");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setTnCategories(data);
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
      }
    } catch (e) {
      console.error("Error cargando categorías TN", e);
      // Fallback: use whatever is in cache (already initialized in useState)
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTnCategories(); }, []);

  const saveTnCategory = async (formData) => {
    if (!formData?.nivel1?.trim()) {
      return { success: false, error: "El campo nivel1 es requerido." };
    }
    setLoading(true);
    try {
      const isEdit = !!formData.id;
      const url    = isEdit ? `/api/tn-categories?id=${formData.id}` : "/api/tn-categories";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetchWithTimeout(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error || `Error ${res.status}` };
      }
      await loadTnCategories();
      return { success: true };
    } catch (e) {
      console.error("Error guardando categoría TN", e);
      return { success: false, error: e.message || "Error al comunicarse con el servidor." };
    } finally {
      setLoading(false);
    }
  };

  const deleteTnCategory = async (id) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/tn-categories?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTnCategories();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    } finally {
      setLoading(false);
    }
  };

  return { tnCategories, loading, loadTnCategories, saveTnCategory, deleteTnCategory };
}
