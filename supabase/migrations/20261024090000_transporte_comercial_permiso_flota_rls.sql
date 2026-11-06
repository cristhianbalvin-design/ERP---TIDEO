-- Permiso de transporte comercial para flota y políticas por acción.
begin;

do $preflight$
declare
  v_policy_count integer;
begin
  if to_regclass('public.permisos_roles') is null then
    raise exception 'TRANSPORTE_COMERCIAL_PREFLIGHT: falta public.permisos_roles';
  end if;
  if to_regclass('public.roles') is null then
    raise exception 'TRANSPORTE_COMERCIAL_PREFLIGHT: falta public.roles';
  end if;
  if to_regclass('public.vehiculos_transporte') is null then
    raise exception 'TRANSPORTE_COMERCIAL_PREFLIGHT: falta public.vehiculos_transporte';
  end if;
  if to_regclass('public.conductores_transporte') is null then
    raise exception 'TRANSPORTE_COMERCIAL_PREFLIGHT: falta public.conductores_transporte';
  end if;
  if to_regprocedure('public.usuario_tiene_empresa(text)') is null then
    raise exception 'TRANSPORTE_COMERCIAL_PREFLIGHT: falta usuario_tiene_empresa(text)';
  end if;
  if to_regprocedure('public.usuario_puede(text,text,text)') is null then
    raise exception 'TRANSPORTE_COMERCIAL_PREFLIGHT: falta usuario_puede(text,text,text)';
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename in ('vehiculos_transporte', 'conductores_transporte')
    and policyname in (
      'vehiculos_transporte_select', 'vehiculos_transporte_insert',
      'vehiculos_transporte_update', 'vehiculos_transporte_delete',
      'conductores_transporte_select', 'conductores_transporte_insert',
      'conductores_transporte_update', 'conductores_transporte_delete'
    );
  if v_policy_count <> 8 then
    raise exception 'TRANSPORTE_COMERCIAL_PREFLIGHT: se esperaban 8 políticas de flota y se encontraron %', v_policy_count;
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('vehiculos_transporte', 'conductores_transporte')
      and policyname in (
        'vehiculos_transporte_select', 'vehiculos_transporte_insert',
        'vehiculos_transporte_update', 'vehiculos_transporte_delete',
        'conductores_transporte_select', 'conductores_transporte_insert',
        'conductores_transporte_update', 'conductores_transporte_delete'
      )
      and (
        (cmd <> 'INSERT' and (
          coalesce(qual, '') not like '%usuario_tiene_empresa%'
          or coalesce(qual, '') not like '%ordenes_compra%'
        ))
        or (cmd in ('INSERT', 'UPDATE') and (
          coalesce(with_check, '') not like '%usuario_tiene_empresa%'
          or coalesce(with_check, '') not like '%ordenes_compra%'
        ))
      )
  ) then
    raise exception 'TRANSPORTE_COMERCIAL_PREFLIGHT: una política de flota no coincide con el tenant y permiso ordenes_compra esperados';
  end if;
end
$preflight$;

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select
  r.id,
  'transporte_comercial',
  true,
  (lower(coalesce(r.categoria, '')) in ('operaciones', 'logistica')
    and lower(coalesce(r.nivel_jerarquico, '')) in ('direccion', 'jefatura', 'gerencia_de_operaciones', 'supervisor', 'planeamiento', 'logistica'))
    or (lower(coalesce(r.categoria, '')) = 'comercial'
      and lower(coalesce(r.nivel_jerarquico, '')) in ('direccion', 'jefatura')),
  (lower(coalesce(r.categoria, '')) in ('operaciones', 'logistica')
    and lower(coalesce(r.nivel_jerarquico, '')) in ('direccion', 'jefatura', 'gerencia_de_operaciones', 'supervisor', 'planeamiento', 'logistica'))
    or (lower(coalesce(r.categoria, '')) = 'comercial'
      and lower(coalesce(r.nivel_jerarquico, '')) in ('direccion', 'jefatura')),
  (lower(coalesce(r.categoria, '')) in ('operaciones', 'logistica')
    and lower(coalesce(r.nivel_jerarquico, '')) in ('direccion', 'jefatura', 'gerencia_de_operaciones')),
  false,
  false,
  false,
  false
from public.roles r
where r.activo = true
  and coalesce(r.es_superadmin, false) = false
  and coalesce(r.es_admin_empresa, false) = false
  and (
    (lower(coalesce(r.categoria, '')) in ('operaciones', 'logistica')
      and lower(coalesce(r.nivel_jerarquico, '')) in ('direccion', 'jefatura', 'gerencia_de_operaciones', 'supervisor', 'planeamiento', 'logistica'))
    or (lower(coalesce(r.categoria, '')) = 'comercial'
      and lower(coalesce(r.nivel_jerarquico, '')) in ('direccion', 'jefatura'))
  )
on conflict (rol_id, pantalla) do nothing;

alter policy vehiculos_transporte_select on public.vehiculos_transporte
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'ver')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'ver')
  )
);
alter policy vehiculos_transporte_insert on public.vehiculos_transporte
with check (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'crear')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'crear')
  )
);
alter policy vehiculos_transporte_update on public.vehiculos_transporte
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'editar')
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'editar')
  )
);
alter policy vehiculos_transporte_delete on public.vehiculos_transporte
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'anular')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'anular')
  )
);

alter policy conductores_transporte_select on public.conductores_transporte
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'ver')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'ver')
  )
);
alter policy conductores_transporte_insert on public.conductores_transporte
with check (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'crear')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'crear')
  )
);
alter policy conductores_transporte_update on public.conductores_transporte
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'editar')
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'editar')
  )
);
alter policy conductores_transporte_delete on public.conductores_transporte
using (
  public.usuario_tiene_empresa(empresa_id)
  and (
    public.usuario_puede(empresa_id, 'ordenes_compra', 'anular')
    or public.usuario_puede(empresa_id, 'transporte_comercial', 'anular')
  )
);

do $postflight$
declare
  v_permission_count integer;
  v_policy_count integer;
begin
  select count(*) into v_permission_count
  from public.permisos_roles
  where pantalla = 'transporte_comercial';
  if v_permission_count = 0 then
    raise exception 'TRANSPORTE_COMERCIAL_POSTFLIGHT: no hay permisos para la pantalla transporte_comercial';
  end if;

  select count(*) into v_policy_count
  from pg_policies p
  where p.schemaname = 'public'
    and p.tablename in ('vehiculos_transporte', 'conductores_transporte')
    and p.policyname in (
      'vehiculos_transporte_select', 'vehiculos_transporte_insert',
      'vehiculos_transporte_update', 'vehiculos_transporte_delete',
      'conductores_transporte_select', 'conductores_transporte_insert',
      'conductores_transporte_update', 'conductores_transporte_delete'
    )
    and (
      (p.cmd <> 'INSERT' and
        coalesce(p.qual, '') like '%usuario_tiene_empresa%' and
        coalesce(p.qual, '') like '%ordenes_compra%' and
        coalesce(p.qual, '') like '%transporte_comercial%')
      or (p.cmd = 'INSERT' and
        coalesce(p.with_check, '') like '%usuario_tiene_empresa%' and
        coalesce(p.with_check, '') like '%ordenes_compra%' and
        coalesce(p.with_check, '') like '%transporte_comercial%')
    )
    and (
      p.cmd not in ('INSERT', 'UPDATE')
      or (
        coalesce(p.with_check, '') like '%usuario_tiene_empresa%'
        and coalesce(p.with_check, '') like '%ordenes_compra%'
        and coalesce(p.with_check, '') like '%transporte_comercial%'
      )
    );
  if v_policy_count <> 8 then
    raise exception 'TRANSPORTE_COMERCIAL_POSTFLIGHT: las 8 políticas deben exigir tenant y ambos permisos; verificadas %', v_policy_count;
  end if;
end
$postflight$;

commit;


