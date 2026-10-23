import { useEffect, useMemo, useState } from 'react';
import { Icon, FooterBrand } from '../components/shell.jsx';
import { fechaLocalISO } from './fechaLocal.js';
import {
  GRUPOS_MIS_OTS, diasDeAtraso, fechaCorta, filtrarMisOTs, grupoMisOT, nombreLugar, resumenMisOTs, textoHorario,
} from './misOTsLogic.js';
import { getSupabaseClient } from '../../lib/supabaseClient.js';
import { useSesionOperativa } from '../../lib/sesionOperativa.js';
import { WorkMenuButton } from '../components/WorkMenuButton.jsx';
import { useCompactWorkMode } from '../../useCompactWorkMode.js';

const ESTADOS_OT_ASIGNADAS = ['programada', 'ejecucion'];

const etiquetaEstado = (estado) => ({
  programada: 'Programada',
  ejecucion: 'En ejecución',
}[estado] || estado || 'Sin estado');

export default function MisOTsPage({ onNavigate }) {
  const sesionOperativa = useSesionOperativa();
  const [tecnico, setTecnico] = useState(null);
  const [ots, setOts] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [sinPerfilOperativo, setSinPerfilOperativo] = useState(false);
  useCompactWorkMode(true);

  useEffect(() => {
    let vigente = true;

    const cargarMisOTs = async () => {
      if (
        sesionOperativa.cargando
        || sesionOperativa.estado !== 'listo'
        || !sesionOperativa.empresaId
        || !sesionOperativa.usuario?.id
      ) {
        if (vigente && !sesionOperativa.cargando) {
          setTecnico(null);
          setOts([]);
          setSinPerfilOperativo(false);
          setCargando(false);
        }
        return;
      }

      setCargando(true);
      setError('');
      setSinPerfilOperativo(false);

      try {
        const { data: perfil, error: perfilError } = await getSupabaseClient()
          .from('personal_operativo')
          .select('id,nombre,especialidad,supervisor,auth_user_id')
          .eq('empresa_id', sesionOperativa.empresaId)
          .eq('auth_user_id', sesionOperativa.usuario.id)
          .maybeSingle();

        if (perfilError) throw perfilError;
        if (!perfil) {
          if (vigente) {
            setTecnico(null);
            setOts([]);
            setSinPerfilOperativo(true);
          }
          return;
        }

        let consulta = getSupabaseClient()
          .from('ordenes_trabajo')
          .select('id,numero,descripcion,servicio,estado,avance_pct,fecha_programada,sociedad_id,cuenta_id,direccion_ejecucion,hora_inicio_estimada,hora_fin_estimada')
          .eq('empresa_id', sesionOperativa.empresaId)
          .eq('tecnico_responsable_id', perfil.id)
          .in('estado', ESTADOS_OT_ASIGNADAS)
          .order('fecha_programada', { ascending: true, nullsFirst: false })
          .order('numero');

        if (sesionOperativa.sociedadId && !sesionOperativa.vistaConsolidada) {
          consulta = consulta.eq('sociedad_id', sesionOperativa.sociedadId);
        } else if (
          sesionOperativa.vistaConsolidada
          && Array.isArray(sesionOperativa.sociedadesIdsAlcance)
          && sesionOperativa.sociedadesIdsAlcance.length
        ) {
          consulta = consulta.in('sociedad_id', sesionOperativa.sociedadesIdsAlcance);
        }

        const { data, error: otsError } = await consulta;
        if (otsError) throw otsError;

        // Nombres legibles de cliente y lugar (el lugar puede ser un id de sede).
        const filas = data || [];
        const idsCuenta = [...new Set(filas.map(ot => ot.cuenta_id).filter(Boolean))];
        const idsSede = [...new Set(filas.map(ot => ot.direccion_ejecucion).filter(id => typeof id === 'string' && id.startsWith('sed_')))];
        const [cuentasR, sedesR] = await Promise.all([
          idsCuenta.length
            ? getSupabaseClient().from('cuentas').select('id,nombre_comercial,razon_social').eq('empresa_id', sesionOperativa.empresaId).in('id', idsCuenta)
            : Promise.resolve({ data: [], error: null }),
          idsSede.length
            ? getSupabaseClient().from('sedes').select('id,nombre').eq('empresa_id', sesionOperativa.empresaId).in('id', idsSede)
            : Promise.resolve({ data: [], error: null }),
        ]);
        const cuentasPorId = Object.fromEntries((cuentasR.data || []).map(c => [c.id, c]));
        const sedesPorId = Object.fromEntries((sedesR.data || []).map(sd => [sd.id, sd]));

        if (vigente) {
          setTecnico(perfil);
          setOts(filas.map(ot => ({
            ...ot,
            clienteNombre: cuentasPorId[ot.cuenta_id]?.nombre_comercial || cuentasPorId[ot.cuenta_id]?.razon_social || 'Sin cliente',
            lugarNombre: nombreLugar(ot.direccion_ejecucion, sedesPorId),
          })));
        }
      } catch (cargaError) {
        if (vigente) {
          setTecnico(null);
          setOts([]);
          setError(cargaError?.message || 'No se pudieron cargar tus OTs asignadas.');
        }
      } finally {
        if (vigente) setCargando(false);
      }
    };

    cargarMisOTs();
    return () => { vigente = false; };
  }, [
    sesionOperativa.cargando,
    sesionOperativa.estado,
    sesionOperativa.empresaId,
    sesionOperativa.usuario?.id,
    sesionOperativa.sociedadId,
    sesionOperativa.vistaConsolidada,
    sesionOperativa.sociedadesIdsAlcance,
  ]);

  const puedeRegistrarParte = sesionOperativa.permiteEscritura;
  const sesionNoDisponible = !sesionOperativa.cargando && sesionOperativa.estado !== 'listo';
  const [filtro, setFiltro] = useState('todas');
  const [consulta, setConsulta] = useState('');
  const hoyISO = fechaLocalISO();
  const resumen = useMemo(() => resumenMisOTs(ots, hoyISO), [ots, hoyISO]);
  const visibles = useMemo(() => filtrarMisOTs(ots, { filtro, consulta }, hoyISO), [ots, filtro, consulta, hoyISO]);
  const hoyLargo = new Date(`${hoyISO}T00:00:00`).toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const registrar = ot => onNavigate('taller', ot ? { ot: ot.id } : undefined);
  const tituloPermiso = puedeRegistrarParte ? undefined : 'No tienes permiso de escritura en Operaciones';
  const listo = !cargando && !sesionNoDisponible && !error && !sinPerfilOperativo;

  const chip = (id, etiqueta, valor) => (
    <button
      type="button"
      className={`dx-ui-chip dx-misots-chip${id === 'atrasadas' && valor ? ' is-late' : ''}${filtro === id ? ' is-on' : ''}`}
      aria-pressed={filtro === id}
      onClick={() => setFiltro(actual => (actual === id ? 'todas' : id))}
    >
      <b>{valor}</b><span>{etiqueta}</span>
    </button>
  );

  const fila = ot => {
    const grupo = grupoMisOT(ot.fecha_programada, hoyISO);
    const enEjecucion = ot.estado === 'ejecucion';
    const servicio = ot.servicio || ot.descripcion || 'Sin descripción';
    const avance = Math.max(0, Math.min(100, Number(ot.avance_pct || 0)));
    const horario = textoHorario(ot.hora_inicio_estimada, ot.hora_fin_estimada);
    return (
      <div key={ot.id} className="dx-ui-row dx-misots-cols">
        <div className="dx-misots-ot">
          <span className={`dx-ui-icon ${enEjecucion ? 'is-violet' : 'is-cyan'}`} aria-hidden="true"><Icon name="workshop" size={17} /></span>
          <div><b>{ot.numero || ot.id}</b><span title={servicio}>{servicio}</span></div>
        </div>
        <div className="dx-misots-who"><b title={ot.clienteNombre}>{ot.clienteNombre}</b><span title={ot.lugarNombre}>{ot.lugarNombre}</span></div>
        {grupo === 'atrasadas' ? (
          <div className="dx-misots-when is-late"><span>{fechaCorta(ot.fecha_programada)}</span><small>Vencida hace {diasDeAtraso(ot.fecha_programada, hoyISO)} {diasDeAtraso(ot.fecha_programada, hoyISO) === 1 ? 'día' : 'días'}</small></div>
        ) : (
          <div className="dx-misots-when"><span>{grupo === 'hoy' ? 'Hoy' : fechaCorta(ot.fecha_programada)}</span><small>{horario}</small></div>
        )}
        <div className="dx-misots-state"><span className={`dx-ui-pill ${enEjecucion ? 'is-amber' : 'is-cyan'}`}><i />{etiquetaEstado(ot.estado)}</span></div>
        <div className="dx-misots-progress" aria-label={`Avance ${avance}%`}><div className="dx-misots-bar"><i style={{ width: `${avance}%` }} /></div><span>{avance}%</span></div>
        <div className="dx-misots-act">
          <button type="button" className="dx-btn primary" disabled={!puedeRegistrarParte} title={tituloPermiso} aria-label={`Registrar parte de ${ot.numero || ot.id}`} onClick={() => registrar(ot)}>
            <Icon name="report" size={15} />Registrar parte
          </button>
        </div>
      </div>
    );
  };

  let cuerpo;
  if (cargando) cuerpo = <div className="dx-ui-empty" role="status">Cargando tus OTs asignadas…</div>;
  else if (sesionNoDisponible) cuerpo = <div className="dx-ui-empty">Inicia sesión operativa para consultar tus OTs asignadas.</div>;
  else if (error) cuerpo = <div className="dx-ui-empty dx-misots-error" role="alert">{error}</div>;
  else if (sinPerfilOperativo) cuerpo = <div className="dx-ui-empty"><b className="dx-misots-empty-title">Tu usuario no está vinculado a un técnico</b>Pide a RRHH que vincule tu usuario a tu ficha de personal operativo para ver aquí tus OTs.</div>;
  else if (!ots.length) cuerpo = <div className="dx-ui-empty">No tienes OTs programadas ni en ejecución.</div>;
  else if (!visibles.length) cuerpo = <div className="dx-ui-empty">{consulta ? `Sin resultados para «${consulta}». Prueba con el número de OT, el cliente o el lugar.` : 'No hay OTs en este grupo.'}</div>;
  else {
    const filtrando = filtro !== 'todas' || Boolean(consulta.trim());
    cuerpo = (
      <>
        <div className="dx-ui-head dx-misots-cols" aria-hidden="true"><span>OT · Servicio</span><span>Cliente · Lugar</span><span>Programada</span><span>Estado</span><span>Avance</span><span /></div>
        {GRUPOS_MIS_OTS.map(grupo => {
          const items = visibles.filter(ot => grupoMisOT(ot.fecha_programada, hoyISO) === grupo.id);
          // Atrasadas solo aparece si hay; al filtrar o buscar se ocultan los grupos vacíos.
          if (!items.length && (filtrando || grupo.id === 'atrasadas')) return null;
          return (
            <section key={grupo.id} aria-label={grupo.titulo}>
              <div className={`dx-misots-group is-${grupo.id}`}><i aria-hidden="true" />{grupo.titulo}<small>{items.length} · {grupo.id === 'hoy' ? hoyLargo : grupo.ayuda}</small></div>
              {items.length ? items.map(fila) : <div className="dx-misots-group-empty">{grupo.vacio}</div>}
            </section>
          );
        })}
      </>
    );
  }

  return (
    <section className="dx-ui dx-misots">
      <header className="dx-ui-head-page">
        <WorkMenuButton />
        <div>
          <div className="dx-ui-eyebrow">Operaciones · Campo</div>
          <h1 className="dx-ui-title">Mis OTs</h1>
          <p className="dx-ui-sub">{tecnico ? [tecnico.nombre, tecnico.especialidad].filter(Boolean).join(' · ') : 'Órdenes de trabajo asignadas al técnico de la sesión.'}</p>
        </div>
        <div className="dx-ui-actions">
          <button type="button" className="dx-btn" disabled={!puedeRegistrarParte} title={tituloPermiso} onClick={() => registrar(null)}>
            <Icon name="report" size={15} />Registrar parte sin OT
          </button>
        </div>
      </header>

      {listo && ots.length > 0 && (
        <div className="dx-ui-summary" role="group" aria-label="Filtrar por grupo">
          {chip('atrasadas', 'Atrasadas', resumen.atrasadas)}
          {chip('hoy', 'Hoy', resumen.hoy)}
          {chip('proximas', 'Próximas', resumen.proximas)}
          {chip('ejecucion', 'En ejecución', resumen.ejecucion)}
        </div>
      )}

      <div className="dx-ui-card">
        {listo && ots.length > 0 && (
          <div className="dx-ui-toolbar">
            <h2>OTs asignadas</h2>
            <span className="dx-ui-count">{visibles.length} de {ots.length}</span>
            <label className="dx-ui-search">
              <Icon name="search" size={16} />
              <input type="search" value={consulta} onChange={event => setConsulta(event.target.value)} placeholder="Buscar por OT, servicio, cliente o lugar" aria-label="Buscar OTs" />
            </label>
          </div>
        )}
        {cuerpo}
      </div>
      <FooterBrand />
    </section>
  );
}
