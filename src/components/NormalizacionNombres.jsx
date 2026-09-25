import React, { useState } from "react";
import { C } from "../constants";
import { apiFetch } from "../utils";

/**
 * Sugerencias de nombre aprendidas por categoría, para el final del Paso 2.
 *
 * No se monta sola: hay que apretar "Buscar sugerencias". Es a propósito —
 * cada consulta gasta cuota de IA, y después de enriquecer un lote grande el
 * usuario puede querer ir directo al CSV sin pagar otra pasada.
 *
 * Si la API no devuelve ninguna sugerencia, la sección no muestra tarjetas:
 * molestar sin motivo es peor que no aparecer.
 */
export default function NormalizacionNombres({ productos = [], onAplicar, toast }) {
  const [estado, setEstado] = useState("idle"); // idle | cargando | listo
  const [sugerencias, setSugerencias] = useState([]);
  const [borradores, setBorradores] = useState({}); // codigo → texto editado
  const [ocupado, setOcupado] = useState(null);
  const [sinDatos, setSinDatos] = useState(null); // razón cuando no hubo nada

  const porCodigo = React.useMemo(() => {
    const m = new Map();
    productos.forEach(p => m.set(String(p.CODIGO || p.codigo || ""), p));
    return m;
  }, [productos]);

  const buscar = async () => {
    setEstado("cargando");
    setSinDatos(null);
    try {
      const body = productos.map(p => {
        const e = p._enriched || {};
        return {
          codigo: p.CODIGO || p.codigo || "",
          nombre_actual: e.nombre_limpio || p.PRODUCTO || p.producto || "",
          categoria_tiendanube: e.categoria_tiendanube || "",
          marca: e.marca || null,
          prop1_valor: e.prop1_valor || null,
          prop2_valor: e.prop2_valor || null,
          prop3_valor: e.prop3_valor || null,
        };
      }).filter(p => p.codigo && p.categoria_tiendanube);

      if (!body.length) {
        setSinDatos("Los productos todavía no tienen categoría de Tienda Nube asignada.");
        setEstado("listo");
        return;
      }

      const data = await apiFetch("/api/naming-patterns", {
        method: "POST",
        body: JSON.stringify({ productos: body }),
        timeout: 90000,
      });

      const conNombre = (data?.results || []).filter(r => r.nombre_sugerido);
      setSugerencias(conNombre);

      if (!conNombre.length) {
        // La razón del primero explica el motivo real (faltan ejemplos,
        // confianza baja…). Es más útil que un "no hay sugerencias" pelado.
        const razon = data?.results?.[0]?.razon;
        setSinDatos(razon || "No hay un patrón aprendido todavía para estas categorías.");
      }
      setEstado("listo");
    } catch (e) {
      toast?.error?.(`No se pudieron buscar sugerencias: ${e.message}`);
      setEstado("idle");
    }
  };

  const aplicar = async (sug) => {
    const codigo = String(sug.codigo);
    const nombre = (borradores[codigo] ?? sug.nombre_sugerido ?? "").trim();
    if (!nombre) {
      toast?.error?.("El nombre no puede quedar vacío.");
      return;
    }
    const producto = porCodigo.get(codigo);
    const e = producto?._enriched || {};

    setOcupado(codigo);
    try {
      const r = await apiFetch("/api/naming-patterns", {
        method: "PATCH",
        body: JSON.stringify({
          codigo,
          nombre_normalizado: nombre,
          categoria_tiendanube: e.categoria_tiendanube || "",
          nombre_original: e.nombre_limpio || producto?.PRODUCTO || null,
        }),
      });

      // Reflejarlo en el producto de la sesión, no solo en la base.
      if (producto && onAplicar) onAplicar(producto._id, { ...e, nombre_limpio: nombre });

      setSugerencias(prev => prev.filter(s => String(s.codigo) !== codigo));
      if (r?.aviso) toast?.error?.(r.aviso);
      else if (r?.faltan > 0) toast?.success?.(`Guardado. Faltan ${r.faltan} ejemplos para que esta categoría sugiera sola.`);
      else toast?.success?.("Nombre aplicado y patrón actualizado.");
    } catch (err) {
      toast?.error?.(err.message);
    } finally {
      setOcupado(null);
    }
  };

  // Ignorar NO manda nada al servidor: un rechazo no debe contaminar el
  // aprendizaje, solo desaparece de la lista.
  const ignorar = codigo => setSugerencias(prev => prev.filter(s => String(s.codigo) !== String(codigo)));

  const altas = sugerencias.filter(s => Number(s.confianza) > 90);

  const aplicarTodas = async () => {
    for (const s of altas) {
      // Secuencial a propósito: cada PATCH recalcula el patrón de la
      // categoría, y en paralelo se pisarían entre sí.
      await aplicar(s);
    }
  };

  if (!productos.length) return null;

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>✨ Normalización de Nombres</span>
        {estado === "idle" && (
          <button
            onClick={buscar}
            style={{ padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.accent}`, background: C.accentBg, color: C.accent, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            Buscar sugerencias
          </button>
        )}
        {estado === "cargando" && (
          <span className="pulse" style={{ fontSize: 12, color: C.textMuted }}>Comparando con los patrones aprendidos...</span>
        )}
        {estado === "listo" && sugerencias.length > 0 && (
          <span style={{ fontSize: 12, color: C.textMuted }}>
            {sugerencias.length} {sugerencias.length === 1 ? "sugerencia" : "sugerencias"}
          </span>
        )}
      </div>

      {estado === "listo" && sinDatos && (
        <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.5 }}>
          {sinDatos}
        </div>
      )}

      {altas.length > 1 && (
        <button
          onClick={aplicarTodas}
          disabled={!!ocupado}
          style={{ alignSelf: "flex-start", padding: "6px 14px", borderRadius: 7, border: "none", background: C.success, color: "#fff", fontSize: 11, fontWeight: 700, cursor: ocupado ? "default" : "pointer" }}
        >
          ✓ Aplicar las {altas.length} con confianza &gt;90%
        </button>
      )}

      {sugerencias.map(s => {
        const codigo = String(s.codigo);
        const producto = porCodigo.get(codigo);
        const actual = producto?._enriched?.nombre_limpio || producto?.PRODUCTO || "";
        const valor = borradores[codigo] ?? s.nombre_sugerido;
        const trabajando = ocupado === codigo;
        const conf = Number(s.confianza) || 0;

        return (
          <div key={codigo} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, background: C.bg, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDim }}>{codigo}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                background: conf > 90 ? `${C.success}18` : `${C.warning}18`,
                color: conf > 90 ? C.success : C.warning,
              }}>
                {conf}%
              </span>
            </div>

            <div style={{ fontSize: 12, color: C.textDim, textDecoration: "line-through" }}>{actual}</div>

            <input
              type="text"
              value={valor}
              onChange={ev => setBorradores(b => ({ ...b, [codigo]: ev.target.value }))}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${C.accent}60`, background: C.surface, color: C.text, fontSize: 14, fontWeight: 600, outline: "none" }}
            />

            {s.razon && <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.4 }}>{s.razon}</div>}

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => aplicar(s)} disabled={trabajando} style={btn(C.success, true)}>
                {trabajando ? "Guardando..." : "✓ Aplicar"}
              </button>
              <button onClick={() => ignorar(codigo)} disabled={trabajando} style={btn(C.textMuted, false)}>
                ✗ Ignorar
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function btn(color, solido) {
  return {
    minHeight: 40,
    padding: "0 14px",
    borderRadius: 8,
    border: solido ? "none" : `1px solid ${color}40`,
    background: solido ? color : "transparent",
    color: solido ? "#fff" : color,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}
