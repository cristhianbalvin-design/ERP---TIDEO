import { useMemo, useState } from 'react';
import { CatalogoMaquinas } from './CatalogoMaquinas.jsx';

export const CATEGORIAS = {
  general: 'General',
  pesada: 'Reparación pesada',
  sold: 'Soldadura',
  crom: 'Cromado',
  mec: 'Mecanizado',
  hidr: 'Hidráulica / banco',
};
const FAMILIAS = {
  mec: 'Mecanizado', rect: 'Rectificado y acabado', corte: 'Corte', conf: 'Conformado y prensado',
  sold: 'Soldadura y recargue', trat: 'Tratamiento térmico y superficial', izaje: 'Elevación y manipulación',
  prue: 'Pruebas, hidráulica y medición', serv: 'Servicios y utilidades',
};
const ICONO_OK = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
);
const ICONO_NO = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></svg>
);

let contadorNuevo = 0;
const nuevoId = prefijo => { contadorNuevo += 1; return `nuevo-${prefijo}-${contadorNuevo}`; };
export const esNuevo = id => String(id || '').startsWith('nuevo-');

export function borradorInicial(datos) {
  return {
    bahias: (datos.bahias || []).map(item => ({ ...item })),
    puestos: (datos.puestos || []).map(item => ({ ...item })),
    maquinas: (datos.maquinas || []).filter(item => item.estado !== 'baja').map(item => ({ ...item })),
  };
}

// Cambios entre el taller guardado y el borrador, en el orden en que deben aplicarse.
export function diferenciasTaller(datos, borrador) {
  const original = borradorInicial(datos);
  const cambio = (lista, item, campos) => {
    const base = lista.find(fila => fila.id === item.id);
    return base && campos.some(campo => String(base[campo] ?? '') !== String(item[campo] ?? ''));
  };
  const vivos = (lista, id) => lista.some(item => item.id === id);
  return {
    bahiasNuevas: borrador.bahias.filter(item => esNuevo(item.id)),
    bahiasEditadas: borrador.bahias.filter(item => !esNuevo(item.id) && cambio(original.bahias, item, ['nombre', 'categoria', 'orden'])),
    bahiasQuitadas: original.bahias.filter(item => !vivos(borrador.bahias, item.id)),
    puestosNuevos: borrador.puestos.filter(item => esNuevo(item.id)),
    puestosEditados: borrador.puestos.filter(item => !esNuevo(item.id) && cambio(original.puestos, item, ['nombre', 'capacidad', 'bahia_id'])),
    puestosQuitados: original.puestos.filter(item => !vivos(borrador.puestos, item.id)),
    maquinasNuevas: borrador.maquinas.filter(item => esNuevo(item.id)),
    maquinasEditadas: borrador.maquinas.filter(item => !esNuevo(item.id)
      && cambio(original.maquinas, item, ['nombre', 'tipo_clave', 'bahia_id', 'puesto_id'])),
    maquinasQuitadas: original.maquinas.filter(item => !vivos(borrador.maquinas, item.id)),
  };
}

export function hayCambios(diferencias) {
  return Object.values(diferencias).some(lista => lista.length > 0);
}

function nombreUbicacion(borrador, maquina) {
  const puesto = borrador.puestos.find(item => item.id === maquina.puesto_id);
  const bahia = borrador.bahias.find(item => item.id === (puesto?.bahia_id || maquina.bahia_id));
  if (puesto) return `${bahia?.nombre || 'Bahía'} · ${puesto.nombre || puesto.codigo}`;
  return bahia?.nombre || 'sin ubicación';
}

export function Configurator({ datos, busy, permiteEscritura, onGuardar, onCancel, vistaPrevia = () => null }) {
  const [borrador, setBorrador] = useState(() => borradorInicial(datos));
  const [catalogo, setCatalogo] = useState(false);
  const [query, setQuery] = useState('');
  const [familia, setFamilia] = useState('todas');
  const [ubicacion, setUbicacion] = useState('');
  const diferencias = useMemo(() => diferenciasTaller(datos, borrador), [datos, borrador]);
  const cambios = hayCambios(diferencias);
  const bloqueado = !permiteEscritura || busy;
  const tipos = datos.tipos || [];

  const actualizar = (lista, id, campos) => setBorrador(actual => ({
    ...actual,
    [lista]: actual[lista].map(item => (item.id === id ? { ...item, ...campos } : item)),
  }));
  const quitar = (lista, id) => setBorrador(actual => ({ ...actual, [lista]: actual[lista].filter(item => item.id !== id) }));

  function agregarBahia() {
    setBorrador(actual => {
      const n = actual.bahias.length + 1;
      const usados = new Set(actual.bahias.map(item => item.codigo));
      let codigo = `B${n}`;
      for (let k = n; usados.has(codigo); k += 1) codigo = `B${k + 1}`;
      return { ...actual, bahias: [...actual.bahias, { id: nuevoId('bahia'), codigo, nombre: `Bahía ${n}`, categoria: 'general', orden: n, activa: true }] };
    });
  }

  function agregarPuesto(bahia) {
    setBorrador(actual => {
      const propios = actual.puestos.filter(item => item.bahia_id === bahia.id);
      const n = propios.length + 1;
      return {
        ...actual,
        puestos: [...actual.puestos, {
          id: nuevoId('puesto'), bahia_id: bahia.id, codigo: `${bahia.codigo || 'B'}-P${n}`, nombre: `Puesto ${n}`,
          capacidad: 1, orden: n, activo: true,
        }],
      };
    });
  }

  function elegirTipo(tipo) {
    const [bahiaId, puestoId] = (ubicacion || `${borrador.bahias[0]?.id || ''}|`).split('|');
    setBorrador(actual => ({
      ...actual,
      maquinas: [...actual.maquinas, {
        id: nuevoId('maquina'), nombre: tipo.nombre, tipo_clave: tipo.clave, bahia_id: bahiaId || null,
        puesto_id: puestoId || null, horas_dia: 8, estado: 'disponible',
      }],
    }));
    setCatalogo(false);
  }

  const ocupadoPuesto = id => (datos.ocupaciones || []).some(item => item.puesto_id === id && item.estado !== 'cancelado'
    && item.fecha_hasta >= new Date().toISOString().slice(0, 10));
  const maquinaEnUso = id => (datos.equipos || []).some(item => item.maquina_id === id && item.estado === 'programado');
  const sinUbicacion = borrador.maquinas.filter(maquina => !borrador.puestos.some(item => item.id === maquina.puesto_id)
    && !borrador.bahias.some(item => item.id === maquina.bahia_id));
  const excedidos = borrador.puestos.filter(puesto => {
    const capacidad = Math.max(1, Number(puesto.capacidad) || 1);
    const ocupaciones = (datos.ocupaciones || []).filter(item => item.puesto_id === puesto.id && item.estado !== 'cancelado');
    return ocupaciones.some(base => ocupaciones.filter(item => item.fecha_desde <= base.fecha_desde && item.fecha_hasta >= base.fecha_desde).length > capacidad);
  });
  const sinNombre = borrador.bahias.some(item => !String(item.nombre || '').trim())
    || borrador.puestos.some(item => !String(item.nombre || '').trim());
  const comprobaciones = [
    [!sinUbicacion.length, 'Toda máquina tiene ubicación.', `Sin ubicación: ${sinUbicacion.map(item => item.nombre).join(', ')}.`],
    [!excedidos.length, 'Ningún puesto supera su capacidad en el plan actual.',
      `Capacidad superada en ${excedidos.map(item => item.nombre || item.codigo).join(', ')} (se resuelve en el tablero).`],
    [!sinNombre, 'Toda bahía y todo puesto tienen nombre.', 'Hay bahías o puestos sin nombre.'],
  ];

  const datosPrevia = useMemo(() => ({
    ...datos,
    bahias: borrador.bahias,
    puestos: borrador.puestos,
    maquinas: borrador.maquinas,
  }), [datos, borrador]);

  return (
    <div className="dx-pl-main is-cfg dx-planner-config">
      <section className="dx-pl-panel" aria-labelledby="pl-cfg">
        <div className="dx-pl-ph">
          <h2 id="pl-cfg">Configurar taller</h2>
          <div className="dx-pl-acts">
            <button type="button" className="dx-pl-btn is-ghost" onClick={onCancel}>Cancelar</button>
            <button
              type="button"
              className="dx-pl-btn is-pri"
              disabled={bloqueado || !cambios || sinNombre}
              onClick={() => onGuardar(diferencias)}
            >Guardar</button>
          </div>
        </div>
        <div className="dx-pl-wzb">
          <p className="dx-pl-lead">
            Define la infraestructura del taller. Los equipos no se colocan aquí: cada OT reserva un puesto al planificarse.
          </p>
          <div className="dx-pl-box">
            <h3>1 · Bahías y puestos del taller</h3>
            <p className="dx-pl-expl">
              Una <b>bahía</b> agrupa puestos. Un <b>puesto</b> recibe por defecto <b>un componente a la vez</b> (editable).
              {' '}La capacidad de la bahía es la suma de sus puestos.
            </p>
            {borrador.bahias.map(bahia => {
              const puestos = borrador.puestos.filter(item => item.bahia_id === bahia.id);
              const maquinasBahia = borrador.maquinas.filter(item => item.bahia_id === bahia.id || puestos.some(p => p.id === item.puesto_id));
              const total = puestos.reduce((suma, item) => suma + (Number(item.capacidad) || 1), 0);
              return (
                <div className="dx-pl-zn" key={bahia.id}>
                  <div className="dx-pl-znh">
                    <label className="dx-pl-fld">Bahía
                      <input value={bahia.nombre || ''} disabled={bloqueado} onChange={event => actualizar('bahias', bahia.id, { nombre: event.target.value })} />
                    </label>
                    <label className="dx-pl-fld">Categoría
                      <select value={bahia.categoria || 'general'} disabled={bloqueado} onChange={event => actualizar('bahias', bahia.id, { categoria: event.target.value })}>
                        {Object.entries(CATEGORIAS).map(([clave, label]) => <option key={clave} value={clave}>{label}</option>)}
                      </select>
                    </label>
                    <div className="dx-pl-znk"><b>{total}</b> a la vez<small>{puestos.length} puesto{puestos.length === 1 ? '' : 's'}</small></div>
                    <button
                      type="button"
                      className="dx-pl-x"
                      aria-label={`Quitar ${bahia.nombre}`}
                      title={puestos.length || maquinasBahia.length ? 'Tiene puestos o máquinas' : undefined}
                      disabled={bloqueado || puestos.length > 0 || maquinasBahia.length > 0}
                      onClick={() => quitar('bahias', bahia.id)}
                    >×</button>
                  </div>
                  {puestos.map(puesto => {
                    const maquinasPuesto = borrador.maquinas.filter(item => item.puesto_id === puesto.id);
                    const enUso = ocupadoPuesto(puesto.id);
                    return (
                      <div className="dx-pl-cfr" key={puesto.id}>
                        <div className="f">
                          <label className="dx-pl-fld">Puesto
                            <input value={puesto.nombre || ''} disabled={bloqueado} onChange={event => actualizar('puestos', puesto.id, { nombre: event.target.value })} />
                          </label>
                          <label className="dx-pl-fld">Componentes a la vez
                            <input
                              type="number" min="1" max="6" value={puesto.capacidad ?? 1} disabled={bloqueado}
                              onChange={event => actualizar('puestos', puesto.id, { capacidad: Math.max(1, Math.min(6, Number(event.target.value) || 1)) })}
                            />
                          </label>
                        </div>
                        <button
                          type="button"
                          className="dx-pl-x"
                          aria-label={`Quitar ${puesto.nombre}`}
                          title={enUso || maquinasPuesto.length ? 'Tiene un equipo o una máquina' : undefined}
                          disabled={bloqueado || enUso || maquinasPuesto.length > 0}
                          onClick={() => quitar('puestos', puesto.id)}
                        >×</button>
                        {maquinasPuesto.length > 0 && (
                          <div className="sub2"><span>Máquina fija:</span><b>{maquinasPuesto.map(item => item.nombre).join(', ')}</b></div>
                        )}
                      </div>
                    );
                  })}
                  <div><button type="button" className="dx-pl-mini" disabled={bloqueado} onClick={() => agregarPuesto(bahia)}>+ Puesto en esta bahía</button></div>
                </div>
              );
            })}
            {!borrador.bahias.length && <p className="dx-pl-expl">Aún no hay bahías. Agrega la primera para armar el taller.</p>}
            <div><button type="button" className="dx-pl-btn" disabled={bloqueado} onClick={agregarBahia}>+ Agregar bahía</button></div>
          </div>
          <div className="dx-pl-box">
            <h3>2 · Máquinas de taller</h3>
            <p className="dx-pl-expl">
              Cada máquina sale del <b>catálogo de máquinas</b> (con su modelo 3D). Puede estar <b>fija dentro de un puesto</b>
              {' '}o <b>servir a una bahía completa</b>, y una misma bahía o puesto admite varias máquinas. Sus horas por día son distintas del espacio.
            </p>
            {borrador.maquinas.map(maquina => {
              const enUso = maquinaEnUso(maquina.id);
              const valor = maquina.puesto_id ? `p:${maquina.puesto_id}` : maquina.bahia_id ? `b:${maquina.bahia_id}` : '';
              return (
                <div className="dx-pl-mqc" key={maquina.id}>
                  <label className="dx-pl-fld">Máquina
                    <input value={maquina.nombre || ''} disabled={bloqueado} onChange={event => actualizar('maquinas', maquina.id, { nombre: event.target.value })} />
                  </label>
                  <label className="dx-pl-fld">Tipo de máquina
                    <select value={maquina.tipo_clave || ''} disabled={bloqueado} onChange={event => actualizar('maquinas', maquina.id, { tipo_clave: event.target.value })}>
                      {!tipos.some(tipo => tipo.clave === maquina.tipo_clave) && <option value={maquina.tipo_clave || ''}>{maquina.tipo_clave || 'Sin tipo'}</option>}
                      {Object.entries(FAMILIAS).map(([clave, label]) => {
                        const lista = tipos.filter(tipo => tipo.familia === clave);
                        return lista.length ? (
                          <optgroup key={clave} label={label}>
                            {lista.map(tipo => <option key={tipo.clave} value={tipo.clave}>{tipo.nombre}</option>)}
                          </optgroup>
                        ) : null;
                      })}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="dx-pl-x"
                    aria-label={`Quitar ${maquina.nombre}`}
                    title={enUso ? 'Hay tareas que la usan' : undefined}
                    disabled={bloqueado || enUso}
                    onClick={() => quitar('maquinas', maquina.id)}
                  >×</button>
                  <label className="dx-pl-fld loc">Ubicación
                    <select
                      value={valor}
                      disabled={bloqueado}
                      onChange={event => {
                        const [tipo, id] = event.target.value.split(':');
                        if (tipo === 'p') {
                          const puesto = borrador.puestos.find(item => item.id === id);
                          actualizar('maquinas', maquina.id, { puesto_id: id, bahia_id: puesto?.bahia_id || null });
                        } else actualizar('maquinas', maquina.id, { puesto_id: null, bahia_id: id || null });
                      }}
                    >
                      {!valor && <option value="">Sin ubicación</option>}
                      <optgroup label="Dentro de un puesto">
                        {borrador.puestos.map(puesto => {
                          const bahia = borrador.bahias.find(item => item.id === puesto.bahia_id);
                          return <option key={puesto.id} value={`p:${puesto.id}`}>{bahia?.nombre || 'Bahía'} · {puesto.nombre || puesto.codigo}</option>;
                        })}
                      </optgroup>
                      <optgroup label="Sirve a una bahía completa">
                        {borrador.bahias.map(bahia => <option key={bahia.id} value={`b:${bahia.id}`}>{bahia.nombre}</option>)}
                      </optgroup>
                    </select>
                  </label>
                  <span className="s">
                    {Number(maquina.horas_dia) || 8} h por día · {maquina.puesto_id ? 'fija en un puesto' : 'sirve a toda la bahía'}
                    {enUso ? ' · en uso por tareas' : ''} · {nombreUbicacion(borrador, maquina)}
                  </span>
                </div>
              );
            })}
            <div className="dx-pl-acts2">
              <button
                type="button"
                className="dx-pl-btn"
                disabled={bloqueado || !tipos.length || !borrador.bahias.length}
                onClick={() => { setUbicacion(`${borrador.bahias[0]?.id || ''}|`); setCatalogo(true); }}
              >+ Agregar máquina del catálogo</button>
              <span className="s">Catálogo: {tipos.length} tipos en {new Set(tipos.map(tipo => tipo.familia)).size} familias de la industria</span>
            </div>
          </div>
          <div className="dx-pl-box">
            <h3>Comprobaciones</h3>
            <ul className="dx-pl-ck">
              {comprobaciones.map(([ok, bien, mal]) => (
                <li key={bien} className={ok ? 'is-ok' : 'is-no'}>{ok ? ICONO_OK : ICONO_NO}<span>{ok ? bien : mal}</span></li>
              ))}
            </ul>
          </div>
        </div>
      </section>
      <div className="dx-pl-3dwrap">{vistaPrevia(datosPrevia)}</div>
      {catalogo && (
        <CatalogoMaquinas
          datos={{ ...datos, bahias: borrador.bahias }}
          puestos={borrador.puestos}
          query={query}
          familia={familia}
          ubicacion={ubicacion}
          onSetQuery={setQuery}
          onSetFamilia={setFamilia}
          onSetUbicacion={setUbicacion}
          onChoose={elegirTipo}
          permiteEscritura={permiteEscritura}
          onClose={() => setCatalogo(false)}
        />
      )}
    </div>
  );
}
