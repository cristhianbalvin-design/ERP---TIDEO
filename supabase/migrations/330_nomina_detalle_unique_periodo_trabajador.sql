-- Restriccion unica faltante en nomina_detalle: nominaService.guardarDetalle() ya usa
-- upsert(rows, { onConflict: 'periodo_id,trabajador_id' }) pero la tabla nunca tuvo un
-- indice/constraint unico que respalde ese onConflict. Sin esto, cualquier upsert falla
-- con "there is no unique or exclusion constraint matching the ON CONFLICT specification".
-- Verificado antes de aplicar: no existen filas duplicadas de (periodo_id, trabajador_id)
-- en produccion.

create unique index if not exists nomina_detalle_periodo_trabajador_uq
  on public.nomina_detalle (periodo_id, trabajador_id);

select pg_notify('pgrst', 'reload schema');
