BEGIN;

-- OPERACION 1: Eliminar familia legacy
DELETE FROM public.personal_documentos
WHERE id IN ('pdoc_71374649-b4d', 'pdoc_97264873-fb7', 'pdoc_f2741152-c5f')
  AND empresa_id = 'emp_2000000000';

-- OPERACION 2: Eliminar versiones de prueba del grupo e72b401e
DELETE FROM public.personal_documentos
WHERE id IN (
  'pdoc_44c152ed-076',
  'pdoc_a964fb3e-f6d',
  'pdoc_684d0f43-2be',
  'pdoc_e6196079-096',
  'pdoc_6af929d7-cb6',
  'pdoc_189bf28a-602',
  'pdoc_1f036752-8d9'
) AND periodo_grupo_id = 'e72b401e-02dd-41ee-b1f2-68512d8c5177';

-- OPERACION 3: Eliminar grupo 51c39d92 completo
DELETE FROM public.personal_documentos
WHERE id IN ('pdoc_301f6583-38f', 'pdoc_d3ada741-ceb')
  AND periodo_grupo_id = '51c39d92-9aab-4220-b456-0e62a3d0f956';

-- OPERACION 4: Limpiar versión suelta sin grupo
UPDATE public.personal_documentos
SET periodo_grupo_id = 'e72b401e-02dd-41ee-b1f2-68512d8c5177',
    version = 1
WHERE id = 'pdoc_7e1ec13d-b05';

-- OPERACION 5: Renumerar versión del grupo 5c47015c
UPDATE public.personal_documentos
SET version = 1
WHERE id = 'pdoc_3b7b82a8-6c3';

UPDATE public.personal_documentos
SET version = 2
WHERE id = 'pdoc_70995809-bd7';

COMMIT;
