-- Audiencia de campañas: personas de bases propias, seguimiento por campaña,
-- paso a Leads y atribución automática por código de fuente.

-- 1. Normalización para reconocer personas repetidas
create or replace function public.audiencia_norm_linkedin(p text)
returns text language sql immutable parallel safe as $$
  select nullif(rtrim(split_part(split_part(regexp_replace(lower(btrim(coalesce(p,''))),'^(https?://)?([a-z]{2,3}\.)?','') ,'?',1),'#',1),'/'),'')
$$;

create or replace function public.audiencia_norm_telefono(p text)
returns text language sql immutable parallel safe as $$
  select nullif(case
    when length(d)=11 and left(d,2)='51' then right(d,9)
    else d end,'')
  from (select regexp_replace(coalesce(p,''),'\D','','g') as d) x
$$;

-- 2. Campañas: mensaje base y código de fuente
alter table public.campanas
  add column if not exists mensaje_base text,
  add column if not exists fuente_codigo text;

alter table public.campanas add constraint campanas_id_empresa_key unique (id, empresa_id);
alter table public.leads add constraint leads_id_empresa_key unique (id, empresa_id);

create unique index campanas_fuente_codigo_uidx
  on public.campanas (empresa_id, lower(btrim(fuente_codigo)))
  where nullif(btrim(fuente_codigo),'') is not null;

-- 3. Personas de la audiencia (una por empresa)
create table public.audiencia_contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  linkedin_url text,
  email text,
  telefono text,
  etiqueta text,
  consentimiento text not null default 'por_confirmar'
    check (consentimiento in ('por_confirmar','confirmado','revocado')),
  linkedin_norm text generated always as (public.audiencia_norm_linkedin(linkedin_url)) stored,
  email_norm text generated always as (nullif(lower(btrim(email)),'')) stored,
  telefono_norm text generated always as (public.audiencia_norm_telefono(telefono)) stored,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint audiencia_contactos_id_empresa_key unique (id, empresa_id),
  constraint audiencia_contactos_con_contacto check (num_nonnulls(linkedin_norm, email_norm, telefono_norm) >= 1)
);
create unique index audiencia_contactos_linkedin_uidx on public.audiencia_contactos (empresa_id, linkedin_norm) where linkedin_norm is not null;
create unique index audiencia_contactos_email_uidx on public.audiencia_contactos (empresa_id, email_norm) where email_norm is not null;
create unique index audiencia_contactos_telefono_uidx on public.audiencia_contactos (empresa_id, telefono_norm) where telefono_norm is not null;

-- 4. Participación de cada persona en cada campaña
create table public.campana_miembros (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  campana_id text not null,
  contacto_id uuid not null,
  estado text not null default 'por_enviar'
    check (estado in ('por_enviar','enviado','interesado','no_interesado','sin_respuesta','no_contactar')),
  canal text not null default 'LinkedIn' check (canal in ('LinkedIn','Correo','WhatsApp','Llamada')),
  ultimo_contacto date,
  proximo_seguimiento date,
  nota text,
  lead_id text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campana_miembros_unico unique (campana_id, contacto_id),
  constraint campana_miembros_campana_fkey foreign key (campana_id, empresa_id)
    references public.campanas (id, empresa_id) on delete cascade,
  constraint campana_miembros_contacto_fkey foreign key (contacto_id, empresa_id)
    references public.audiencia_contactos (id, empresa_id) on delete cascade,
  constraint campana_miembros_lead_fkey foreign key (lead_id, empresa_id)
    references public.leads (id, empresa_id) on delete set null (lead_id)
);
create index campana_miembros_empresa_campana_idx on public.campana_miembros (empresa_id, campana_id);
create index campana_miembros_contacto_idx on public.campana_miembros (contacto_id);
create index campana_miembros_lead_idx on public.campana_miembros (lead_id) where lead_id is not null;

-- 5. Reglas de consentimiento
create or replace function public.campana_miembros_antes()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.estado <> 'no_contactar' and exists (
    select 1 from public.audiencia_contactos c
    where c.id = new.contacto_id and c.consentimiento = 'revocado'
  ) then
    raise exception 'Esta persona pidió no ser contactada; cambia primero su consentimiento.';
  end if;
  return new;
end $$;

create or replace function public.campana_miembros_despues()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.estado = 'no_contactar' then
    update public.audiencia_contactos
       set consentimiento = 'revocado', updated_at = now()
     where id = new.contacto_id and consentimiento <> 'revocado';
  end if;
  return null;
end $$;

create or replace function public.audiencia_contactos_despues()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.consentimiento = 'revocado' and old.consentimiento <> 'revocado' then
    update public.campana_miembros
       set estado = 'no_contactar', proximo_seguimiento = null
     where contacto_id = new.id and estado <> 'no_contactar';
  end if;
  return null;
end $$;

create trigger campana_miembros_antes_trg before insert or update on public.campana_miembros
  for each row execute function public.campana_miembros_antes();
create trigger campana_miembros_despues_trg after insert or update of estado on public.campana_miembros
  for each row execute function public.campana_miembros_despues();
create trigger audiencia_contactos_despues_trg after update of consentimiento on public.audiencia_contactos
  for each row execute function public.audiencia_contactos_despues();

-- 6. RLS y privilegios
alter table public.audiencia_contactos enable row level security;
alter table public.campana_miembros enable row level security;

revoke all on public.audiencia_contactos, public.campana_miembros from anon, authenticated;
grant select, insert, update, delete on public.audiencia_contactos, public.campana_miembros to authenticated;

create policy audiencia_contactos_select on public.audiencia_contactos for select to authenticated
  using (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id,'marketing','ver'));
create policy audiencia_contactos_insert on public.audiencia_contactos for insert to authenticated
  with check (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id,'marketing','crear'));
create policy audiencia_contactos_update on public.audiencia_contactos for update to authenticated
  using (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id,'marketing','editar'))
  with check (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id,'marketing','editar'));
create policy audiencia_contactos_delete on public.audiencia_contactos for delete to authenticated
  using (usuario_es_admin_empresa(empresa_id));

create policy campana_miembros_select on public.campana_miembros for select to authenticated
  using (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id,'marketing','ver'));
create policy campana_miembros_insert on public.campana_miembros for insert to authenticated
  with check (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id,'marketing','crear'));
create policy campana_miembros_update on public.campana_miembros for update to authenticated
  using (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id,'marketing','editar'))
  with check (usuario_tiene_empresa(empresa_id) and usuario_puede(empresa_id,'marketing','editar'));
create policy campana_miembros_delete on public.campana_miembros for delete to authenticated
  using (usuario_es_admin_empresa(empresa_id));

-- 7. Importar personas (p_simular devuelve el resumen sin guardar)
create or replace function public.importar_audiencia_campana(p_campana_id text, p_filas jsonb, p_simular boolean default true)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_empresa text; f jsonb; v_id uuid; v_cons text; v_estado_c text; v_txt text;
  v_lk text; v_em text; v_tel text; v_nuevo boolean; v_filas int := 0;
  v_nuevas int := 0; v_existen int := 0; v_en_campana int := 0;
  v_sin_contacto int := 0; v_sin_nombre int := 0; v_no_contactar int := 0; v_agregadas int := 0;
begin
  select c.empresa_id into v_empresa from public.campanas c where c.id = p_campana_id;
  if v_empresa is null then raise exception 'Campaña no encontrada.'; end if;
  if not usuario_puede(v_empresa,'marketing','crear') then raise exception 'No tienes permiso para agregar personas.'; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Formato de filas no válido.'; end if;
  if jsonb_array_length(p_filas) > 5000 then raise exception 'Importa como máximo 5000 filas por vez.'; end if;

  begin
    for f in select * from jsonb_array_elements(p_filas) loop
      v_filas := v_filas + 1;
      if nullif(btrim(f->>'nombre'),'') is null then v_sin_nombre := v_sin_nombre + 1; continue; end if;
      v_lk := audiencia_norm_linkedin(f->>'linkedin_url');
      v_em := nullif(lower(btrim(f->>'email')),'');
      v_tel := audiencia_norm_telefono(f->>'telefono');
      if v_lk is null and v_em is null and v_tel is null then v_sin_contacto := v_sin_contacto + 1; continue; end if;

      v_txt := lower(btrim(coalesce(f->>'consentimiento','')));
      v_cons := case when v_txt in ('confirmado','si','sí','true','1') then 'confirmado'
                     when v_txt in ('revocado','no','no contactar','false','0') then 'revocado'
                     else 'por_confirmar' end;

      select c.id, c.consentimiento into v_id, v_estado_c
        from public.audiencia_contactos c
       where c.empresa_id = v_empresa
         and (c.linkedin_norm = v_lk or c.email_norm = v_em or c.telefono_norm = v_tel)
       order by c.created_at limit 1;
      v_nuevo := not found;

      if v_nuevo then
        insert into public.audiencia_contactos (empresa_id,nombre,linkedin_url,email,telefono,etiqueta,consentimiento)
        values (v_empresa, btrim(f->>'nombre'), nullif(btrim(f->>'linkedin_url'),''), nullif(btrim(f->>'email'),''),
                nullif(btrim(f->>'telefono'),''), nullif(btrim(f->>'etiqueta'),''), v_cons)
        returning id, consentimiento into v_id, v_estado_c;
      end if;

      if v_estado_c = 'revocado' then v_no_contactar := v_no_contactar + 1; continue; end if;

      insert into public.campana_miembros (empresa_id,campana_id,contacto_id)
      values (v_empresa,p_campana_id,v_id)
      on conflict (campana_id,contacto_id) do nothing;
      if found then
        v_agregadas := v_agregadas + 1;
        if v_nuevo then v_nuevas := v_nuevas + 1; else v_existen := v_existen + 1; end if;
      else
        v_en_campana := v_en_campana + 1;
      end if;
    end loop;
    if p_simular then raise exception using errcode = 'TD001', message = 'simulacion'; end if;
  exception when sqlstate 'TD001' then null;
  end;

  return jsonb_build_object('filas',v_filas,'nuevas',v_nuevas,'ya_existen',v_existen,'ya_en_campana',v_en_campana,
    'sin_contacto',v_sin_contacto,'sin_nombre',v_sin_nombre,'no_contactar',v_no_contactar,
    'agregadas',v_agregadas,'simulado',p_simular);
end $$;

-- 8. Cambio de estado individual o masivo
create or replace function public.cambiar_estado_miembros(p_ids uuid[], p_estado text)
returns integer language plpgsql security invoker set search_path = public as $$
declare v_hoy date := (now() at time zone 'America/Lima')::date; v_n integer;
begin
  if p_estado not in ('por_enviar','enviado','interesado','no_interesado','sin_respuesta','no_contactar') then
    raise exception 'Estado no válido.';
  end if;
  update public.campana_miembros m
     set estado = p_estado,
         ultimo_contacto = case
           when p_estado = 'enviado' then v_hoy
           when p_estado in ('interesado','no_interesado','sin_respuesta') then coalesce(m.ultimo_contacto, v_hoy)
           else m.ultimo_contacto end,
         proximo_seguimiento = case
           when p_estado = 'enviado' then v_hoy + 5
           when p_estado = 'interesado' then m.proximo_seguimiento
           else null end
   where m.id = any(p_ids)
     and m.lead_id is null
     and (p_estado = 'no_contactar' or not exists (
       select 1 from public.audiencia_contactos c where c.id = m.contacto_id and c.consentimiento = 'revocado'));
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'No se actualizó ninguna persona: ya son leads o pidieron no ser contactadas.'; end if;
  return v_n;
end $$;

-- 9. Guardar la ficha de una persona (consentimiento y seguimiento juntos)
create or replace function public.guardar_miembro_campana(
  p_miembro_id uuid, p_estado text, p_canal text, p_ultimo_contacto date,
  p_proximo_seguimiento date, p_nota text, p_consentimiento text)
returns void language plpgsql security invoker set search_path = public as $$
declare m public.campana_miembros; v_estado text := p_estado; v_cons text := p_consentimiento;
begin
  select * into m from public.campana_miembros where id = p_miembro_id for update;
  if not found then raise exception 'Persona no encontrada.'; end if;
  if v_cons = 'revocado' then v_estado := 'no_contactar'; end if;
  if v_estado = 'no_contactar' then v_cons := 'revocado'; end if;
  if m.lead_id is not null and v_estado <> m.estado and v_estado <> 'no_contactar' then
    raise exception 'Esta persona ya es lead; su seguimiento continúa en Leads.';
  end if;
  update public.audiencia_contactos
     set consentimiento = v_cons, updated_at = now()
   where id = m.contacto_id and consentimiento is distinct from v_cons;
  update public.campana_miembros
     set estado = v_estado, canal = p_canal, ultimo_contacto = p_ultimo_contacto,
         proximo_seguimiento = p_proximo_seguimiento, nota = nullif(btrim(coalesce(p_nota,'')),'')
   where id = p_miembro_id;
  if not found then raise exception 'No tienes permiso para editar esta persona.'; end if;
end $$;

-- 10. Pasar a Leads sin duplicar
create or replace function public.pasar_miembro_a_lead(p_miembro_id uuid, p_responsable text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare m public.campana_miembros; c public.audiencia_contactos; v_campana text; v_lead text;
begin
  select * into m from public.campana_miembros where id = p_miembro_id for update;
  if not found then raise exception 'Persona no encontrada.'; end if;
  if m.lead_id is not null then return jsonb_build_object('lead_id',m.lead_id,'creado',false); end if;
  if m.estado <> 'interesado' then raise exception 'Primero marca a la persona como Interesada.'; end if;
  select * into c from public.audiencia_contactos where id = m.contacto_id;
  if c.consentimiento = 'revocado' then raise exception 'Esta persona pidió no ser contactada.'; end if;
  select nombre into v_campana from public.campanas where id = m.campana_id;

  select l.id into v_lead from public.leads l
   where l.empresa_id = m.empresa_id
     and coalesce(l.estado,'') <> 'descartado'
     and ((c.email_norm is not null and lower(btrim(l.email)) = c.email_norm)
       or (c.telefono_norm is not null and audiencia_norm_telefono(l.telefono) = c.telefono_norm))
   order by l.created_at desc limit 1;

  if v_lead is null then
    insert into public.leads (empresa_id,nombre_contacto,tipo_documento,telefono,email,fuente,campana,campana_id,
      necesidad,estado,registrado_desde,responsable,responsable_id)
    values (m.empresa_id,c.nombre,'DNI',c.telefono,c.email,'Base propia',v_campana,m.campana_id,
      'Interesado en '||v_campana,'nuevo','backoffice',p_responsable,auth.uid())
    returning id into v_lead;
    update public.campana_miembros set lead_id = v_lead where id = p_miembro_id;
    return jsonb_build_object('lead_id',v_lead,'creado',true);
  end if;

  update public.leads set campana_id = m.campana_id, campana = v_campana
   where id = v_lead and campana_id is null;
  update public.campana_miembros set lead_id = v_lead where id = p_miembro_id;
  return jsonb_build_object('lead_id',v_lead,'creado',false);
end $$;

revoke all on function public.importar_audiencia_campana(text,jsonb,boolean) from public, anon;
revoke all on function public.cambiar_estado_miembros(uuid[],text) from public, anon;
revoke all on function public.guardar_miembro_campana(uuid,text,text,date,date,text,text) from public, anon;
revoke all on function public.pasar_miembro_a_lead(uuid,text) from public, anon;
grant execute on function public.importar_audiencia_campana(text,jsonb,boolean) to authenticated;
grant execute on function public.cambiar_estado_miembros(uuid[],text) to authenticated;
grant execute on function public.guardar_miembro_campana(uuid,text,text,date,date,text,text) to authenticated;
grant execute on function public.pasar_miembro_a_lead(uuid,text) to authenticated;

-- 11. Atribución automática de leads por código de fuente
create or replace function public.leads_atribuir_campana()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id text; v_nombre text;
begin
  if new.campana_id is null and nullif(btrim(new.fuente),'') is not null then
    select c.id, c.nombre into v_id, v_nombre from public.campanas c
     where c.empresa_id = new.empresa_id
       and lower(btrim(c.fuente_codigo)) = lower(btrim(new.fuente));
    if v_id is not null then
      new.campana_id := v_id;
      new.campana := coalesce(new.campana, v_nombre);
    end if;
  end if;
  return new;
end $$;
revoke all on function public.leads_atribuir_campana() from public, anon, authenticated;
create trigger leads_atribuir_campana_trg before insert on public.leads
  for each row execute function public.leads_atribuir_campana();

-- 12. Corrección acotada: campaña Power BI de TIDEO SAC
update public.campanas set fuente_codigo = 'powerbi_ia_landing'
 where id = 'camp_4498183a-6d82-4429-b5f7-c42b5f8ee724' and empresa_id = 'emp_20609996464';

update public.leads
   set campana_id = 'camp_4498183a-6d82-4429-b5f7-c42b5f8ee724',
       campana = 'Power BI con IA - Complemento'
 where empresa_id = 'emp_20609996464' and campana_id is null
   and id in ('lead_1789819123348_sjoj6','lead_1789653676669_nxpa7','lead_mu4m52wa','lead_1789584669609_q7slu');

update public.oportunidades
   set campana_id = 'camp_4498183a-6d82-4429-b5f7-c42b5f8ee724'
 where empresa_id = 'emp_20609996464' and campana_id is null
   and lead_id = 'lead_1789584669609_q7slu';

-- 13. Comprobación
do $$
declare v_leads int; v_rls int;
begin
  select count(*) into v_leads from public.leads
   where campana_id = 'camp_4498183a-6d82-4429-b5f7-c42b5f8ee724';
  if v_leads <> 4 then raise exception 'Atribución esperada 4 leads, hay %', v_leads; end if;
  select count(*) into v_rls from pg_class
   where oid in ('public.audiencia_contactos'::regclass,'public.campana_miembros'::regclass) and relrowsecurity;
  if v_rls <> 2 then raise exception 'RLS incompleto'; end if;
  if public.audiencia_norm_linkedin('https://www.linkedin.com/in/Ana-X/?utm=1') <> 'linkedin.com/in/ana-x'
     or public.audiencia_norm_telefono('+51 987 654 321') <> '987654321' then
    raise exception 'Normalización incorrecta';
  end if;
end $$;
