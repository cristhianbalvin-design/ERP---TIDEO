-- Catálogo de fabricantes y números de parte equivalentes por material.
-- El número OEM sigue editándose exclusivamente en materiales.nro_parte.

create or replace function public.normalizar_texto_matching(p_valor text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
    translate(upper(btrim(coalesce(p_valor, ''))), 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
    '\s+', ' ', 'g'
  );
$$;

create table if not exists public.fabricantes (
  id                  text primary key,
  empresa_id          text not null references public.empresas(id) on delete cascade,
  codigo              text not null,
  nombre              text not null,
  nombre_normalizado  text not null,
  estado              text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint fabricantes_empresa_codigo_key unique (empresa_id, codigo),
  constraint fabricantes_empresa_nombre_normalizado_key unique (empresa_id, nombre_normalizado)
);

create or replace function public.preparar_fabricante()
returns trigger
language plpgsql
as $$
begin
  new.nombre := btrim(new.nombre);
  new.nombre_normalizado := public.normalizar_texto_matching(new.nombre);
  if new.nombre_normalizado = '' then
    raise exception 'El nombre del fabricante es obligatorio.';
  end if;
  if nullif(btrim(coalesce(new.codigo, '')), '') is null then
    new.codigo := 'FAB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_preparar_fabricante on public.fabricantes;
create trigger trg_preparar_fabricante
  before insert or update of codigo, nombre on public.fabricantes
  for each row execute function public.preparar_fabricante();

create index if not exists idx_fabricantes_empresa_estado
  on public.fabricantes (empresa_id, estado, nombre_normalizado);

alter table public.fabricantes enable row level security;
drop policy if exists fabricantes_tenant_isolation on public.fabricantes;
create policy fabricantes_tenant_isolation on public.fabricantes
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.material_numeros_parte (
  id              text primary key,
  empresa_id      text not null references public.empresas(id) on delete cascade,
  material_id     text not null references public.materiales(id) on delete cascade,
  numero_parte    text not null,
  tipo            text not null check (tipo in ('original', 'alternativo')),
  fabricante_id   text references public.fabricantes(id) on delete set null,
  orden           smallint,
  notas           text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint material_numeros_parte_material_numero_key unique (material_id, numero_parte),
  constraint material_numeros_parte_orden_check check (
    (tipo = 'original' and orden is null) or
    (tipo = 'alternativo' and orden between 1 and 4)
  )
);

create unique index if not exists material_numeros_parte_un_original
  on public.material_numeros_parte (material_id) where tipo = 'original';
create unique index if not exists material_numeros_parte_orden_alternativo
  on public.material_numeros_parte (material_id, orden) where tipo = 'alternativo';
create index if not exists idx_material_numeros_parte_busqueda
  on public.material_numeros_parte (empresa_id, numero_parte) where activo;

create or replace function public.validar_material_numero_parte()
returns trigger
language plpgsql
as $$
declare
  v_empresa_material text;
  v_empresa_fabricante text;
  v_total_alternativos integer;
begin
  new.numero_parte := btrim(new.numero_parte);
  if new.numero_parte = '' then
    raise exception 'El número de parte es obligatorio.';
  end if;

  select empresa_id into v_empresa_material from public.materiales where id = new.material_id;
  if v_empresa_material is null or v_empresa_material <> new.empresa_id then
    raise exception 'El material debe pertenecer a la misma empresa.';
  end if;

  if new.fabricante_id is not null then
    select empresa_id into v_empresa_fabricante from public.fabricantes where id = new.fabricante_id;
    if v_empresa_fabricante is null or v_empresa_fabricante <> new.empresa_id then
      raise exception 'El fabricante debe pertenecer a la misma empresa.';
    end if;
  end if;

  if new.tipo = 'alternativo' then
    select count(*) into v_total_alternativos
      from public.material_numeros_parte
     where material_id = new.material_id
       and tipo = 'alternativo'
       and id <> coalesce(new.id, '');
    if v_total_alternativos >= 4 then
      raise exception 'Un material puede tener como máximo 4 números de parte alternativos.';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validar_material_numero_parte on public.material_numeros_parte;
create trigger trg_validar_material_numero_parte
  before insert or update on public.material_numeros_parte
  for each row execute function public.validar_material_numero_parte();

create or replace function public.sincronizar_numero_parte_original_material()
returns trigger
language plpgsql
as $$
begin
  if nullif(btrim(coalesce(new.nro_parte, '')), '') is null then
    delete from public.material_numeros_parte
      where material_id = new.id and tipo = 'original';
  else
    insert into public.material_numeros_parte (
      id, empresa_id, material_id, numero_parte, tipo, fabricante_id, orden, activo
    ) values (
      'mnp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
      new.empresa_id, new.id, btrim(new.nro_parte), 'original', null, null, true
    ) on conflict (material_id) where tipo = 'original'
      do update set numero_parte = excluded.numero_parte,
                    empresa_id = excluded.empresa_id,
                    activo = true,
                    updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_materiales_numero_parte_original on public.materiales;
create trigger trg_materiales_numero_parte_original
  after insert or update of nro_parte, empresa_id on public.materiales
  for each row execute function public.sincronizar_numero_parte_original_material();

-- Hace consultables los originales que ya existían antes de la migración.
insert into public.material_numeros_parte (id, empresa_id, material_id, numero_parte, tipo, activo)
select 'mnp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
       m.empresa_id, m.id, btrim(m.nro_parte), 'original', true
  from public.materiales m
 where nullif(btrim(coalesce(m.nro_parte, '')), '') is not null
on conflict do nothing;

alter table public.material_numeros_parte enable row level security;
drop policy if exists material_numeros_parte_tenant_isolation on public.material_numeros_parte;
create policy material_numeros_parte_tenant_isolation on public.material_numeros_parte
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

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
    insert into public.material_numeros_parte (
      id, empresa_id, material_id, numero_parte, tipo, fabricante_id, orden, notas, activo
    ) values (
      'mnp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
      p_empresa_id, p_material_id, v_numero, 'alternativo', v_fabricante_id, v_orden,
      nullif(btrim(v_item ->> 'notas'), ''), coalesce((v_item ->> 'activo')::boolean, true)
    );
  end loop;
end;
$$;

grant select, insert, update, delete on public.fabricantes, public.material_numeros_parte to authenticated, service_role;
grant execute on function public.reemplazar_material_numeros_alternativos(text, text, jsonb) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
