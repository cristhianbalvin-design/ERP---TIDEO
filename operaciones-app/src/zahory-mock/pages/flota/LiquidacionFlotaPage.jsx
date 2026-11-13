import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { useSesionOperativa } from "../../../lib/sesionOperativa.js";
import {
  Campo,
  Dialogo,
  ErrorPie,
  MotivoForm,
  Pill,
  filaTeclado,
} from "./flotaUi.jsx";
import { LiquidacionFlotaPdf } from "./LiquidacionFlotaPdf.jsx";
import {
  armarKpiPartes,
  atribucionParada,
  CAUSAS_PARADA,
  estadoDia,
  etiquetaHistorialLiquidacion,
  formatoMoneda,
  formatoPeriodo,
  horasOperadas,
  validarParte,
} from "./liquidacionFlotaLogic.js";
import {
  aprobarLiquidacionFlota,
  anularLiquidacionFlota,
  anularParteLiquidacion,
  cargarContratosLiquidacion,
  cargarEquiposLiquidacion,
  cargarEventosLiquidacion,
  cargarLineasLiquidacion,
  cargarLiquidacionesFlota,
  cargarPartesLiquidacion,
  cargarPartesPeriodo,
  cargarPartesVecinos,
  cargarUltimoParteLiquidacion,
  crearLiquidacionFlota,
  devolverLiquidacionFlota,
  enviarLiquidacionFlota,
  permisosLiquidacionFlota,
  recalcularLiquidacionFlota,
  guardarParteLiquidacion,
  subirFotoParte,
} from "../../../services/flotaLiquidacionService.js";

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const mesActual = () => hoy().slice(0, 7);
const mesAnterior = () => {
  const [anio, mes] = mesActual().split("-").map(Number);
  return new Date(anio, mes - 2, 1).toISOString().slice(0, 7);
};
const nf = (v, d = 1) =>
  v == null ? "—" : Number(v).toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });
const moneda = formatoMoneda;
const fechaBonita = (f) =>
  f
    ? new Date(`${String(f).slice(0, 10)}T12:00:00`).toLocaleDateString("es-PE", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "Sin dato";
const ESTADOS = {
  borrador: ["Borrador", "amber"],
  en_revision: ["En revisión", "violet"],
  aprobada: ["Aprobada", "green"],
  anulada: ["Anulada", "gray"],
};
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const ESTADOS_DIA_ARIA = {
  registrado: "Registrado",
  proveedor: "Parada del proveedor",
  sin_operacion: "Sin operación",
  falta: "Falta el parte",
  pendiente: "Pendiente de registrar",
  futuro: "Fecha futura",
  fuera: "Fuera de vigencia",
};
const turnoNombre = { dia: "Día", noche: "Noche", dia_noche: "Día y noche" };
const causaLabel = (codigo) => CAUSAS_PARADA.find((x) => x.codigo === codigo)?.etiqueta || codigo || "Sin causa";
const dmrTono = (valor, meta) =>
  valor == null
    ? "gray"
    : Number(valor) >= Number(meta || 0)
      ? "green"
      : Number(valor) >= Number(meta || 0) - 5
        ? "amber"
        : "red";

export function LiquidacionFlotaPage() {
  const sesion = useSesionOperativa();
  const empresaId = sesion.empresaId;
  const [permisos, setPermisos] = useState({ ver: false, crear: false, editar: false, aprobar: false, anular: false });
  const [permisosResueltos, setPermisosResueltos] = useState(false);
  const [errorPermisos, setErrorPermisos] = useState("");
  const [contratos, setContratos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [partes, setPartes] = useState([]);
  const [liquidaciones, setLiquidaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [tab, setTab] = useState("partes");
  const [contratoId, setContratoId] = useState("");
  const [equipoId, setEquipoId] = useState("");
  const [mes, setMes] = useState(mesActual());
  const [periodoFiltro, setPeriodoFiltro] = useState("todos");
  const [estadoFiltro, setEstadoFiltro] = useState("todos");
  const [parteDia, setParteDia] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [nuevo, setNuevo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [crearOpen, setCrearOpen] = useState(false);
  const contrato = contratos.find((c) => c.id === contratoId);
  const equipo = equipos.find((e) => e.id === equipoId);
  const recargar = useCallback(async () => {
    if (!empresaId) return;
    setActualizando(true);
    setError("");
    try {
      const [cs, ls] = await Promise.all([cargarContratosLiquidacion(empresaId), cargarLiquidacionesFlota(empresaId)]);
      const es = await cargarEquiposLiquidacion(cs);
      const desde = `${mes}-01`;
      const hasta = `${mes}-${String(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;
      const ps = await cargarPartesLiquidacion(empresaId, desde, hasta);
      setContratos(cs);
      setLiquidaciones(ls);
      setEquipos(es);
      setPartes(ps);
      if (!contratoId && cs[0]) setContratoId(cs[0].id);
      if (!equipoId && es[0]) setEquipoId(es[0].id);
    } catch (e) {
      setError(e.message || "No se pudo cargar Liquidación & DMR.");
    } finally {
      setCargando(false);
      setActualizando(false);
    }
  }, [empresaId, mes]);
  useEffect(() => {
    if (!empresaId) return;
    let vigente = true;
    setPermisos({ ver: false, crear: false, editar: false, aprobar: false, anular: false });
    setPermisosResueltos(false);
    setErrorPermisos("");
    permisosLiquidacionFlota(empresaId).then((p) => {
      if (vigente) { setPermisos(p); setPermisosResueltos(true); }
    }).catch((e) => {
      if (vigente) { setErrorPermisos(e.message || "No se pudieron cargar los permisos."); setPermisosResueltos(true); }
    });
    return () => { vigente = false; };
  }, [empresaId]);
  useEffect(() => {
    recargar();
  }, [recargar]);
  const equiposContrato = equipos.filter((e) => e.contrato_alquiler_id === contratoId);
  useEffect(() => {
    if (equiposContrato.length && !equiposContrato.some((e) => e.id === equipoId)) setEquipoId(equiposContrato[0].id);
  }, [contratoId, equipos.length]);
  const parteMap = useMemo(
    () =>
      new Map(partes.filter((p) => p.estado === "registrado").map((p) => [`${p.contrato_equipo_id}:${p.fecha}`, p])),
    [partes],
  );
  const partesEquipo = partes.filter((p) => p.contrato_equipo_id === equipoId && p.estado === "registrado");
  const liqBloquea = liquidaciones.some(
    (l) =>
      l.contrato_alquiler_id === contratoId &&
      String(l.periodo).slice(0, 7) === mes &&
      ["en_revision", "aprobada"].includes(l.estado),
  );
  const inicioContrato = contrato?.fecha_inicio || "";
  const finContrato = contrato?.fecha_fin || "";
  const dias = useMemo(() => {
    const [y, m] = mes.split("-").map(Number);
    const cantidad = new Date(y, m, 0).getDate();
    return Array.from({ length: cantidad }, (_, i) => {
      const f = `${mes}-${String(i + 1).padStart(2, "0")}`;
      return {
        fecha: f,
        dia: i + 1,
        estado: estadoDia({
          fecha: f,
          hoy: hoy(),
          inicio: inicioContrato,
          fin: finContrato,
          parte: parteMap.get(`${equipoId}:${f}`),
        }),
      };
    });
  }, [mes, equipoId, inicioContrato, finContrato, parteMap]);
  const faltan = dias.filter((x) => x.estado === "falta");
  const kpisPartes = armarKpiPartes(partesEquipo, faltan);
  const actual = mes === mesActual();
  const dmr = kpisPartes.programadas
    ? ((kpisPartes.programadas - kpisPartes.proveedor) / kpisPartes.programadas) * 100
    : null;
  const partesVisibles = partesEquipo.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const recargarLiquidacion = async (id) => {
    const l = (await cargarLiquidacionesFlota(empresaId)).find((x) => x.id === id);
    if (!l) return;
    const periodo = String(l.periodo).slice(0, 7);
    const [periodoAnio, periodoMes] = periodo.split("-").map(Number);
    const ultimoDia = new Date(periodoAnio, periodoMes, 0).getDate();
    const [lineas, eventos, ps] = await Promise.all([
      cargarLineasLiquidacion(id),
      cargarEventosLiquidacion(empresaId, "liquidacion", id),
      cargarPartesPeriodo(l.contrato_alquiler_id, `${periodo}-01`, `${periodo}-${ultimoDia}`),
    ]);
    setDetalle({ ...l, lineas, eventos, partes: ps });
  };
  const abrirParte = async (fecha, p = null) => {
    let vecinos;
    let ultimoParte;
    try {
      [vecinos, ultimoParte] = await Promise.all([
        cargarPartesVecinos(equipo?.equipo_id, fecha, p?.id),
        cargarUltimoParteLiquidacion(equipoId, p?.id),
      ]);
    } catch (e) {
      setError(e.message || "No se pudieron leer los horómetros vecinos.");
      return;
    }
    const anterior = vecinos.anterior;
    const siguiente = vecinos.siguiente;
    setParteDia({
      fecha,
      parte: p || {
        contrato_equipo_id: equipoId,
        contrato_alquiler_id: contratoId,
        activo_id: equipo?.equipo_id,
        fecha,
        turno: "dia",
        sin_operacion: false,
        horas_programadas: ultimoParte?.horas_programadas ?? 12,
        horometro_inicio: anterior?.horometro_fin ?? equipo?.activo?.horometro_actual ?? "",
        horometro_fin: "",
        paradas: [],
        vb_cliente: "",
        observaciones: "",
      },
      anterior: anterior?.horometro_fin,
      siguiente: siguiente?.horometro_inicio,
      soloLectura: liqBloquea,
      sugeridoPartePrevio: Boolean(ultimoParte),
    });
  };
  const guardarParte = async (form, erroresRef, refs, archivo) => {
    const errores = validarParte(form, {
      hoy: hoy(),
      inicio: inicioContrato,
      fin: finContrato,
      numero: contrato?.numero,
      anterior: parteDia?.anterior,
      siguiente: parteDia?.siguiente,
      mesBloqueado: liqBloquea,
    });
    erroresRef(errores);
    if (Object.keys(errores).some((k) => errores[k])) {
      const nodo = refs?.current;
      const clave = Object.keys(errores).find(
        (k) => errores[k] && nodo?.querySelector(`[data-campo="${k}"]:not(:disabled)`),
      );
      if (clave) setTimeout(() => nodo.querySelector(`[data-campo="${clave}"]`)?.focus(), 0);
      return;
    }
    setBusy(true);
    try {
      let path = form.evidencia_path || null;
      if (archivo) path = await subirFotoParte(empresaId, archivo);
      await guardarParteLiquidacion(empresaId, {
        ...form,
        fecha: parteDia.fecha,
        contrato_alquiler_id: contratoId,
        contrato_equipo_id: equipoId,
        activo_id: equipo?.equipo_id,
        horas_programadas: form.sin_operacion ? 0 : Number(form.horas_programadas),
        horometro_inicio: form.sin_operacion ? null : Number(form.horometro_inicio),
        horometro_fin: form.sin_operacion ? null : Number(form.horometro_fin),
        evidencia_path: path,
        paradas: form.sin_operacion
          ? []
          : form.paradas.map((p) => ({ ...p, horas: Number(p.horas), atribucion: atribucionParada(p.causa) })),
      });
      setParteDia(null);
      setAviso("Parte guardado.");
      await recargar();
    } catch (e) {
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const listadoLiq = liquidaciones.filter(
    (l) =>
      (periodoFiltro === "todos" || String(l.periodo).slice(0, 7) === periodoFiltro) &&
      (estadoFiltro === "todos" || l.estado === estadoFiltro),
  );
  const kpiLiq = listadoLiq.filter((l) => periodoFiltro === "todos" || String(l.periodo).slice(0, 7) === periodoFiltro);
  const setAccion = async (fn, mensaje) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await recargar();
      if (detalle) await recargarLiquidacion(detalle.id);
      setAviso(mensaje);
    } catch (e) {
      setError(e.message || "No se pudo completar la acción.");
    } finally {
      setBusy(false);
    }
  };
  if (permisosResueltos && !permisos.ver && !errorPermisos)
    return (
      <section className="dx-ui dx-flotab dx-liqf">
        <div className="dx-ui-empty">No tienes permiso para ver Liquidación &amp; DMR.</div>
      </section>
    );
  return (
    <section className="dx-ui dx-flotab dx-liqf">
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">Flota &amp; Alquileres · Control mensual</div>
          <h1 className="dx-ui-title">Liquidación &amp; DMR</h1>
          <p className="dx-ui-sub">Partes diarios, disponibilidad y facturación por contrato.</p>
        </div>
      </header>
      {aviso && (
        <p className="dx-ui-notice" role="status">
          {aviso}
        </p>
      )}
      {actualizando && <span className="dx-liqf-refresh" role="status">Actualizando…</span>}
      {cargando && <span className="dx-liqf-refresh" role="status">Cargando datos…</span>}
      {errorPermisos && <p className="dx-ui-error" role="alert">{errorPermisos}</p>}
      {error && (
        <p className="dx-ui-error" role="alert">
          {error}
        </p>
      )}
      <div className="dx-ui-tabs" role="tablist">
        <button className={`dx-ui-tab${tab === "partes" ? " on" : ""}`} onClick={() => setTab("partes")}>
          Partes diarios
        </button>
        <button className={`dx-ui-tab${tab === "liquidaciones" ? " on" : ""}`} onClick={() => setTab("liquidaciones")}>
          Liquidaciones
        </button>
      </div>
      {tab === "partes" ? (
        <>
          <div className="dx-ui-toolbar dx-liqf-filters">
            <label>
              Contrato
              <select
                className="dx-ui-control"
                value={contratoId}
                onChange={(e) => {
                  setContratoId(e.target.value);
                  setEquipoId("");
                  recargar();
                }}
              >
                {contratos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero} · {c.cliente}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Equipo
              <select className="dx-ui-control" value={equipoId} onChange={(e) => setEquipoId(e.target.value)}>
                {equiposContrato.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.activo?.codigo} · {x.activo?.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mes
              <input className="dx-ui-control" type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
            </label>
            <span className="dx-liqf-grow" />
            {(permisos.crear || !permisosResueltos || errorPermisos) && (
              <button
                className="dx-btn primary"
                disabled={!permisos.crear || !equipoId || liqBloquea}
                onClick={() => abrirParte(faltan[0]?.fecha || hoy())}
              >
                ＋ Nuevo parte
              </button>
            )}
          </div>
          <div className="dx-ui-kpi-row dx-liqf-kpis">
            <div className="dx-ui-kpi">
              <strong>
                {nf(kpisPartes.operadas)} / {nf(kpisPartes.programadas)} h
              </strong>
              <span>Horas operadas de programadas</span>
            </div>
            <div className="dx-ui-kpi">
              <strong className={`dx-liqf-${dmrTono(dmr, contrato?.meta_dmr)}`}>{dmr == null ? "—" : `${nf(dmr)} %`}</strong>
              <span>DMR del mes · meta {nf(contrato?.meta_dmr)} %</span>
            </div>
            <div className="dx-ui-kpi">
              <strong>{nf(kpisPartes.proveedor)} h</strong>
              <span>
                Paradas del proveedor <small>{nf(kpisPartes.cliente)} h del cliente</small>
              </span>
            </div>
            <div className="dx-ui-kpi">
              <strong>{faltan.length} días</strong>
              <span>
                Sin parte{" "}
                {faltan.length
                  ? `· ${faltan
                      .slice(0, 5)
                      .map((x) => x.dia)
                      .join(", ")}${faltan.length > 5 ? "…" : ""}`
                  : "· Al día"}
              </span>
            </div>
          </div>
          <div className="dx-ui-card">
            <div className="dx-ui-toolbar">
              <div>
                <h2>
                  {MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}
                </h2>
                <p className="dx-ui-sub">
                  {equipo?.activo?.codigo || "Equipo"} · selecciona un día para ver o registrar el parte
                </p>
              </div>
            </div>
            <div className="dx-liqf-calendar">
              {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                <b key={i}>{d}</b>
              ))}
              {Array.from({ length: (new Date(`${mes}-01T12:00:00`).getDay() + 6) % 7 }, (_, i) => (
                <i key={`e${i}`} />
              ))}
              {dias.map((d) => (
                <button
                  key={d.fecha}
                  disabled={["fuera", "futuro"].includes(d.estado)}
                  className={`dx-liqf-day is-${d.estado}`}
                  aria-label={`${d.fecha}: ${ESTADOS_DIA_ARIA[d.estado]}`}
                  onClick={() => abrirParte(d.fecha, parteMap.get(`${equipoId}:${d.fecha}`))}
                >
                  {d.dia}
                  {d.estado === "proveedor" && <i />}
                </button>
              ))}
            </div>
            <div className="dx-liqf-legend">
              <span className="is-registrado">Registrado</span>
              <span className="is-proveedor">Parada del proveedor</span>
              <span className="is-sin_operacion">Sin operación</span>
              <span className="is-falta">Falta (días anteriores)</span>
              <span className="is-pendiente">Pendiente (hoy)</span>
              <span className="is-futuro">Futuro</span>
              <span className="is-fuera">Fuera de vigencia</span>
            </div>
          </div>
          <div className="dx-ui-card">
            <div className="dx-ui-toolbar">
              <h2>Partes registrados</h2>
              <span className="dx-ui-count">{partesVisibles.length}</span>
            </div>
            {!partesVisibles.length ? (
              <div className="dx-ui-empty">No hay partes registrados para este equipo y mes.</div>
            ) : (
              <>
                <div className="dx-liqf-table">
                  <div className="dx-liqf-head">
                    <span>Fecha</span>
                    <span>Turno</span>
                    <span>Horómetro</span>
                    <span>Operadas</span>
                    <span>Paradas</span>
                    <span>VºBº cliente</span>
                  </div>
                  {partesVisibles.map((p) => (
                    <div key={p.id} className="dx-liqf-row" {...filaTeclado(() => abrirParte(p.fecha, p))}>
                      <span>
                        <b>{fechaBonita(p.fecha)}</b>
                      </span>
                      <span>
                        {turnoNombre[p.turno]} · {nf(p.horas_programadas)} h
                      </span>
                      <span>{p.sin_operacion ? "—" : `${nf(p.horometro_inicio)} → ${nf(p.horometro_fin)}`}</span>
                      <span>
                        <b>{nf(p.horas_operadas)} h</b>
                      </span>
                      <span>
                        {(p.paradas || []).map((x, i) => (
                          <Pill
                            key={i}
                            tono={x.atribucion === "proveedor" ? "amber" : x.atribucion === "cliente" ? "cyan" : "gray"}
                          >
                            {x.horas} h · {causaLabel(x.causa)}
                          </Pill>
                        ))}
                      </span>
                      <span>{p.vb_cliente || "Sin dato"}</span>
                    </div>
                  ))}
                </div>
                <div className="dx-liqf-cards">
                  {partesVisibles.map((p) => (
                    <button key={p.id} className="dx-liqf-card" onClick={() => abrirParte(p.fecha, p)}>
                      <b>
                        {fechaBonita(p.fecha)} · {nf(p.horas_operadas)} h operadas
                      </b>
                      <span>
                        Horómetro {p.sin_operacion ? "—" : `${nf(p.horometro_inicio)} → ${nf(p.horometro_fin)}`}
                      </span>
                      <span>
                        Turno {turnoNombre[p.turno]} · VºBº {p.vb_cliente}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="dx-ui-toolbar dx-liqf-filters">
            <label>
              Periodo
              <select
                className="dx-ui-control"
                value={periodoFiltro}
                onChange={(e) => setPeriodoFiltro(e.target.value)}
              >
                <option value="todos">Todos</option>
                {[...new Set(liquidaciones.map((x) => String(x.periodo).slice(0, 7)))]
                  .sort()
                  .reverse()
                  .map((x) => (
                    <option key={x} value={x}>
                      {MESES[Number(x.slice(5, 7)) - 1]} {x.slice(0, 4)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Estado
              <select className="dx-ui-control" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
                <option value="todos">Todos</option>
                {Object.entries(ESTADOS).map(([v, [label]]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
        <span className="dx-liqf-grow" />
            {(permisos.crear || !permisosResueltos || errorPermisos) && (
              <button className="dx-btn primary" disabled={!permisos.crear} onClick={() => setCrearOpen(true)}>
                ＋ Liquidar un mes
              </button>
            )}
          </div>
          <div className="dx-ui-kpi-row dx-liqf-kpis">
            <div className="dx-ui-kpi">
              <strong>
                {moneda(
                  kpiLiq.reduce((s, l) => s + Number(l.total || 0), 0),
                  kpiLiq[0]?.moneda,
                )}
              </strong>
              <span>Por liquidar</span>
            </div>
            <div className="dx-ui-kpi">
              <strong>{nf(kpiLiq.reduce((s, l) => s + Number(l.horas_operadas || 0), 0))} h</strong>
              <span>Horas operadas</span>
            </div>
            <div className="dx-ui-kpi">
              <strong>
                {moneda(
                  kpiLiq.reduce((s, l) => s + Number(l.penalidad || 0), 0),
                  kpiLiq[0]?.moneda,
                )}
              </strong>
              <span>Penalidades DMR</span>
            </div>
            <div className="dx-ui-kpi">
              <strong>{kpiLiq.reduce((s, l) => s + Number(l.dias_faltantes || 0), 0)}</strong>
              <span>Días sin parte</span>
            </div>
          </div>
          <div className="dx-ui-card">
            <div className="dx-liqf-table dx-liqf-liqs">
              <div className="dx-liqf-head">
                <span>Liquidación</span>
                <span>Contrato / cliente</span>
                <span>Periodo</span>
                <span>Horas</span>
                <span>DMR vs meta</span>
                <span>Penalidad</span>
                <span>Total</span>
                <span>Estado</span>
              </div>
              {!listadoLiq.length ? (
                <div className="dx-ui-empty">No hay liquidaciones que coincidan con los filtros.</div>
              ) : (
                listadoLiq.map((l) => (
                  <div key={l.id} className="dx-liqf-row" {...filaTeclado(() => recargarLiquidacion(l.id))}>
                    <span>
                      <b>{l.numero}</b>
                    </span>
                    <span>
                      <b>{l.contrato?.numero}</b>
                      <small>{l.contrato?.cliente}</small>
                    </span>
                    <span>
                      {MESES[Number(String(l.periodo).slice(5, 7)) - 1]} {String(l.periodo).slice(0, 4)}
                    </span>
                    <span>{nf(l.horas_operadas)} h</span>
                    <span>
                      <div className={`dx-liqf-bar is-${dmrTono(l.dmr, l.meta_dmr)}`}>
                        <i style={{ width: `${Math.max(0, Math.min(100, Number(l.dmr || 0)))}%` }} />
                        <b style={{ left: `${Math.max(0, Math.min(100, Number(l.meta_dmr || 0)))}%` }} />
                      </div>
                      {nf(l.dmr)} % / {nf(l.meta_dmr)} %
                    </span>
                    <span>{moneda(l.penalidad, l.moneda)}</span>
                    <span>
                      <b>{moneda(l.total, l.moneda)}</b>
                    </span>
                    <span>
                      <Pill tono={ESTADOS[l.estado]?.[1]}>{ESTADOS[l.estado]?.[0]}</Pill>
                      {l.dias_faltantes > 0 && <small>Faltan {l.dias_faltantes} partes</small>}
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="dx-liqf-cards">
              {listadoLiq.map((l) => (
                <button className="dx-liqf-card" key={l.id} onClick={() => recargarLiquidacion(l.id)}>
                  <b>
                    {l.numero} · {l.contrato?.numero}
                  </b>
                  <span>
                    {l.contrato?.cliente} · {formatoPeriodo(l.periodo)}
                  </span>
                  <span><Pill tono={ESTADOS[l.estado]?.[1]}>{ESTADOS[l.estado]?.[0]}</Pill></span>
                  <span>
                    DMR {nf(l.dmr)} % / {nf(l.meta_dmr)} % · Total {moneda(l.total, l.moneda)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      {parteDia && (
        <ParteDialog
          key={`${parteDia.fecha}:${parteDia.parte.id || "nuevo"}`}
          estado={parteDia}
          contrato={contrato}
          equipo={equipo}
          permisos={permisos}
          onClose={() => setParteDia(null)}
          onGuardar={guardarParte}
          onAnular={async (motivo) => {
            await anularParteLiquidacion(parteDia.parte.id, motivo);
            setParteDia(null);
            await recargar();
            setAviso("Parte anulado.");
          }}
        />
      )}
      {crearOpen && (
        <CrearLiquidacion
          contratos={contratos}
          onClose={() => setCrearOpen(false)}
          onCrear={async (c, m) => {
            await crearLiquidacionFlota(empresaId, c, m);
            setCrearOpen(false);
            await recargar();
            setAviso("Liquidación creada en borrador.");
          }}
        />
      )}
      {detalle && (
        <DetalleLiquidacion
          key={detalle.id}
          detalle={detalle}
          permisos={permisos}
          busy={busy}
          onClose={() => setDetalle(null)}
          onAccion={setAccion}
          onIrPartes={(l, equipoLinea) => {
            setTab("partes");
            setContratoId(l.contrato_alquiler_id);
            setEquipoId(equipoLinea?.contrato_equipo_id || "");
            setMes(String(l.periodo).slice(0, 7));
            setDetalle(null);
          }}
        />
      )}
    </section>
  );
}

function ParteDialog({ estado, contrato, equipo, permisos, onClose, onGuardar, onAnular }) {
  const [form, setForm] = useState(estado.parte);
  const [errores, setErrores] = useState({});
  const [archivo, setArchivo] = useState(null);
  const [error, setError] = useState("");
  const [motivo, setMotivo] = useState(false);
  const ref = useRef(null);
  const solo = estado.soloLectura || (!form.id && !permisos.crear) || (form.id && !permisos.editar);
  const op =
    form.sin_operacion ||
    form.horometro_inicio === "" ||
    form.horometro_inicio == null ||
    form.horometro_fin === "" ||
    form.horometro_fin == null
      ? NaN
      : horasOperadas(form.horometro_inicio, form.horometro_fin);
  const parada = (form.paradas || []).reduce((s, x) => s + (Number(x.horas) || 0), 0);
  const disponibles = Number(form.horas_programadas || 0) - parada;
  const set = (k, v) => {
    setForm((x) => ({ ...x, [k]: v }));
    setErrores((x) => {
      const next = { ...x };
      delete next[k];
      if (k.startsWith("horometro_")) {
        delete next.horometros;
        delete next.horometro_inicio;
        delete next.horometro_fin;
      }
      return next;
    });
  };
  const setParada = (i, k, v) => {
    setForm((x) => ({ ...x, paradas: x.paradas.map((p, j) => (j === i ? { ...p, [k]: v } : p)) }));
    setErrores((x) => {
      const next = { ...x };
      delete next[`parada_${i}`];
      delete next.paradas;
      return next;
    });
  };
  return (
    <Dialogo
      etiqueta="Parte diario"
      titulo={`${form.id ? "Parte del " : "Nuevo parte · "}${fechaBonita(estado.fecha)}`}
      subtitulo={`${contrato?.numero || ""} · ${equipo?.activo?.codigo || ""} ${equipo?.activo?.nombre || ""}`}
      onCerrar={onClose}
      cerrarFuera={false}
      pie={
        <>
          <ErrorPie mensaje={error} />
          {form.id && permisos.editar && !estado.soloLectura && (
            <button className="dx-btn danger" type="button" onClick={() => setMotivo(true)}>
              Anular parte
            </button>
          )}
          <span className="dx-liqf-grow" />
          <button className="dx-btn" onClick={onClose}>
            Cerrar
          </button>
          {!solo && (
            <button
              className="dx-btn primary"
              disabled={false}
              onClick={async () => {
                setError("");
                try {
                  await onGuardar(form, setErrores, ref, archivo);
                } catch (e) {
                  setError(e.message || "No se pudo guardar el parte.");
                }
              }}
            >
              Guardar parte
            </button>
          )}
        </>
      }
    >
      {estado.soloLectura && (
        <div className="dx-ui-notice">El mes ya está liquidado: el parte es de solo lectura.</div>
      )}
      <div ref={ref} className="dx-liqf-form">
        <div className="dx-liqf-formgrid">
          <Campo etiqueta="Fecha" requerido error={errores.fecha}>
            <input className="dx-ui-control" data-campo="fecha" type="date" value={estado.fecha} disabled />
          </Campo>
          <Campo etiqueta="Turno" requerido error={errores.turno}>
            <select
              className="dx-ui-control"
              data-campo="turno"
              value={form.turno || "dia"}
              disabled={solo}
              onChange={(e) => set("turno", e.target.value)}
            >
              {Object.entries(turnoNombre).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            etiqueta="Horas programadas"
            requerido
            error={errores.horas_programadas}
            ayuda={
              estado.sugeridoPartePrevio || form.id
                ? "Del último parte; ajústalo al turno pactado."
                : "Valor sugerido; ajústalo al turno pactado."
            }
          >
            <input
              className="dx-ui-control"
              data-campo="horas_programadas"
              type="number"
              min="0"
              max="24"
              step="0.5"
              value={form.horas_programadas ?? ""}
              disabled={solo || form.sin_operacion}
              onChange={(e) => set("horas_programadas", e.target.value)}
            />
          </Campo>
        </div>
        <label className="dx-liqf-switch">
          <input
            type="checkbox"
            checked={!!form.sin_operacion}
            disabled={solo}
            onChange={(e) =>
              setForm((x) => ({ ...x, sin_operacion: e.target.checked, paradas: e.target.checked ? [] : x.paradas }))
            }
          />{" "}
          Sin operación
        </label>
        {!form.sin_operacion && (
          <>
            <div className="dx-liqf-formgrid">
              <Campo
                etiqueta="Horómetro inicial"
                requerido
                error={errores.horometro_inicio || errores.horometros}
                ayuda={
                  estado.anterior != null
                    ? `Viene del parte anterior (${nf(estado.anterior)} h)`
                    : "Último horómetro del equipo"
                }
              >
                <input
                  className="dx-ui-control"
                  data-campo="horometro_inicio"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.horometro_inicio ?? ""}
                  disabled={solo}
                  onChange={(e) => set("horometro_inicio", e.target.value)}
                />
              </Campo>
              <Campo
                etiqueta="Horómetro final"
                requerido
                error={errores.horometro_fin || errores.horometros}
                ayuda="Las horas operadas se calculan solas."
              >
                <input
                  className="dx-ui-control"
                  data-campo="horometro_fin"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.horometro_fin ?? ""}
                  disabled={solo}
                  onChange={(e) => set("horometro_fin", e.target.value)}
                />
              </Campo>
            </div>
            <div className="dx-liqf-section">
              <b>Paradas del día</b>
              <small>La causa determina la atribución; solo las del proveedor bajan el DMR.</small>
              {form.paradas.map((p, i) => (
                <div className="dx-liqf-stop" key={i}>
                  <Campo etiqueta="Horas" error={errores[`parada_${i}`]}>
                    <input
                      className="dx-ui-control"
                      data-campo={`parada_${i}`}
                      type="number"
                      min="0"
                      step="0.5"
                      value={p.horas ?? ""}
                      disabled={solo}
                      onChange={(e) => setParada(i, "horas", e.target.value)}
                    />
                  </Campo>
                  <Campo etiqueta="Causa">
                    <select
                      className="dx-ui-control"
                      data-campo={`parada_${i}`}
                      value={p.causa || ""}
                      disabled={solo}
                      onChange={(e) => setParada(i, "causa", e.target.value)}
                    >
                      <option value="">Causa…</option>
                      {CAUSAS_PARADA.map((c) => (
                        <option key={c.codigo} value={c.codigo}>
                          {c.etiqueta}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <Pill
                    tono={
                      atribucionParada(p.causa) === "proveedor"
                        ? "amber"
                        : atribucionParada(p.causa) === "cliente"
                          ? "cyan"
                          : "gray"
                    }
                  >
                    {atribucionParada(p.causa) || "Neutral"}
                  </Pill>
                  {!solo && (
                    <button
                      type="button"
                      className="dx-btn"
                      onClick={() => setForm((x) => ({ ...x, paradas: x.paradas.filter((_, j) => j !== i) }))}
                    >
                      Quitar
                    </button>
                  )}
                </div>
              ))}
              {errores.paradas && <small className="dx-ui-error">{errores.paradas}</small>}
              {!solo && (
                <button
                  className="dx-btn"
                  type="button"
                  onClick={() => setForm((x) => ({ ...x, paradas: [...x.paradas, { horas: "", causa: "" }] }))}
                >
                  ＋ Agregar parada
                </button>
              )}
            </div>
            <div className="dx-liqf-sum">
              <span>
                Operadas <b>{Number.isFinite(op) ? `${nf(op)} h` : "—"}</b>
              </span>
              <span>
                Paradas <b>{nf(parada)} h</b>
              </span>
              <span>
                Disponibles <b>{nf(disponibles)} h</b>
              </span>
              {Number.isFinite(op) && op > disponibles + 0.05 && (
                <Pill tono="amber">Operadas &gt; disponibles: revisa horómetro o paradas</Pill>
              )}
            </div>
            <Campo etiqueta="VºBº del cliente" requerido error={errores.vb_cliente}>
              <input
                className="dx-ui-control"
                data-campo="vb_cliente"
                value={form.vb_cliente || ""}
                disabled={solo}
                placeholder="Nombre de quien firma el parte"
                onChange={(e) => set("vb_cliente", e.target.value)}
              />
            </Campo>
          </>
        )}
        {form.sin_operacion && <div className="dx-liqf-sum">Sin operación · 0 horas operadas</div>}
        <Campo
          etiqueta="Foto del parte firmado"
          ayuda={form.evidencia_path ? `Archivo guardado: ${form.evidencia_path}` : "Opcional · imagen hasta 10 MB"}
        >
          <input
            className="dx-ui-control"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={solo}
            onChange={(e) => setArchivo(e.target.files?.[0] || null)}
          />
        </Campo>
        <Campo etiqueta="Observaciones">
          <textarea
            className="dx-ui-control"
            rows="3"
            value={form.observaciones || ""}
            disabled={solo}
            onChange={(e) => set("observaciones", e.target.value)}
          />
        </Campo>
      </div>
      {motivo && (
        <Dialogo
          titulo="Anular parte"
          subtitulo="La anulación queda registrada en el historial."
          onCerrar={() => setMotivo(false)}
          pie={null}
        >
          <MotivoForm
            etiqueta="Motivo de anulación"
            boton="Anular parte"
            peligro
            onCancelar={() => setMotivo(false)}
            onConfirmar={async (m) => {
              await onAnular(m);
              setMotivo(false);
            }}
          />
        </Dialogo>
      )}
    </Dialogo>
  );
}

function CrearLiquidacion({ contratos, onClose, onCrear }) {
  const [c, setC] = useState(contratos[0]?.id || "");
  const [m, setM] = useState(mesAnterior());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialogo
      titulo="Liquidar un mes"
      subtitulo="Se crea en borrador con los partes del periodo."
      onCerrar={onClose}
      pie={
        <>
          <ErrorPie mensaje={error} />
          <button className="dx-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="dx-btn primary"
            disabled={busy || !c || m > mesActual()}
            onClick={async () => {
              setBusy(true);
              try {
                await onCrear(c, m);
              } catch (e) {
                setError(e.message || "No se pudo crear la liquidación.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Crear liquidación
          </button>
        </>
      }
    >
      <div className="dx-liqf-form">
        <Campo etiqueta="Contrato" requerido>
          <select className="dx-ui-control" value={c} onChange={(e) => setC(e.target.value)}>
            {contratos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.numero} · {x.cliente}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Mes" requerido>
          <input
            className="dx-ui-control"
            type="month"
            max={mesActual()}
            value={m}
            onChange={(e) => setM(e.target.value)}
          />
        </Campo>
      </div>
    </Dialogo>
  );
}

function DetalleLiquidacion({ detalle: l, permisos, busy, onClose, onAccion, onIrPartes }) {
  const [motivo, setMotivo] = useState("");
  const [accion, setAccion] = useState("");
  const [pdfPartes, setPdfPartes] = useState(l.partes || []);
  const faltantes = l.lineas.flatMap((x) => (x.dias_faltantes || []).map((fecha) => ({ linea: x, fecha })));
  const estadoIdx = ["borrador", "en_revision", "aprobada"].indexOf(l.estado);
  const descargar = (
    <PDFDownloadLink
      document={<LiquidacionFlotaPdf liquidacion={l} contrato={l.contrato} lineas={l.lineas} partes={pdfPartes} />}
      fileName={`${l.numero}.pdf`}
      className="dx-btn"
    >
      {({ loading }) => (loading ? "Preparando PDF…" : "Descargar PDF")}
    </PDFDownloadLink>
  );
  const motivoDialog = accion && (
    <Dialogo
      titulo={accion === "devolver" ? "Devolver a borrador" : "Anular liquidación"}
      onCerrar={() => setAccion("")}
      pie={null}
    >
      <MotivoForm
        etiqueta="Motivo"
        boton={accion === "devolver" ? "Devolver" : "Anular"}
        peligro
        onCancelar={() => setAccion("")}
        onConfirmar={async (m) => {
          await onAccion(
            () => (accion === "devolver" ? devolverLiquidacionFlota(l.id, m) : anularLiquidacionFlota(l.id, m)),
            accion === "devolver" ? "Liquidación devuelta a borrador." : "Liquidación anulada.",
          );
          setAccion("");
        }}
      />
    </Dialogo>
  );
  return (
    <>
      <Dialogo
        ancho
        etiqueta="Detalle de liquidación"
        titulo={`${l.numero} · ${MESES[Number(String(l.periodo).slice(5, 7)) - 1]} ${String(l.periodo).slice(0, 4)}`}
        subtitulo={
          `${l.contrato?.numero} · ${l.contrato?.cliente} · Meta DMR ${nf(l.meta_dmr)} % ` +
          `· mínimo ${nf(l.contrato?.minimo_facturable)} ${l.contrato?.unidad_minimo_facturable || "hora"}`
        }
        onCerrar={onClose}
        pie={
          <>
            {descargar}
            {l.estado === "borrador" && permisos.editar && (
              <>
                <button
                  className="dx-btn"
                  disabled={busy}
                  onClick={() => onAccion(() => recalcularLiquidacionFlota(l.id), "Liquidación recalculada.")}
                >
                  Recalcular
                </button>
                <button
                  className="dx-btn primary"
                  disabled={busy || faltantes.length > 0}
                  onClick={() => onAccion(() => enviarLiquidacionFlota(l.id), "Enviada a revisión.")}
                >
                  Enviar a revisión
                </button>
              </>
            )}
            {l.estado === "en_revision" && (
              <>
                {permisos.aprobar && (
                  <>
                    <button className="dx-btn dx-liqf-grow" onClick={() => setAccion("devolver")}>
                      Devolver
                    </button>
                    <button
                      className="dx-btn primary"
                      disabled={busy}
                      onClick={() => onAccion(() => aprobarLiquidacionFlota(l.id), "Liquidación aprobada.")}
                    >
                      Aprobar
                    </button>
                  </>
                )}
              </>
            )}
            {["borrador", "en_revision"].includes(l.estado) && permisos.anular && (
              <button className="dx-btn danger" onClick={() => setAccion("anular")}>
                Anular
              </button>
            )}
          </>
        }
      >
        <ol className="dx-liqf-steps">
          {["borrador", "en_revision", "aprobada"].map((x, i) => (
            <li key={x} className={i < estadoIdx ? "done" : i === estadoIdx ? "current" : ""}>
              {i < estadoIdx ? "✓ " : ""}
              {ESTADOS[x][0]}
            </li>
          ))}
        </ol>
        {faltantes.length > 0 && (
          <div className="dx-ui-notice dx-liqf-missing">
            <span>
              <b>Faltan {faltantes.length} partes diarios.</b>{" "}
              {faltantes
                .slice(0, 12)
                .map((x) => `${x.linea.activo?.codigo || x.linea.activo_id}: ${fechaBonita(x.fecha)}`)
                .join(" · ")}
              . Regístralos o marca «sin operación» para poder enviar a revisión.
            </span>
            <button className="dx-btn" onClick={() => onIrPartes(l, faltantes[0].linea)}>
              Ir a partes
            </button>
          </div>
        )}
        {l.devuelta_motivo && <div className="dx-ui-notice dx-liqf-warning">Motivo de devolución: {l.devuelta_motivo}</div>}
        {l.anulado_motivo && <div className="dx-ui-notice">Motivo de anulación: {l.anulado_motivo}</div>}
        <div className="dx-liqf-detailgrid">
          <div className="dx-ui-card">
            <div className="dx-ui-toolbar">
              <h2>Por equipo</h2>
            </div>
            <div className="dx-liqf-table">
              <div className="dx-liqf-head">
                <span>Equipo</span>
                <span>Operadas</span>
                <span>Facturables</span>
                <span>DMR</span>
                <span>Importe / penalidad</span>
              </div>
              {l.lineas.map((x) => (
                <div className="dx-liqf-row" key={x.id}>
                  <span>
                    <b>{x.activo?.codigo || x.activo_id}</b>
                    <small>{x.activo?.nombre}</small>
                  </span>
                  <span>{nf(x.horas_operadas)} h</span>
                  <span>
                    {nf(x.horas_facturables)} h
                    {x.horas_facturables > x.horas_operadas && <small>Mínimo prorrateado</small>}
                  </span>
                  <span>{nf(x.dmr)} %</span>
                  <span>
                    <b>{moneda(x.total, l.moneda)}</b>
                    {Number(x.penalidad) > 0 && <small>− {moneda(x.penalidad, l.moneda)} penalidad</small>}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="dx-ui-card">
            <div className="dx-ui-toolbar">
              <h2>Cómo se calculó</h2>
            </div>
            <div className="dx-liqf-calc">
              {l.lineas.map((x) => (
                <div key={x.id}>
                  <span>
                    {x.activo?.codigo}: {nf(x.horas_facturables)} h × {moneda(x.tarifa_hora, l.moneda)}
                  </span>
                  <b>{moneda(x.importe_base, l.moneda)}</b>
                  <small>
                    {nf(x.horas_operadas)} h operadas · mínimo prorrateado {nf(x.minimo_prorrateado)} h
                  </small>
                </div>
              ))}
              <div>
                <span>
                  DMR = (programadas {nf(l.horas_programadas)} h − paradas proveedor {nf(l.horas_parada_proveedor)} h) ÷
                  programadas
                </span>
                <b>{nf(l.dmr)} %</b>
              </div>
              {l.lineas
                .filter((x) => Number(x.penalidad) > 0)
                .map((x) => (
                  <div key={`pen-${x.id}`}>
                    <span>Penalidad {x.activo?.codigo}</span>
                    <b>− {moneda(x.penalidad, l.moneda)}</b>
                  </div>
                ))}
              <div className="dx-liqf-total">
                <span>Total a facturar</span>
                <b>{moneda(l.total, l.moneda)}</b>
              </div>
              <small>Las horas facturables, tarifas e importes son los valores devueltos por la base de datos.</small>
            </div>
          </div>
        </div>
        <div className="dx-ui-card">
          <div className="dx-ui-toolbar">
            <h2>Historial</h2>
          </div>
          <div className="dx-liqf-history">
            {!l.eventos?.length ? (
              <p className="dx-flotab-muted">Sin movimientos registrados.</p>
            ) : (
              <div className="dx-ui-timeline">
                {l.eventos.map((evento) => (
                  <div key={evento.id}>
                    <b>{etiquetaHistorialLiquidacion(evento)}</b>
                    <span>
                      {new Date(evento.created_at).toLocaleString("es-PE")}
                      {evento.detalle?.codigo ? ` · ${evento.detalle.codigo}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {l.estado === "aprobada" && (
          <p className="dx-ui-notice">Liquidación aprobada: los partes de este mes quedan bloqueados.</p>
        )}
      </Dialogo>
      {motivoDialog}
    </>
  );
}
