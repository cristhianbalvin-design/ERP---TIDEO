-- Caja chica: cierre atómico, transferencias internas y saldo único en BD.
--
-- La devolución bancaria se representa en caja_chica_fondos mediante
-- monto_devuelto y sus datos de auditoría. La RPC inserta el único ingreso en
-- movimientos_tesoreria y actualiza monto_devuelto en la misma transacción;
-- por eso el saldo de un fondo cerrado vuelve exactamente a cero.

alter table public.caja_chica_fondos
  add column if not exists sociedad_id uuid default null references public.sociedades(id) on delete set null,
  add column if not exists monto_devuelto numeric(14,2) not null default 0 check (monto_devuelto >= 0),
  add column if not exists devolucion_cuenta_bancaria_id text references public.cuentas_bancarias(id) on delete set null,
  add column if not exists devolucion_fecha date,
  add column if not exists devolucion_referencia text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.caja_chica_fondos'::regclass
      and conname = 'caja_chica_fondos_empresa_sociedad_fkey'
  ) then
    alter table public.caja_chica_fondos
      add constraint caja_chica_fondos_empresa_sociedad_fkey
      foreign key (empresa_id, sociedad_id)
      references public.sociedades(empresa_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.caja_chica_fondos'::regclass
      and conname = 'caja_chica_fondos_empresa_id_key'
  ) then
    alter table public.caja_chica_fondos
      add constraint caja_chica_fondos_empresa_id_key unique (empresa_id, id);
  end if;
end;
$$;

-- Solo se backfillean fondos abiertos con una cuenta bancaria cuyo tenant
-- coincide. Los fondos cerrados y los dos fondos excluidos por negocio no se
-- corrigen retroactivamente.
update public.caja_chica_fondos f
set sociedad_id = cb.sociedad_id
from public.cuentas_bancarias cb
where f.cuenta_bancaria_id = cb.id
  and f.empresa_id = cb.empresa_id
  and f.estado <> 'cerrado'
  and f.id not in ('ccf_shfaltzytsq', 'ccf_3nn9hzetz9t')
  and f.sociedad_id is null
  and cb.sociedad_id is not null;

create index if not exists idx_caja_chica_fondos_empresa_sociedad
  on public.caja_chica_fondos(empresa_id, sociedad_id, estado);

create table if not exists public.caja_chica_transferencias (
  id                  text primary key default ('cct_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id          text not null references public.empresas(id),
  sociedad_id         uuid not null,
  fondo_origen_id     text not null,
  fondo_destino_id    text not null,
  monto               numeric(14,2) not null check (monto > 0),
  moneda              text not null,
  fecha               date not null default current_date,
  referencia          text,
  estado              text not null default 'registrado'
                      check (estado in ('registrado', 'anulado')),
  creado_por          text references public.usuarios(id) on delete set null,
  creado_en           timestamptz not null default now(),
  constraint caja_chica_transferencias_fondos_distintos
    check (fondo_origen_id <> fondo_destino_id),
  constraint caja_chica_transferencias_empresa_sociedad_fkey
    foreign key (empresa_id, sociedad_id)
    references public.sociedades(empresa_id, id),
  constraint caja_chica_transferencias_origen_fkey
    foreign key (empresa_id, fondo_origen_id)
    references public.caja_chica_fondos(empresa_id, id),
  constraint caja_chica_transferencias_destino_fkey
    foreign key (empresa_id, fondo_destino_id)
    references public.caja_chica_fondos(empresa_id, id)
);

create index if not exists idx_caja_chica_transferencias_origen_fecha
  on public.caja_chica_transferencias(empresa_id, fondo_origen_id, fecha desc)
  where estado = 'registrado';
create index if not exists idx_caja_chica_transferencias_destino_fecha
  on public.caja_chica_transferencias(empresa_id, fondo_destino_id, fecha desc)
  where estado = 'registrado';

alter table public.caja_chica_transferencias enable row level security;

drop policy if exists cc_transferencias_select on public.caja_chica_transferencias;
create policy cc_transferencias_select on public.caja_chica_transferencias
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_alcance_sociedades(empresa_id) is null
      or sociedad_id = any(public.usuario_alcance_sociedades(empresa_id))
    )
    and (
      public.usuario_puede(empresa_id, 'caja', 'ver')
      or public.usuario_responsable_fondo_caja(fondo_origen_id)
      or public.usuario_responsable_fondo_caja(fondo_destino_id)
    )
  );

-- Las transferencias solo se escriben dentro de la RPC atómica. La tabla sigue
-- protegida por RLS, pero no se concede INSERT/UPDATE/DELETE a authenticated.
revoke all on table public.caja_chica_transferencias from anon, authenticated;
grant select on table public.caja_chica_transferencias to authenticated;

-- Los fondos con sociedad NULL permanecen visibles para poder clasificarse;
-- ninguna operación de transferencia puede utilizarlos como origen/destino.
drop policy if exists cc_fondos_select on public.caja_chica_fondos;
drop policy if exists cc_fondos_insert on public.caja_chica_fondos;
drop policy if exists cc_fondos_update on public.caja_chica_fondos;

create policy cc_fondos_select on public.caja_chica_fondos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_alcance_sociedades(empresa_id) is null
      or sociedad_id is null
      or sociedad_id = any(public.usuario_alcance_sociedades(empresa_id))
    )
    and (
      public.usuario_puede(empresa_id, 'caja', 'ver')
      or public.usuario_responsable_fondo_caja(id)
    )
  );

create policy cc_fondos_insert on public.caja_chica_fondos
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_alcance_sociedades(empresa_id) is null
      or sociedad_id is null
      or sociedad_id = any(public.usuario_alcance_sociedades(empresa_id))
    )
    and public.usuario_puede(empresa_id, 'caja', 'crear')
  );

create policy cc_fondos_update on public.caja_chica_fondos
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_alcance_sociedades(empresa_id) is null
      or sociedad_id is null
      or sociedad_id = any(public.usuario_alcance_sociedades(empresa_id))
    )
    and public.usuario_puede(empresa_id, 'caja', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_alcance_sociedades(empresa_id) is null
      or sociedad_id is null
      or sociedad_id = any(public.usuario_alcance_sociedades(empresa_id))
    )
    and public.usuario_puede(empresa_id, 'caja', 'editar')
  );

-- Fuente única de saldo para la UI futura y para todas las RPC que necesiten
-- validar disponibilidad. La función falla ante movimientos con una moneda
-- distinta a la del fondo para impedir sumas multi-moneda silenciosas.
create or replace function public.calcular_saldo_fondo_caja_chica(
  p_fondo_id text
)
returns numeric(14,2)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fondo public.caja_chica_fondos%rowtype;
  v_moneda text;
  v_gastado numeric(14,2) := 0;
  v_aportado numeric(14,2) := 0;
  v_repuesto numeric(14,2) := 0;
  v_transferido numeric(14,2) := 0;
  v_recibido numeric(14,2) := 0;
begin
  select * into v_fondo
  from public.caja_chica_fondos
  where id = p_fondo_id
  for update;

  if not found then
    raise exception 'FONDO_NO_ENCONTRADO: El fondo de caja chica especificado no existe.';
  end if;

  v_moneda := upper(coalesce(v_fondo.moneda, 'PEN'));

  if exists (
    select 1 from public.caja_chica
    where fondo_id = v_fondo.id
      and lower(coalesce(estado, '')) not in ('anulado', 'anulada')
      and upper(coalesce(moneda, 'PEN')) <> v_moneda
  ) then
    raise exception 'MONEDA_INCONSISTENTE: El fondo tiene egresos registrados en una moneda distinta a la del fondo.';
  end if;

  if exists (
    select 1 from public.caja_chica_aportes
    where fondo_id = v_fondo.id
      and lower(coalesce(estado, '')) not in ('anulado', 'anulada')
      and upper(coalesce(moneda, 'PEN')) <> v_moneda
  ) then
    raise exception 'MONEDA_INCONSISTENTE: El fondo tiene aportes registrados en una moneda distinta a la del fondo.';
  end if;

  if exists (
    select 1 from public.caja_chica_rendiciones
    where fondo_id = v_fondo.id
      and lower(coalesce(estado, '')) in ('aprobada', 'repuesta')
      and upper(coalesce(moneda, 'PEN')) <> v_moneda
  ) then
    raise exception 'MONEDA_INCONSISTENTE: El fondo tiene reposiciones registradas en una moneda distinta a la del fondo.';
  end if;

  if exists (
    select 1
    from public.caja_chica_transferencias
    where estado = 'registrado'
      and (fondo_origen_id = v_fondo.id or fondo_destino_id = v_fondo.id)
      and upper(coalesce(moneda, 'PEN')) <> v_moneda
  ) then
    raise exception 'MONEDA_INCONSISTENTE: El fondo tiene transferencias registradas en una moneda distinta a la del fondo.';
  end if;

  select coalesce(sum(monto), 0)
    into v_gastado
  from public.caja_chica
  where fondo_id = v_fondo.id
    and lower(coalesce(estado, '')) not in ('anulado', 'anulada');

  select coalesce(sum(monto), 0)
    into v_aportado
  from public.caja_chica_aportes
  where fondo_id = v_fondo.id
    and lower(coalesce(estado, '')) not in ('anulado', 'anulada');

  select coalesce(sum(monto_aprobado), 0)
    into v_repuesto
  from public.caja_chica_rendiciones
  where fondo_id = v_fondo.id
    and lower(coalesce(estado, '')) in ('aprobada', 'repuesta');

  select coalesce(sum(monto), 0)
    into v_transferido
  from public.caja_chica_transferencias
  where fondo_origen_id = v_fondo.id
    and estado = 'registrado';

  select coalesce(sum(monto), 0)
    into v_recibido
  from public.caja_chica_transferencias
  where fondo_destino_id = v_fondo.id
    and estado = 'registrado';

  return round(
    coalesce(v_fondo.monto_asignado, 0)
    + v_aportado
    + v_repuesto
    - v_gastado
    - v_transferido
    + v_recibido
    - coalesce(v_fondo.monto_devuelto, 0),
    2
  );
end;
$$;

revoke all on function public.calcular_saldo_fondo_caja_chica(text) from public, anon, authenticated;

-- Reemplaza la definición remota de 541. La única diferencia funcional es que
-- el saldo se obtiene de la fuente única anterior, incluyendo transferencias y
-- devoluciones a cuenta.
create or replace function public.registrar_egreso_caja_chica_atomico(
  p_payload jsonb
)
returns public.caja_chica
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fondo_id text := nullif(btrim(p_payload ->> 'fondo_id'), '');
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_sociedad_id uuid := nullif(btrim(p_payload ->> 'sociedad_id'), '')::uuid;
  v_monto numeric(14,2) := round(coalesce(nullif(p_payload ->> 'monto', '')::numeric, 0), 2);
  v_concepto text := nullif(btrim(p_payload ->> 'concepto'), '');
  v_fecha date := coalesce(nullif(p_payload ->> 'fecha', '')::date, current_date);
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_id text := nullif(btrim(p_payload ->> 'id'), '');
  v_responsable_id text := nullif(btrim(p_payload ->> 'responsable_id'), '');
  v_responsable_nombre text := nullif(btrim(p_payload ->> 'responsable_nombre'), '');
  v_ceco_id text := nullif(btrim(p_payload ->> 'ceco_id'), '');
  v_categoria text := coalesce(nullif(btrim(p_payload ->> 'categoria'), ''), 'Administrativos');
  v_num_comprobante text := nullif(btrim(p_payload ->> 'num_comprobante'), '');
  v_comprobante_url text := nullif(btrim(p_payload ->> 'comprobante_url'), '');
  v_estado text := coalesce(nullif(btrim(p_payload ->> 'estado'), ''), 'registrado');
  v_origen_registro text := coalesce(nullif(btrim(p_payload ->> 'origen_registro'), ''), 'backoffice');
  v_gasto_id text := nullif(btrim(p_payload ->> 'gasto_id'), '');
  v_creado_por text := coalesce(nullif(btrim(p_payload ->> 'creado_por'), ''), auth.uid()::text);
  v_creado_en timestamptz := coalesce(nullif(p_payload ->> 'creado_en', '')::timestamptz, now());

  v_fondo public.caja_chica_fondos%rowtype;
  v_disponible numeric(14,2) := 0;
  v_alcance uuid[];
  v_nuevo_egreso public.caja_chica%rowtype;
begin
  if v_fondo_id is null then
    raise exception 'FONDO_REQUERIDO: Seleccione un fondo de caja chica.';
  end if;

  if v_monto <= 0 then
    raise exception 'MONTO_INVALIDO: El monto del egreso debe ser mayor a cero.';
  end if;

  if v_concepto is null then
    raise exception 'CONCEPTO_REQUERIDO: El concepto del egreso es obligatorio.';
  end if;

  select * into v_fondo
  from public.caja_chica_fondos
  where id = v_fondo_id
  for update;

  if not found then
    raise exception 'FONDO_NO_ENCONTRADO: El fondo de caja chica especificado no existe.';
  end if;

  if v_empresa_id is not null and v_empresa_id <> v_fondo.empresa_id then
    raise exception 'EMPRESA_NO_COINCIDE: El fondo no pertenece a la empresa indicada.';
  end if;
  v_empresa_id := v_fondo.empresa_id;

  if v_fondo.estado = 'cerrado' then
    raise exception 'FONDO_CERRADO: No se pueden registrar egresos en un fondo de caja chica cerrado.';
  end if;
  if v_fondo.estado <> 'activo' then
    raise exception 'FONDO_INACTIVO: El fondo de caja chica no se encuentra activo.';
  end if;

  -- La sociedad efectiva se obtiene del fondo. El valor recibido en el
  -- payload solo conserva compatibilidad de firma y no decide el alcance.
  v_sociedad_id := v_fondo.sociedad_id;
  if v_sociedad_id is null then
    select id into v_sociedad_id
    from public.sociedades
    where empresa_id = v_empresa_id and es_principal = true
    limit 1;
    if v_sociedad_id is null then
      select id into v_sociedad_id
      from public.sociedades
      where empresa_id = v_empresa_id
      order by id asc
      limit 1;
    end if;
  end if;

  if auth.uid() is not null then
    if not public.usuario_tiene_empresa(v_empresa_id) then
      raise exception 'PERMISO_DENEGADO: No tiene permisos para operar en esta empresa.';
    end if;

    if not (public.usuario_puede(v_empresa_id, 'caja', 'crear') or public.usuario_responsable_fondo_caja(v_fondo.id)) then
      raise exception 'PERMISO_DENEGADO: No tiene permisos para registrar egresos en este fondo de caja chica.';
    end if;

    v_alcance := public.usuario_alcance_sociedades(v_empresa_id);
    if v_sociedad_id is not null
       and v_alcance is not null
       and not (v_sociedad_id = any(v_alcance)) then
      raise exception 'ALCANCE_DENEGADO: La sociedad seleccionada está fuera del alcance societario del usuario.';
    end if;
  elsif current_user not in ('postgres', 'service_role') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'NO_AUTENTICADO: Sesión no autenticada.';
  end if;

  v_disponible := public.calcular_saldo_fondo_caja_chica(v_fondo.id);

  if v_monto > v_disponible then
    raise exception 'SALDO_INSUFICIENTE_CAJA_CHICA: El monto del egreso (% %) supera el saldo disponible actual del fondo (% %).',
      v_monto, v_moneda, v_disponible, v_fondo.moneda;
  end if;

  if v_responsable_id is null then
    v_responsable_id := v_fondo.responsable_id;
  end if;
  if v_responsable_nombre is null and v_responsable_id is not null then
    select nombre into v_responsable_nombre
    from public.usuarios
    where id = v_responsable_id;
  end if;

  if v_id is null then
    v_id := 'cc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
  end if;

  insert into public.caja_chica (
    id, empresa_id, fondo_id, sociedad_id, fecha, concepto, monto, moneda,
    responsable_id, responsable_nombre, ceco_id, categoria, num_comprobante,
    comprobante_url, estado, origen_registro, gasto_id, creado_por, creado_en
  ) values (
    v_id, v_empresa_id, v_fondo.id, v_sociedad_id, v_fecha, v_concepto, v_monto, v_moneda,
    v_responsable_id, v_responsable_nombre, v_ceco_id, v_categoria, v_num_comprobante,
    v_comprobante_url, v_estado, v_origen_registro, v_gasto_id, v_creado_por, v_creado_en
  )
  returning * into v_nuevo_egreso;

  return v_nuevo_egreso;
end;
$$;

create or replace function public.cerrar_fondo_caja_chica_atomico(
  p_fondo_id text,
  p_destino_tipo text default null,
  p_destino_id text default null,
  p_referencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fondo public.caja_chica_fondos%rowtype;
  v_fondo_destino public.caja_chica_fondos%rowtype;
  v_cuenta public.cuentas_bancarias%rowtype;
  v_transferencia public.caja_chica_transferencias%rowtype;
  v_movimiento public.movimientos_tesoreria%rowtype;
  v_empresa_id text;
  v_destino_tipo text := lower(nullif(btrim(p_destino_tipo), ''));
  v_destino_id text := nullif(btrim(p_destino_id), '');
  v_saldo numeric(14,2);
  v_alcance uuid[];
  v_cerrado_por text := auth.uid()::text;
  v_fecha date := current_date;
begin
  if nullif(btrim(p_fondo_id), '') is null then
    raise exception 'FONDO_REQUERIDO: Seleccione un fondo de caja chica.';
  end if;

  select * into v_fondo
  from public.caja_chica_fondos
  where id = p_fondo_id
  for update;

  if not found then
    raise exception 'FONDO_NO_ENCONTRADO: El fondo de caja chica especificado no existe.';
  end if;

  if v_fondo.estado <> 'activo' then
    raise exception 'FONDO_NO_ACTIVO: Solo se puede cerrar un fondo activo.';
  end if;

  v_empresa_id := v_fondo.empresa_id;

  if auth.uid() is not null then
    if not public.usuario_tiene_empresa(v_empresa_id) then
      raise exception 'PERMISO_DENEGADO: El fondo no pertenece a una empresa disponible para el usuario.';
    end if;
    if not public.usuario_puede(v_empresa_id, 'caja', 'editar') then
      raise exception 'PERMISO_DENEGADO: No tiene permiso para cerrar fondos de caja chica.';
    end if;
    v_alcance := public.usuario_alcance_sociedades(v_empresa_id);
    if v_fondo.sociedad_id is not null
       and v_alcance is not null
       and not (v_fondo.sociedad_id = any(v_alcance)) then
      raise exception 'ALCANCE_DENEGADO: La sociedad del fondo está fuera del alcance societario del usuario.';
    end if;
  elsif current_user not in ('postgres', 'service_role') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'NO_AUTENTICADO: Sesión no autenticada.';
  end if;

  v_saldo := public.calcular_saldo_fondo_caja_chica(v_fondo.id);

  if v_saldo < -0.005 then
    raise exception 'SALDO_NEGATIVO_CIERRE: No se puede cerrar el fondo porque su saldo recalculado es % %.',
      v_saldo, v_fondo.moneda;
  end if;

  v_saldo := greatest(0, round(v_saldo, 2));

  if v_saldo > 0 then
    if v_destino_tipo is null or v_destino_id is null then
      raise exception 'DESTINO_REQUERIDO: Un fondo con saldo positivo requiere una caja abierta o una cuenta bancaria de destino.';
    end if;

    if v_destino_tipo = 'transferencia' then
      if v_fondo.sociedad_id is null then
        raise exception 'SOCIEDAD_ORIGEN_REQUERIDA: El fondo no tiene sociedad clasificada y no puede transferirse a otra caja.';
      end if;

      select * into v_fondo_destino
      from public.caja_chica_fondos
      where id = v_destino_id
      for update;

      if not found or v_fondo_destino.empresa_id <> v_empresa_id then
        raise exception 'DESTINO_NO_VALIDO: La caja destino no existe en la empresa del fondo origen.';
      end if;
      if v_fondo_destino.id = v_fondo.id then
        raise exception 'DESTINO_NO_VALIDO: La caja destino debe ser distinta del fondo origen.';
      end if;
      if v_fondo_destino.estado <> 'activo' then
        raise exception 'DESTINO_NO_ABIERTO: La caja destino debe estar abierta.';
      end if;
      if upper(coalesce(v_fondo_destino.moneda, 'PEN')) <> upper(coalesce(v_fondo.moneda, 'PEN')) then
        raise exception 'MONEDA_NO_COINCIDE: La caja destino debe tener la misma moneda del fondo origen.';
      end if;
      if v_fondo_destino.sociedad_id is null or v_fondo_destino.sociedad_id <> v_fondo.sociedad_id then
        raise exception 'SOCIEDAD_NO_COINCIDE: La caja destino debe pertenecer a la misma sociedad del fondo origen.';
      end if;

      if v_alcance is not null and not (v_fondo_destino.sociedad_id = any(v_alcance)) then
        raise exception 'ALCANCE_DENEGADO: La sociedad de la caja destino está fuera del alcance societario del usuario.';
      end if;

      insert into public.caja_chica_transferencias (
        empresa_id, sociedad_id, fondo_origen_id, fondo_destino_id, monto,
        moneda, fecha, referencia, estado, creado_por
      ) values (
        v_empresa_id, v_fondo.sociedad_id, v_fondo.id, v_fondo_destino.id,
        v_saldo, upper(coalesce(v_fondo.moneda, 'PEN')), v_fecha,
        nullif(btrim(p_referencia), ''), 'registrado', v_cerrado_por
      ) returning * into v_transferencia;

      update public.caja_chica_fondos
      set estado = 'cerrado',
          fecha_cierre = v_fecha,
          cerrado_por = v_cerrado_por
      where id = v_fondo.id
      returning * into v_fondo;

      return jsonb_build_object(
        'fondo', to_jsonb(v_fondo),
        'saldo_cerrado', v_saldo,
        'destino_tipo', 'transferencia',
        'transferencia', to_jsonb(v_transferencia),
        'movimiento_tesoreria', null
      );
    elsif v_destino_tipo = 'cuenta_bancaria' then
      select * into v_cuenta
      from public.cuentas_bancarias
      where id = v_destino_id
      for update;

      if not found or v_cuenta.empresa_id <> v_empresa_id then
        raise exception 'CUENTA_NO_VALIDA: La cuenta bancaria no pertenece a la empresa del fondo.';
      end if;
      if v_cuenta.estado <> 'activo' then
        raise exception 'CUENTA_NO_ACTIVA: La cuenta bancaria destino no está activa.';
      end if;
      if upper(coalesce(v_cuenta.moneda, 'PEN')) <> upper(coalesce(v_fondo.moneda, 'PEN')) then
        raise exception 'MONEDA_NO_COINCIDE: La cuenta bancaria destino debe tener la misma moneda del fondo.';
      end if;
      if v_fondo.sociedad_id is not null
         and (v_cuenta.sociedad_id is null or v_cuenta.sociedad_id <> v_fondo.sociedad_id) then
        raise exception 'SOCIEDAD_NO_COINCIDE: La cuenta bancaria destino debe pertenecer a la misma sociedad del fondo.';
      end if;
      if v_alcance is not null
         and v_cuenta.sociedad_id is not null
         and not (v_cuenta.sociedad_id = any(v_alcance)) then
        raise exception 'ALCANCE_DENEGADO: La sociedad de la cuenta destino está fuera del alcance societario del usuario.';
      end if;

      insert into public.movimientos_tesoreria (
        id, empresa_id, tipo, descripcion, monto, moneda, fecha,
        cuenta_bancaria_id, referencia, vinculo_tipo, vinculo_id, estado
      ) values (
        'tes_' || replace(gen_random_uuid()::text, '-', ''), v_empresa_id,
        'ingreso', 'Devolución remanente caja chica: ' || v_fondo.nombre,
        v_saldo, upper(coalesce(v_fondo.moneda, 'PEN')), v_fecha,
        v_cuenta.id, nullif(btrim(p_referencia), ''),
        'caja_chica_fondo_cierre', v_fondo.id, 'registrado'
      ) returning * into v_movimiento;

      update public.caja_chica_fondos
      set estado = 'cerrado',
          fecha_cierre = v_fecha,
          cerrado_por = v_cerrado_por,
          monto_devuelto = v_saldo,
          devolucion_cuenta_bancaria_id = v_cuenta.id,
          devolucion_fecha = v_fecha,
          devolucion_referencia = nullif(btrim(p_referencia), '')
      where id = v_fondo.id
      returning * into v_fondo;

      return jsonb_build_object(
        'fondo', to_jsonb(v_fondo),
        'saldo_cerrado', v_saldo,
        'destino_tipo', 'cuenta_bancaria',
        'transferencia', null,
        'movimiento_tesoreria', to_jsonb(v_movimiento)
      );
    else
      raise exception 'DESTINO_INVALIDO: El destino debe ser transferencia o cuenta_bancaria.';
    end if;
  end if;

  update public.caja_chica_fondos
  set estado = 'cerrado',
      fecha_cierre = v_fecha,
      cerrado_por = v_cerrado_por,
      monto_devuelto = 0,
      devolucion_cuenta_bancaria_id = null,
      devolucion_fecha = null,
      devolucion_referencia = null
  where id = v_fondo.id
  returning * into v_fondo;

  return jsonb_build_object(
    'fondo', to_jsonb(v_fondo),
    'saldo_cerrado', 0,
    'destino_tipo', null,
    'transferencia', null,
    'movimiento_tesoreria', null
  );
end;
$$;

revoke all on function public.registrar_egreso_caja_chica_atomico(jsonb) from public, anon;
grant execute on function public.registrar_egreso_caja_chica_atomico(jsonb) to authenticated, service_role;

revoke all on function public.cerrar_fondo_caja_chica_atomico(text, text, text, text) from public, anon;
grant execute on function public.cerrar_fondo_caja_chica_atomico(text, text, text, text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
