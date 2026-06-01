import { useState, useEffect } from "react";
import { fetchWithTimeout } from "../utils";

export default function useTnCategories() {
  const [tnCategories, setTnCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadTnCategories = async () => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout("/api/tn-categories");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data)) setTnCategories(data);
    } catch (e) {
      console.error("Error cargando categorías TN", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTnCategories(); }, []);

  const saveTnCategory = async (formData) => {
    // Client-side validation before hitting the API
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
