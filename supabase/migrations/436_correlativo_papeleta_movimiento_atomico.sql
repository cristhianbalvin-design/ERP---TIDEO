-- Evita colisiones de PM-XXXX al confirmar solicitudes RRHH.
-- El índice de solicitudes_rrhh es único por empresa, incluso cuando la
-- empresa trabaja con varias sociedades; por eso la reserva también es global
-- por empresa y usa el máximo de todos los contadores societarios existentes.

create or replace function public.siguiente_correlativo_papeleta_movimiento(
  p_empresa_id text,
  p_sociedad_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_multisociedad boolean := false;
  v_contador_id text;
  v_ultimo_contador integer := 0;
  v_ultimo_emitido integer := 0;
  v_siguiente integer;
begin
  if auth.uid() is null or not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No autorizado para reservar correlativos de esta empresa';
  end if;

  select coalesce(e.multisociedad_habilitado, false)
    into v_multisociedad
  from public.empresas e
  where e.id = p_empresa_id;

  if not found then
    raise exception 'Empresa no encontrada';
  end if;

  if v_multisociedad and p_sociedad_id is null then
    raise exception 'La sociedad es obligatoria para reservar el correlativo';
  end if;

  if p_sociedad_id is not null and not exists (
    select 1
    from public.sociedades s
    where s.id = p_sociedad_id
      and s.empresa_id = p_empresa_id
  ) then
    raise exception 'La sociedad no pertenece a la empresa';
  end if;

  -- Serializa el correlativo para toda la empresa: la unicidad de las
  -- papeletas no incluye sociedad_id.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('papeleta-movimiento|' || p_empresa_id, 0)
  );

  select coalesce(max(c.ultimo_numero), 0)
    into v_ultimo_contador
  from public.correlativos_documentos c
  where c.empresa_id = p_empresa_id
    and c.tipo_documento = 'papeleta_movimiento'
    and c.serie = 'PM';

  select coalesce(max((substring(sr.numero_correlativo from '^PM-([0-9]+)$'))::integer), 0)
    into v_ultimo_emitido
  from public.solicitudes_rrhh sr
  where sr.empresa_id = p_empresa_id
    and sr.numero_correlativo ~ '^PM-[0-9]+$';

  v_siguiente := greatest(v_ultimo_contador, v_ultimo_emitido) + 1;

  select c.id
    into v_contador_id
  from public.correlativos_documentos c
  where c.empresa_id = p_empresa_id
    and c.tipo_documento = 'papeleta_movimiento'
    and c.serie = 'PM'
    and c.sociedad_id is not distinct from p_sociedad_id
  for update;

  if found then
    update public.correlativos_documentos
       set ultimo_numero = v_siguiente,
           updated_at = now()
     where id = v_contador_id;
  else
    insert into public.correlativos_documentos (
      id, empresa_id, sociedad_id, tipo_documento, serie, ultimo_numero, updated_at
    ) values (
      'cor_' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 18),
      p_empresa_id, p_sociedad_id, 'papeleta_movimiento', 'PM', v_siguiente, now()
    );
  end if;

  return 'PM-' || lpad(v_siguiente::text, 4, '0');
end;
$$;

revoke all on function public.siguiente_correlativo_papeleta_movimiento(text, uuid) from public, anon;
grant execute on function public.siguiente_correlativo_papeleta_movimiento(text, uuid) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
