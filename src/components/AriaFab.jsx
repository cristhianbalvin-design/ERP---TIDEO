import React, { forwardRef } from 'react';
import Avatar from '../inicio/Avatar.jsx';

const AriaFab = forwardRef(function AriaFab({ pendientes, inicio = false, abierto = false, oculto = false, onClick }, ref) {
  return <button ref={ref} id={inicio ? 'fab' : undefined} className={`dxi-fab${inicio ? '' : ' dx-asis-fab'}`} type="button"
    style={oculto ? { display: 'none' } : undefined} aria-label="Pregúntale a Aria" aria-expanded={abierto}
    aria-haspopup="dialog" tabIndex={abierto ? -1 : 0} onClick={onClick}>
    <span className="dxi-tp" aria-hidden="true">Pregúntale a Aria</span>
    {pendientes != null && <span className="dxi-cnt">{pendientes}</span>}
    {inicio ? <span className="dxi-fab-av" id="fabAv" data-s="reposo" /> : <span className="dxi-fab-av" aria-hidden="true"><Avatar robot /></span>}
  </button>;
});
export default AriaFab;
