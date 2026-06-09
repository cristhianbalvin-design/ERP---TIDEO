-- Algunas oportunidades históricas tienen moneda = NULL en la base de datos,
-- lo que hace que el Pipeline y la Hoja de Costeo las muestren en Soles (PEN)
-- aunque el lead de origen esté registrado en otra moneda (ej. USD).
-- Este fix en dos pasos:
--   1. Para opps con lead vinculado y moneda NULL: hereda la moneda del lead.
--   2. Para el resto (moneda NULL sin lead): usa 'PEN' como default seguro.

UPDATE public.oportunidades o
SET moneda = l.moneda
FROM public.leads l
WHERE (o.lead_id = l.id)
  AND o.moneda IS NULL
  AND l.moneda IS NOT NULL
  AND l.moneda != '';

UPDATE public.oportunidades
SET moneda = 'PEN'
WHERE moneda IS NULL;

-- Evitar futuros NULLs: la columna ya tiene DEFAULT 'PEN' en el schema,
-- pero aplicamos NOT NULL explícitamente como protección adicional.
ALTER TABLE public.oportunidades
  ALTER COLUMN moneda SET DEFAULT 'PEN',
  ALTER COLUMN moneda SET NOT NULL;
