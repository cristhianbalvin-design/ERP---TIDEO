-- Audiencia: permite personas sin LinkedIn, correo ni teléfono.
-- Sin esos datos se reconocen por nombre, y una reimportación con enlaces las completa sin duplicarlas.

alter table public.audiencia_contactos drop constraint audiencia_contactos_con_contacto;

create or replace function public.audiencia_norm_nombre(p text)
returns text
language sql
immutable parallel safe
as $$
  select nullif(lower(regexp_replace(btrim(translate(coalesce(p,''),'ÁÉÍÓÚÜáéíóúü','AEIOUUaeiouu')),'\s+',' ','g')),'')
$$;

create or replace function public.audiencia_estado_desde_texto(p text)
returns text
language sql
immutable parallel safe
as $function$
  select case
    when t in ('por enviar','por_enviar','pendiente','sin enviar','no enviado','por contactar','sin contactar','nuevo','conectado','conectada') then 'por_enviar'
    when t in ('enviado','enviada','contactado','contactada','mensaje enviado','escrito') then 'enviado'
    when t in ('interesado','interesada') then 'interesado'
    when t in ('no interesado','no interesada','no_interesado') then 'no_interesado'
    when t in ('sin respuesta','sin_respuesta','no responde','no respondio') then 'sin_respuesta'
    when t in ('no contactar','no_contactar','no molestar') then 'no_contactar'
  end
  from (select lower(btrim(translate(coalesce(p,''),'ÁÉÍÓÚáéíóú','AEIOUaeiou'))) as t) x
$function$;

create or replace function public.importar_audiencia_campana(p_campana_id text, p_filas jsonb, p_simular boolean default true)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_empresa text; f jsonb; v_id uuid; v_cons text; v_estado_c text; v_txt text;
  v_lk text; v_em text; v_tel text; v_nuevo boolean; v_filas int := 0;
  v_nuevas int := 0; v_existen int := 0; v_en_campana int := 0;
  v_sin_contacto int := 0; v_sin_nombre int := 0; v_no_contactar int := 0; v_agregadas int := 0;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_emp text; v_car text; v_tipo text; v_estado text; v_texto_estado text; v_sin_estado int := 0;
  v_estados jsonb := '{}'::jsonb;
  v_sin_datos boolean; v_por_nombre boolean; v_completados int := 0;
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
      v_sin_datos := v_lk is null and v_em is null and v_tel is null;
      if v_sin_datos then v_sin_contacto := v_sin_contacto + 1; end if;

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
      v_por_nombre := false;

      if v_nuevo then
        select c.id, c.consentimiento into v_id, v_estado_c
          from public.audiencia_contactos c
         where c.empresa_id = v_empresa
           and audiencia_norm_nombre(c.nombre) = audiencia_norm_nombre(f->>'nombre')
           and (v_sin_datos or num_nonnulls(c.linkedin_norm, c.email_norm, c.telefono_norm) = 0)
         order by c.created_at limit 1;
        v_por_nombre := found;
        v_nuevo := not found;
      end if;

      if v_nuevo then
        insert into public.audiencia_contactos (empresa_id,nombre,linkedin_url,email,telefono,etiqueta,consentimiento,tipo_cliente,empresa_nombre,cargo)
        values (v_empresa, btrim(f->>'nombre'), nullif(btrim(f->>'linkedin_url'),''), nullif(btrim(f->>'email'),''),
                nullif(btrim(f->>'telefono'),''), nullif(btrim(f->>'etiqueta'),''), v_cons, v_tipo, v_emp, v_car)
        returning id, consentimiento into v_id, v_estado_c;
      else
        update public.audiencia_contactos
           set empresa_nombre = coalesce(empresa_nombre, v_emp), cargo = coalesce(cargo, v_car), updated_at = now()
         where id = v_id and ((empresa_nombre is null and v_emp is not null) or (cargo is null and v_car is not null));

        if v_por_nombre and not v_sin_datos then
          update public.audiencia_contactos
             set linkedin_url = coalesce(nullif(btrim(f->>'linkedin_url'),''), linkedin_url),
                 email = coalesce(nullif(btrim(f->>'email'),''), email),
                 telefono = coalesce(nullif(btrim(f->>'telefono'),''), telefono),
                 updated_at = now()
           where id = v_id;
          update public.leads l
             set linkedin_url = coalesce(l.linkedin_url, nullif(btrim(f->>'linkedin_url'),'')),
                 email = coalesce(l.email, nullif(btrim(f->>'email'),'')),
                 telefono = coalesce(l.telefono, nullif(btrim(f->>'telefono'),''))
           where l.id in (select m.lead_id from public.campana_miembros m where m.contacto_id = v_id and m.lead_id is not null);
          v_completados := v_completados + 1;
        end if;
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
    'agregadas',v_agregadas,'simulado',p_simular,'estados',v_estados,'estado_sin_reconocer',v_sin_estado,
    'completados',v_completados);
end $function$;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'audiencia_contactos_con_contacto') then
    raise exception 'La restricción de contacto sigue activa.';
  end if;
  if public.audiencia_estado_desde_texto('Conectado') <> 'por_enviar' then
    raise exception 'Conectado no se reconoce como Por enviar.';
  end if;
  if public.audiencia_norm_nombre('  Ána   MARÍA ') <> 'ana maria' then
    raise exception 'La normalización del nombre falló.';
  end if;
  if pg_get_functiondef('public.importar_audiencia_campana(text,jsonb,boolean)'::regprocedure) not like '%v_completados%' then
    raise exception 'La importación no quedó actualizada.';
  end if;
end $$;
