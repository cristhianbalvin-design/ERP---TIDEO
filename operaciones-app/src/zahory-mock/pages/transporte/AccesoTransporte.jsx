import React from 'react';

export function AccesoTransporte({ acceso }) {
  if (!acceso.motivo) return null;

  const mensaje = acceso.motivo === 'verificando'
    ? 'Verificando permisos…'
    : acceso.motivo === 'sin_sesion'
      ? 'Tu sesión no está activa. Inicia sesión para continuar.'
      : acceso.motivo === 'sin_empresa'
        ? 'Tu usuario no tiene una empresa asignada.'
        : acceso.motivo === 'no_configurado'
          ? 'La conexión con el servidor no está configurada.'
          : acceso.motivo === 'error'
            ? `No se pudieron verificar los permisos: ${acceso.error}`
            : 'Acceso restringido. No tienes permiso para ver Transporte Comercial.';

  return (
    <section className="dx-ui dx-transporte">
      <div className="dx-ui-empty" role="status">
        {mensaje}
        {acceso.motivo === 'error' && (
          <button type="button" onClick={acceso.reintentar}>Reintentar</button>
        )}
      </div>
    </section>
  );
}
