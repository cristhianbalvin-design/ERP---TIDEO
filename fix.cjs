const fs = require('fs');
let code = fs.readFileSync('src/pages_fin.jsx', 'utf8');

const idxCard = code.indexOf('<div className="card mt-6">');
const idxEndFrag = code.indexOf('</React.Fragment>', idxCard);
const idxEndFichaJSX = code.indexOf('{fichaJSX}', idxEndFrag);

const properStructure = `          <div className="card mt-6">
            {index === firstVisibleIdx && FiltersUI}
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Cliente</th><th>Factura</th><th>OS Cliente</th><th>Vencimiento</th>
                    <th>Total</th><th>Saldo neto</th>{sec.mostrarRetencion && <th>Retencion SUNAT</th>}
                    <th>Medio pago esp.</th><th>Estado</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.length ? sec.rows.map(c=>{
                    const dias  = diasMoraDe(c);
                    const est   = estadoDe(c);
                    const meta  = ESTADO_META[est] || ESTADO_META.por_cobrar;
                    const vence = c.fecha_vencimiento||c.vence||'--';
                    const moneda = monedaCxCDe(c);
                    return (
                      <tr key={c.id} style={{cursor:'pointer'}} onClick={()=>abrirFicha(c)}>
                        <td>
                          <strong>{clienteDe(c)}</strong>
                          {retencionDe(c)>0 && <span className="badge badge-orange" style={{marginLeft:6,fontSize:10}}>Retencion SUNAT</span>}
                        </td>
                        <td className="mono">{facturaNumeroDe(c)}</td>
                        <td className="text-muted">{osNumeroDe(c)}</td>
                        <td style={{color:dias>0?'var(--danger)':dias===0?'var(--orange)':'inherit',fontWeight:dias>0?600:400}}>{vence}</td>
                        <td className="num">{moneyCurrency(totalDe(c), moneda)}</td>
                        <td className="num"><strong>{moneyCurrency(saldoDe(c), moneda)}</strong></td>
                        {sec.mostrarRetencion && <td className="num">{retencionDe(c)>0 ? moneyCurrency(retencionDe(c), moneda) : <span className="text-subtle">--</span>}</td>}
                        <td style={{color:'var(--fg-muted)',fontSize:12}}>{c.medio_pago_esperado||<span className="text-subtle">--</span>}</td>
                        <td><span className={'badge '+meta.cls}>{meta.label}</span></td>
                        <td onClick={e=>e.stopPropagation()} style={{whiteSpace:'nowrap'}}>
                          {saldoDe(c)>0 && !estadoTerminalCxC(c) && <button className="btn btn-sm btn-primary" data-local-form="true" onClick={e=>abrirCobro(c,e)} style={{marginRight:6}}>Cobrar</button>}
                          {puedeEditarCxC && !estadoTerminalCxC(c) && (
                            <button className="icon-btn" title="Anular CxC" style={{color:'var(--danger)'}} onClick={e=>{e.stopPropagation();setConfirmAnular(c);}}>{I.trash}</button>
                          )}
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={sec.mostrarRetencion ? 10 : 9} style={{textAlign:'center',padding:36,color:'var(--fg-muted)'}}>
                      {hayFiltros ? 'Sin resultados con los filtros aplicados.' : 'Sin facturas en esta moneda.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </React.Fragment>
        );
      })()}`;

code = code.substring(0, idxCard) + properStructure + '\n\n      ' + code.substring(idxEndFichaJSX);

fs.writeFileSync('src/pages_fin.jsx', code);
console.log('Done!');
