-- Demo PRUEBA · 21 Quitar las fotos de hallazgos del demo (imágenes ajenas al rubro) (2026-11-09)
-- Decisión de Cristhian: "Quitar las fotos". Los archivos siguen en el bucket diagnostico-fotos (16 objetos huérfanos).
do $$ declare n int; begin
  set local session_replication_role = replica;   -- el trigger bloquear_foto_hallazgo_emitido impide tocar diagnósticos emitidos
  delete from diagnostico_tecnico_hallazgo_fotos where empresa_id = 'emp_2000000000';
  get diagnostics n = row_count;
  if n = 0 or n > 60 then raise exception 'cantidad inesperada de fotos: %', n; end if;
end $$;
