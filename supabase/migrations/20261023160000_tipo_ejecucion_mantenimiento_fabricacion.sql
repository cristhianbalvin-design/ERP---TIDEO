-- F0 · Tipo de ejecución (mantenimiento / fabricación) de punta a punta.
-- Diagnóstico → Hoja de Costeo (por Trabajo) → Cotización → OS Cliente.
-- La OS usa el tipo para ofrecer "Crear OT" (mantenimiento) y/o "Crear OF" (fabricación).
-- Migración aditiva: no modifica filas de hojas_costeo (protegidas cuando están aprobadas).
-- Aplicada en producción el 23/10/2026 en dos partes (tipo_ejecucion_1_hoja_trabajos y
-- tipo_ejecucion_2_funcion_y_columnas) más la carga de datos de la sección 4 con su comprobación.

-- 1. Tipo por Trabajo dentro de una hoja ---------------------------------------
create table if not exists public.hoja_costeo_trabajos (
  hoja_costeo_id text not null references public.hojas_costeo(id) on delete cascade,
  familia_trabajo_id uuid not null references public.familia_trabajo(id),
  tipo_ejecucion text not null check (tipo_ejecucion in ('mantenimiento', 'fabricacion')),
  actualizado_en timestamptz not null default now(),
  primary key (hoja_costeo_id, familia_trabajo_id)
);

alter table public.hoja_costeo_trabajos enable row level security;

drop policy if exists hoja_trabajos_select on public.hoja_costeo_trabajos;
create policy hoja_trabajos_select on public.hoja_costeo_trabajos for select using (
  exists (select 1 from public.hojas_costeo hc
          where hc.id = hoja_costeo_trabajos.hoja_costeo_id
            and public.usuario_tiene_empresa(hc.empresa_id)
            and public.usuario_puede(hc.empresa_id, 'hoja_costeo', 'ver')
            and exists (select 1 from (select public.usuario_alcance_sociedades(hc.empresa_id) as alcance) au
                        where au.alcance is null or hc.sociedad_id = any (au.alcance))));

drop policy if exists hoja_trabajos_insert on public.hoja_costeo_trabajos;
create policy hoja_trabajos_insert on public.hoja_costeo_trabajos for insert with check (
  exists (select 1 from public.hojas_costeo hc
          where hc.id = hoja_costeo_trabajos.hoja_costeo_id
            and public.usuario_tiene_empresa(hc.empresa_id)
            and public.usuario_puede(hc.empresa_id, 'hoja_costeo', 'crear')
            and exists (select 1 from (select public.usuario_alcance_sociedades(hc.empresa_id) as alcance) au
                        where au.alcance is null or hc.sociedad_id = any (au.alcance))));

drop policy if exists hoja_trabajos_update on public.hoja_costeo_trabajos;
create policy hoja_trabajos_update on public.hoja_costeo_trabajos for update using (
  exists (select 1 from public.hojas_costeo hc
          where hc.id = hoja_costeo_trabajos.hoja_costeo_id
            and public.usuario_tiene_empresa(hc.empresa_id)
            and public.usuario_puede(hc.empresa_id, 'hoja_costeo', 'editar')
            and exists (select 1 from (select public.usuario_alcance_sociedades(hc.empresa_id) as alcance) au
                        where au.alcance is null or hc.sociedad_id = any (au.alcance))))
with check (
  exists (select 1 from public.hojas_costeo hc
          where hc.id = hoja_costeo_trabajos.hoja_costeo_id
            and public.usuario_tiene_empresa(hc.empresa_id)
            and public.usuario_puede(hc.empresa_id, 'hoja_costeo', 'editar')
            and exists (select 1 from (select public.usuario_alcance_sociedades(hc.empresa_id) as alcance) au
                        where au.alcance is null or hc.sociedad_id = any (au.alcance))));

drop policy if exists hoja_trabajos_delete on public.hoja_costeo_trabajos;
create policy hoja_trabajos_delete on public.hoja_costeo_trabajos for delete using (
  exists (select 1 from public.hojas_costeo hc
          where hc.id = hoja_costeo_trabajos.hoja_costeo_id
            and public.usuario_tiene_empresa(hc.empresa_id)
            and public.usuario_puede(hc.empresa_id, 'hoja_costeo', 'editar')
            and exists (select 1 from (select public.usuario_alcance_sociedades(hc.empresa_id) as alcance) au
                        where au.alcance is null or hc.sociedad_id = any (au.alcance))));

grant select, insert, update, delete on public.hoja_costeo_trabajos to authenticated;

-- Una hoja aprobada no cambia su clasificación (igual que sus líneas).
create or replace function public.bloquear_tipo_trabajo_hoja_aprobada()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_estado text;
begin
  select estado into v_estado from public.hojas_costeo
   where id = coalesce(new.hoja_costeo_id, old.hoja_costeo_id);
  if v_estado = 'aprobada' then
    raise exception 'No se puede cambiar el tipo de un trabajo en una Hoja de Costeo aprobada.' using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_hoja_trabajos_bloqueo on public.hoja_costeo_trabajos;
create trigger trg_hoja_trabajos_bloqueo
  before insert or update or delete on public.hoja_costeo_trabajos
  for each row execute function public.bloquear_tipo_trabajo_hoja_aprobada();

-- 2. Tipo resultante de una hoja ----------------------------------------------
-- Por cada Trabajo con mano de obra: el tipo elegido o, si no hay, el del diagnóstico.
-- Un solo tipo → ese tipo; ambos → 'mixto'; ninguno definido → null.
create or replace function public.tipo_ejecucion_hoja(p_hoja_id text)
returns text language sql stable security definer set search_path to 'public' as $$
  with h as (
    select hc.id, d.tipo as tipo_diagnostico
      from public.hojas_costeo hc
      left join public.diagnosticos_tecnicos d on d.id = hc.diagnostico_id
     where hc.id = p_hoja_id
  ), trabajos as (
    select distinct l.familia_trabajo_id from public.hoja_costeo_lineas_mano_obra l
     where l.hoja_costeo_id = p_hoja_id
  ), tipos as (
    select distinct coalesce(t.tipo_ejecucion, h.tipo_diagnostico) as tipo
      from h
      left join trabajos tr on true
      left join public.hoja_costeo_trabajos t
        on t.hoja_costeo_id = h.id and t.familia_trabajo_id = tr.familia_trabajo_id
  )
  select case
           when count(*) filter (where tipo is not null) = 0 then null
           when count(*) filter (where tipo is not null) > 1 then 'mixto'
           else max(tipo)
         end
    from tipos;
$$;

grant execute on function public.tipo_ejecucion_hoja(text) to authenticated;

-- 3. Tipo en cotización y OS ---------------------------------------------------
alter table public.cotizaciones add column if not exists tipo_ejecucion text;
alter table public.os_clientes add column if not exists tipo_ejecucion text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cotizaciones_tipo_ejecucion_chk') then
    alter table public.cotizaciones add constraint cotizaciones_tipo_ejecucion_chk
      check (tipo_ejecucion is null or tipo_ejecucion in ('mantenimiento', 'fabricacion', 'mixto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'os_clientes_tipo_ejecucion_chk') then
    alter table public.os_clientes add constraint os_clientes_tipo_ejecucion_chk
      check (tipo_ejecucion is null or tipo_ejecucion in ('mantenimiento', 'fabricacion', 'mixto'));
  end if;
end $$;

-- La cotización hereda el tipo de su hoja si no se eligió a mano.
create or replace function public.heredar_tipo_ejecucion_cotizacion()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.tipo_ejecucion is null and new.hoja_costeo_id is not null then
    new.tipo_ejecucion := public.tipo_ejecucion_hoja(new.hoja_costeo_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_cotizaciones_tipo_ejecucion on public.cotizaciones;
create trigger trg_cotizaciones_tipo_ejecucion
  before insert or update of hoja_costeo_id, tipo_ejecucion on public.cotizaciones
  for each row execute function public.heredar_tipo_ejecucion_cotizacion();

-- La OS hereda el tipo de su cotización si no se eligió a mano.
create or replace function public.heredar_tipo_ejecucion_os()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.tipo_ejecucion is null and new.cotizacion_id is not null then
    select coalesce(c.tipo_ejecucion, case when c.hoja_costeo_id is not null then public.tipo_ejecucion_hoja(c.hoja_costeo_id) end)
      into new.tipo_ejecucion
      from public.cotizaciones c
     where c.id = new.cotizacion_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_os_clientes_tipo_ejecucion on public.os_clientes;
create trigger trg_os_clientes_tipo_ejecucion
  before insert or update of cotizacion_id, tipo_ejecucion on public.os_clientes
  for each row execute function public.heredar_tipo_ejecucion_os();

-- 4. Datos existentes (decisión de Cristhian, 23/10/2026) ------------------------
-- Cotizaciones con hoja: el tipo que resulte de la hoja (solo las que vienen de diagnóstico lo tienen).
update public.cotizaciones c
   set tipo_ejecucion = public.tipo_ejecucion_hoja(c.hoja_costeo_id)
 where c.tipo_ejecucion is null and c.hoja_costeo_id is not null
   and public.tipo_ejecucion_hoja(c.hoja_costeo_id) is not null;

-- OS con OTs: mantenimiento (hoy todas trabajan con OT). El resto: el de su cotización o "Sin definir".
update public.os_clientes o
   set tipo_ejecucion = 'mantenimiento'
 where o.tipo_ejecucion is null
   and exists (select 1 from public.ordenes_trabajo t where t.os_cliente_id = o.id);

update public.os_clientes o
   set tipo_ejecucion = c.tipo_ejecucion
  from public.cotizaciones c
 where o.tipo_ejecucion is null and c.id = o.cotizacion_id and c.tipo_ejecucion is not null;

-- 5. Comprobación ------------------------------------------------------------
do $$
declare v_os_con_ot_sin_tipo integer; v_invalidos integer;
begin
  select count(*) into v_os_con_ot_sin_tipo from public.os_clientes o
   where o.tipo_ejecucion is null and exists (select 1 from public.ordenes_trabajo t where t.os_cliente_id = o.id);
  if v_os_con_ot_sin_tipo > 0 then
    raise exception 'Quedaron % OS con OTs sin tipo de ejecución', v_os_con_ot_sin_tipo;
  end if;
  select count(*) into v_invalidos from public.os_clientes
   where tipo_ejecucion is not null and tipo_ejecucion not in ('mantenimiento', 'fabricacion', 'mixto');
  if v_invalidos > 0 then raise exception 'Tipos de ejecución inválidos en OS: %', v_invalidos; end if;
end $$;

-- 6. Cotización especial (tabla propia) --------------------------------------
-- Aplicada como tipo_ejecucion_3_cotizacion_especial.
alter table public.cotizaciones_especiales add column if not exists tipo_ejecucion text
  constraint cotizaciones_especiales_tipo_ejecucion_chk check (tipo_ejecucion is null or tipo_ejecucion in ('mantenimiento', 'fabricacion', 'mixto'));
drop trigger if exists trg_cotizaciones_especiales_tipo_ejecucion on public.cotizaciones_especiales;
create trigger trg_cotizaciones_especiales_tipo_ejecucion before insert or update of hoja_costeo_id, tipo_ejecucion on public.cotizaciones_especiales
  for each row execute function public.heredar_tipo_ejecucion_cotizacion();

-- La OS también hereda de la cotización especial.
create or replace function public.heredar_tipo_ejecucion_os()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.tipo_ejecucion is null and new.cotizacion_id is not null then
    select coalesce(c.tipo_ejecucion, case when c.hoja_costeo_id is not null then public.tipo_ejecucion_hoja(c.hoja_costeo_id) end)
      into new.tipo_ejecucion from public.cotizaciones c where c.id = new.cotizacion_id;
  end if;
  if new.tipo_ejecucion is null and new.cotizacion_especial_id is not null then
    select coalesce(e.tipo_ejecucion, case when e.hoja_costeo_id is not null then public.tipo_ejecucion_hoja(e.hoja_costeo_id) end)
      into new.tipo_ejecucion from public.cotizaciones_especiales e where e.id = new.cotizacion_especial_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_os_clientes_tipo_ejecucion on public.os_clientes;
create trigger trg_os_clientes_tipo_ejecucion before insert or update of cotizacion_id, cotizacion_especial_id, tipo_ejecucion on public.os_clientes
  for each row execute function public.heredar_tipo_ejecucion_os();

update public.cotizaciones_especiales e set tipo_ejecucion = public.tipo_ejecucion_hoja(e.hoja_costeo_id)
 where e.tipo_ejecucion is null and e.hoja_costeo_id is not null and public.tipo_ejecucion_hoja(e.hoja_costeo_id) is not null;
update public.os_clientes o set tipo_ejecucion = e.tipo_ejecucion from public.cotizaciones_especiales e
 where o.tipo_ejecucion is null and e.id = o.cotizacion_especial_id and e.tipo_ejecucion is not null;
