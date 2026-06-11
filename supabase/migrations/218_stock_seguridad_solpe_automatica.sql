-- Stock de seguridad y SOLPEs automaticas por reorden.

alter table public.materiales
  add column if not exists stock_seguridad numeric(14,2) default 0,
  add column if not exists creado_por uuid references auth.users(id) on delete set null;

create or replace function public.set_materiales_creado_por()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.creado_por is null then
    new.creado_por := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_materiales_creado_por on public.materiales;
create trigger trg_materiales_creado_por
  before insert on public.materiales
  for each row execute function public.set_materiales_creado_por();

alter table public.solpe_interna
  add column if not exists origen text default 'manual',
  add column if not exists material_id text references public.materiales(id) on delete set null,
  add column if not exists cantidad_solicitada numeric(14,2),
  add column if not exists disponible_actual numeric(14,2),
  add column if not exists punto_reorden_efectivo numeric(14,2),
  add column if not exists urgencia text,
  add column if not exists fecha date default current_date,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists creado_por uuid references auth.users(id) on delete set null;

create index if not exists idx_materiales_reorden_seguridad
  on public.materiales (empresa_id, punto_reorden, stock_seguridad)
  where coalesce(punto_reorden, 0) > 0;

create index if not exists idx_solpe_reorden_material_estado
  on public.solpe_interna (empresa_id, material_id, estado)
  where material_id is not null and estado in ('borrador', 'solicitada', 'aprobada');

create or replace function public.responsable_solpe_reorden(p_empresa_id text, p_creado_por uuid default null)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select ue.user_id
      from public.usuarios_empresas ue
      join public.roles r on r.id = ue.rol_id
      left join public.permisos_roles pr on pr.rol_id = ue.rol_id
      where ue.empresa_id = p_empresa_id
        and ue.estado = 'activo'
        and (
          coalesce(r.es_admin_empresa, false) = true
          or coalesce(r.es_superadmin, false) = true
          or (
            pr.pantalla in ('solpe', 'ordenes_compra', 'cot_compras')
            and coalesce(pr.puede_aprobar, false) = true
          )
        )
      order by
        case when coalesce(r.es_admin_empresa, false) or coalesce(r.es_superadmin, false) then 0 else 1 end,
        ue.created_at nulls last
      limit 1
    ),
    p_creado_por
  );
$$;

create or replace function public.generar_solpes_reorden(p_empresa_id text default null)
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
  v_mat record;
  v_solpe_id text;
  v_codigo text;
  v_cantidad numeric;
  v_destinatario uuid;
  v_mensaje text;
  v_generadas integer;
  v_omitidas integer;
  v_detalle text;
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
      for v_mat in
        with stock_material as (
          select
            s.empresa_id,
            s.material_id,
            sum(coalesce(s.disponible, 0)) as disponible
          from public.stock s
          where s.empresa_id = v_emp.id
          group by s.empresa_id, s.material_id
        )
        select
          m.id,
          m.codigo,
          m.descripcion,
          m.empresa_id,
          m.punto_reorden,
          coalesce(m.stock_seguridad, 0) as stock_seguridad,
          m.stock_maximo,
          m.unidad,
          m.creado_por,
          coalesce(sm.disponible, 0) as disponible,
          coalesce(m.punto_reorden, 0) + coalesce(m.stock_seguridad, 0) as punto_reorden_efectivo
        from public.materiales m
        left join stock_material sm on sm.material_id = m.id and sm.empresa_id = m.empresa_id
        where m.empresa_id = v_emp.id
          and m.punto_reorden is not null
          and m.punto_reorden > 0
          and coalesce(sm.disponible, 0) <= (coalesce(m.punto_reorden, 0) + coalesce(m.stock_seguridad, 0))
      loop
        if exists (
          select 1
          from public.solpe_interna si
          where si.empresa_id = v_emp.id
            and si.material_id = v_mat.id
            and si.estado in ('borrador', 'solicitada', 'aprobada')
        ) then
          v_omitidas := v_omitidas + 1;
          continue;
        end if;

        v_cantidad := case
          when v_mat.stock_maximo is not null and v_mat.stock_maximo > 0
            then greatest(v_mat.stock_maximo - v_mat.disponible, 0)
          else greatest(v_mat.punto_reorden * 2, 0)
        end;

        v_solpe_id := 'slp_auto_' || replace(gen_random_uuid()::text, '-', '');
        v_codigo := 'SLP-AUTO-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

        insert into public.solpe_interna (
          id, empresa_id, codigo, descripcion, tipo, prioridad, urgencia, estado,
          origen, material_id, cantidad_solicitada, disponible_actual, punto_reorden_efectivo,
          fecha, items, creado_por
        ) values (
          v_solpe_id,
          v_emp.id,
          v_codigo,
          'Reorden automático: ' || coalesce(v_mat.descripcion, v_mat.codigo, v_mat.id),
          'bien',
          'normal',
          'normal',
          'solicitada',
          'automatico',
          v_mat.id,
          v_cantidad,
          v_mat.disponible,
          v_mat.punto_reorden_efectivo,
          current_date,
          jsonb_build_array(jsonb_build_object(
            'material_id', v_mat.id,
            'codigo', v_mat.codigo,
            'nombre', v_mat.descripcion,
            'cantidad', v_cantidad,
            'unidad', v_mat.unidad,
            'punto_reorden', v_mat.punto_reorden,
            'stock_seguridad', v_mat.stock_seguridad,
            'disponible', v_mat.disponible
          )),
          v_mat.creado_por
        );

        v_destinatario := public.responsable_solpe_reorden(v_emp.id, v_mat.creado_por);
        if v_destinatario is not null then
          v_mensaje := format(
            'Se generó una SOLPE para %s (stock actual: %s, punto de reorden: %s)',
            coalesce(v_mat.descripcion, v_mat.codigo, v_mat.id),
            trim(to_char(v_mat.disponible, 'FM999999990.##')),
            trim(to_char(v_mat.punto_reorden_efectivo, 'FM999999990.##'))
          );

          insert into public.notificaciones_sistema (
            empresa_id, user_id, texto, tipo, titulo, mensaje,
            referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
          ) values (
            v_emp.id,
            v_destinatario,
            v_mensaje,
            'solpe_reorden',
            'Reorden automático generado',
            v_mensaje,
            'solpe_interna',
            v_solpe_id,
            jsonb_build_object(
              'material_id', v_mat.id,
              'codigo_material', v_mat.codigo,
              'disponible', v_mat.disponible,
              'punto_reorden', v_mat.punto_reorden,
              'stock_seguridad', v_mat.stock_seguridad,
              'punto_reorden_efectivo', v_mat.punto_reorden_efectivo,
              'cantidad_solicitada', v_cantidad
            ),
            'media',
            false,
            now(),
            now()
          );
        end if;

        v_generadas := v_generadas + 1;
      end loop;
    exception when others then
      v_detalle := sqlerrm;
    end;

    empresa_id := v_emp.id;
    generadas := v_generadas;
    omitidas := v_omitidas;
    detalle := v_detalle;
    return next;
  end loop;
end;
$$;

revoke all on function public.generar_solpes_reorden(text) from public;
grant execute on function public.generar_solpes_reorden(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      execute $cron$
        select cron.schedule(
          'solpes-reorden-diarias',
          '0 11 * * *',
          'select public.generar_solpes_reorden();'
        )
        where not exists (
          select 1 from cron.job where jobname = 'solpes-reorden-diarias'
        )
      $cron$;
    exception when others then
      raise notice 'No se pudo registrar pg_cron solpes-reorden-diarias: %', sqlerrm;
    end;
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
