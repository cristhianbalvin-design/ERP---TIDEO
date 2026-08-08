-- SEG-2b: cierra la superficie publica de reclutamiento.
--
-- Orden de despliegue coordinado:
--   1. desplegar la Edge Function crear-upload-cv-publico;
--   2. aplicar esta migracion;
--   3. desplegar el frontend adaptado.
--
-- La migracion no elimina objetos huerfanos ni candidaturas duplicadas
-- historicas. La idempotencia publica se aplica sin crear un indice unico que
-- obligue a modificar esos datos existentes.

-- ---------------------------------------------------------------------------
-- A. Vacantes: anon deja de enumerar filas/tokens y usa un lookup por token.
-- ---------------------------------------------------------------------------

drop policy if exists rrhh_vacantes_tenant_select on public.rrhh_vacantes;
drop policy if exists rrhh_vacantes_authenticated_select on public.rrhh_vacantes;

create policy rrhh_vacantes_authenticated_select
on public.rrhh_vacantes
for select
to authenticated
using (public.usuario_tiene_empresa(empresa_id));

revoke all privileges on table public.rrhh_vacantes from anon;

create or replace function public.obtener_vacante_publica(
  p_public_token text
)
returns table (
  cargo text,
  area text,
  sede text,
  descripcion text,
  posiciones integer,
  posiciones_cubiertas integer,
  estado text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    v.cargo,
    v.area,
    v.sede,
    v.descripcion,
    v.posiciones,
    v.posiciones_cubiertas,
    v.estado
  from public.rrhh_vacantes v
  where v.public_token = nullif(pg_catalog.btrim(p_public_token), '')
    and v.estado = 'abierta'
  limit 1;
$$;

alter function public.obtener_vacante_publica(text) owner to postgres;
revoke execute on function public.obtener_vacante_publica(text) from public;
revoke execute on function public.obtener_vacante_publica(text) from anon;
revoke execute on function public.obtener_vacante_publica(text) from authenticated;
grant execute on function public.obtener_vacante_publica(text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- B. Las tablas dejan de aceptar escrituras directas de anon.
-- ---------------------------------------------------------------------------

drop policy if exists rrhh_candidatos_tenant_select on public.rrhh_candidatos;
drop policy if exists rrhh_candidatos_tenant_write on public.rrhh_candidatos;
drop policy if exists rrhh_candidatos_authenticated_select on public.rrhh_candidatos;
drop policy if exists rrhh_candidatos_authenticated_write on public.rrhh_candidatos;

create policy rrhh_candidatos_authenticated_select
on public.rrhh_candidatos
for select
to authenticated
using (public.usuario_tiene_empresa(empresa_id));

create policy rrhh_candidatos_authenticated_write
on public.rrhh_candidatos
for all
to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'reclutamiento', 'ver')
)
with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists rrhh_candidaturas_tenant_select on public.rrhh_candidaturas;
drop policy if exists rrhh_candidaturas_tenant_write on public.rrhh_candidaturas;
drop policy if exists rrhh_candidaturas_authenticated_select on public.rrhh_candidaturas;
drop policy if exists rrhh_candidaturas_authenticated_write on public.rrhh_candidaturas;

create policy rrhh_candidaturas_authenticated_select
on public.rrhh_candidaturas
for select
to authenticated
using (public.usuario_tiene_empresa(empresa_id));

create policy rrhh_candidaturas_authenticated_write
on public.rrhh_candidaturas
for all
to authenticated
using (
  public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'reclutamiento', 'ver')
)
with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists rrhh_candidatura_historial_tenant_select
  on public.rrhh_candidatura_historial;
drop policy if exists rrhh_candidatura_historial_insert
  on public.rrhh_candidatura_historial;
drop policy if exists rrhh_candidatura_historial_authenticated_select
  on public.rrhh_candidatura_historial;
drop policy if exists rrhh_candidatura_historial_authenticated_insert
  on public.rrhh_candidatura_historial;

create policy rrhh_candidatura_historial_authenticated_select
on public.rrhh_candidatura_historial
for select
to authenticated
using (public.usuario_tiene_empresa(empresa_id));

create policy rrhh_candidatura_historial_authenticated_insert
on public.rrhh_candidatura_historial
for insert
to authenticated
with check (public.usuario_tiene_empresa(empresa_id));

revoke all privileges on table public.rrhh_candidatos from anon;
revoke all privileges on table public.rrhh_candidaturas from anon;
revoke all privileges on table public.rrhh_candidatura_historial from anon;

-- ---------------------------------------------------------------------------
-- C/D. Snapshot por candidatura, bucket privado y tickets de subida.
-- ---------------------------------------------------------------------------

alter table public.rrhh_candidaturas
  add column if not exists postulante_nombre text,
  add column if not exists postulante_telefono text,
  add column if not exists postulante_email text,
  add column if not exists cv_bucket text,
  add column if not exists cv_path text;

create index if not exists idx_rrhh_candidaturas_vacante_candidato
  on public.rrhh_candidaturas(vacante_id, candidato_id, created_at, id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'reclutamiento-cv',
  'reclutamiento-cv',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.rrhh_postulacion_upload_tickets (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  vacante_id text not null references public.rrhh_vacantes(id) on delete cascade,
  bucket_id text not null default 'reclutamiento-cv'
    check (bucket_id = 'reclutamiento-cv'),
  object_path text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  candidato_id text references public.rrhh_candidatos(id) on delete set null,
  candidatura_id text references public.rrhh_candidaturas(id) on delete set null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists idx_rrhh_postulacion_upload_tickets_expiry
  on public.rrhh_postulacion_upload_tickets(expires_at)
  where consumed_at is null;

alter table public.rrhh_postulacion_upload_tickets enable row level security;
revoke all privileges on table public.rrhh_postulacion_upload_tickets
  from public, anon, authenticated;
grant all privileges on table public.rrhh_postulacion_upload_tickets
  to service_role;

drop policy if exists storage_reclutamiento_cv_authenticated_select
  on storage.objects;

create policy storage_reclutamiento_cv_authenticated_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'reclutamiento-cv'
  and exists (
    select 1
    from public.rrhh_candidaturas c
    where c.cv_bucket = storage.objects.bucket_id
      and c.cv_path = storage.objects.name
      and public.usuario_tiene_empresa(c.empresa_id)
  )
);

-- La Edge Function y las URL firmadas reemplazan por completo este INSERT.
drop policy if exists storage_docs_privados_anon_insert on storage.objects;

-- La firma anterior confiaba en empresa/vacante y debe desaparecer para que
-- PostgREST no conserve una sobrecarga insegura con el mismo nombre.
drop function if exists public.registrar_postulacion_publica(
  text, text, text, text, text, text, text, text, text
);

create or replace function public.registrar_postulacion_publica(
  p_public_token text,
  p_upload_ticket_id uuid,
  p_nombre text,
  p_dni text,
  p_telefono text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token text;
  v_nombre text;
  v_dni text;
  v_telefono text;
  v_email text;
  v_vacante public.rrhh_vacantes%rowtype;
  v_ticket public.rrhh_postulacion_upload_tickets%rowtype;
  v_candidato_id text;
  v_candidatura_id text;
  v_ya_existia boolean := false;
  v_object_size bigint;
  v_object_mime text;
begin
  v_token := nullif(pg_catalog.btrim(coalesce(p_public_token, '')), '');
  v_nombre := nullif(pg_catalog.btrim(coalesce(p_nombre, '')), '');
  v_dni := pg_catalog.regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  v_telefono := nullif(pg_catalog.btrim(coalesce(p_telefono, '')), '');
  v_email := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');

  if v_token is null then
    raise exception 'Vacante no disponible';
  end if;
  if v_nombre is null then
    raise exception 'Nombre obligatorio';
  end if;
  if v_dni = '' then
    raise exception 'DNI obligatorio';
  end if;
  if p_upload_ticket_id is null then
    raise exception 'Ticket de subida obligatorio';
  end if;

  select v.*
    into v_vacante
  from public.rrhh_vacantes v
  where v.public_token = v_token
    and v.estado = 'abierta'
  limit 1;

  if not found then
    raise exception 'Vacante no disponible';
  end if;

  select t.*
    into v_ticket
  from public.rrhh_postulacion_upload_tickets t
  where t.id = p_upload_ticket_id
    and t.empresa_id = v_vacante.empresa_id
    and t.vacante_id = v_vacante.id
    and t.bucket_id = 'reclutamiento-cv'
  for update;

  if not found then
    raise exception 'Ticket de subida invalido';
  end if;

  -- Reintento de la misma solicitud despues de un commit cuya respuesta se
  -- perdio: devuelve el resultado original sin volver a mutar nada.
  if v_ticket.consumed_at is not null then
    if v_ticket.candidato_id is null or v_ticket.candidatura_id is null then
      raise exception 'Ticket de subida ya utilizado';
    end if;

    perform 1
    from public.rrhh_candidatos c
    where c.id = v_ticket.candidato_id
      and c.empresa_id = v_vacante.empresa_id
      and pg_catalog.regexp_replace(coalesce(c.dni, ''), '\D', '', 'g') = v_dni;

    if not found then
      raise exception 'Ticket de subida ya utilizado';
    end if;

    return pg_catalog.jsonb_build_object(
      'candidatura_id', v_ticket.candidatura_id,
      'candidato_id', v_ticket.candidato_id,
      'ya_existia', true
    );
  end if;

  if v_ticket.expires_at <= pg_catalog.now() then
    raise exception 'Ticket de subida vencido';
  end if;

  select
    coalesce((o.metadata ->> 'size')::bigint, 0),
    pg_catalog.lower(coalesce(o.metadata ->> 'mimetype', ''))
  into v_object_size, v_object_mime
  from storage.objects o
  where o.bucket_id = v_ticket.bucket_id
    and o.name = v_ticket.object_path
  limit 1;

  if not found then
    raise exception 'El CV no fue subido';
  end if;
  if v_object_size <= 0 or v_object_size > 5242880 then
    raise exception 'El CV excede el limite permitido';
  end if;
  if v_object_mime not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Tipo de CV no permitido';
  end if;

  -- Serializa todas las postulaciones publicas del mismo candidato dentro del
  -- tenant, incluso si ocurren simultaneamente para vacantes diferentes.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'postulacion-publica|' || v_vacante.empresa_id || '|' || v_dni,
      0
    )
  );

  select c.id
    into v_candidato_id
  from public.rrhh_candidatos c
  where c.empresa_id = v_vacante.empresa_id
    and pg_catalog.regexp_replace(coalesce(c.dni, ''), '\D', '', 'g') = v_dni
  order by c.created_at asc, c.id asc
  limit 1;

  if not found then
    v_candidato_id := 'cand_' || pg_catalog.replace(gen_random_uuid()::text, '-', '');

    insert into public.rrhh_candidatos (
      id,
      empresa_id,
      nombre,
      dni,
      telefono,
      email
    )
    values (
      v_candidato_id,
      v_vacante.empresa_id,
      v_nombre,
      v_dni,
      v_telefono,
      v_email
    )
    on conflict (empresa_id, dni) do nothing;

    select c.id
      into v_candidato_id
    from public.rrhh_candidatos c
    where c.empresa_id = v_vacante.empresa_id
      and pg_catalog.regexp_replace(coalesce(c.dni, ''), '\D', '', 'g') = v_dni
    order by c.created_at asc, c.id asc
    limit 1;

    if not found then
      raise exception 'No se pudo registrar el candidato';
    end if;
  end if;

  -- Reutiliza la candidatura historica mas antigua sin modificar su snapshot,
  -- etapa ni historial. Esto preserva las filas duplicadas existentes, pero la
  -- ruta publica no crea duplicados nuevos.
  select c.id
    into v_candidatura_id
  from public.rrhh_candidaturas c
  where c.vacante_id = v_vacante.id
    and c.candidato_id = v_candidato_id
  order by c.created_at asc, c.id asc
  limit 1;

  if found then
    v_ya_existia := true;
  else
    v_candidatura_id := 'candit_' || pg_catalog.replace(gen_random_uuid()::text, '-', '');

    insert into public.rrhh_candidaturas (
      id,
      empresa_id,
      vacante_id,
      candidato_id,
      etapa,
      fuente,
      postulante_nombre,
      postulante_telefono,
      postulante_email,
      cv_bucket,
      cv_path
    )
    values (
      v_candidatura_id,
      v_vacante.empresa_id,
      v_vacante.id,
      v_candidato_id,
      'postulado',
      'portal_publico',
      v_nombre,
      v_telefono,
      v_email,
      v_ticket.bucket_id,
      v_ticket.object_path
    );

    insert into public.rrhh_candidatura_historial (
      empresa_id,
      candidatura_id,
      etapa_desde,
      etapa_hasta,
      motivo,
      notas,
      usuario_id
    )
    values (
      v_vacante.empresa_id,
      v_candidatura_id,
      null,
      'postulado',
      'Postulacion publica',
      null,
      'Sistema'
    );
  end if;

  update public.rrhh_postulacion_upload_tickets
  set
    consumed_at = pg_catalog.now(),
    candidato_id = v_candidato_id,
    candidatura_id = v_candidatura_id
  where id = v_ticket.id;

  return pg_catalog.jsonb_build_object(
    'candidatura_id', v_candidatura_id,
    'candidato_id', v_candidato_id,
    'ya_existia', v_ya_existia
  );
end;
$$;

alter function public.registrar_postulacion_publica(
  text, uuid, text, text, text, text
) owner to postgres;

revoke execute on function public.registrar_postulacion_publica(
  text, uuid, text, text, text, text
) from public;
revoke execute on function public.registrar_postulacion_publica(
  text, uuid, text, text, text, text
) from anon;
revoke execute on function public.registrar_postulacion_publica(
  text, uuid, text, text, text, text
) from authenticated;
grant execute on function public.registrar_postulacion_publica(
  text, uuid, text, text, text, text
) to anon, authenticated, service_role;

comment on function public.obtener_vacante_publica(text) is
  'Lookup publico no enumerable: devuelve solo campos visibles de una vacante abierta por token.';
comment on table public.rrhh_postulacion_upload_tickets is
  'Tickets privados y de corta duracion emitidos por la Edge Function para subir CV publicos.';
comment on function public.registrar_postulacion_publica(
  text, uuid, text, text, text, text
) is
  'Canal unico de postulacion publica: deriva tenant/vacante del token y consume un ticket de CV.';

select pg_notify('pgrst', 'reload schema');
