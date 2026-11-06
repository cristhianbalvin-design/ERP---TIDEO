-- Diagnóstico de fabricación · etapa 3: consumo de material por pieza, ficha técnica congelada al emitir
-- y paso de piezas/materiales a la Hoja de Costeo.
-- Decisiones (Cristhian, 2026-10-28):
--   * Cada pieza lleva "consumo por pieza" en la unidad del material; la Hoja de Costeo recibe consumo × cantidad.
--   * La ficha técnica se descarga siempre (marca "Borrador"); al emitir queda congelada como versión fija.
--   * La ficha incluye conclusión, trabajos a realizar (sin horas ni costos) y firma del emisor.
--   * Cada tarea puede indicar su pieza (diagnostico_tecnico_lineas.pieza_id, ya existente desde 653).
--   * Calidad (piezas y plano en la Orden de Fabricación) queda para F4.
-- Las funciones existentes se modifican sobre su definición vigente con replace() verificado:
-- si un fragmento esperado no existe, la migración falla y no cambia nada.

set lock_timeout = '10s';

-- 1) Columnas ---------------------------------------------------------------------------------------
alter table public.diagnostico_fabricacion_piezas
  add column if not exists consumo_material numeric(14,4);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'diagnostico_fabricacion_piezas_consumo_check') then
    alter table public.diagnostico_fabricacion_piezas
      add constraint diagnostico_fabricacion_piezas_consumo_check check (consumo_material is null or consumo_material > 0);
  end if;
end $$;
comment on column public.diagnostico_fabricacion_piezas.consumo_material is 'Consumo del material por pieza, en la unidad del material; la Hoja de Costeo recibe consumo × cantidad.';

alter table public.diagnosticos_tecnicos
  add column if not exists ficha_emisor jsonb;
comment on column public.diagnosticos_tecnicos.ficha_emisor is 'Fabricación: emisor elegido para firmar la ficha técnica (persona, cargo y firma).';

alter table public.hoja_costeo_lineas_materiales
  add column if not exists diagnostico_pieza_id uuid;
create index if not exists hoja_costeo_lineas_materiales_pieza_idx
  on public.hoja_costeo_lineas_materiales (diagnostico_pieza_id) where diagnostico_pieza_id is not null;
comment on column public.hoja_costeo_lineas_materiales.diagnostico_pieza_id is 'Pieza del diagnóstico de fabricación que originó la línea (material × consumo × cantidad).';

-- 2) Fichas técnicas congeladas (una versión por emisión; inmutables) -------------------------------
create table if not exists public.diagnostico_fabricacion_fichas (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  diagnostico_id text not null references public.diagnosticos_tecnicos(id) on delete cascade,
  version integer not null check (version >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and jsonb_typeof(snapshot->'piezas') = 'array'),
  emitido_por uuid default auth.uid(),
  emitido_en timestamptz not null default now(),
  constraint diagnostico_fabricacion_fichas_version_uq unique (diagnostico_id, version)
);
comment on table public.diagnostico_fabricacion_fichas is 'Ficha técnica de fabricación congelada al emitir el diagnóstico (snapshot inmutable por versión).';

alter table public.diagnostico_fabricacion_fichas enable row level security;
drop policy if exists fab_fichas_select on public.diagnostico_fabricacion_fichas;
create policy fab_fichas_select on public.diagnostico_fabricacion_fichas for select using (
  usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id, 'diagnostico_tecnico', 'ver')
  and exists (select 1 from public.diagnosticos_tecnicos d where d.id = diagnostico_id and d.empresa_id = diagnostico_fabricacion_fichas.empresa_id
    and usuario_puede_ver_diagnostico_padre(d.tipo, d.empresa_id, d.recepcion_id, d.oportunidad_id)));
-- Sin políticas de escritura: solo la función de emisión inserta (security definer).
revoke all on public.diagnostico_fabricacion_fichas from anon;
grant select on public.diagnostico_fabricacion_fichas to authenticated;

-- 3) Emisión con ficha congelada (la regla que la exige va en 20261028090100, al fusionar el PR).
create or replace function public.emitir_diagnostico_fabricacion(p_id text, p_ficha jsonb)
returns table(id text, estado text, emitido_por uuid, emitido_en timestamptz)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_d public.diagnosticos_tecnicos%rowtype;
  v_version integer;
begin
  select d.* into v_d from public.diagnosticos_tecnicos d where d.id = p_id;
  if not found then raise exception 'El diagnóstico no existe.' using errcode = 'P0002'; end if;
  if v_d.tipo is distinct from 'fabricacion' then
    raise exception 'Solo los diagnósticos de fabricación tienen ficha técnica.' using errcode = '22023';
  end if;
  if p_ficha is null or jsonb_typeof(p_ficha) <> 'object' or jsonb_typeof(p_ficha->'piezas') <> 'array' then
    raise exception 'La ficha técnica no es válida.' using errcode = '22023';
  end if;
  -- emitir_diagnostico_tecnico valida sesión, permiso, estado, piezas y consumo.
  perform set_config('tideo.ficha_fabricacion', p_id, true);
  return query select e.id, e.estado, e.emitido_por, e.emitido_en from public.emitir_diagnostico_tecnico(p_id) e;
  perform set_config('tideo.ficha_fabricacion', '', true);
  select coalesce(max(f.version), 0) + 1 into v_version from public.diagnostico_fabricacion_fichas f where f.diagnostico_id = p_id;
  insert into public.diagnostico_fabricacion_fichas (empresa_id, diagnostico_id, version, snapshot)
  values (v_d.empresa_id, p_id, v_version,
          p_ficha || jsonb_build_object('version', v_version, 'emitido_en', now(), 'emisor', coalesce(v_d.ficha_emisor, p_ficha->'emisor')));
end;
$$;
revoke all on function public.emitir_diagnostico_fabricacion(text, jsonb) from public, anon;
grant execute on function public.emitir_diagnostico_fabricacion(text, jsonb) to authenticated;

-- 4) Hoja de Costeo: fabricación desde recepción y materiales de las piezas -------------------------
do $$
declare v_def text := pg_get_functiondef('public.generar_hoja_costeo_desde_diagnostico(text,uuid)'::regprocedure);
        v_old text; v_new text;
begin
  -- 4a) fabricación nacida de una recepción: cliente, activo y sociedad salen de la recepción.
  v_old := $q$  ELSIF v_d.tipo='fabricacion' THEN
    SELECT o.* INTO v_oportunidad$q$;
  v_new := $q$  ELSIF v_d.tipo='fabricacion' AND v_d.recepcion_id IS NOT NULL THEN
    SELECT r.* INTO v_recepcion FROM public.recepciones_activos_cliente r
      WHERE r.id=v_d.recepcion_id AND r.empresa_id=v_d.empresa_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La recepción del diagnóstico no existe o no pertenece a la empresa.' USING ERRCODE='23514';
    END IF;
    v_activo_id := coalesce(v_d.activo_id, v_recepcion.activo_id);
    v_moneda := NULL;
    SELECT a.* INTO v_activo FROM public.activos a
      WHERE a.id=v_activo_id AND a.empresa_id=v_d.empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El activo de la recepción no existe o no pertenece a la empresa.' USING ERRCODE='23514';
    END IF;
    v_cuenta_id := v_activo.cliente_propietario_id;
    v_sociedad_id := v_recepcion.sociedad_id;
    IF p_sociedad_id IS NOT NULL AND p_sociedad_id IS DISTINCT FROM v_sociedad_id THEN
      RAISE EXCEPTION 'La sociedad indicada no coincide con la sociedad de la recepción.' USING ERRCODE='23514';
    END IF;
  ELSIF v_d.tipo='fabricacion' THEN
    SELECT o.* INTO v_oportunidad$q$;
  v_old := replace(v_old, E'\n', E'\r\n'); v_new := replace(v_new, E'\n', E'\r\n');
  if position(v_old in v_def) = 0 then raise exception 'generar_hoja: no se encontró la rama de fabricación'; end if;
  v_def := replace(v_def, v_old, v_new);

  -- 4b) materiales de las piezas (consumo × cantidad), después de los materiales de las tareas.
  v_old := $q$  GET DIAGNOSTICS v_materiales=ROW_COUNT;

  RETURN jsonb_build_object('hoja_costeo_id',v_hoja_id,'numero',v_numero,'creada',true,$q$;
  v_new := $q$  GET DIAGNOSTICS v_materiales=ROW_COUNT;

  IF v_d.tipo='fabricacion' THEN
    INSERT INTO public.hoja_costeo_lineas_materiales
      (hoja_costeo_id,material_id,descripcion,unidad,cantidad,costo_unitario_snapshot,
       subtotal,fue_manual,orden,pendiente_valoracion,diagnostico_pieza_id)
    SELECT v_hoja_id,p.material_id,mat.descripcion,mat.unidad,round(p.consumo_material*p.cantidad,4),0,0,false,
      1000+p.orden,true,p.id
    FROM public.diagnostico_fabricacion_piezas p
    JOIN public.materiales mat ON mat.id=p.material_id AND mat.empresa_id=p.empresa_id
    WHERE p.diagnostico_id=v_d.id AND p.empresa_id=v_d.empresa_id AND p.consumo_material IS NOT NULL
    ORDER BY p.orden,p.id;
    GET DIAGNOSTICS v_activos=ROW_COUNT;
    v_materiales := v_materiales + v_activos;
    SELECT count(*) INTO v_activos FROM public.hoja_costeo_lineas_activos WHERE hoja_costeo_id=v_hoja_id;
  END IF;

  RETURN jsonb_build_object('hoja_costeo_id',v_hoja_id,'numero',v_numero,'creada',true,$q$;
  v_old := replace(v_old, E'\n', E'\r\n'); v_new := replace(v_new, E'\n', E'\r\n');
  if position(v_old in v_def) = 0 then raise exception 'generar_hoja: no se encontró el cierre de materiales'; end if;
  execute replace(v_def, v_old, v_new);
end $$;

do $$
declare v_def text := pg_get_functiondef('public.actualizar_hoja_costeo_desde_diagnostico(text)'::regprocedure);
        v_old text; v_new text;
begin
  v_old := $q$  SELECT i.id INTO v_informe_id FROM public.diagnostico_informes i$q$;
  v_new := $q$  -- Etapa 3: materiales de las piezas de fabricación (consumo × cantidad).
  IF v_d.tipo='fabricacion' THEN
    DELETE FROM public.hoja_costeo_lineas_materiales m
     WHERE m.hoja_costeo_id=v_h.id AND m.diagnostico_pieza_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.diagnostico_fabricacion_piezas p
          WHERE p.id=m.diagnostico_pieza_id AND p.diagnostico_id=v_d.id
            AND p.material_id IS NOT NULL AND p.consumo_material IS NOT NULL);
    GET DIAGNOSTICS v_n=ROW_COUNT; v_eliminadas := v_eliminadas+v_n;
    UPDATE public.hoja_costeo_lineas_materiales m
       SET material_id=p.material_id, descripcion=mat.descripcion, unidad=mat.unidad,
           cantidad=round(p.consumo_material*p.cantidad,4),
           subtotal=CASE WHEN m.pendiente_valoracion THEN m.subtotal ELSE round(round(p.consumo_material*p.cantidad,4)*coalesce(m.costo_unitario_snapshot,0),2) END
      FROM public.diagnostico_fabricacion_piezas p
      JOIN public.materiales mat ON mat.id=p.material_id AND mat.empresa_id=p.empresa_id
     WHERE m.hoja_costeo_id=v_h.id AND p.id=m.diagnostico_pieza_id
       AND (m.material_id IS DISTINCT FROM p.material_id OR m.cantidad IS DISTINCT FROM round(p.consumo_material*p.cantidad,4));
    GET DIAGNOSTICS v_n=ROW_COUNT; v_actualizadas := v_actualizadas+v_n;
    INSERT INTO public.hoja_costeo_lineas_materiales
      (hoja_costeo_id,material_id,descripcion,unidad,cantidad,costo_unitario_snapshot,
       subtotal,fue_manual,orden,pendiente_valoracion,diagnostico_pieza_id)
    SELECT v_h.id,p.material_id,mat.descripcion,mat.unidad,round(p.consumo_material*p.cantidad,4),0,0,false,
      1000+p.orden,true,p.id
    FROM public.diagnostico_fabricacion_piezas p
    JOIN public.materiales mat ON mat.id=p.material_id AND mat.empresa_id=p.empresa_id
    WHERE p.diagnostico_id=v_d.id AND p.empresa_id=v_d.empresa_id AND p.consumo_material IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.hoja_costeo_lineas_materiales x
                      WHERE x.hoja_costeo_id=v_h.id AND x.diagnostico_pieza_id=p.id)
    ORDER BY p.orden,p.id;
    GET DIAGNOSTICS v_n=ROW_COUNT; v_agregadas := v_agregadas+v_n;
  END IF;

  SELECT i.id INTO v_informe_id FROM public.diagnostico_informes i$q$;
  if position(v_old in v_def) = 0 then raise exception 'actualizar_hoja: no se encontró la búsqueda del informe'; end if;
  v_new := replace(v_new, E'\n', E'\r\n');
  execute replace(v_def, v_old, v_new);
end $$;

-- 5) Comprobación -----------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='diagnostico_fabricacion_piezas' and column_name='consumo_material') then
    raise exception 'VERIFY: falta consumo_material';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='hoja_costeo_lineas_materiales' and column_name='diagnostico_pieza_id') then
    raise exception 'VERIFY: falta diagnostico_pieza_id';
  end if;
  if to_regprocedure('public.emitir_diagnostico_fabricacion(text,jsonb)') is null then
    raise exception 'VERIFY: falta emitir_diagnostico_fabricacion';
  end if;
  if position('diagnostico_pieza_id' in pg_get_functiondef('public.generar_hoja_costeo_desde_diagnostico(text,uuid)'::regprocedure)) = 0
     or position('v_d.recepcion_id IS NOT NULL' in pg_get_functiondef('public.generar_hoja_costeo_desde_diagnostico(text,uuid)'::regprocedure)) = 0 then
    raise exception 'VERIFY: generar_hoja_costeo_desde_diagnostico sin cambios de etapa 3';
  end if;
  if position('diagnostico_pieza_id' in pg_get_functiondef('public.actualizar_hoja_costeo_desde_diagnostico(text)'::regprocedure)) = 0 then
    raise exception 'VERIFY: actualizar_hoja_costeo_desde_diagnostico sin piezas';
  end if;
  if (select count(*) from pg_policies where tablename = 'diagnostico_fabricacion_fichas') <> 1 then
    raise exception 'VERIFY: políticas de fichas';
  end if;
end $$;
