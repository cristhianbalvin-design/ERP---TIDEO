-- Transitos de Ordenes de Compra.
-- Registra dos caminos: recojo propio y despacho informado por proveedor.

alter table public.transportistas
  add column if not exists tipo_operador text not null default 'tercero';

alter table public.transportistas
  drop constraint if exists transportistas_tipo_operador_check;

alter table public.transportistas
  add constraint transportistas_tipo_operador_check
  check (tipo_operador in ('propio', 'tercero'));

update public.transportistas
set tipo_operador = 'tercero'
where tipo_operador is null;

create table if not exists public.orden_compra_transitos (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  orden_compra_id text not null references public.ordenes_compra(id) on delete cascade,
  tipo text not null check (tipo in ('recojo_propio', 'despacho_proveedor')),
  estado text not null default 'registrado' check (estado in ('registrado', 'en_transito', 'recibido', 'cancelado')),
  fecha_salida date,
  fecha_estimada_llegada date,
  observaciones text,
  archivo_url text,

  -- Recojo propio: reutiliza maestro de transporte.
  transportista_id text references public.transportistas(id),
  vehiculo_id text references public.vehiculos_transporte(id),
  conductor_id text references public.conductores_transporte(id),

  -- Despacho proveedor: informacion recibida de terceros, no administrada como maestro.
  guia_proveedor_numero text,
  guia_proveedor_fecha date,
  proveedor_transportista_nombre text,
  proveedor_transportista_ruc text,
  proveedor_vehiculo_placa text,
  proveedor_conductor_nombre text,

  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_oc_transitos_empresa_oc
  on public.orden_compra_transitos(empresa_id, orden_compra_id, created_at desc);

create index if not exists idx_oc_transitos_estado
  on public.orden_compra_transitos(empresa_id, estado, fecha_salida desc);

create index if not exists idx_notif_sistema_oc_transito_idempotencia
  on public.notificaciones_sistema(user_id, tipo, referencia_tipo, referencia_id, created_at desc)
  where referencia_tipo = 'orden_compra' and tipo = 'oc_en_transito';

alter table public.orden_compra_transitos enable row level security;

drop policy if exists tenant_oc_transitos on public.orden_compra_transitos;
create policy tenant_oc_transitos on public.orden_compra_transitos
  for all to authenticated
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create or replace function public.aplicar_oc_en_transito_desde_transito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oc record;
  v_fecha date;
  v_mensaje text;
  v_titulo text;
begin
  new.updated_at := now();

  if new.creado_por is null then
    new.creado_por := auth.uid();
  end if;

  if new.estado <> 'en_transito' then
    return new;
  end if;

  select id, codigo, estado, creado_por, proveedor_id
    into v_oc
    from public.ordenes_compra
   where id = new.orden_compra_id
     and empresa_id = new.empresa_id;

  if not found then
    raise exception 'Orden de compra % no existe o no pertenece a la empresa %', new.orden_compra_id, new.empresa_id;
  end if;

  if lower(coalesce(v_oc.estado, '')) not in ('emitida', 'confirmada', 'en_transito') then
    raise exception 'No se puede marcar en transito una OC en estado %', v_oc.estado;
  end if;

  v_fecha := coalesce(new.fecha_salida, current_date);

  if lower(coalesce(v_oc.estado, '')) in ('emitida', 'confirmada') then
    update public.ordenes_compra
       set estado = 'en_transito',
           fecha_en_transito = coalesce(fecha_en_transito, v_fecha),
           updated_at = now()
     where id = new.orden_compra_id
       and empresa_id = new.empresa_id
       and lower(coalesce(estado, '')) in ('emitida', 'confirmada');
  end if;

  if v_oc.creado_por is null then
    return new;
  end if;

  v_titulo := case
    when new.tipo = 'recojo_propio' then 'OC en transito - recojo propio'
    else 'OC en transito - despacho proveedor'
  end;

  v_mensaje := case
    when new.tipo = 'recojo_propio'
      then format('%s esta en transito por recojo propio desde %s.',
        coalesce(v_oc.codigo, v_oc.id), to_char(v_fecha, 'YYYY-MM-DD'))
    else format('%s esta en transito por despacho del proveedor%s desde %s.',
        coalesce(v_oc.codigo, v_oc.id),
        case when nullif(new.guia_proveedor_numero, '') is not null
          then format(' con guia %s', new.guia_proveedor_numero)
          else ''
        end,
        to_char(v_fecha, 'YYYY-MM-DD'))
  end;

  if not exists (
    select 1
      from public.notificaciones_sistema ns
     where ns.user_id = v_oc.creado_por
       and ns.tipo = 'oc_en_transito'
       and ns.referencia_tipo = 'orden_compra'
       and ns.referencia_id = new.orden_compra_id
       and ns.created_at >= now() - interval '24 hours'
  ) then
    insert into public.notificaciones_sistema (
      empresa_id, user_id, texto, tipo, titulo, mensaje,
      referencia_tipo, referencia_id, referencia_payload, prioridad, leida, created_at, creada_en
    ) values (
      new.empresa_id,
      v_oc.creado_por,
      v_mensaje,
      'oc_en_transito',
      v_titulo,
      v_mensaje,
      'orden_compra',
      new.orden_compra_id,
      jsonb_build_object(
        'orden_compra_id', new.orden_compra_id,
        'transito_id', new.id,
        'tipo', new.tipo,
        'fecha_salida', v_fecha,
        'guia_proveedor_numero', new.guia_proveedor_numero,
        'transportista_id', new.transportista_id,
        'vehiculo_id', new.vehiculo_id,
        'conductor_id', new.conductor_id
      ),
      'media',
      false,
      now(),
      now()
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_oc_transitos_en_transito on public.orden_compra_transitos;
create trigger trg_oc_transitos_en_transito
before insert or update of estado, fecha_salida, creado_por
on public.orden_compra_transitos
for each row execute function public.aplicar_oc_en_transito_desde_transito();

create or replace function public.marcar_oc_transitos_recibidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.orden_compra_id is null then
    return new;
  end if;

  if lower(coalesce(new.estado, '')) not in ('confirmada', 'conforme', 'total')
     and lower(coalesce(new.tipo, '')) not in ('total', 'parcial') then
    return new;
  end if;

  update public.orden_compra_transitos
     set estado = 'recibido',
         updated_at = now()
   where empresa_id = new.empresa_id
     and orden_compra_id = new.orden_compra_id
     and estado in ('registrado', 'en_transito');

  return new;
end;
$$;

drop trigger if exists trg_recepcion_marca_oc_transito_recibido on public.recepciones;
create trigger trg_recepcion_marca_oc_transito_recibido
after insert or update of estado, tipo
on public.recepciones
for each row execute function public.marcar_oc_transitos_recibidos();
