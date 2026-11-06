-- Audiencia: tipo de cliente, empresa, cargo, estado al importar y datos completos al pasar a Leads.

-- 1. Columnas nuevas
alter table public.audiencia_contactos
  add column tipo_cliente text not null default 'persona',
  add column empresa_nombre text,
  add column cargo text;
alter table public.audiencia_contactos
  add constraint audiencia_contactos_tipo_cliente_check check (tipo_cliente in ('persona','empresa')),
  add constraint audiencia_contactos_empresa_requerida check (tipo_cliente = 'persona' or nullif(btrim(empresa_nombre),'') is not null);

alter table public.leads add column linkedin_url text;
create index leads_linkedin_norm_idx on public.leads (empresa_id, public.audiencia_norm_linkedin(linkedin_url))
  where linkedin_url is not null;

-- 2. Traducción del estado escrito en el archivo
create or replace function public.audiencia_estado_desde_texto(p text)
returns text language sql immutable parallel safe as $$
  select case
    when t in ('por enviar','por_enviar','pendiente','sin enviar','no enviado','por contactar','sin contactar','nuevo') then 'por_enviar'
    when t in ('enviado','enviada','contactado','contactada','mensaje enviado','escrito') then 'enviado'
    when t in ('interesado','interesada') then 'interesado'
    when t in ('no interesado','no interesada','no_interesado') then 'no_interesado'
    when t in ('sin respuesta','sin_respuesta','no responde','no respondio') then 'sin_respuesta'
    when t in ('no contactar','no_contactar','no molestar') then 'no_contactar'
  end
  from (select lower(btrim(translate(coalesce(p,''),'ÁÉÍÓÚáéíóú','AEIOUaeiou'))) as t) x
$$;

-- 3. Importación con los campos nuevos
create or replace function public.importar_audiencia_campana(p_campana_id text, p_filas jsonb, p_simular boolean default true)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  v_empresa text; f jsonb; v_id uuid; v_cons text; v_estado_c text; v_txt text;
  v_lk text; v_em text; v_tel text; v_nuevo boolean; v_filas int := 0;
  v_nuevas int := 0; v_existen int := 0; v_en_campana int := 0;
  v_sin_contacto int := 0; v_sin_nombre int := 0; v_no_contactar int := 0; v_agregadas int := 0;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_emp text; v_car text; v_tipo text; v_estado text; v_texto_estado text; v_sin_estado int := 0;
  v_estados jsonb := '{}'::jsonb;
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

      v_emp := nullif(btrim(f->>'empresa_nombre'),'');
      v_car := nullif(btrim(f->>'cargo'),'');
      v_tipo := case when lower(btrim(coalesce(f->>'tipo_cliente',''))) = 'empresa' and v_emp is not null then 'empresa' else 'persona' end;
      v_texto_estado := nullif(btrim(f->>'estado'),'');
      v_estado := audiencia_estado_desde_texto(v_texto_estado);
      if v_estado is null then
        if v_texto_estado is not null then v_sin_estado := v_sin_estado + 1; end if;
        v_estado := 'por_enviar';
      end if;

      v_txt := lower(btrim(coalesce(f->>'consentimiento','')));
      v_cons := case when v_txt in ('confirmado','si','sí','true','1') then 'confirmado'
                     when v_txt in ('revocado','no','no contactar','false','0') or v_estado = 'no_contactar' then 'revocado'
                     else 'por_confirmar' end;

      select c.id, c.consentimiento into v_id, v_estado_c
        from public.audiencia_contactos c
       where c.empresa_id = v_empresa
         and (c.linkedin_norm = v_lk or c.email_norm = v_em or c.telefono_norm = v_tel)
       order by c.created_at limit 1;
      v_nuevo := not found;

      if v_nuevo then
        insert into public.audiencia_contactos (empresa_id,nombre,linkedin_url,email,telefono,etiqueta,consentimiento,tipo_cliente,empresa_nombre,cargo)
        values (v_empresa, btrim(f->>'nombre'), nullif(btrim(f->>'linkedin_url'),''), nullif(btrim(f->>'email'),''),
                nullif(btrim(f->>'telefono'),''), nullif(btrim(f->>'etiqueta'),''), v_cons, v_tipo, v_emp, v_car)
        returning id, consentimiento into v_id, v_estado_c;
      else
        update public.audiencia_contactos
           set empresa_nombre = coalesce(empresa_nombre, v_emp), cargo = coalesce(cargo, v_car), updated_at = now()
         where id = v_id and ((empresa_nombre is null and v_emp is not null) or (cargo is null and v_car is not null));
      end if;

      if v_estado_c = 'revocado' then v_no_contactar := v_no_contactar + 1; continue; end if;

      insert into public.campana_miembros (empresa_id,campana_id,contacto_id,estado,nota,ultimo_contacto,proximo_seguimiento)
      values (v_empresa,p_campana_id,v_id,v_estado,nullif(btrim(f->>'observacion'),''),
              case when v_estado = 'por_enviar' then null else v_hoy end,
              case when v_estado = 'enviado' then v_hoy + 5 end)
      on conflict (campana_id,contacto_id) do nothing;
      if found then
        v_agregadas := v_agregadas + 1;
        v_estados := jsonb_set(v_estados, array[v_estado], to_jsonb(coalesce((v_estados->>v_estado)::int,0) + 1));
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
    'agregadas',v_agregadas,'simulado',p_simular,'estados',v_estados,'estado_sin_reconocer',v_sin_estado);
end $$;

-- 4. Ficha completa: datos de la persona y seguimiento en una sola operación
create or replace function public.guardar_ficha_miembro_campana(
  p_miembro_id uuid, p_estado text, p_canal text, p_ultimo_contacto date,
  p_proximo_seguimiento date, p_nota text, p_consentimiento text,
  p_tipo_cliente text, p_empresa_nombre text, p_cargo text)
returns void language plpgsql security invoker set search_path = public as $$
declare v_contacto uuid; v_lead text;
begin
  select contacto_id, lead_id into v_contacto, v_lead from public.campana_miembros where id = p_miembro_id;
  if not found then raise exception 'Persona no encontrada.'; end if;
  if p_tipo_cliente = 'empresa' and nullif(btrim(p_empresa_nombre),'') is null then
    raise exception 'Escribe la empresa.';
  end if;
  update public.audiencia_contactos
     set tipo_cliente = p_tipo_cliente, empresa_nombre = nullif(btrim(p_empresa_nombre),''),
         cargo = nullif(btrim(p_cargo),''), updated_at = now()
   where id = v_contacto;
  if not found then raise exception 'No tienes permiso para editar esta persona.'; end if;
  perform public.guardar_miembro_campana(p_miembro_id,p_estado,p_canal,p_ultimo_contacto,p_proximo_seguimiento,p_nota,p_consentimiento);
end $$;

-- 5. Paso a Leads con todos los datos
create or replace function public.pasar_miembro_a_lead(p_miembro_id uuid, p_responsable text default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare m public.campana_miembros; c public.audiencia_contactos; v_campana text; v_lead text; v_necesidad text;
begin
  select * into m from public.campana_miembros where id = p_miembro_id for update;
  if not found then raise exception 'Persona no encontrada.'; end if;
  if m.lead_id is not null then return jsonb_build_object('lead_id',m.lead_id,'creado',false); end if;
  if m.estado <> 'interesado' then raise exception 'Primero marca a la persona como Interesada.'; end if;
  select * into c from public.audiencia_contactos where id = m.contacto_id;
  if c.consentimiento = 'revocado' then raise exception 'Esta persona pidió no ser contactada.'; end if;
  select nombre into v_campana from public.campanas where id = m.campana_id;
  v_necesidad := v_campana || case when m.nota is null then '' else E'\n' || m.nota end;

  select l.id into v_lead from public.leads l
   where l.empresa_id = m.empresa_id
     and coalesce(l.estado,'') <> 'descartado'
     and ((c.email_norm is not null and lower(btrim(l.email)) = c.email_norm)
       or (c.telefono_norm is not null and audiencia_norm_telefono(l.telefono) = c.telefono_norm)
       or (c.linkedin_norm is not null and audiencia_norm_linkedin(l.linkedin_url) = c.linkedin_norm))
   order by l.created_at desc limit 1;

  if v_lead is null then
    insert into public.leads (empresa_id,nombre_contacto,tipo_documento,empresa_nombre,razon_social,cargo,linkedin_url,telefono,email,fuente,campana,campana_id,
      necesidad,estado,registrado_desde,responsable,responsable_id)
    values (m.empresa_id,c.nombre,case when c.tipo_cliente = 'empresa' then 'RUC' else 'DNI' end,c.empresa_nombre,
      case when c.tipo_cliente = 'empresa' then c.empresa_nombre end,c.cargo,c.linkedin_url,c.telefono,c.email,'Base propia',v_campana,m.campana_id,
      v_necesidad,'nuevo','backoffice',p_responsable,auth.uid())
    returning id into v_lead;
    update public.campana_miembros set lead_id = v_lead where id = p_miembro_id;
    return jsonb_build_object('lead_id',v_lead,'creado',true);
  end if;

  update public.leads
     set campana_id = coalesce(campana_id, m.campana_id), campana = coalesce(campana, v_campana),
         linkedin_url = coalesce(linkedin_url, c.linkedin_url), cargo = coalesce(cargo, c.cargo),
         empresa_nombre = coalesce(empresa_nombre, c.empresa_nombre)
   where id = v_lead;
  update public.campana_miembros set lead_id = v_lead where id = p_miembro_id;
  return jsonb_build_object('lead_id',v_lead,'creado',false);
end $$;

revoke all on function public.guardar_ficha_miembro_campana(uuid,text,text,date,date,text,text,text,text,text) from public, anon;
grant execute on function public.guardar_ficha_miembro_campana(uuid,text,text,date,date,text,text,text,text,text) to authenticated;
revoke all on function public.importar_audiencia_campana(text,jsonb,boolean) from public, anon;
revoke all on function public.pasar_miembro_a_lead(uuid,text) from public, anon;
grant execute on function public.importar_audiencia_campana(text,jsonb,boolean) to authenticated;
grant execute on function public.pasar_miembro_a_lead(uuid,text) to authenticated;

-- 6. Comprobación
do $$
begin
  if public.audiencia_estado_desde_texto(' Contactado ') <> 'enviado'
     or public.audiencia_estado_desde_texto('No respondió') <> 'sin_respuesta'
     or public.audiencia_estado_desde_texto('otro') is not null then
    raise exception 'Mapeo de estados incorrecto';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='linkedin_url') then
    raise exception 'Falta leads.linkedin_url';
  end if;
end $$;
