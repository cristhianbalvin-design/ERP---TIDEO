import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../context.jsx";
import { campanaAudienciaService as servicio } from "../services/campanaAudienciaService.js";
import "../campana_audiencia.css";

const ESTADOS = {
  por_enviar: "Por enviar",
  enviado: "Enviado",
  sin_respuesta: "Sin respuesta",
  interesado: "Interesado",
  lead: "Lead creado",
  no_interesado: "No interesado",
  no_contactar: "No contactar",
};
const CONS = {
  por_confirmar: "Por confirmar",
  confirmado: "Confirmado",
  revocado: "Revocado",
};
const estado = (m) => (m.lead_id ? "lead" : m.estado);
const fecha = (d) => (d ? d.split("-").reverse().join("/") : "Sin dato");
const normal = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const hoy = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const vencido = (m) =>
  m.proximo_seguimiento &&
  m.proximo_seguimiento < hoy() &&
  !m.lead_id &&
  !["no_interesado", "no_contactar"].includes(m.estado);
const vacio = (v) => v || "Sin dato";
const inicial = {
  nombre: "",
  tipo_cliente: "persona",
  empresa_nombre: "",
  cargo: "",
  observacion: "",
  linkedin_url: "",
  email: "",
  telefono: "",
  etiqueta: "",
  consentimiento: "por_confirmar",
};
const plural = (n, uno, varios) => (n === 1 ? uno : varios);

function Modal({ titulo, cerrar, children, pie, dark }) {
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") cerrar();
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [cerrar]);
  return createPortal(
    <div className={dark ? "dark" : ""}>
      <div className="dx-ui">
        <div className="dx-camp-aud-overlay">
          <div
            className="dx-camp-aud-modal"
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
          >
            <header>
              <h2>{titulo}</h2>
              <button
                type="button"
                className="dx-btn"
                aria-label="Cerrar"
                onClick={cerrar}
              >
                ×
              </button>
            </header>
            <div className="dx-camp-aud-modal-body">{children}</div>
            <footer>{pie}</footer>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const TIPOS = {
  base_propia: "Base propia",
  ads: "Ads",
  email: "Email",
  evento: "Evento",
  outbound: "Outbound",
  contenido: "Contenido",
  referidos: "Referidos",
};
const ESTADOS_CAMPANA = {
  borrador: "Borrador",
  activa: "Activa",
  pausada: "Pausada",
  finalizada: "Finalizada",
};
const COLORES = {
  por_enviar: "is-amber",
  enviado: "is-cyan",
  interesado: "is-green",
  sin_respuesta: "is-gray",
  no_interesado: "is-gray",
  no_contactar: "is-red",
  lead: "dx-camp-aud-pill-lead",
};
function Pill({ valor }) {
  return (
    <span className={`dx-ui-pill ${COLORES[valor]}`}>
      <i />
      {ESTADOS[valor]}
    </span>
  );
}
function Lista({
  filtro,
  setFiltro,
  miembros,
  contar,
  editar,
  seleccion,
  setSeleccion,
  ejecutar,
  cargando,
  errorCarga,
  visibles,
  ficha,
  keyRow,
  persona,
  pill,
  accion,
}) {
  return (
    <>
      <div className="dx-camp-aud-filters">
        {[["todos", "Todos"], ...Object.entries(ESTADOS)].map(([k, label]) => (
          <button
            key={k}
            className="dx-btn"
            aria-pressed={filtro === k}
            onClick={() => setFiltro(k)}
          >
            {label} ({k === "todos" ? miembros.length : contar(k)})
          </button>
        ))}
      </div>
      {editar && seleccion.length > 0 && (
        <div className="dx-camp-aud-bulk">
          <span>
            {seleccion.length}{" "}
            {plural(seleccion.length, "seleccionada", "seleccionadas")}
          </span>
          {[
            ["enviado", "Marcar enviados"],
            ["sin_respuesta", "Sin respuesta"],
            ["no_contactar", "No contactar"],
          ].map(([k, l]) => (
            <button
              key={k}
              className="dx-btn"
              onClick={() =>
                ejecutar(
                  () => servicio.cambiarEstado(seleccion, k),
                  "Personas actualizadas.",
                ).then((ok) => {
                  if (ok) setSeleccion([]);
                })
              }
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="dx-camp-aud-head">
        <span></span>
        <span>Persona</span>
        <span>Estado</span>
        <span>Último contacto</span>
        <span>Seguimiento</span>
        <span>Siguiente acción</span>
      </div>
      {!cargando &&
        !errorCarga &&
        visibles.map((m) => (
          <div
            className="dx-camp-aud-row"
            role="button"
            tabIndex={0}
            key={m.id}
            onClick={() => ficha(m)}
            onKeyDown={(e) => keyRow(e, m)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              {editar && !m.lead_id && (
                <input
                  type="checkbox"
                  aria-label={`Seleccionar ${m.contacto?.nombre}`}
                  checked={seleccion.includes(m.id)}
                  onChange={(e) =>
                    setSeleccion(
                      e.target.checked
                        ? [...seleccion, m.id]
                        : seleccion.filter((id) => id !== m.id),
                    )
                  }
                />
              )}
            </div>
            <div className="dx-camp-aud-person">{persona(m)}</div>
            <div>
              <span className="dx-camp-aud-label">Estado</span>
              {pill(m)}
            </div>
            <div>
              <span className="dx-camp-aud-label">Último contacto</span>
              {fecha(m.ultimo_contacto)}
            </div>
            <div className={vencido(m) ? "dx-camp-aud-late" : ""}>
              <span className="dx-camp-aud-label">Seguimiento</span>
              {fecha(m.proximo_seguimiento)}
              {vencido(m) && " · vencido"}
            </div>
            {accion(m)}
          </div>
        ))}
    </>
  );
}
function Kanban({
  visibles,
  miembros,
  editar,
  mover,
  ficha,
  keyRow,
  persona,
  accion,
}) {
  const [destino, setDestino] = useState(null);
  const [arrastrado, setArrastrado] = useState(null);
  return (
    <div className="dx-camp-aud-board" aria-label="Kanban de la audiencia">
      {Object.entries(ESTADOS).map(([k, l]) => {
        const grupo = visibles.filter((m) => estado(m) === k);
        return (
          <section
            key={k}
            className={`dx-camp-aud-column ${destino === k ? "is-destination" : ""}`}
            onDragOver={(e) => {
              if (editar) {
                e.preventDefault();
                setDestino(k);
              }
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setDestino(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDestino(null);
              setArrastrado(null);
              const m = miembros.find(
                (x) => x.id === e.dataTransfer.getData("text/plain"),
              );
              if (m && editar) mover(m, k);
            }}
          >
            <div className="dx-camp-aud-column-head">
              <Pill valor={k} />
              <span>{grupo.length}</span>
            </div>
            {grupo.length ? (
              grupo.map((m) => (
                <article
                  key={m.id}
                  className={`dx-camp-aud-card ${arrastrado === m.id ? "is-dragging" : ""}`}
                  role="button"
                  tabIndex={0}
                  draggable={editar && !m.lead_id}
                  onDragStart={(e) => {
                    setArrastrado(m.id);
                    e.dataTransfer.setData("text/plain", m.id);
                  }}
                  onDragEnd={() => {
                    setArrastrado(null);
                    setDestino(null);
                  }}
                  onClick={() => ficha(m)}
                  onKeyDown={(e) => keyRow(e, m)}
                >
                  <div className="dx-camp-aud-person">{persona(m)}</div>
                  <div className="dx-camp-aud-meta">
                    <span>
                      Último contacto
                      <br />
                      {fecha(m.ultimo_contacto)}
                    </span>
                    <span className={vencido(m) ? "dx-camp-aud-late" : ""}>
                      Seguimiento
                      <br />
                      {fecha(m.proximo_seguimiento)}
                      {vencido(m) && " · vencido"}
                    </span>
                  </div>
                  {accion(m)}
                </article>
              ))
            ) : (
              <div className="dx-ui-empty">Sin personas</div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default function CampanaAudiencia({ campana, onVolver }) {
  const {
    role,
    authUser,
    usuarios,
    dark,
    navigate,
    recargarLeads,
    setCampanas,
  } = useApp();
  const crear = Boolean(
    role?.permisos?.todo ||
    role?.permisos?.crear === true ||
    role?.permisos?.crear?.includes?.("marketing"),
  );
  const editar = Boolean(
    role?.permisos?.todo ||
    role?.permisos?.editar === true ||
    role?.permisos?.editar?.includes?.("marketing"),
  );
  const [miembros, setMiembros] = useState([]),
    [cargando, setCargando] = useState(true),
    [errorCarga, setErrorCarga] = useState(""),
    [error, setError] = useState(""),
    [aviso, setAviso] = useState("");
  const [consulta, setConsulta] = useState(""),
    [filtro, setFiltro] = useState("todos"),
    [seleccion, setSeleccion] = useState([]);
  const clave = `campana-audiencia-vista:${authUser?.id || "usuario"}`;
  const [vista, setVista] = useState(() => {
    try {
      return localStorage.getItem(clave) === "kanban" ? "kanban" : "lista";
    } catch {
      return "lista";
    }
  });
  const [modal, setModal] = useState(null),
    [form, setForm] = useState({}),
    [errores, setErrores] = useState({}),
    [ocupado, setOcupado] = useState(false),
    [errorModal, setErrorModal] = useState("");
  const [filas, setFilas] = useState(null),
    [resumen, setResumen] = useState(null),
    [mensaje, setMensaje] = useState(campana.mensaje_base || "");
  const refForm = useRef(null),
    archivoVersion = useRef(0);
  const cargar = async () => {
    setMiembros(await servicio.listar(campana.id));
  };
  useEffect(() => {
    setCargando(true);
    setErrorCarga("");
    cargar()
      .catch((e) =>
        setErrorCarga(e.message || "No se pudo cargar la audiencia."),
      )
      .finally(() => setCargando(false));
  }, [campana.id]);
  const cambiarVista = (v) => {
    setVista(v);
    try {
      localStorage.setItem(clave, v);
    } catch {}
  };
  const abrir = (tipo, datos = {}) => {
    setModal(tipo);
    setForm(datos);
    setErrores({});
    setErrorModal("");
    setFilas(null);
    setResumen(null);
  };
  const cerrar = () => {
    if (!ocupado) setModal(null);
  };
  const ejecutar = async (fn, texto) => {
    setError("");
    setAviso("");
    try {
      const r = await fn();
      await cargar();
      setSeleccion([]);
      setError("");
      if (texto) setAviso(typeof texto === "function" ? texto(r) : texto);
      return true;
    } catch (e) {
      setError(e.message || "No se pudo completar la operación.");
      return false;
    }
  };
  const mover = async (m, destino) => {
    if (estado(m) === destino) return;
    if (m.lead_id) {
      setAviso("");
      setError("Esta persona ya es lead; continúa en Leads y Scoring.");
      return;
    }
    if (destino === "lead") {
      if (m.estado !== "interesado") {
        setAviso("");
        setError("Primero marca a la persona como interesada.");
        return;
      }
      await ejecutar(
        async () => {
          const r = await servicio.pasarLead(
            m.id,
            usuarios.find(
              (u) =>
                (authUser?.id &&
                  (u.id === authUser.id || u.auth_user_id === authUser.id)) ||
                (authUser?.email && u.email === authUser.email),
            )?.nombre,
          );
          try {
            await recargarLeads();
          } catch (e) {
            await cargar();
            throw new Error(
              "El lead se vinculó, pero no se pudieron actualizar las métricas: " +
                (e.message || "error de carga"),
            );
          }
          return r;
        },
        (r) =>
          r.creado
            ? "Se creó un lead nuevo y se vinculó a la campaña."
            : "Se vinculó un lead existente a la campaña.",
      );
    } else
      await ejecutar(
        () => servicio.cambiarEstado([m.id], destino),
        "Estado actualizado.",
      );
  };
  const guardarModal = async () => {
    setErrorModal("");
    setErrores({});
    if (modal === "persona" || modal === "ficha") {
      const e = {};
      if (form.tipo_cliente === "empresa" && !form.empresa_nombre?.trim()) e.empresa_nombre = "Escribe la empresa.";
      if (modal === "persona") {
      if (!form.nombre?.trim()) e.nombre = "Escribe el nombre.";
      if (
        ![form.linkedin_url, form.email, form.telefono].some((v) => v?.trim())
      )
        e.linkedin_url = "Ingresa LinkedIn, correo o teléfono.";
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
        e.email = "Ingresa un correo válido.";
      }
      if (Object.keys(e).length) {
        setErrores(e);
        requestAnimationFrame(() =>
          refForm.current?.querySelector('[aria-invalid="true"]')?.focus(),
        );
        return;
      }
    }
    setOcupado(true);
    try {
      if (modal === "mensaje") {
        const r = await servicio.guardarMensaje(campana.id, form.mensaje);
        setMensaje(r.mensaje_base || "");
        setCampanas((prev) =>
          prev.map((c) =>
            c.id === campana.id ? { ...c, mensaje_base: r.mensaje_base } : c,
          ),
        );
      }
      if (modal === "ficha") await servicio.guardar(form.miembro, form);
      if (modal === "persona") {
        const r = await servicio.importar(campana.id, [form], false);
        setError("");
        setAviso(
          r.no_contactar
            ? "Esta persona pidió no ser contactada."
            : r.ya_en_campana
              ? "Esta persona ya estaba en la campaña."
              : "Persona agregada.",
        );
      }
      if (modal === "importar") {
        const r = await servicio.importar(campana.id, filas, false);
        setError("");
        setAviso(
          `Importación completada: ${r.agregadas} ${plural(r.agregadas, "persona agregada", "personas agregadas")}${r.completados ? ` y ${r.completados} ${plural(r.completados, "persona completada", "personas completadas")}` : ""}.`,
        );
      }
      if (modal !== "mensaje") await cargar();
      setModal(null);
    } catch (e) {
      setErrorModal(e.message || "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  };
  const leerArchivo = async (e) => {
    const version = ++archivoVersion.current;
    setFilas(null);
    setResumen(null);
    setErrorModal("");
    const archivo = e.target.files?.[0];
    if (!archivo) {
      setOcupado(false);
      return;
    }
    try {
      const registros = await servicio.leerArchivo(archivo);
      if (version !== archivoVersion.current) return;
      setFilas(registros);
      setOcupado(true);
      const r = await servicio.importar(campana.id, registros, true);
      if (version === archivoVersion.current) setResumen(r);
    } catch (err) {
      if (version === archivoVersion.current)
        setErrorModal(err.message || "No se pudo leer el archivo.");
    } finally {
      if (version === archivoVersion.current) setOcupado(false);
    }
  };

  const copiar = async (m) => {
    setError("");
    setAviso("");
    const url = String(m.contacto?.linkedin_url || "")
      .trim()
      .replace(/^https?:\/\//i, "");
    if (m.contacto?.linkedin_url && (!url || /[\s\\]/.test(url))) {
      setError("El perfil de LinkedIn no tiene una URL válida.");
      return;
    }
    try {
      const parsed = url ? new URL(`https://${url}`) : null;
      if (parsed &&
        !["linkedin.com", "www.linkedin.com"].includes(
          parsed.hostname.toLowerCase(),
        ) &&
        !parsed.hostname.toLowerCase().endsWith(".linkedin.com")
      )
        throw new Error("El perfil de LinkedIn no tiene una URL válida.");
      if (mensaje.trim()) {
        try {
          await navigator.clipboard.writeText(
            mensaje.replace(
              /\{nombre\}/gi,
              () => (m.contacto?.nombre || "").trim().split(/\s+/)[0],
            ),
          );
          setAviso("Mensaje copiado. Estado sin cambios.");
        } catch {
          setError(
            parsed
              ? "No se pudo copiar el mensaje. Se abrirá el perfil de LinkedIn."
              : "No se pudo copiar el mensaje al portapapeles.",
          );
        }
      } else {
        setAviso("No hay mensaje base; redacta uno para copiarlo.");
      }
      if (parsed) window.open(parsed.href, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e.message || "No se pudo copiar el mensaje.");
    }
  };
  const filtrados = useMemo(
    () =>
      miembros.filter((m) =>
        [
          m.contacto?.nombre,
          m.contacto?.email,
          m.contacto?.telefono,
          m.contacto?.linkedin_url,
          m.contacto?.etiqueta,
          m.contacto?.empresa_nombre,
          m.contacto?.cargo,
        ].some((v) => normal(v).includes(normal(consulta))),
      ),
    [miembros, consulta],
  );
  const visibles =
    vista === "lista" && filtro !== "todos"
      ? filtrados.filter((m) => estado(m) === filtro)
      : filtrados;
  const contar = (k) => miembros.filter((m) => estado(m) === k).length;
  const kp = [
    [miembros.length, plural(miembros.length, "persona", "personas")],
    [contar("por_enviar"), "por enviar"],
    [
      miembros.filter((m) => m.ultimo_contacto).length,
      plural(
        miembros.filter((m) => m.ultimo_contacto).length,
        "contactada",
        "contactadas",
      ),
    ],
    [
      contar("interesado"),
      plural(contar("interesado"), "interesada", "interesadas"),
    ],
    [contar("lead"), plural(contar("lead"), "lead creado", "leads creados")],
    [
      miembros.filter(vencido).length,
      plural(
        miembros.filter(vencido).length,
        "seguimiento vencido",
        "seguimientos vencidos",
      ),
    ],
  ];
  const ficha = (m) =>
    abrir("ficha", {
      miembro: m,
      estado: m.estado,
      canal: m.canal,
      ultimo_contacto: m.ultimo_contacto || "",
      proximo_seguimiento: m.proximo_seguimiento || "",
      nota: m.nota || "",
      consentimiento: m.contacto?.consentimiento || "por_confirmar",
      tipo_cliente: m.contacto?.tipo_cliente || "persona",
      empresa_nombre: m.contacto?.empresa_nombre || "",
      cargo: m.contacto?.cargo || "",
    });
  const accion = (m) => (
    <div
      className="dx-camp-aud-actions"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {m.lead_id ? (
        <button className="dx-btn" onClick={() => navigate("leads")}>
          Ver lead
        </button>
      ) : (
        editar && (
          <>
            {m.estado === "por_enviar" && (
              <>
                <button className="dx-btn primary" onClick={() => copiar(m)}>
                  {m.contacto?.linkedin_url ? "Copiar y abrir LinkedIn" : "Copiar mensaje"}
                </button>
                <button className="dx-btn" onClick={() => mover(m, "enviado")}>
                  Marcar enviado
                </button>
              </>
            )}
            {["enviado", "sin_respuesta"].includes(m.estado) && (
              <>
                <button
                  className="dx-btn"
                  onClick={() => mover(m, "interesado")}
                >
                  Interesado
                </button>
                <button
                  className="dx-btn"
                  onClick={() => mover(m, "no_interesado")}
                >
                  No interesado
                </button>
              </>
            )}
            {m.estado === "interesado" && (
              <button
                className="dx-btn primary"
                onClick={() => mover(m, "lead")}
              >
                Pasar a Leads
              </button>
            )}
          </>
        )
      )}
    </div>
  );
  const persona = (m) => (
    <>
      <strong>{m.contacto?.nombre} <span className={`dx-camp-aud-tipo ${m.contacto?.tipo_cliente === "empresa" ? "is-empresa" : ""}`}>{m.contacto?.tipo_cliente === "empresa" ? "EMPRESA" : "PERSONA"}</span></strong>
      <small>{[m.contacto?.cargo, m.contacto?.empresa_nombre].filter(Boolean).join(" · ") || "Sin dato"}</small>
      {m.contacto?.etiqueta && <small>{m.contacto.etiqueta}</small>}
      {m.contacto?.consentimiento === "por_confirmar" && (
        <small>Consentimiento por confirmar</small>
      )}
    </>
  );
  const pill = (m) => <Pill valor={estado(m)} />;
  const keyRow = (e, m) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      ficha(m);
    }
  };
  const campo = (nombre, etiqueta, tipo = "text") => (
    <div className="dx-ui-field" key={nombre}>
      <label htmlFor={`aud-${nombre}`}>
        {etiqueta}
        {(nombre === "nombre" || (nombre === "empresa_nombre" && form.tipo_cliente === "empresa")) && <span className="dx-ui-required"> *</span>}
      </label>
      {modal === "ficha" && !editar ? (
        <span>
          {tipo === "date" ? fecha(form[nombre]) : vacio(form[nombre])}
        </span>
      ) : (
        <input
          id={`aud-${nombre}`}
          type={tipo}
          placeholder={nombre === "nombre" ? "Nombres y apellidos" : undefined}
          readOnly={modal === "ficha" && !editar}
          value={form[nombre] || ""}
          aria-invalid={!!errores[nombre]}
          onChange={(e) => setForm({ ...form, [nombre]: e.target.value })}
        />
      )}
      {errores[nombre] && (
        <span className="dx-ui-field-error" role="alert">
          {errores[nombre]}
        </span>
      )}
    </div>
  );
  const tipoCliente = (
    <div className="dx-ui-field">
      <label htmlFor="aud-tipo">Tipo de cliente <span className="dx-ui-required">*</span></label>
      {modal === "ficha" && !editar ? <span>{form.tipo_cliente === "empresa" ? "Empresa" : "Persona"}</span> :
        <select id="aud-tipo" className="dx-ui-select" value={form.tipo_cliente} onChange={(e) => setForm({ ...form, tipo_cliente: e.target.value })}>
          <option value="persona">Persona</option><option value="empresa">Empresa</option>
        </select>}
    </div>
  );
  const observacion = (key) => (
    <div className="dx-ui-field dx-camp-aud-wide">
      <label htmlFor="aud-observacion">Observación</label>
      {modal === "ficha" && !editar ? <span>{vacio(form[key])}</span> :
        <textarea id="aud-observacion" rows={3} value={form[key] || ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />}
    </div>
  );
  return (
    <section className="dx-ui dx-camp-aud-root">
      <button className="dx-camp-aud-back" onClick={onVolver}>
        ← Marketing Automation
      </button>
      <header className="dx-ui-head-page">
        <div>
          <div className="dx-ui-eyebrow">
            Campaña · {TIPOS[campana.tipo] || vacio(campana.tipo)}
          </div>
          <h1 className="dx-ui-title">{campana.nombre}</h1>
          <p className="dx-ui-sub">
            {campana.canal} ·{" "}
            {ESTADOS_CAMPANA[campana.estado] || vacio(campana.estado)} ·{" "}
            {fecha(campana.fecha_inicio)} a {fecha(campana.fecha_fin)}
          </p>
        </div>
        {crear && (
          <div className="dx-ui-actions">
            <button
              className="dx-btn"
              onClick={() => abrir("persona", { ...inicial })}
            >
              Agregar persona
            </button>
            <button
              className="dx-btn primary"
              onClick={() => abrir("importar")}
            >
              Importar Excel
            </button>
          </div>
        )}
      </header>
      {errorCarga && (
        <div className="dx-camp-aud-error" role="alert">
          {errorCarga}
        </div>
      )}
      {error && (
        <div className="dx-camp-aud-error" role="alert">
          {error}
        </div>
      )}
      {aviso && (
        <div className="dx-camp-aud-notice" role="status">
          {aviso}
        </div>
      )}
      {cargando ? (
        <div className="dx-ui-empty">Cargando audiencia…</div>
      ) : (
        !errorCarga && (
          <div className="dx-ui-kpi-row" aria-label="Resumen de la campaña">
            {kp.map(([n, l]) => (
              <div className="dx-ui-kpi" key={l}>
                <strong>{n}</strong>
                <span>{l}</span>
              </div>
            ))}
          </div>
        )
      )}
      <section className="dx-ui-card dx-camp-aud-message">
        <div>
          <strong>Mensaje base</strong>
          <p>
            {mensaje ||
              "Redacta un mensaje base para personalizarlo al contactar a cada persona."}
          </p>
        </div>
        {editar && (
          <button
            className="dx-btn"
            onClick={() => abrir("mensaje", { mensaje })}
          >
            Editar
          </button>
        )}
      </section>
      <section className="dx-ui-card">
        <div className="dx-ui-toolbar">
          <h2>Audiencia</h2>
          <span className="dx-ui-count">
            {miembros.length} {plural(miembros.length, "persona", "personas")}
          </span>
          <label className="dx-ui-search">
            <input
              aria-label="Buscar en la audiencia"
              placeholder="Buscar nombre, empresa, cargo o correo"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
            />
          </label>
          <div
            className="dx-camp-aud-actions"
            role="group"
            aria-label="Vista de la audiencia"
          >
            {["lista", "kanban"].map((v) => (
              <button
                className="dx-btn"
                key={v}
                aria-pressed={vista === v}
                onClick={() => cambiarVista(v)}
              >
                {v === "lista" ? "Lista" : "Kanban"}
              </button>
            ))}
          </div>
        </div>
        {!mensaje && (
          <p className="dx-camp-aud-hint">
            No hay mensaje base; puedes redactarlo antes de copiar.
          </p>
        )}
        {vista === "lista" && (
          <Lista
            {...{
              filtro,
              setFiltro,
              miembros,
              contar,
              editar,
              seleccion,
              setSeleccion,
              ejecutar,
              cargando,
              errorCarga,
              visibles,
              ficha,
              keyRow,
              persona,
              pill,
              accion,
            }}
          />
        )}
        {vista === "kanban" && !cargando && !errorCarga && (
          <Kanban
            {...{
              visibles,
              miembros,
              editar,
              mover,
              ficha,
              keyRow,
              persona,
              accion,
            }}
          />
        )}
        {!cargando && !errorCarga && !miembros.length && (
          <div className="dx-ui-empty">
            Aún no hay personas en esta campaña.
          </div>
        )}
        {!cargando &&
          !errorCarga &&
          miembros.length > 0 &&
          !visibles.length && (
            <div className="dx-ui-empty">
              No hay resultados para esta búsqueda o filtro.
            </div>
          )}
      </section>
      {modal && (
        <Modal
          titulo={
            {
              persona: "Agregar persona",
              importar: "Importar audiencia",
              mensaje: "Mensaje base",
              ficha: form.miembro?.contacto?.nombre || "Ficha de persona",
            }[modal]
          }
          cerrar={cerrar}
          dark={dark}
          pie={
            <>
              <button className="dx-btn" onClick={cerrar} disabled={ocupado}>
                Cancelar
              </button>
              {(modal !== "ficha" || editar) && (
                <button
                  className="dx-btn primary"
                  onClick={guardarModal}
                  disabled={ocupado || (modal === "importar" && (!resumen || (!resumen.agregadas && !resumen.completados)))}
                >
                  {ocupado
                    ? "Guardando…"
                    : modal === "importar"
                      ? "Confirmar importación"
                      : modal === "persona"
                        ? "Agregar"
                        : "Guardar"}
                </button>
              )}
            </>
          }
        >
          <div ref={refForm}>
            {modal === "mensaje" && (
              <div className="dx-ui-field">
                <label htmlFor="aud-mensaje">Texto del mensaje</label>
                <textarea
                  id="aud-mensaje"
                  rows={5}
                  value={form.mensaje}
                  onChange={(e) =>
                    setForm({ ...form, mensaje: e.target.value })
                  }
                />
                <span className="dx-ui-field-hint">
                  {"{nombre}"} se reemplaza por el primer nombre de cada persona
                  al copiar.
                </span>
              </div>
            )}
            {modal === "persona" && (
              <div className="dx-ui-form-grid is-2">
                {tipoCliente}
                {campo("nombre", "Nombre completo")}
                {campo("empresa_nombre", form.tipo_cliente === "empresa" ? "Empresa" : "Empresa donde labora")}
                {campo("cargo", "Cargo")}
                {campo("linkedin_url", "Perfil de LinkedIn")}
                {campo("email", "Correo", "email")}
                {campo("telefono", "Teléfono")}
                {campo("etiqueta", "Etiqueta")}
                <div className="dx-ui-field">
                  <label htmlFor="aud-cons">
                    Consentimiento para promociones
                  </label>
                  <select
                    id="aud-cons"
                    className="dx-ui-select"
                    value={form.consentimiento}
                    onChange={(e) =>
                      setForm({ ...form, consentimiento: e.target.value })
                    }
                  >
                    {Object.entries(CONS).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                {observacion("observacion")}
              </div>
            )}
            {modal === "ficha" && (
              <>
                <div className="dx-camp-aud-readonly">
                  <div>
                    <b>LinkedIn</b> {vacio(form.miembro.contacto?.linkedin_url)}
                  </div>
                  <div>
                    <b>Correo</b> {vacio(form.miembro.contacto?.email)}
                  </div>
                  <div>
                    <b>Teléfono</b> {vacio(form.miembro.contacto?.telefono)}
                  </div>
                </div>
                <div className="dx-ui-form-grid is-2">
                  {[
                    [
                      "estado",
                      "Estado",
                      Object.entries(ESTADOS).filter(([k]) => k !== "lead"),
                    ],
                    [
                      "canal",
                      "Canal",
                      ["LinkedIn", "Correo", "WhatsApp", "Llamada"].map((x) => [
                        x,
                        x,
                      ]),
                    ],
                    ["consentimiento", "Consentimiento", Object.entries(CONS)],
                  ].map(([k, l, opciones]) => (
                    <div className="dx-ui-field" key={k}>
                      <label htmlFor={`aud-${k}`}>{l}</label>
                      {!editar || (k === "estado" && form.miembro.lead_id) ? (
                        <span>
                          {k === "estado" && form.miembro.lead_id
                            ? ESTADOS.lead
                            : opciones.find(([v]) => v === form[k])?.[1] ||
                              vacio(form[k])}
                        </span>
                      ) : (
                        <select
                          id={`aud-${k}`}
                          className="dx-ui-select"
                          value={form[k]}
                          onChange={(e) =>
                            setForm({ ...form, [k]: e.target.value })
                          }
                        >
                          {opciones.map(([v, t]) => (
                            <option key={v} value={v}>
                              {t}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                  {campo("ultimo_contacto", "Último contacto", "date")}
                  {campo("proximo_seguimiento", "Próximo seguimiento", "date")}
                  {tipoCliente}
                  {campo("cargo", "Cargo")}
                  {campo("empresa_nombre", "Empresa")}
                  <span className="dx-ui-field-hint dx-camp-aud-wide">Persona: dónde labora. Empresa: quién compra.</span>
                  {observacion("nota")}
                  {!form.miembro.lead_id && <div className="dx-camp-aud-preview dx-camp-aud-wide">
                    <strong>Así llegará al lead</strong>
                    {[["Tipo", form.tipo_cliente === "empresa" ? "EMPRESA" : "PERSONA"], ["Empresa", form.empresa_nombre], ["Cargo", form.cargo], ["LinkedIn", form.miembro.contacto?.linkedin_url], ["Oportunidad", campana.nombre], ["Observación", form.nota]].map(([label, value]) => <div key={label}><span>{label}</span> {vacio(value)}</div>)}
                  </div>}
                </div>
              </>
            )}
            {modal === "importar" && (
              <>
                <div className="dx-ui-field">
                  <label htmlFor="aud-archivo">Archivo Excel o CSV</label>
                  <input
                    id="aud-archivo"
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={leerArchivo}
                  />
                  <span className="dx-ui-field-hint">
                    Columnas: Apellidos, Nombres, LinkedIn, Empresa, Cargo, Estado, correo, teléfono, etiqueta, consentimiento, observación y tipo.
                  </span>
                </div>
                <button
                  className="dx-btn"
                  onClick={() => servicio.descargarPlantilla()}
                >
                  Descargar plantilla
                </button>
                {ocupado && <p>Simulando importación…</p>}
                {resumen && (
                  <div className="dx-camp-aud-summary">
                    {[
                      ["filas", "filas leídas"],
                      ["nuevas", "personas nuevas"],
                      ["ya_existen", "ya existen"],
                      ["ya_en_campana", "ya en campaña"],
                      ["sin_contacto", "sin LinkedIn ni contacto"],
                      ["sin_nombre", "sin nombre"],
                      ["no_contactar", "no contactar"],
                      ["agregadas", "a agregar"],
                      ["completados", "enlaces completados"],
                    ].map(([k, l]) => (
                      <div key={k}>
                        <strong>{resumen[k]}</strong>
                        <span>{l}</span>
                      </div>
                    ))}
                  </div>
                )}
                {resumen && <p className="dx-camp-aud-hint">Estado: {Object.entries(resumen.estados || {}).map(([k, n]) => `${ESTADOS[k] || k}: ${n}`).join(" · ") || "Sin personas agregadas"} · {resumen.estado_sin_reconocer || 0} estado sin reconocer, pasarán a Por enviar.</p>}
                <p className="dx-camp-aud-hint">Sin columna de tipo se importan como Persona. Para estados ya avanzados, la fecha de último contacto será la de importación.</p>
                <p className="dx-camp-aud-hint">
                  Las personas repetidas se reconocen por LinkedIn, correo o
                  teléfono. Las personas sin LinkedIn, correo ni teléfono se reconocen por nombre; reimportarlas con enlaces las completa sin duplicarlas. Quienes pidieron no ser contactadas no se agregarán.
                </p>
              </>
            )}
            {errorModal && (
              <div className="dx-camp-aud-error" role="alert">
                {errorModal}
              </div>
            )}
          </div>
        </Modal>
      )}
    </section>
  );
}
