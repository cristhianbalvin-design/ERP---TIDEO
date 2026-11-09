-- Demo PRUEBA · 16 Certificaciones sin adjunto obligatorio y jornadas mineras (2026-11-08)
-- 1) Los tipos "Seguridad minera" y "Revisión técnica" exigían adjunto y el demo no tiene archivos: todos los equipos
--    quedaban bloqueados en el Panel de Flota. En PRUEBA dejan de exigir adjunto.
do $$ declare n int; begin
  update flota_certificacion_tipos set requiere_adjunto = false, updated_at = now()
  where empresa_id = 'emp_2000000000' and nombre in ('Seguridad minera', 'Revisión técnica');
  get diagnostics n = row_count;
  if n <> 2 then raise exception 'se esperaban 2 tipos y se actualizaron %', n; end if;
  if (select count(*) from activos a where a.empresa_id = 'emp_2000000000' and a.propietario_tipo = 'propio'
        and (public.flota__evaluar_requisitos('emp_2000000000', a.id, current_date)->>'bloqueado')::boolean) > 0 then
    raise exception 'siguen equipos bloqueados';
  end if;
end $$;

-- 2) Nómina de noviembre: los mineros 14x7 necesitan su asignación física de jornada; Dante Quispe tenía un tramo general
--    abierto superpuesto con su ciclo minero.
do $$ declare n int; begin
  set local session_replication_role = replica;
  update personal_asignaciones_jornada set fecha_fin = date '2026-09-22'
  where id = 'demo_personal_asi_0006' and empresa_id = 'emp_2000000000' and regimen_jornada = 'general' and fecha_fin is null;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'no se cerró el tramo general de Dante Quispe'; end if;

  insert into personal_asignaciones_jornada (id, empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio, fecha_fin,
    regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo, motivo, created_at)
  select 'paj_demo_' || p.id, 'emp_2000000000', p.id, 'operativo', 'normal', date '2026-08-01', null,
    'ciclo_acumulativo', 14, 7, date '2026-08-03', 'Régimen minero 14x7 del contrato', now()
  from personal_operativo p
  where p.empresa_id = 'emp_2000000000' and p.regimen_jornada = 'minero_14x7'
    and not exists (select 1 from personal_asignaciones_jornada a where a.personal_id = p.id)
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'se esperaban 4 asignaciones y se crearon %', n; end if;
end $$;
