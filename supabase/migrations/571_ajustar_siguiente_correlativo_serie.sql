-- Ajuste seguro de correlativos desde Parámetros generales.
-- El permiso específico se almacena en permisos_roles.permisos_extra:
-- {"ajustar_correlativo": true}, sobre la pantalla parametros.

create table if not exists public.series_documentarias_ajustes_auditoria (
  id text primary key default ('sda_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id),
  serie_id text not null references public.series_documentarias(id),
  documento text not null,
  valor_anterior numeric not null,
  valor_nuevo numeric not null,
  ajustado_por uuid,
  ajustado_at timestamptz not null default now()
);

alter table public.series_documentarias_ajustes_auditoria enable row level security;

revoke all on table public.series_documentarias_ajustes_auditoria from public, anon, authenticated;
grant select on table public.series_documentarias_ajustes_auditoria to authenticated;
grant all on table public.series_documentarias_ajustes_auditoria to service_role;

drop policy if exists series_doc_ajustes_auditoria_select
  on public.series_documentarias_ajustes_auditoria;
create policy series_doc_ajustes_auditoria_select
  on public.series_documentarias_ajustes_auditoria
  for select
  to authenticated
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'parametros', 'ver')
  );

-- Todos los roles que ya podían editar Parámetros reciben el permiso específico.
insert into public.permisos_roles (
  rol_id,
  pantalla,
  puede_ver,
  puede_crear,
  puede_editar,
  puede_anular,
  puede_aprobar,
  puede_exportar,
  puede_ver_costos,
  puede_ver_finanzas,
  permisos_extra
)
select
  pr.rol_id,
  'parametros',
  pr.puede_ver,
  pr.puede_crear,
  pr.puede_editar,
  pr.puede_anular,
  pr.puede_aprobar,
  pr.puede_exportar,
  pr.puede_ver_costos,
  pr.puede_ver_finanzas,
  coalesce(pr.permisos_extra, '{}'::jsonb)
    || jsonb_build_object('ajustar_correlativo', true)
from public.permisos_roles pr
where pr.pantalla = 'parametros'
  and pr.puede_editar = true
on conflict (rol_id, pantalla) do update
set permisos_extra = coalesce(public.permisos_roles.permisos_extra, '{}'::jsonb)
  || jsonb_build_object('ajustar_correlativo', true),
    updated_at = now();

create or replace function public.ajustar_siguiente_correlativo_serie(
  p_empresa_id text,
  p_serie_id text,
  p_nuevo_correlativo numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_serie public.series_documentarias%rowtype;
  v_max_usado numeric := 0;
  v_minimo_permitido numeric;
  v_usuario_permitido boolean := false;
  v_resultado public.series_documentarias%rowtype;
begin
  if p_empresa_id is null or btrim(p_empresa_id) = '' then
    raise exception 'La empresa es obligatoria.' using errcode = '22023';
  end if;

  if p_serie_id is null or btrim(p_serie_id) = '' then
    raise exception 'La serie es obligatoria.' using errcode = '22023';
  end if;

  if p_nuevo_correlativo is null
     or p_nuevo_correlativo < 1
     or p_nuevo_correlativo <> trunc(p_nuevo_correlativo) then
    raise exception 'El siguiente correlativo debe ser un entero positivo.' using errcode = '22023';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;

  select
    public.usuario_es_superadmin_plataforma()
    or exists (
      select 1
      from public.usuarios_empresas ue
      join public.roles r on r.id = ue.rol_id
      where ue.user_id = auth.uid()
        and ue.empresa_id = p_empresa_id
        and ue.estado = 'activo'
        and r.es_admin_empresa = true
    )
    or exists (
      select 1
      from public.usuarios_empresas ue
      join public.permisos_roles pr on pr.rol_id = ue.rol_id
      where ue.user_id = auth.uid()
        and ue.empresa_id = p_empresa_id
        and ue.estado = 'activo'
        and pr.pantalla = 'parametros'
        and coalesce((pr.permisos_extra->>'ajustar_correlativo')::boolean, false)
    )
    into v_usuario_permitido;

  if not v_usuario_permitido then
    raise exception 'No tiene permiso para ajustar correlativos en Parámetros generales.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('ajustar_siguiente_correlativo_serie' || p_empresa_id || p_serie_id, 0)
  );

  select *
    into strict v_serie
  from public.series_documentarias
  where id = p_serie_id
    and empresa_id = p_empresa_id
  for update;

  case v_serie.documento
    when 'Activo' then
      select coalesce(max((substring(codigo from '([0-9]{5})$'))::numeric), 0)
        into v_max_usado
      from public.activos
      where empresa_id = p_empresa_id
        and codigo ~ '^ACT-[0-9]{5}$';
    when 'caso_servicio' then
      select greatest(
        coalesce((select max(numero_caso)::numeric from public.recepciones_activos_cliente where empresa_id = p_empresa_id), 0),
        coalesce((select max(numero_caso)::numeric from public.cotizaciones where empresa_id = p_empresa_id), 0),
        coalesce((select max(numero_caso)::numeric from public.cotizaciones_especiales where empresa_id = p_empresa_id), 0),
        coalesce((select max(numero_caso)::numeric from public.os_clientes where empresa_id = p_empresa_id), 0),
        coalesce((select max(numero_caso)::numeric from public.ordenes_trabajo where empresa_id = p_empresa_id), 0)
      ) into v_max_usado;
    when 'Cotizaciones' then
      select greatest(
        coalesce((select max((substring(numero from '([0-9]{4})$'))::numeric) from public.cotizaciones where empresa_id = p_empresa_id and numero ~ '^COT-[0-9]{4}-[0-9]{4}$'), 0),
        coalesce((select max((substring(numero from '([0-9]{4})$'))::numeric) from public.cotizaciones_especiales where empresa_id = p_empresa_id and numero ~ '^COT-[0-9]{4}-[0-9]{4}$'), 0)
      ) into v_max_usado;
    when 'OS Cliente' then
      select coalesce(max((substring(numero from '([0-9]{4})$'))::numeric), 0)
        into v_max_usado
      from public.os_clientes
      where empresa_id = p_empresa_id
        and numero ~ '^OSC-[0-9]{4}-[0-9]{4}$';
    when 'Ordenes de Trabajo' then
      select coalesce(max((substring(numero from '([0-9]{4})$'))::numeric), 0)
        into v_max_usado
      from public.ordenes_trabajo
      where empresa_id = p_empresa_id
        and numero ~ '^OT-[0-9]{2}-[0-9]{4}$';
    when 'Proyectos' then
      select coalesce(max((substring(codigo from '([0-9]{4})$'))::numeric), 0)
        into v_max_usado
      from public.proyectos
      where empresa_id = p_empresa_id
        and codigo ~ '^PROY-[0-9]{4}-[0-9]{4}$';
    else
      raise exception 'No existe un cálculo de máximo usado aprobado para la serie documental %.', v_serie.documento
        using errcode = '22023';
  end case;

  v_minimo_permitido := greatest(v_serie.siguiente_correlativo, v_max_usado + 1);
  if p_nuevo_correlativo < v_minimo_permitido then
    raise exception 'El correlativo % es menor que el mínimo seguro % (máximo usado: %).',
      p_nuevo_correlativo, v_minimo_permitido, v_max_usado
      using errcode = '22023';
  end if;

  update public.series_documentarias
     set siguiente_correlativo = p_nuevo_correlativo,
         updated_at = now()
   where id = v_serie.id
  returning * into v_resultado;

  insert into public.series_documentarias_ajustes_auditoria (
    empresa_id,
    serie_id,
    documento,
    valor_anterior,
    valor_nuevo,
    ajustado_por
  ) values (
    p_empresa_id,
    v_serie.id,
    v_serie.documento,
    v_serie.siguiente_correlativo,
    p_nuevo_correlativo,
    auth.uid()
  );

  return jsonb_build_object(
    'serie', to_jsonb(v_resultado),
    'maximo_usado', v_max_usado,
    'minimo_permitido', v_minimo_permitido
  );
end;
$$;

revoke all on function public.ajustar_siguiente_correlativo_serie(text, text, numeric) from public, anon;
grant execute on function public.ajustar_siguiente_correlativo_serie(text, text, numeric) to authenticated, service_role;

-- La pantalla puede editar metadatos, pero el siguiente_correlativo solo cambia por RPC.
revoke update on table public.series_documentarias from public, anon, authenticated;
grant update (documento, serie, regla, estado, updated_at)
  on table public.series_documentarias to authenticated;
grant all on table public.series_documentarias to service_role;
