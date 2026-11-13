import React, { useEffect, useState } from 'react';
import { useSesionOperativa } from '../../../lib/sesionOperativa.js';
import { cargarDisponibilidad } from '../../../services/confiabilidadService.js';
import { Barra, Kpi, Periodo, Segmentos, dinero, fecha, numero, periodoInicial, permisos } from './confiabilidadUi.jsx';

export function DisponibilidadMecanicaPage({ onNav }) {
  const { empresaId, sociedadId, estado } = useSesionOperativa();
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [segmento, setSegmento] = useState('flota');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [acceso, setAcceso] = useState(null);
  useEffect(() => {
    let activo = true;
    if (!empresaId) {
      setCargando(false);
      return () => {
        activo = false;
      };
    }
    setCargando(true);
    setError('');
    setDatos(null);
    Promise.all([
      permisos(empresaId, 'disponibilidad_mecanica', ['ver']),
      periodo.desde && periodo.hasta && periodo.desde <= periodo.hasta
        ? cargarDisponibilidad(empresaId, sociedadId, periodo.desde, periodo.hasta, segmento)
        : Promise.reject(new Error('Selecciona un periodo válido.')),
    ])
      .then(([p, d]) => {
        if (activo) {
          setAcceso(p);
          setDatos(d);
        }
      })
      .catch((e) => {
        if (activo) setError(e.message);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, [empresaId, sociedadId, periodo.desde, periodo.hasta, segmento]);
  const filas = datos?.[segmento] || [];
  const suma = (clave, lista = filas) => lista.reduce((s, x) => s + Number(x[clave] || 0), 0);
  const posibles = suma(segmento === 'flota' ? 'horas_programadas' : 'horas_posibles');
  const parada = suma(segmento === 'flota' ? 'parada_proveedor' : 'horas_falla');
  const promedio = posibles ? (100 * (posibles - parada)) / posibles : null;
  const aprobadas = filas.filter((x) => x.estado_liquidacion === 'aprobada' && x.penalidad != null);
  const bajo = new Set(
    filas
      .filter((x) => x.dmr != null && x.meta_dmr != null && Number(x.dmr) < Number(x.meta_dmr))
      .map((x) => x.activo_id),
  ).size;
  return (
    <section className="dx-ui dx-confd">
      <header>
        <div className="dx-ui-eyebrow">CONFIABILIDAD</div>
        <h1 className="dx-ui-title">Disponibilidad mecánica</h1>
        <p>Disponibilidad contractual de flota y disponibilidad de máquinas del taller.</p>
      </header>
      <div className="dx-ui-card dx-confd-filtros">
        <Periodo value={periodo} onChange={setPeriodo} />
        <Segmentos
          prefijo="dx-confd"
          value={segmento}
          onChange={setSegmento}
          opciones={['flota', 'taller', 'cliente']}
        />
      </div>
      {cargando || estado === 'cargando' ? (
        <div className="dx-ui-empty">Cargando disponibilidad…</div>
      ) : error ? (
        <div className="dx-ui-empty" role="alert">
          {error}
        </div>
      ) : !empresaId ? (
        <div className="dx-ui-empty">No hay una empresa disponible en la sesión.</div>
      ) : !acceso?.ver ? (
        <div className="dx-ui-empty">No tienes permiso para ver disponibilidad mecánica.</div>
      ) : segmento === 'cliente' ? (
        <div className="dx-ui-card dx-ui-empty">
          La disponibilidad contractual no aplica a equipos de clientes. Consulta sus días entre fallas en KPIs de
          confiabilidad.
        </div>
      ) : (
        <>
          <div className="dx-ui-kpi-row">
            <Kpi
              titulo={segmento === 'flota' ? 'DMR promedio ponderado' : 'Disponibilidad promedio ponderada'}
              valor={promedio == null ? null : numero(promedio, '%')}
            />
            <Kpi
              titulo={segmento === 'flota' ? 'Equipos bajo meta' : 'Máquinas bajo 90 %'}
              valor={
                segmento === 'flota'
                  ? bajo
                  : filas.filter((x) => x.disponibilidad_pct != null && Number(x.disponibilidad_pct) < 90).length
              }
            />
            <Kpi
              titulo={segmento === 'flota' ? 'Horas de parada del proveedor' : 'Horas de falla'}
              valor={numero(parada, ' h')}
            />
            {segmento === 'flota' && (
              <Kpi
                titulo="Penalidad de liquidaciones aprobadas"
                valor={aprobadas.length === 1 ? dinero(aprobadas[0].penalidad) : 'Sin dato'}
              />
            )}
          </div>
          {segmento === 'flota' && aprobadas.length > 1 && (
            <p>
              No se puede sumar la penalidad total: la información recibida no identifica la moneda de cada liquidación.
            </p>
          )}
          <p>
            {segmento === 'flota'
              ? 'DMR = (horas programadas − paradas del proveedor) ÷ horas programadas × 100.'
              : 'Disponibilidad = (horas posibles − horas de falla) ÷ horas posibles × 100.'}
          </p>
          <div className="dx-ui-card">
            <div className="dx-ui-toolbar">
              <h2>{segmento === 'flota' ? 'Flota por equipo y mes' : 'Máquinas del taller'}</h2>
              <span className="dx-ui-count">
                {filas.length} {filas.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
            {!filas.length ? (
              <div className="dx-ui-empty">No hay datos para el periodo seleccionado.</div>
            ) : (
              <div className="dx-confd-table-wrap">
                <table className="dx-confd-table">
                  <thead>
                    <tr>
                      {(segmento === 'flota'
                        ? [
                            'Equipo',
                            'Mes',
                            'Contrato / cliente',
                            'Programadas',
                            'Parada proveedor',
                            'Parada cliente',
                            'Parada neutral',
                            'DMR / meta',
                            'Penalidad / liquidación',
                          ]
                        : ['Máquina', 'Horas posibles', 'Horas de falla', 'Disponibilidad']
                      ).map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((x, i) => (
                      <tr key={`${x.activo_id}-${x.mes || i}`}>
                        <td>
                          {x.codigo || 'Sin dato'}
                          <br />
                          {x.nombre || 'Sin dato'}
                        </td>
                        {segmento === 'flota' ? (
                          <>
                            <td>{fecha(x.mes)}</td>
                            <td>
                              {x.contrato || 'Sin dato'}
                              <br />
                              {x.cliente || 'Sin dato'}
                            </td>
                            <td>{numero(x.horas_programadas, ' h')}</td>
                            <td>{numero(x.parada_proveedor, ' h')}</td>
                            <td>{numero(x.parada_cliente, ' h')}</td>
                            <td>{numero(x.parada_neutral, ' h')}</td>
                            <td>
                              <Barra valor={x.dmr} /> Meta: {numero(x.meta_dmr, '%')}
                            </td>
                            <td>
                              {x.estado_liquidacion === 'ausente' ? (
                                'Sin liquidación'
                              ) : (
                                <>
                                  {dinero(x.penalidad)}
                                  <br />
                                  {x.estado_liquidacion || 'Sin dato'}
                                  <br />
                                  <button type="button" onClick={() => onNav?.('liquidacion')}>
                                    Ver liquidación
                                  </button>
                                </>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{numero(x.horas_posibles, ' h')}</td>
                            <td>{numero(x.horas_falla, ' h')}</td>
                            <td>
                              <Barra valor={x.disponibilidad_pct} />
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
