-- Lead time real en OC y alertas diarias de OC vencidas sin recepcion.

alter table public.ordenes_compra
  add column if not exists fecha_recepcion_real date,
  add column if not exists lead_time_dias integer,
  add column if not exists creado_por uuid references auth.users(id) on delete set null;

create index if not exists idx_oc_lead_time_proveedor
  on public.ordenes_compra (empresa_id, proveedor_id, lead_time_dias)
  where lead_time_dias is not null;

create index if not exists idx_oc_vencidas_sin_recepcion
  on public.ordenes_compra (empresa_id, fecha_entrega_esperada, estado)
  where fecha_entrega_esperada is not null;

create index if not exists idx_notif_sistema_oc_vencida_idempotencia
  on public.notificaciones_sistema (user_id, tipo, referencia_tipo, referencia_id, created_at desc)
  where referencia_tipo = 'orden_compra' and tipo = 'oc_vencida';

create or replace function public.set_orden_compra_lead_time()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.creado_por is null then
    new.creado_por := auth.uid();
  end if;

  if new.fecha_recepcion_real is not null and new.fecha_emision is not null then
    new.lead_time_dias := new.fecha_recepcion_real::date - new.fecha_emision::date;
  elsif new.fecha_recepcion_real is null then
    new.lead_time_dias := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ordenes_compra_lead_time on public.ordenes_compra;
create trigger trg_ordenes_compra_lead_time
  before insert or update of fecha_emision, fecha_recepcion_real, creado_por
  on public.ordenes_compra
  for each row
  execute function public.set_orden_compra_lead_time();

update public.ordenes_compra
set lead_time_dias = fecha_recepcion_real::date - fecha_emision::date
where fecha_recepcion_real is not null
  and fecha_emision is not null
  and lead_time_dias is distinct from (fecha_recepcion_real::date - fecha_emision::date);

create or replace function public.generar_notificaciones_oc_vencidas(p_empresa_id text default null)
returns table (
  empresa_id text,
  generadas integer,
  omitidas integer,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp record;
  v_oc record;
  v_generadas integer;
  v_omitidas integer;
  v_detalle text;
  v_mensaje text;
begin
  for v_emp in
    select e.id
    from public.empresas e
    where (p_empresa_id is null or e.id = p_empresa_id)
      and coalesce(e.estado, 'activo') in ('activa', 'activo', 'demo')
      and (auth.uid() is null or public.usuario_es_admin_empresa(e.id))
  loop
    v_generadas := 0;
    v_omitidas := 0;
    v_detalle := null;

    begin
      for v_oc in
        select
          oc.id,
          oc.codigo,
          oc.empresa_id,
          oc.proveedor_id,
          oc.descripcion,
          oc.estado,
          oc.fecha_emision,
          oc.fecha_entrega_esperada,
          oc.creado_por,
          p.razon_social as proveedor_nombre
        from public.ordenes_compra oc
        left join public.proveedores p on p.id = oc.proveedor_id
        where oc.empresa_id = v_emp.id
          and oc.fecha_entrega_esperada is not null
          and oc.fecha_entrega_esperada::date < current_date
          and lower(coalesce(oc.estado, '')) not in ('cerrada', 'anulada', 'recibida')
      loop
        if v_oc.creado_por is null then
          v_omitidas := v_omitidas + 1;
          v_detalle := concat_ws(' | ', v_detalle, format('OC %s sin creado_por', coalesce(v_oc.codigo, v_oc.id)));
          continue;
        end if;

        v_mensaje := format(
          '%s vencio el %s y aun no registra recepcion.%s',
          coalesce(v_oc.codigo, v_oc.id),
          to_char(v_oc.fecha_entrega_esperada::date, 'YYYY-MM-DD'),
          case when v_oc.proveedor_nombre is not null then format(' Proveedor: %s.', v_oc.proveedor_nombre) else '' end
        );

        if exists (
          select 1
          from public.notificaciones_sistema ns
          where ns.user_id = v_oc.creado_por
            and ns.tipo = 'oc_vencida'
            and ns.referencia_tipo = 'orden_compra'
            and ns.referencia_id = v_oc.id
            and ns.created_at >= now() - interval '24 hours'
        ) then
          v_omitidas := v_omitidas + 1;
        else
          insert into public.notificaciones_sistema (
            empresa_id, user_id, texto, tipo, titulo, mensaje,
            referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
          ) values (
            v_emp.id,
            v_oc.creado_por,
            v_mensaje,
            'oc_vencida',
            'OC vencida sin recepción',
            v_mensaje,
            'orden_compra',
            v_oc.id,
            jsonb_build_object(
              'orden_compra_id', v_oc.id,
              'codigo', v_oc.codigo,
              'proveedor_id', v_oc.proveedor_id,
              'proveedor_nombre', v_oc.proveedor_nombre,
              'estado', v_oc.estado,
              'fecha_emision', v_oc.fecha_emision,
              'fecha_entrega_esperada', v_oc.fecha_entrega_esperada
            ),
            'alta',
            false,
            now(),
            now()
          );
          v_generadas := v_generadas + 1;
        end if;
      end loop;

      insert into public.notificaciones_documentarias_log (empresa_id, estado, generadas, omitidas, detalle)
      values (v_emp.id, 'ok', v_generadas, v_omitidas, concat_ws(' | ', 'oc_vencida', v_detalle));
    exception when others then
      v_detalle := sqlerrm;
      insert into public.notificaciones_documentarias_log (empresa_id, estado, generadas, omitidas, detalle)
      values (v_emp.id, 'error', v_generadas, v_omitidas, concat_ws(' | ', 'oc_vencida', v_detalle));
    end;

    empresa_id := v_emp.id;
    generadas := v_generadas;
    omitidas := v_omitidas;
    detalle := v_detalle;
    return next;
  end loop;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generar_notificaciones_documentarias'
      and p.pronargs = 1
  ) and not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'generar_notificaciones_documentarias_base_213'
  ) then
    alter function public.generar_notificaciones_documentarias(text)
      rename to generar_notificaciones_documentarias_base_213;
  end if;
end $$;

create or replace function public.generar_notificaciones_documentarias(p_empresa_id text default null)
returns table (
  empresa_id text,
  generadas integer,
  omitidas integer,
  detalle text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    return query
    select *
    from public.generar_notificaciones_documentarias_base_213(p_empresa_id);
  end;

  begin
    return query
    select *
    from public.generar_notificaciones_oc_vencidas(p_empresa_id);
  end;
end;
$$;

revoke all on function public.generar_notificaciones_oc_vencidas(text) from public;
grant execute on function public.generar_notificaciones_oc_vencidas(text) to authenticated;

revoke all on function public.generar_notificaciones_documentarias(text) from public;
grant execute on function public.generar_notificaciones_documentarias(text) to authenticated;

select pg_notify('pgrst', 'reload schema');
