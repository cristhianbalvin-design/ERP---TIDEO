create or replace function public.validar_diagnostico_tecnico_linea_referencias() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare de text; fe text; ae text; te text; ce text; xe text;
begin
 if tg_op='UPDATE' and new.diagnostico_id is distinct from old.diagnostico_id then raise exception 'No se puede mover una linea a otro diagnostico.' using errcode='42501'; end if;
 select empresa_id into de from public.diagnosticos_tecnicos where id=new.diagnostico_id;
 select empresa_id into fe from public.familia_trabajo where id=new.familia_trabajo_id;
 select empresa_id into ae from public.tipos_servicio_interno where id=new.actividad_id;
 select empresa_id into te from public.tipos_servicio_interno where id=new.tarea_id;
 select empresa_id into ce from public.cargos_empresa where id=new.cargo_id;
 if de is distinct from new.empresa_id then raise exception 'La linea y su diagnostico deben pertenecer al mismo tenant.' using errcode='23514'; end if;
 if fe is distinct from new.empresa_id then raise exception 'La familia de trabajo debe pertenecer al mismo tenant.' using errcode='23514'; end if;
 if new.actividad_id is not null and ae is distinct from new.empresa_id then raise exception 'La actividad debe pertenecer al mismo tenant.' using errcode='23514'; end if;
 if new.tarea_id is not null and te is distinct from new.empresa_id then raise exception 'La tarea debe pertenecer al mismo tenant.' using errcode='23514'; end if;
 if new.cargo_id is not null and ce is distinct from new.empresa_id then raise exception 'El cargo debe pertenecer al mismo tenant.' using errcode='23514'; end if;
 if new.activo_id is not null then select empresa_id into xe from public.activos where id=new.activo_id and propietario_tipo='propio' and cliente_propietario_id is null; if xe is distinct from new.empresa_id then raise exception 'El activo de maquina debe ser propio y pertenecer al mismo tenant.' using errcode='23514'; end if; end if;
 return new;
end $$;
