-- SPOT / Bloque 3a: cuentas bancarias de proveedores.
-- La cuenta pertenece al proveedor; no reutiliza cuentas_bancarias, que son
-- cuentas propias de la empresa.

do $guard$
begin
  if to_regclass('public.proveedor_cuentas_bancarias') is not null then
    raise exception 'B3A|proveedor_cuentas_bancarias ya existe; no se reemplaza una instalacion previa';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'validar_tenant_proveedor_cuenta_bancaria',
        'validar_proveedor_cuenta_banco_nacion_permiso'
      )
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    raise exception 'B3A|funcion de integridad ya existe; no se reemplaza sin pg_get_functiondef remoto';
  end if;
end;
$guard$;

create table public.proveedor_cuentas_bancarias (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  proveedor_id text not null references public.proveedores(id) on delete restrict,
  alias text,
  banco text not null,
  tipo_cuenta text not null default 'corriente',
  numero_cuenta text,
  cci text,
  moneda text not null default 'PEN',
  es_cuenta_banco_nacion boolean not null default false,
  estado text not null default 'activo',
  observaciones text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proveedor_cuentas_bancarias_banco_no_vacio check (btrim(banco) <> ''),
  constraint proveedor_cuentas_bancarias_identificador check (
    nullif(regexp_replace(coalesce(numero_cuenta, ''), '\s+', '', 'g'), '') is not null
    or nullif(regexp_replace(coalesce(cci, ''), '\s+', '', 'g'), '') is not null
  ),
  constraint proveedor_cuentas_bancarias_moneda check (moneda in ('PEN', 'USD')),
  constraint proveedor_cuentas_bancarias_estado check (estado in ('activo', 'inactivo')),
  constraint proveedor_cuentas_bancarias_bn_pen check (
    not es_cuenta_banco_nacion or moneda = 'PEN'
  )
);

comment on table public.proveedor_cuentas_bancarias is
  'Cuentas bancarias declaradas por proveedores, incluida la cuenta BN para SPOT.';
comment on column public.proveedor_cuentas_bancarias.es_cuenta_banco_nacion is
  'Indica que la cuenta es la cuenta del Banco de la Nacion del proveedor para depositos SPOT.';

create unique index proveedor_cuentas_bancarias_identidad_unq
  on public.proveedor_cuentas_bancarias (
    empresa_id,
    proveedor_id,
    lower(regexp_replace(btrim(banco), '\s+', ' ', 'g')),
    regexp_replace(lower(coalesce(numero_cuenta, '')), '[^[:alnum:]]', '', 'g'),
    regexp_replace(lower(coalesce(cci, '')), '[^[:alnum:]]', '', 'g')
  );

create unique index proveedor_cuentas_bancarias_bn_activa_unq
  on public.proveedor_cuentas_bancarias (empresa_id, proveedor_id)
  where es_cuenta_banco_nacion and estado = 'activo';

create function public.validar_tenant_proveedor_cuenta_bancaria()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_proveedor_empresa_id text;
begin
  select p.empresa_id
    into v_proveedor_empresa_id
  from public.proveedores p
  where p.id = new.proveedor_id;

  if v_proveedor_empresa_id is null then
    raise exception 'El proveedor no existe o no tiene empresa asignada.';
  end if;

  if new.empresa_id is distinct from v_proveedor_empresa_id then
    raise exception 'La cuenta bancaria y el proveedor deben pertenecer a la misma empresa.';
  end if;

  return new;
end;
$function$;

create function public.validar_proveedor_cuenta_banco_nacion_permiso()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if auth.uid() is not null
     and (
       tg_op = 'INSERT' and coalesce(new.es_cuenta_banco_nacion, false)
       or tg_op = 'UPDATE' and new.es_cuenta_banco_nacion is distinct from old.es_cuenta_banco_nacion
     )
     and not public.usuario_puede(new.empresa_id, 'proveedores', 'editar') then
    raise exception 'Solo un usuario con permiso proveedores.editar puede cambiar la cuenta Banco de la Nacion del proveedor.';
  end if;

  return new;
end;
$function$;

revoke all on function public.validar_tenant_proveedor_cuenta_bancaria() from public, anon, authenticated;
revoke all on function public.validar_proveedor_cuenta_banco_nacion_permiso() from public, anon, authenticated;

create trigger proveedor_cuentas_bancarias_tenant_trg
before insert or update on public.proveedor_cuentas_bancarias
for each row execute function public.validar_tenant_proveedor_cuenta_bancaria();

create trigger proveedor_cuentas_bancarias_bn_permiso_trg
before insert or update on public.proveedor_cuentas_bancarias
for each row execute function public.validar_proveedor_cuenta_banco_nacion_permiso();

alter table public.proveedor_cuentas_bancarias enable row level security;
alter table public.proveedor_cuentas_bancarias force row level security;

grant select, insert, update, delete on public.proveedor_cuentas_bancarias to authenticated;

create policy pcb_select on public.proveedor_cuentas_bancarias
for select to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'proveedores', 'ver')
);

create policy pcb_insert on public.proveedor_cuentas_bancarias
for insert to authenticated
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'proveedores', 'crear')
);

create policy pcb_update on public.proveedor_cuentas_bancarias
for update to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'proveedores', 'editar')
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'proveedores', 'editar')
);

create policy pcb_delete on public.proveedor_cuentas_bancarias
for delete to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'proveedores', 'anular')
);

do $validate$
declare
  v_relid oid;
  v_fn oid;
begin
  select c.oid into v_relid
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'proveedor_cuentas_bancarias';

  if v_relid is null then raise exception 'B3A_VALIDACION|tabla ausente'; end if;
  if not exists (
    select 1 from pg_attribute a
    where a.attrelid = v_relid and a.attname = 'es_cuenta_banco_nacion' and not a.attisdropped
  ) then raise exception 'B3A_VALIDACION|columna BN ausente'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'proveedor_cuentas_bancarias_identidad_unq') then
    raise exception 'B3A_VALIDACION|indice de identidad ausente';
  end if;
  if not exists (select 1 from pg_indexes where indexname = 'proveedor_cuentas_bancarias_bn_activa_unq') then
    raise exception 'B3A_VALIDACION|indice BN activa ausente';
  end if;
  if (select count(*) from pg_policy where polrelid = v_relid) <> 4 then
    raise exception 'B3A_VALIDACION|se esperaban cuatro politicas RLS';
  end if;
  if (select count(*) from pg_trigger where tgrelid = v_relid and not tgisinternal) <> 2 then
    raise exception 'B3A_VALIDACION|se esperaban dos triggers funcionales';
  end if;

  select p.oid into v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'validar_proveedor_cuenta_banco_nacion_permiso'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_fn is null
     or pg_get_functiondef(v_fn) not like '%usuario_puede(new.empresa_id, ''proveedores'', ''editar'')%' then
    raise exception 'B3A_VALIDACION|proteccion BN sin proveedores.editar';
  end if;

  raise notice 'B3A_VALIDACION|tabla=ok|indices=identidad+BN_activa|rls=4|triggers=tenant+permiso';
end;
$validate$;
