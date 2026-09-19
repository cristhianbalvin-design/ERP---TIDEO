-- TIDEO ERP - Integridad tenant de la relacion proveedor <-> familia.
-- No modifica columnas ni carga datos.

create or replace function public.validar_proveedor_familia_tenant()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_proveedor_empresa_id text;
  v_familia_empresa_id text;
begin
  select p.empresa_id
    into v_proveedor_empresa_id
    from public.proveedores p
   where p.id = new.proveedor_id;

  select f.empresa_id
    into v_familia_empresa_id
    from public.material_familias f
   where f.id = new.familia_id;

  if v_proveedor_empresa_id is null
     or v_familia_empresa_id is null
     or new.empresa_id is null
     or v_proveedor_empresa_id is distinct from new.empresa_id
     or v_familia_empresa_id is distinct from new.empresa_id then
    raise exception using
      errcode = '23514',
      message = 'La relacion proveedor_familia debe pertenecer a un unico tenant.',
      detail = format(
        'empresa_id=%s, proveedor.empresa_id=%s, familia.empresa_id=%s',
        new.empresa_id,
        coalesce(v_proveedor_empresa_id, '<inexistente>'),
        coalesce(v_familia_empresa_id, '<inexistente>')
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_proveedor_familia_tenant
  on public.proveedor_familia;

create trigger trg_validar_proveedor_familia_tenant
before insert or update on public.proveedor_familia
for each row
execute function public.validar_proveedor_familia_tenant();

notify pgrst, 'reload schema';

