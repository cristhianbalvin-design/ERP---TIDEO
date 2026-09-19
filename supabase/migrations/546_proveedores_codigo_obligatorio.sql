-- Garantiza que todo proveedor tenga un codigo unico dentro de su tenant.

create or replace function public.generar_codigo_proveedor(p_empresa_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siguiente bigint;
begin
  if nullif(btrim(p_empresa_id), '') is null then
    raise exception 'No se puede generar un codigo de proveedor sin empresa_id';
  end if;

  -- Serializa la generacion por tenant para evitar colisiones concurrentes.
  perform pg_advisory_xact_lock(hashtextextended(p_empresa_id, 0));

  select coalesce(max((substring(codigo from 5))::bigint), 0) + 1
    into v_siguiente
    from public.proveedores
   where empresa_id = p_empresa_id
     and codigo ~ '^PRV-[0-9]+$';

  return 'PRV-' || lpad(v_siguiente::text, 6, '0');
end;
$$;

create or replace function public.asignar_codigo_proveedor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(new.codigo), '') is null then
    new.codigo := public.generar_codigo_proveedor(new.empresa_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proveedores_codigo on public.proveedores;
create trigger trg_proveedores_codigo
before insert or update of empresa_id, codigo on public.proveedores
for each row execute function public.asignar_codigo_proveedor();

-- Backfill de proveedores creados antes de este trigger.
do $$
declare
  v_proveedor record;
begin
  for v_proveedor in
    select id, empresa_id
      from public.proveedores
     where nullif(btrim(codigo), '') is null
     order by empresa_id, id
  loop
    update public.proveedores
       set codigo = public.generar_codigo_proveedor(v_proveedor.empresa_id)
     where id = v_proveedor.id;
  end loop;
end;
$$;

alter table public.proveedores
  alter column codigo set not null;

alter table public.proveedores
  drop constraint if exists proveedores_codigo_no_vacio;

alter table public.proveedores
  add constraint proveedores_codigo_no_vacio check (btrim(codigo) <> '');

create unique index if not exists uq_proveedores_empresa_codigo
  on public.proveedores (empresa_id, codigo);

notify pgrst, 'reload schema';
