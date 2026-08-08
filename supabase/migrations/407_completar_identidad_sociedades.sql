-- Materializa la identidad heredable al crear una sociedad y completa
-- exclusivamente los campos nulos de las sociedades existentes.

create or replace function public.heredar_identidad_sociedad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config public.empresa_config%rowtype;
begin
  select *
    into v_config
  from public.empresa_config
  where empresa_id = new.empresa_id;

  new.direccion_fiscal := coalesce(new.direccion_fiscal, nullif(btrim(v_config.direccion), ''));
  new.logo_url := coalesce(new.logo_url, nullif(btrim(v_config.logo_url), ''));
  new.firma_url := coalesce(new.firma_url, nullif(btrim(v_config.firma_url), ''));
  new.regimen_laboral := coalesce(
    new.regimen_laboral,
    nullif(btrim(v_config.regimen_laboral_empresa), ''),
    'general'
  );
  new.pct_quincena_1 := coalesce(new.pct_quincena_1, v_config.pct_quincena_1, 50);

  return new;
end;
$$;

drop trigger if exists trg_sociedades_heredar_identidad on public.sociedades;
create trigger trg_sociedades_heredar_identidad
  before insert on public.sociedades
  for each row execute function public.heredar_identidad_sociedad();

create or replace function public.preparar_multisociedad_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_sociedades integer;
  v_sociedades_activas integer;
  v_nombre_sociedad text;
  v_codigo_sociedad text;
  v_config public.empresa_config%rowtype;
begin
  if new.multisociedad_habilitado = true
     and (tg_op = 'INSERT' or old.multisociedad_habilitado is distinct from true) then
    select count(*), count(*) filter (where activa = true)
      into v_total_sociedades, v_sociedades_activas
    from public.sociedades
    where empresa_id = new.id;

    if tg_op = 'UPDATE' and v_total_sociedades = 0 then
      v_nombre_sociedad := coalesce(
        nullif(trim(new.nombre_comercial), ''),
        nullif(trim(new.razon_social), ''),
        new.id
      );
      v_codigo_sociedad := public.generar_codigo_sociedad_unico(new.id, v_nombre_sociedad);

      select *
        into v_config
      from public.empresa_config
      where empresa_id = new.id;

      insert into public.sociedades (
        empresa_id,
        codigo,
        nombre,
        razon_social,
        ruc,
        activa,
        es_principal,
        direccion_fiscal,
        logo_url,
        firma_url,
        regimen_laboral,
        pct_quincena_1
      ) values (
        new.id,
        v_codigo_sociedad,
        v_nombre_sociedad,
        new.razon_social,
        new.ruc,
        true,
        true,
        nullif(btrim(v_config.direccion), ''),
        nullif(btrim(v_config.logo_url), ''),
        nullif(btrim(v_config.firma_url), ''),
        coalesce(nullif(btrim(v_config.regimen_laboral_empresa), ''), 'general'),
        coalesce(v_config.pct_quincena_1, 50)
      );
      v_sociedades_activas := 1;
    end if;

    if tg_op = 'UPDATE' and v_sociedades_activas = 0 then
      raise exception 'No se puede activar multisociedad: el tenant debe tener al menos una sociedad activa.';
    end if;
  end if;

  if new.multisociedad_habilitado = true
     and new.estado in ('activa', 'demo')
     and not exists (
       select 1 from public.sociedades
       where empresa_id = new.id and activa = true
     ) then
    raise exception 'No se puede activar el tenant: debe tener al menos una sociedad activa.';
  end if;

  return new;
end;
$$;

with identidad_heredada as (
  select
    s.id,
    coalesce(s.direccion_fiscal, nullif(btrim(ec.direccion), '')) as direccion_fiscal,
    coalesce(s.logo_url, nullif(btrim(ec.logo_url), '')) as logo_url,
    coalesce(s.firma_url, nullif(btrim(ec.firma_url), '')) as firma_url,
    coalesce(
      s.regimen_laboral,
      nullif(btrim(ec.regimen_laboral_empresa), ''),
      'general'
    ) as regimen_laboral,
    coalesce(s.pct_quincena_1, ec.pct_quincena_1, 50) as pct_quincena_1
  from public.sociedades s
  join public.empresas e on e.id = s.empresa_id
  left join public.empresa_config ec on ec.empresa_id = e.id
)
update public.sociedades s
set direccion_fiscal = h.direccion_fiscal,
    logo_url = h.logo_url,
    firma_url = h.firma_url,
    regimen_laboral = h.regimen_laboral,
    pct_quincena_1 = h.pct_quincena_1,
    updated_at = now()
from identidad_heredada h
where h.id = s.id
  and row(
    s.direccion_fiscal,
    s.logo_url,
    s.firma_url,
    s.regimen_laboral,
    s.pct_quincena_1
  ) is distinct from row(
    h.direccion_fiscal,
    h.logo_url,
    h.firma_url,
    h.regimen_laboral,
    h.pct_quincena_1
  );
