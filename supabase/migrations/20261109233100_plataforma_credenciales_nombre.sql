-- Nombre de la credencial sin la palabra "Clave" (los avisos ya dicen "La clave ...").
update public.plataforma_credenciales
   set nombre = 'Claude de Aria (aria-erp-produccion)', actualizado_en = now()
 where id = 'anthropic_aria';

do $$
begin
  if not exists (select 1 from public.plataforma_credenciales where id = 'anthropic_aria' and nombre = 'Claude de Aria (aria-erp-produccion)') then
    raise exception 'No se actualizó el nombre de la credencial';
  end if;
end;
$$;
