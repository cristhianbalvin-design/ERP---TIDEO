import React, { useEffect, useRef, useState } from 'react';
import { I } from '../icons.jsx';
import { ColumnFilter } from './ColumnFilter.jsx';

export function PersonalAccionesMenu({ descargarExcel, abrirCargaMasiva, abrirTiposDocumento, abrirRequisitos, visibleCols, setVisibleCols, columnas }) {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    if (!menuAbierto) return undefined;
    const cerrarFuera = e => { if (!menuRef.current?.contains(e.target)) setMenuAbierto(false); };
    const cerrarEscape = e => {
      if (e.key === 'Escape') {
        setMenuAbierto(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', cerrarFuera);
    document.addEventListener('keydown', cerrarEscape);
    return () => {
      document.removeEventListener('mousedown', cerrarFuera);
      document.removeEventListener('keydown', cerrarEscape);
    };
  }, [menuAbierto]);

  const ejecutar = accion => { setMenuAbierto(false); accion(); };
  return (
    <div className="dx-personal-actions">
      <ColumnFilter columns={columnas} visibleCols={visibleCols} onChange={setVisibleCols} />
      <div className="dx-personal-menu-wrap" ref={menuRef}>
        <button ref={menuButtonRef} type="button" className="dx-personal-btn" aria-haspopup="menu" aria-expanded={menuAbierto} onClick={() => setMenuAbierto(v => !v)}>Más acciones <span aria-hidden="true">⌄</span></button>
        {menuAbierto && <div className="dx-personal-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => ejecutar(descargarExcel)}><span aria-hidden="true">{I.download}</span>Descargar Excel</button>
          <button type="button" role="menuitem" onClick={() => ejecutar(abrirCargaMasiva)}><span aria-hidden="true">{I.upload}</span>Carga masiva</button>
          <button type="button" role="menuitem" onClick={() => ejecutar(abrirTiposDocumento)}><span aria-hidden="true">▤</span>Tipos de Documento</button>
          <button type="button" role="menuitem" onClick={() => ejecutar(abrirRequisitos)}><span aria-hidden="true">{I.shield}</span>Requisitos por Cargo</button>
        </div>}
      </div>
    </div>
  );
}
