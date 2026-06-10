-- Fase 1A: Maestro de Cargos — normalización, FK y RPC fusionar
-- Convierte cargo de texto libre a referencia normalizada en cargos_empresa

-- Extensión para eliminar diacríticos en la normalización
create extension if not exists unaccent;

-- ─── 1. Columnas FK en tablas de personal ────────────────────────────────────
alter table public.personal_operativo
  add column if not exists cargo_id text references public.cargos_empresa(id) on delete set null;

alter table public.personal_administrativo
  add column if not exists cargo_id text references public.cargos_empresa(id) on delete set null;

create index if not exists idx_personal_op_cargo_id  on public.personal_operativo(cargo_id);
create index if not exists idx_personal_adm_cargo_id on public.personal_administrativo(cargo_id);

-- ─── 2. RPC: fusionar_cargos ─────────────────────────────────────────────────
-- Reapunta todas las fichas del cargo origen al destino y desactiva el origen.
create or replace function public.fusionar_cargos(
  p_cargo_origen_id  text,
  p_cargo_destino_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
begin
  -- Cargo destino válido y accesible para el usuario
  select empresa_id into v_empresa_id
  from public.cargos_empresa
  where id = p_cargo_destino_id;

  if not found then
    raise exception 'Cargo destino no encontrado';
  end if;

  if not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  -- Cargo origen debe pertenecer al mismo tenant
  if not exists (
    select 1 from public.cargos_empresa
    where id = p_cargo_origen_id and empresa_id = v_empresa_id
  ) then
    raise exception 'El cargo origen no pertenece al mismo tenant';
  end if;

  if p_cargo_origen_id = p_cargo_destino_id then
    raise exception 'Origen y destino deben ser cargos distintos';
  end if;

  -- Reapuntar fichas
  update public.personal_operativo
    set cargo_id = p_cargo_destino_id
    where cargo_id = p_cargo_origen_id;

  update public.personal_administrativo
    set cargo_id = p_cargo_destino_id
    where cargo_id = p_cargo_origen_id;

  -- Desactivar origen (no eliminar — regla de auditoría del sistema)
  update public.cargos_empresa
    set estado = 'inactivo', updated_at = now()
    where id = p_cargo_origen_id;
end;
$$;

-- ─── 3. Migración de datos: normalizar cargo texto → cargo_id ────────────────
-- Itera por tenant, agrupa variantes por clave normalizada, crea entradas en
-- cargos_empresa donde no existan y popula cargo_id en las fichas.
-- Seguro re-ejecutar (guarda WHERE cargo_id IS NULL).
do $$
declare
  r_empresa    record;
  r_norm       record;
  v_existing   text;
  v_new_id     text;
  v_tipo       text;
  v_seq        int;
  v_placeholders text[];
begin
  v_placeholders := array[
    '', 'por definir', 'por_definir', 'sin definir', 'sin asignar',
    'n/a', 'na', '-', 'pendiente', 'sin cargo', 'no definido'
  ];

  for r_empresa in
    select distinct empresa_id from (
      select empresa_id from public.personal_operativo
        where cargo is not null and trim(cargo) <> ''
      union
      select empresa_id from public.personal_administrativo
        where cargo is not null and trim(cargo) <> ''
    ) s
  loop
    -- Máximo número de código CAR-NNN existente para este tenant
    select coalesce(max(
      case when codigo ~ '^CAR-[0-9]+$'
      then (regexp_match(codigo, '([0-9]+)$'))[1]::int
      else 0 end
    ), 0) into v_seq
    from public.cargos_empresa
    where empresa_id = r_empresa.empresa_id;

    -- Por cada clave normalizada distinta de este tenant
    for r_norm in
      with raw as (
        select cargo, 'Operativo' as src
        from public.personal_operativo
        where empresa_id = r_empresa.empresa_id
          and cargo is not null
          and lower(trim(cargo)) <> all(v_placeholders)

        union all

        select cargo, 'Administrativo' as src
        from public.personal_administrativo
        where empresa_id = r_empresa.empresa_id
          and cargo is not null
          and lower(trim(cargo)) <> all(v_placeholders)
      ),
      with_norm as (
        select cargo, src,
          unaccent(lower(regexp_replace(trim(cargo), '\s+', ' ', 'g'))) as norm_key
        from raw
        where trim(cargo) <> ''
      ),
      counted as (
        select norm_key, src, cargo, count(*) as cnt
        from with_norm
        group by norm_key, src, cargo
      ),
      grouped as (
        select
          norm_key,
          array_agg(distinct src) as sources,
          -- Nombre canónico: mayor frecuencia, en empate el más largo, luego alfa
          (select cargo from counted c2
           where c2.norm_key = counted.norm_key
           order by c2.cnt desc, length(c2.cargo) desc, c2.cargo
           limit 1) as canonical_name
        from counted
        group by norm_key
      )
      select * from grouped
    loop
      -- Determinar ámbito
      if 'Operativo' = any(r_norm.sources) and 'Administrativo' = any(r_norm.sources) then
        v_tipo := 'Ambos';
      elsif 'Operativo' = any(r_norm.sources) then
        v_tipo := 'Operativo';
      else
        v_tipo := 'Administrativo';
      end if;

      -- Buscar cargo existente con la misma clave normalizada
      select id into v_existing
      from public.cargos_empresa
      where empresa_id = r_empresa.empresa_id
        and unaccent(lower(regexp_replace(trim(nombre), '\s+', ' ', 'g'))) = r_norm.norm_key
      limit 1;

      if v_existing is not null then
        -- Actualizar tipo si es necesario (solo se amplía, nunca se reduce)
        update public.cargos_empresa
        set tipo = case
          when tipo = v_tipo then tipo
          when v_tipo = 'Ambos' then 'Ambos'
          when tipo = 'Operativo'      and v_tipo = 'Administrativo' then 'Ambos'
          when tipo = 'Administrativo' and v_tipo = 'Operativo'      then 'Ambos'
          else tipo
        end,
        updated_at = now()
        where id = v_existing;

        v_new_id := v_existing;
      else
        -- Crear entrada nueva en el catálogo
        v_seq   := v_seq + 1;
        v_new_id := 'car_' || left(replace(gen_random_uuid()::text, '-', ''), 18);

        insert into public.cargos_empresa(id, empresa_id, codigo, nombre, tipo, estado, created_at, updated_at)
        values (
          v_new_id,
          r_empresa.empresa_id,
          'CAR-' || lpad(v_seq::text, 3, '0'),
          r_norm.canonical_name,
          v_tipo,
          'activo',
          now(), now()
        );
      end if;

      -- Poblar cargo_id en personal_operativo (no tocar los ya asignados)
      update public.personal_operativo
      set cargo_id = v_new_id
      where empresa_id = r_empresa.empresa_id
        and cargo_id is null
        and cargo is not null
        and lower(trim(cargo)) <> all(v_placeholders)
        and unaccent(lower(regexp_replace(trim(cargo), '\s+', ' ', 'g'))) = r_norm.norm_key;

      -- Poblar cargo_id en personal_administrativo
      update public.personal_administrativo
      set cargo_id = v_new_id
      where empresa_id = r_empresa.empresa_id
        and cargo_id is null
        and cargo is not null
        and lower(trim(cargo)) <> all(v_placeholders)
        and unaccent(lower(regexp_replace(trim(cargo), '\s+', ' ', 'g'))) = r_norm.norm_key;

    end loop;
  end loop;
end;
$$;

select pg_notify('pgrst', 'reload schema');
