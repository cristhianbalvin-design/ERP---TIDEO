import React, { useEffect, useRef, useState } from 'react';
import { FileUpload } from '../../components/FileUpload.jsx';
import { getSupabaseClient, isSupabaseConfigured } from '../../lib/supabaseClient.js';
import { accionPrimaria, armarHistorial, permisosFicha } from './facturacionFicha.js';
import './facturacionFicha.css';

const tipos = { factura: 'Factura', boleta: 'Boleta', nota_credito: 'Nota de crédito', nota_debito: 'Nota de débito' };
const estados = { emitida: 'Emitida', cobro_parcial: 'Cobro parcial', cobrada: 'Cobrada', anulada: 'Anulada' };
const fecha = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : 'Sin dato');
const etiqueta = (v) => v ? v.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()) : 'Sin dato';
const dinero = (n, moneda = 'PEN') =>
  `${moneda === 'USD' ? 'US$' : moneda === 'PEN' ? 'S/' : moneda} ${Number(n || 0).toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function FacturacionFicha({ ctx }) {
  const {
    f,
    cuenta,
    sociedad,
    empresa,
    role,
    cxc,
    os,
    val,
    origen,
    notas,
    detracciones,
    detraccionesError,
    autodetraccion,
    ventas,
    cuentasBancarias = [],
    centrosBeneficio = [],
    tab,
    setTab,
    onClose,
    onCobro,
    onEditar,
    onNota,
    onAnular,
    onRestaurar,
    restaurable,
    onGenerarCxC,
    generandoCxC,
    onAutodetraccion,
    onEliminarArchivo,
    onAbrirFactura,
    devolucionPendiente,
    onReintentarDevolucion,
    navigate,
    hoy,
  } = ctx;
  const [menu, setMenu] = useState(false),
    [venta, setVenta] = useState(null),
    [cobros, setCobros] = useState([]),
    [error, setError] = useState('');
  const [confirmacion, setConfirmacion] = useState(null);
  const [errorAccion, setErrorAccion] = useState('');
  const [accionEnCurso, setAccionEnCurso] = useState(false);
  const panel = useRef(null),
    menuButton = useRef(null),
    returnFocus = useRef(
      [...document.querySelectorAll('[role="button"][tabindex="0"]')].find(
        (row) => row.getAttribute('aria-label') === `Abrir ${f.numero || f.id}`,
      ) || document.activeElement,
    );
  const nombreCuenta = (id) => cuentasBancarias.find((c) => c.id === id)?.nombre || 'Sin dato';
  const permisos = permisosFicha(role);
  const saldo = cxc ? (cxc.saldo ?? cxc.monto_total ?? 0) : 0;
  const primaria = accionPrimaria(f, saldo, permisos);
  const vigente = ['emitida', 'cobro_parcial'].includes(f.estado);
  const puedeNc = vigente && permisos.notaCredito;
  const opciones = [
    f.estado === 'emitida' && permisos.editar && ['Editar comprobante', onEditar],
    f.estado === 'emitida' && permisos.notaDebito && ['Nota de débito', () => onNota('nota_debito')],
    f.estado === 'emitida' && permisos.anular && ['Anular', onAnular],
    restaurable && permisos.restaurar && ['Restaurar a emitida', () => setConfirmacion({ tipo: 'restaurar' })],
  ].filter(Boolean);
  const escritura = Boolean(
    primaria ||
    puedeNc ||
    opciones.length ||
    (!cxc && f.estado !== 'anulada' && permisos.generarCxC) ||
    (autodetraccion && permisos.autodetraccion) ||
    (permisos.editar && f.estado !== 'anulada'),
  );
  const historial = armarHistorial(f, cobros, notas, cuentasBancarias);
  const vinculos = [venta, os, val, cxc, origen, ...notas].filter(Boolean).length;
  useEffect(() => {
    panel.current?.focus();
    return () => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    };
  }, []);
  useEffect(() => {
    const key = (e) => {
      if (e.key !== 'Escape') return;
      if (menu) {
        e.stopPropagation();
        setMenu(false);
        menuButton.current?.focus();
      } else if (!document.querySelector('[data-ffi-modal="true"]')) onClose();
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [menu, onClose]);
  useEffect(() => {
    if (!menu) return undefined;
    const fuera = (e) => {
      if (!e.target.closest('.dx-ffi-more')) setMenu(false);
    };
    document.addEventListener('click', fuera);
    return () => document.removeEventListener('click', fuera);
  }, [menu]);
  useEffect(() => {
    let activo = true;
    setCobros([]);
    setVenta(null);
    setError('');
    setConfirmacion(null);
    setErrorAccion('');
    if (Array.isArray(ventas))
      setVenta(ventas.find((v) => v.factura_id === f.id && (!v.empresa_id || v.empresa_id === empresa?.id)) || null);
    if (!empresa?.id || !isSupabaseConfigured())
      return () => {
        activo = false;
      };
    getSupabaseClient()
      .then(async (sb) => {
        const consultas = [
          sb
            .from('cobros_cxc')
            .select('fecha_cobro,monto_capital,monto_mora,medio_pago,numero_operacion,cuenta_bancaria')
            .eq('empresa_id', empresa.id)
            .eq('factura_id', f.id),
        ];
        if (!Array.isArray(ventas))
          consultas.push(
            sb
              .from('ventas')
              .select('id,numero,concepto,monto_total,moneda,estado')
              .eq('empresa_id', empresa.id)
              .eq('factura_id', f.id)
              .limit(1),
          );
        const resultados = await Promise.all(consultas);
        if (!activo) return;
        if (resultados[0].error) setError('No se pudo cargar el historial de cobros.');
        else setCobros(resultados[0].data || []);
        if (resultados[1]?.error) setError('No se pudo cargar la venta vinculada.');
        else if (resultados[1]) setVenta(resultados[1].data?.[0] || null);
      })
      .catch(() => {
        if (activo) setError('No se pudieron cargar las vinculaciones y los cobros.');
      });
    return () => {
      activo = false;
    };
  }, [f.id, empresa?.id, ventas, cxc?.monto_pagado, cxc?.saldo]);
  const descargar = async () => {
    try {
      if (f.archivo_pdf_url) {
        const a = document.createElement('a');
        a.href = f.archivo_pdf_url;
        a.download = `${f.numero || 'comprobante'}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        const { descargarFacturaPdf } = await import('../../lib/facturaPdf.js');
        descargarFacturaPdf({ factura: f, cuenta, sociedad: sociedad || empresa, detracciones });
      }
    } catch (e) {
      setError(e?.message || 'No se pudo descargar el PDF.');
    }
  };
  const dias = f.fecha_vencimiento
    ? Math.ceil((Date.parse(`${f.fecha_vencimiento}T00:00:00`) - Date.parse(`${hoy}T00:00:00`)) / 86400000)
    : null;
  const tabs = [
    ['detalle', 'Detalle', (f.items || []).length],
    ['vinculaciones', 'Vinculaciones', vinculos],
    ['archivos', 'Archivos', null],
    ['historial', 'Historial', historial.length],
  ];
  const enlace = (titulo, detalle, accion) => (
    <div
      className="dx-ffi-link"
      role={accion ? 'button' : undefined}
      tabIndex={accion ? 0 : undefined}
      onClick={accion || undefined}
      onKeyDown={(e) => {
        if (accion && ['Enter', ' '].includes(e.key)) {
          e.preventDefault();
          accion();
        }
      }}
    >
      <div>
        <b>{titulo}</b>
        <small>{detalle}</small>
      </div>
    </div>
  );
  return (
    <div className="dx-ui">
      <div className="dx-ffi-backdrop" onClick={onClose} />
      <aside className="dx-ffi" role="dialog" aria-modal="true" aria-labelledby="ffi-title" tabIndex={-1} ref={panel}>
        <header className="dx-ffi-head">
          <div className="dx-ffi-top">
            <div className="dx-ffi-id">
              <div className="dx-ffi-eyebrow">
                {tipos[f.tipo_documento] || 'Comprobante'} ·{' '}
                {sociedad?.nombre || sociedad?.razon_social || empresa?.nombre || ''}
              </div>
              <h2 id="ffi-title">
                {f.numero || 'Sin dato'}
                <span className={`dx-ui-pill ${f.estado === 'cobrada' ? 'is-green' :
                  f.estado === 'anulada' ? 'is-gray' : 'is-amber'}`}>
                  {estados[f.estado] || etiqueta(f.estado)}
                </span>
                {dias !== null && vigente && (
                  <span className={`dx-ui-pill ${dias < 0 ? 'is-red' : dias === 0 ? 'is-amber' : 'is-cyan'}`}>
                    {dias < 0 ? `Vencida hace ${-dias} ${dias === -1 ? 'día' : 'días'}` :
                      dias === 0 ? 'Vence hoy' : `Vence en ${dias} ${dias === 1 ? 'día' : 'días'}`}
                  </span>
                )}
              </h2>
              <p className="dx-ffi-client">
                {cuenta?.razon_social || cuenta?.nombre_comercial || 'Sin dato'} · RUC {cuenta?.ruc || 'Sin dato'}
              </p>
            </div>
            <button className="dx-ffi-close" aria-label="Cerrar ficha" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="dx-ffi-actions">
            {primaria && (
              <button className="dx-btn primary" onClick={onCobro}>
                {primaria}
              </button>
            )}
            {puedeNc && (
              <button className="dx-btn" onClick={() => onNota('nota_credito')}>
                Nota de crédito
              </button>
            )}
            <button className="dx-btn" onClick={descargar}>
              Descargar PDF
            </button>
            {opciones.length > 0 && (
              <div className="dx-ffi-more">
                <button
                  ref={menuButton}
                  className="dx-btn"
                  aria-haspopup="menu"
                  aria-expanded={menu}
                  onClick={() => setMenu(!menu)}
                >
                  Más ▾
                </button>
                {menu && (
                  <div className="dx-ffi-menu" role="menu">
                    {opciones.map(([label, action]) => (
                      <button
                        role="menuitem"
                        key={label}
                        onClick={() => {
                          setMenu(false);
                          menuButton.current?.focus();
                          action();
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {!escritura && (
            <div className="dx-ffi-perm">
              Solo lectura: tu rol no tiene permiso para editar Facturación ni registrar cobros. Puedes descargar el
              PDF.
            </div>
          )}
        </header>
        <div className="dx-ffi-body">
          {devolucionPendiente && (
            <div className="dx-ffi-devolucion" role="alert">
              <p>La nota de crédito {f.numero} se emitió, pero no se pudo registrar la devolución al cliente.</p>
              <button className="dx-btn" disabled={accionEnCurso} onClick={async () => {
                setAccionEnCurso(true);
                setErrorAccion('');
                try {
                  await onReintentarDevolucion();
                } catch (err) {
                  setErrorAccion(err?.message || 'No se pudo registrar la devolución.');
                } finally {
                  setAccionEnCurso(false);
                }
              }}>{accionEnCurso ? 'Reintentando…' : 'Reintentar devolución'}</button>
            </div>
          )}
          {errorAccion && <div className="dx-ffi-confirm" role="alert">{errorAccion}</div>}
          {confirmacion && (
            <div className="dx-ffi-confirm">
              <p>{confirmacion.tipo === 'restaurar'
                ? `¿Restaurar ${f.numero} a emitida?`
                : `¿Eliminar el archivo ${confirmacion.tipo.toUpperCase()} histórico?`}</p>
              <button className="dx-btn danger" disabled={accionEnCurso} onClick={async () => {
                setAccionEnCurso(true);
                setErrorAccion('');
                try {
                  if (confirmacion.tipo === 'restaurar') await onRestaurar();
                  else await onEliminarArchivo(f.id, confirmacion.tipo);
                  setConfirmacion(null);
                } catch (err) {
                  setErrorAccion(err?.message || 'No se pudo completar la operación.');
                } finally {
                  setAccionEnCurso(false);
                }
              }}>{confirmacion.tipo === 'restaurar' ? 'Restaurar' : 'Eliminar'}</button>
              <button className="dx-btn" disabled={accionEnCurso} onClick={() => {
                setConfirmacion(null);
                setErrorAccion('');
              }}>Cancelar</button>
            </div>
          )}
          {f.estado === 'anulada' && (
            <div className="dx-ffi-annul">
              <b>Comprobante anulado.</b> Motivo: {f.motivo_anulacion || 'Sin dato'}
              {restaurable && ' · Anulada directamente sin nota de crédito.'}
            </div>
          )}
          <div className="dx-ffi-steps" aria-label="Estado del comprobante">
            <span>Emitida · {fecha(f.fecha_emision)}</span>
            <span>{estados[f.estado] || f.estado}</span>
            {f.fecha_vencimiento && <span>Vence · {fecha(f.fecha_vencimiento)}</span>}
          </div>
          <div className="dx-ui-kpi-row">
            {[
              ['Total', dinero(f.total, f.moneda), ''],
              ['Cobrado', cxc ? dinero(cxc.monto_pagado, f.moneda) : 'Sin dato', 'is-green'],
              ['Saldo', cxc ? dinero(saldo, f.moneda) : 'Sin dato', saldo > 0 ? 'is-amber' : ''],
              ['Vencimiento', fecha(f.fecha_vencimiento), dias < 0 ? 'is-red' : ''],
            ].map(([label, valor, color]) => (
              <div className={`dx-ui-kpi ${color}`} key={label}>
                <span>{label}</span>
                <strong>{valor}</strong>
              </div>
            ))}
          </div>
          <div className="dx-ffi-tabs" role="tablist">
            {tabs.map(([id, label, count]) => (
              <button
                key={id}
                id={`ffi-tab-${id}`}
                role="tab"
                aria-selected={tab === id}
                aria-controls={`ffi-panel-${id}`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
                  e.preventDefault();
                  const index = tabs.findIndex(([key]) => key === id);
                  const next = tabs[(index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length][0];
                  setTab(next);
                  document.getElementById(`ffi-tab-${next}`)?.focus();
                }}
              >
                {label} {count !== null && <b>{count}</b>}
              </button>
            ))}
          </div>
          {error && <div className="dx-ffi-alert" role="alert">{error}</div>}
          <div role="tabpanel" id={`ffi-panel-${tab}`} aria-labelledby={`ffi-tab-${tab}`}>
            {tab === 'detalle' && (
              <>
                <section className="dx-ffi-card">
                  <h3>Datos del comprobante</h3>
                  <dl className="dx-ffi-dl">
                    {[
                      ['Emisión', fecha(f.fecha_emision)],
                      ['Condición de pago', f.condicion_pago],
                      ['Moneda', f.moneda === 'USD' ? 'USD · Dólares' : 'PEN · Soles'],
                      ['Sociedad', sociedad?.nombre || sociedad?.razon_social || empresa?.nombre],
                      ['CEBE', centrosBeneficio.find((c) => c.id === f.centro_beneficio_id)?.nombre],
                      ['Detracción', f.aplica_detraccion
                        ? `${f.codigo_spot || ''} ${f.porcentaje_detraccion || ''}%` : 'No aplica'],
                      ['Retención', f.aplica_retencion ? dinero(f.monto_retencion, f.moneda) : 'No aplica'],
                      ['Glosa', f.glosa],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v || 'Sin dato'}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <section className="dx-ffi-card">
                  <h3>Partidas</h3>
                  <div className="dx-ffi-partidas">
                    <div className="dx-ui-head">
                      <span>Descripción</span><span>Cant.</span><span>P. unitario</span><span>Importe</span>
                    </div>
                    {(f.items || []).map((item, i) => (
                      <div className="dx-ui-row" key={item.id || i}>
                        <span>{item.descripcion || 'Sin dato'}</span>
                        <span>{item.cantidad}</span>
                        <span>{dinero(item.precio_unitario, f.moneda)}</span>
                        <span>{dinero(Number(item.cantidad) * Number(item.precio_unitario), f.moneda)}</span>
                      </div>
                    ))}
                    {!f.items?.length && <p>Sin partidas registradas.</p>}
                  </div>
                  <div className="dx-ffi-totals">
                    {[
                      ['Subtotal', f.subtotal],
                      ['IGV', f.igv],
                      ['Total facturado', f.total],
                      ...(f.aplica_retencion
                        ? [
                            ['Retención SUNAT', -Number(f.monto_retencion || 0)],
                            ['Neto a cobrar', f.monto_neto_cobrable ?? f.total - (f.monto_retencion || 0)],
                          ]
                        : []),
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <b>{dinero(v, f.moneda)}</b>
                      </div>
                    ))}
                  </div>
                  {(f.glosa || f.notas) && (
                    <div className="dx-ffi-files">
                      {f.glosa && (
                        <div>
                          <b>Glosa: </b>
                          {f.glosa}
                        </div>
                      )}
                      {f.notas && (
                        <div>
                          <b>Notas: </b>
                          {f.notas}
                        </div>
                      )}
                    </div>
                  )}
                </section>
                <section className="dx-ffi-card">
                  <h3>Detracción</h3>
                  <div className="dx-ffi-files">
                    {detraccionesError ? <p>{detraccionesError}</p> : !detracciones.length ? (
                      <p>No hay obligaciones SPOT registradas.</p>
                    ) : detracciones.map((d) => (
                      <dl className="dx-ffi-dl" key={d.id}>
                        {[
                          ['Tipo', d.documento_ajuste_id ? 'Ajuste' : 'Principal'],
                          ['Estado', etiqueta(d.estado)],
                          ['Origen', etiqueta(d.origen)],
                          ['Monto origen', dinero(d.monto_detraccion_origen, d.moneda_origen || f.moneda)],
                          ['Depósito en soles', dinero(d.monto_detraccion_soles, 'PEN')],
                          ['Cuenta destino', nombreCuenta(d.cuenta_destino_id)],
                          ['Constancia', [d.numero_constancia || 'Sin dato', fecha(d.fecha_constancia)].join(' · ')],
                          ['Fecha límite', fecha(d.fecha_limite_deposito)],
                        ].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
                      </dl>
                    ))}
                  </div>
                </section>
                {autodetraccion && (
                  <div className="dx-ffi-alert">
                    Por autodetraer · Fecha límite: {fecha(autodetraccion.fecha_limite_deposito)}{' '}
                    {permisos.autodetraccion && (
                      <button className="dx-btn primary" onClick={onAutodetraccion}>
                        Registrar autodetracción
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
            {tab === 'vinculaciones' && (
              <section className="dx-ffi-card">
                <h3>Vinculaciones</h3>
                {enlace(
                  'Venta de origen',
                  venta ? `${venta.numero || venta.id} · ${venta.concepto || ''}` : 'Sin venta vinculada',
                  venta && (() => navigate('ventas', { detail: venta.id })),
                )}
                {enlace(
                  'Valorización',
                  val
                    ? `${val.numero} · ${etiqueta(val.estado)} · ${dinero(val.total, val.moneda || f.moneda)}`
                    : 'Sin valorización vinculada',
                  val && (() => navigate('valorizaciones', { detail: val.id })),
                )}
                {enlace(
                  'OS de cliente',
                  os
                    ? `${os.numero} · Monto aprobado: ${dinero(os.monto_aprobado, os.moneda || f.moneda)}`
                    : 'Sin OS vinculada',
                  os && (() => navigate('os_clientes', { detail: os.id })),
                )}
                {enlace(
                  'Cuenta por cobrar',
                  cxc
                    ? [
                        `Total ${dinero(cxc.monto_total, cxc.moneda || f.moneda)}`,
                        `Pagado ${dinero(cxc.monto_pagado, cxc.moneda || f.moneda)}`,
                        `Saldo ${dinero(saldo, cxc.moneda || f.moneda)}`,
                        etiqueta(cxc.estado), `Vence ${fecha(cxc.fecha_vencimiento)}`,
                      ].join(' · ')
                    : 'Sin CxC generada',
                  cxc && (() => navigate('cxc')),
                )}
                {!cxc && f.estado !== 'anulada' && permisos.generarCxC && (
                  <div className="dx-ffi-files">
                    <button className="dx-btn primary" disabled={generandoCxC} onClick={onGenerarCxC}>
                      {generandoCxC ? 'Generando…' : 'Generar CxC'}
                    </button>
                  </div>
                )}
                {origen &&
                  enlace(
                    'Comprobante origen',
                    [origen.numero, dinero(origen.total, origen.moneda), fecha(origen.fecha_emision),
                      etiqueta(origen.estado)].join(' · '),
                    () => onAbrirFactura(origen.id),
                  )}
                <h3>Notas relacionadas ({notas.length})</h3>
                {notas.length ? (
                  notas.map((n) => (
                    <React.Fragment key={n.id}>
                      {enlace(
                        n.numero || n.id,
                        [tipos[n.tipo_documento], fecha(n.fecha_emision),
                          `Motivo: ${n.motivo_codigo || n.motivo || 'Sin dato'}`,
                          dinero(n.total || n.monto, n.moneda || f.moneda)].join(' · '),
                        () => onAbrirFactura(n.id),
                      )}
                    </React.Fragment>
                  ))
                ) : (
                  <div className="dx-ffi-files">No hay notas de crédito o débito relacionadas.</div>
                )}
              </section>
            )}
            {tab === 'archivos' && (
              <section className="dx-ffi-card">
                <h3>Archivos</h3>
                <div className="dx-ffi-files">
                  <div className="dx-ffi-note">
                    Descargar PDF utiliza el archivo electrónico si existe; de lo contrario genera una representación
                    interna.
                  </div>
                  <FileUpload
                    entidadTipo="facturas"
                    entidadId={f.id}
                    empresaId={empresa?.id}
                    categoria="comprobante_factura"
                    descripcion={`Adjunto de la factura ${f.numero}`}
                    multiple
                    readOnly={!permisos.editar || f.estado === 'anulada'}
                    adjuntosExternos={[
                      {
                        id: 'factura-pdf-historico',
                        tipo: 'pdf',
                        nombre_original: 'PDF de factura',
                        categoria: 'Archivo histórico',
                        url: f.archivo_pdf_url,
                        externo: true,
                      },
                      {
                        id: 'factura-zip-historico',
                        tipo: 'zip',
                        nombre_original: 'ZIP de factura',
                        categoria: 'Archivo histórico',
                        url: f.archivo_zip_url,
                        externo: true,
                      },
                    ].filter((a) => a.url)}
                    onEliminarAdjuntoExterno={(a) => {
                      setErrorAccion('');
                      setConfirmacion({ tipo: a.tipo });
                    }}
                  />
                </div>
              </section>
            )}
            {tab === 'historial' && (
              <section className="dx-ffi-card">
                <h3>Historial</h3>
                <ol className="dx-ffi-tl">
                  {historial.map((h, i) => (
                    <li key={i}>
                      <b>{h.texto}</b>
                      <small>
                        {fecha(h.fecha)}
                        {h.detalle && ` · ${h.detalle}`}
                      </small>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
