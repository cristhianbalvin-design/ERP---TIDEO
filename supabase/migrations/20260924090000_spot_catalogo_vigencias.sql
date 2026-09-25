-- SPOT: actualizacion de vigencias verificadas contra normas oficiales.
-- Solo actualiza filas que aun tienen la vigencia de respaldo 2026-09-24.
-- El codigo 010 queda fuera: su tasa actual se confirma en el apendice,
-- pero no se identifico aun la norma que fijo historicamente el 15% vigente.

do $$
declare
  v_actualizadas integer;
  v_tasas integer;
  v_superpuestas integer;
  v_textos_invalidos integer;
begin
  with esperadas(codigo, porcentaje, nueva_vigencia, nueva_fuente_url, nueva_referencia) as (
    values
      ('019', 10.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 10%; vigencia 2015-01-01.'),
      ('021', 10.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 10%; vigencia 2015-01-01.'),
      ('024', 10.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 10%; vigencia 2015-01-01.'),
      ('025', 10.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 10%; vigencia 2015-01-01.'),
      ('026', 10.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 10%; vigencia 2015-01-01.'),
      ('030', 4.00::numeric, date '2013-11-01', 'https://www.sunat.gob.pe/legislacion/superin/2013/265-2013.pdf', 'R.S. 265-2013/SUNAT; porcentaje actual 4%; vigencia 2013-11-01.'),
      ('027', 4.00::numeric, date '2006-10-01', 'https://www.sunat.gob.pe/legislacion/superin/2006/158.htm', 'R.S. 158-2006/SUNAT; porcentaje actual 4%; vigencia 2006-10-01.'),
      ('004', 4.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 4%; vigencia 2015-01-01.'),
      ('005', 4.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 4%; vigencia 2015-01-01.'),
      ('008', 4.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 4%; vigencia 2015-01-01.'),
      ('009', 10.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 10%; vigencia 2015-01-01.'),
      ('014', 4.00::numeric, date '2005-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2004/300.htm', 'R.S. 300-2004/SUNAT; porcentaje actual 4%; vigencia 2005-01-01.'),
      ('017', 4.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 4%; vigencia 2015-01-01.'),
      ('031', 10.00::numeric, date '2025-04-01', 'https://www.sunat.gob.pe/legislacion/superin/2025/000086-2025.pdf', 'R.S. 086-2025/SUNAT; numeral 16 modificado; porcentaje actual 10%; vigencia 2025-04-01.'),
      ('035', 1.50::numeric, date '2012-11-01', 'https://www.sunat.gob.pe/legislacion/superin/2012/249-2012.pdf', 'R.S. 249-2012/SUNAT; porcentaje actual 1.5%; vigencia 2012-11-01.'),
      ('036', 1.50::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 1.5%; vigencia 2015-01-01.'),
      ('039', 10.00::numeric, date '2015-01-01', 'https://www.sunat.gob.pe/legislacion/superin/2014/343-2014.pdf', 'R.S. 343-2014/SUNAT; porcentaje actual 10%; vigencia 2015-01-01.')
  ), actualizadas as (
    update public.spot_catalogo s
       set vigencia_desde = e.nueva_vigencia,
           fuente_url = e.nueva_fuente_url,
           fuente_referencia = e.nueva_referencia
      from esperadas e
     where s.codigo = e.codigo
       and s.vigencia_desde = date '2026-09-24'
    returning s.codigo
  )
  select count(*) into v_actualizadas from actualizadas;

  if v_actualizadas <> 17 then
    raise exception 'VIGENCIAS|filas_actualizadas=%|esperadas=17', v_actualizadas;
  end if;
  raise notice 'VIGENCIAS|filas_actualizadas=%', v_actualizadas;

  with esperadas(codigo, porcentaje, nueva_vigencia) as (
    values
      ('019', 10.00::numeric, date '2015-01-01'), ('021', 10.00::numeric, date '2015-01-01'),
      ('024', 10.00::numeric, date '2015-01-01'), ('025', 10.00::numeric, date '2015-01-01'),
      ('026', 10.00::numeric, date '2015-01-01'), ('030', 4.00::numeric, date '2013-11-01'),
      ('027', 4.00::numeric, date '2006-10-01'), ('004', 4.00::numeric, date '2015-01-01'),
      ('005', 4.00::numeric, date '2015-01-01'), ('008', 4.00::numeric, date '2015-01-01'),
      ('009', 10.00::numeric, date '2015-01-01'), ('014', 4.00::numeric, date '2005-01-01'),
      ('017', 4.00::numeric, date '2015-01-01'), ('031', 10.00::numeric, date '2025-04-01'),
      ('035', 1.50::numeric, date '2012-11-01'), ('036', 1.50::numeric, date '2015-01-01'),
      ('039', 10.00::numeric, date '2015-01-01')
  )
  select count(*) into v_tasas
    from esperadas e
    join public.spot_catalogo s
      on s.codigo = e.codigo and s.vigencia_desde = e.nueva_vigencia
   where s.porcentaje = e.porcentaje;

  if v_tasas <> 17 then
    raise exception 'VIGENCIAS|tasas_sin_cambios=%|esperadas=17', v_tasas;
  end if;
  raise notice 'VIGENCIAS|tasas_sin_cambios=%', v_tasas;

  select count(*) into v_superpuestas
    from public.spot_catalogo a
    join public.spot_catalogo b
      on a.codigo = b.codigo
     and a.id < b.id
     and daterange(a.vigencia_desde, coalesce(a.vigencia_hasta + 1, 'infinity'::date), '[)')
         && daterange(b.vigencia_desde, coalesce(b.vigencia_hasta + 1, 'infinity'::date), '[)');

  if v_superpuestas <> 0 then
    raise exception 'VIGENCIAS|vigencias_superpuestas=%', v_superpuestas;
  end if;
  raise notice 'VIGENCIAS|vigencias_superpuestas=0';

  select count(*) into v_textos_invalidos
    from public.spot_catalogo
   where descripcion like '%?%'
      or fuente_referencia like '%?%'
      or position(chr(65533) in descripcion) > 0
      or position(chr(65533) in fuente_referencia) > 0;

  if v_textos_invalidos <> 0 then
    raise exception 'VIGENCIAS|textos_invalidos=%', v_textos_invalidos;
  end if;
  raise notice 'VIGENCIAS|textos_invalidos=0';
end;
$$;
