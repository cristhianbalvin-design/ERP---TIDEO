-- Diagnóstico de fabricación · características ligadas a una parte del dibujo del catálogo.
-- Decisión (Cristhian, 2026-10-27): si el plano de la pieza es un dibujo del catálogo, tocar una parte
-- (zona) la marca y pone el pin; la característica puede tomar una de las medidas definidas para esa
-- parte. Solo cambios aditivos: dos columnas opcionales y sus validaciones.

set lock_timeout = '10s';

alter table public.diagnostico_fabricacion_caracteristicas
  add column if not exists zona_id text,
  add column if not exists medida_id text;

comment on column public.diagnostico_fabricacion_caracteristicas.zona_id is 'Parte del dibujo del catálogo (catalogo_componente_zonas.id del componente de la pieza).';
comment on column public.diagnostico_fabricacion_caracteristicas.medida_id is 'Medida del catálogo para esa parte (catalogo_componente_medidas.id).';

-- La parte y la medida deben existir en el dibujo del catálogo que usa la pieza.
create or replace function public.validar_zona_caracteristica_fabricacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pieza record;
begin
  if new.zona_id is null then
    if new.medida_id is not null then
      raise exception 'La medida del catálogo necesita la parte del dibujo.' using errcode = '22023';
    end if;
    return new;
  end if;

  select p.plano_origen, p.componente_catalogo_id into v_pieza
    from public.diagnostico_fabricacion_piezas p
   where p.id = new.pieza_id;

  if v_pieza.plano_origen is distinct from 'catalogo' or v_pieza.componente_catalogo_id is null then
    raise exception 'Solo los planos del catálogo tienen partes.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.catalogo_componente_zonas z
     where z.componente_id = v_pieza.componente_catalogo_id and z.id = new.zona_id
  ) then
    raise exception 'La parte elegida no pertenece al dibujo de la pieza.' using errcode = '22023';
  end if;
  if new.medida_id is not null and not exists (
    select 1 from public.catalogo_componente_medidas m
     where m.componente_id = v_pieza.componente_catalogo_id and m.zona_id = new.zona_id and m.id = new.medida_id
  ) then
    raise exception 'La medida elegida no pertenece a esa parte del dibujo.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.validar_zona_caracteristica_fabricacion() from public, anon;

drop trigger if exists b_validar_zona_caracteristica_fabricacion on public.diagnostico_fabricacion_caracteristicas;
create trigger b_validar_zona_caracteristica_fabricacion
  before insert or update of zona_id, medida_id, pieza_id on public.diagnostico_fabricacion_caracteristicas
  for each row execute function public.validar_zona_caracteristica_fabricacion();

-- Si la pieza cambia de plano (otro dibujo o un plano subido), sus características pierden la parte y la medida.
create or replace function public.limpiar_zonas_al_cambiar_plano_fabricacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plano_origen is distinct from old.plano_origen
     or new.componente_catalogo_id is distinct from old.componente_catalogo_id then
    update public.diagnostico_fabricacion_caracteristicas
       set zona_id = null, medida_id = null
     where pieza_id = new.id and (zona_id is not null or medida_id is not null);
  end if;
  return new;
end;
$$;

revoke all on function public.limpiar_zonas_al_cambiar_plano_fabricacion() from public, anon;

drop trigger if exists c_limpiar_zonas_al_cambiar_plano on public.diagnostico_fabricacion_piezas;
create trigger c_limpiar_zonas_al_cambiar_plano
  after update of plano_origen, componente_catalogo_id on public.diagnostico_fabricacion_piezas
  for each row execute function public.limpiar_zonas_al_cambiar_plano_fabricacion();

-- Comprobación
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'diagnostico_fabricacion_caracteristicas'
         and column_name in ('zona_id', 'medida_id')) <> 2 then
    raise exception 'VERIFY: faltan columnas zona_id/medida_id';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'b_validar_zona_caracteristica_fabricacion') then
    raise exception 'VERIFY: falta el trigger de validación de zona';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'c_limpiar_zonas_al_cambiar_plano') then
    raise exception 'VERIFY: falta el trigger de limpieza de zonas';
  end if;
end $$;
