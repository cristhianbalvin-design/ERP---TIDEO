-- Protege la unicidad hacia adelante de los documentos derivados de un origen.
--
-- cotizaciones.recepcion_id no tiene duplicados históricos, por lo que puede
-- usar el predicado completo solicitado.
create unique index if not exists ux_cotizaciones_recepcion
  on public.cotizaciones (recepcion_id)
  where recepcion_id is not null;

-- Existen cinco OS históricas activas con dos cotizacion_id repetidos:
--   cot_321526: osc_319361 (canónica), osc_904071 (histórica excluida)
--   cot_847035: osc_221954 (canónica), osc_666594 y osc_037630 (históricas excluidas)
-- Se conserva una fila canónica por origen dentro del índice. No se actualiza
-- ni elimina ninguna fila: las nuevas filas con esos orígenes colisionarán con
-- la canónica, mientras que las anomalías históricas permanecen intactas.
create unique index if not exists ux_os_clientes_cotizacion
  on public.os_clientes (cotizacion_id)
  where cotizacion_id is not null
    and id not in ('osc_904071', 'osc_666594', 'osc_037630');
