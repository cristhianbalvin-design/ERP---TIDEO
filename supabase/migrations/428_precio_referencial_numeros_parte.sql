-- Precio referencial por número de parte. Es independiente de
-- materiales.precio_unitario, que continúa siendo el precio oficial del material.

alter table public.material_numeros_parte
  add column if not exists precio_referencial numeric(14,4),
  add column if not exists moneda text not null default 'PEN';

alter table public.material_numeros_parte
  drop constraint if exists material_numeros_parte_precio_referencial_check,
  drop constraint if exists material_numeros_parte_moneda_check;

alter table public.material_numeros_parte
  add constraint material_numeros_parte_precio_referencial_check
    check (precio_referencial is null or precio_referencial >= 0),
  add constraint material_numeros_parte_moneda_check
    check (moneda in ('PEN', 'USD'));

create or replace function public.reemplazar_material_numeros_alternativos(
  p_empresa_id text,
  p_material_id text,
  p_alternativos jsonb default '[]'::jsonb
) returns void
language plpgsql
as $$
declare
  v_item jsonb;
  v_numero text;
  v_fabricante_id text;
  v_precio_referencial numeric;
  v_moneda text;
  v_orden smallint := 0;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a la empresa indicada.';
  end if;
  if not exists (select 1 from public.materiales where id = p_material_id and empresa_id = p_empresa_id) then
    raise exception 'Material inexistente o fuera de la empresa.';
  end if;
  if jsonb_typeof(coalesce(p_alternativos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_alternativos, '[]'::jsonb)) > 4 then
    raise exception 'Se permiten como máximo 4 números de parte alternativos.';
  end if;

  delete from public.material_numeros_parte
   where material_id = p_material_id and tipo = 'alternativo';

  for v_item in select value from jsonb_array_elements(coalesce(p_alternativos, '[]'::jsonb)) loop
    v_numero := nullif(btrim(v_item ->> 'numero_parte'), '');
    if v_numero is null then
      continue;
    end if;
    v_orden := v_orden + 1;
    v_fabricante_id := nullif(btrim(v_item ->> 'fabricante_id'), '');
    v_moneda := upper(coalesce(nullif(btrim(v_item ->> 'moneda'), ''), 'PEN'));
    if v_moneda not in ('PEN', 'USD') then
      raise exception 'La moneda del precio referencial debe ser PEN o USD.';
    end if;
    begin
      v_precio_referencial := nullif(btrim(v_item ->> 'precio_referencial'), '')::numeric;
    exception when invalid_text_representation then
      raise exception 'El precio referencial debe ser numérico.';
    end;
    if v_precio_referencial is not null and v_precio_referencial < 0 then
      raise exception 'El precio referencial no puede ser negativo.';
    end if;

    insert into public.material_numeros_parte (
      id, empresa_id, material_id, numero_parte, tipo, fabricante_id, orden,
      notas, precio_referencial, moneda, activo
    ) values (
      'mnp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
      p_empresa_id, p_material_id, v_numero, 'alternativo', v_fabricante_id, v_orden,
      nullif(btrim(v_item ->> 'notas'), ''), v_precio_referencial, v_moneda,
      coalesce((v_item ->> 'activo')::boolean, true)
    );
  end loop;
end;
$$;

grant execute on function public.reemplazar_material_numeros_alternativos(text, text, jsonb) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
