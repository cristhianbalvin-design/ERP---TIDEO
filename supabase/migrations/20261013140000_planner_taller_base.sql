-- Planner de taller · Fase 0 · base de datos (aditiva)
-- Catálogo maestro de tipos de máquina (global + sembrado por empresa), bahías, puestos,
-- máquinas de taller, asignaciones de equipo y extensión de planner_asignaciones.
-- No toca la tabla activos.

-- 0) Trigger genérico de updated_at propio del Planner
CREATE OR REPLACE FUNCTION public.planner_set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1) Catálogo maestro global (genérico, sin nombres de clientes)
CREATE TABLE IF NOT EXISTS public.planner_maquina_tipos_default (
  clave text PRIMARY KEY,
  nombre text NOT NULL,
  familia text NOT NULL CHECK (familia IN ('mec','rect','corte','conf','sold','trat','izaje','prue','serv')),
  base_3d text NOT NULL,
  descripcion text,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planner_maquina_tipos_default ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planner_mtd_select ON public.planner_maquina_tipos_default;
CREATE POLICY planner_mtd_select ON public.planner_maquina_tipos_default FOR SELECT TO authenticated USING (true);

INSERT INTO public.planner_maquina_tipos_default (clave, nombre, familia, base_3d, descripcion, orden) VALUES
('lathe','Torno convencional','mec','lathe','Cilindrado, refrentado y roscado de ejes y bujes',1),
('cnc','Torno CNC','mec','cnc','Torneado de precisión con control numérico',2),
('vlathe','Torno vertical (carrusel)','mec','cnc','Piezas grandes y pesadas de eje vertical',3),
('mill','Fresadora universal','mec','mill','Planeado, ranurado y chaveteros',4),
('vmc','Centro de mecanizado vertical','mec','cnc','Fresado CNC de 3 a 5 ejes',5),
('hmc','Centro de mecanizado horizontal','mec','cnc','Producción de carcasas y bloques',6),
('bore','Mandrinadora','mec','mill','Mandrinado de bloques, carcasas y bancadas',7),
('drill','Taladro de columna','mec','drill','Perforado y roscado de piezas medianas',8),
('radial','Taladro radial','mec','drill','Perforado de piezas grandes sin moverlas',9),
('shaper','Limadora / cepillo','mec','mill','Ranuras y planos en piezas largas',10),
('gear','Talladora de engranajes','mec','mill','Tallado y reparación de engranajes',11),
('broach','Brochadora','mec','press','Chaveteros y perfiles internos',12),
('honing','Máquina de bruñido (honing)','mec','grind','Acabado interior de camisas y cilindros hidráulicos',13),
('edm','Electroerosión (EDM)','mec','cnc','Cortes y cavidades en aceros endurecidos',14),
('grind','Rectificadora plana','rect','grind','Superficies planas con tolerancia fina',15),
('cgrind','Rectificadora cilíndrica','rect','grind','Ejes, pasadores y vástagos',16),
('crank','Rectificadora de cigüeñales','rect','grind','Muñones de cigüeñal y árboles de levas',17),
('vgrind','Rectificadora de asientos de válvulas','rect','grind','Culatas y asientos de válvulas',18),
('toolg','Afiladora de herramientas','rect','grind','Afilado de brocas, fresas y cuchillas',19),
('polish','Pulidora de vástagos','rect','grind','Acabado espejo de vástagos cromados',20),
('lap','Lapeadora','rect','grind','Acabado ultra fino de superficies de sello',21),
('saw','Sierra de cinta','corte','saw','Corte de barras y perfiles',22),
('cutoff','Sierra circular de corte','corte','saw','Corte rápido de tubos y barras',23),
('plasma','Corte por plasma / oxicorte','corte','plasma','Corte de planchas gruesas',24),
('laser','Corte láser','corte','plasma','Corte de precisión en chapa',25),
('wjet','Corte por chorro de agua','corte','plasma','Corte sin zona afectada por calor',26),
('shear','Cizalla de guillotina','corte','press','Corte recto de planchas',27),
('press','Prensa hidráulica','conf','press','Montaje, desmontaje y conformado',28),
('pressm','Prensa mecánica','conf','press','Estampado y trabajos repetitivos',29),
('bpress','Prensa de bujes y rodamientos','conf','press','Montaje a presión de bujes y rodamientos',30),
('straight','Prensa enderezadora','conf','press','Enderezado de ejes y barras',31),
('brake','Plegadora','conf','press','Plegado de planchas',32),
('roll','Roladora de planchas','conf','roll','Curvado de planchas y virolas',33),
('weld','Equipo de soldadura (MIG/TIG/SMAW)','sold','weld','Soldadura de estructuras y reparaciones',34),
('sarc','Soldadura por arco sumergido','sold','weld','Cordones largos en piezas gruesas',35),
('hardf','Equipo de recargue duro','sold','weld','Recargue de cucharas, dientes y desgastes',36),
('wpos','Posicionador de soldadura','sold','weld','Gira la pieza para soldar en posición',37),
('spray','Metalizado / termorociado','sold','booth','Recuperación de ejes y asientos por aporte',38),
('furn','Horno de tratamiento térmico','trat','oven','Temple, revenido y normalizado',39),
('stress','Horno de alivio de tensiones','trat','oven','Alivio de tensiones tras soldar',40),
('varn','Horno de barnizado','trat','oven','Curado de bobinados y barnices',41),
('chrome','Tanque de cromado','trat','chrome','Cromo duro en vástagos y camisas',42),
('plat','Línea de niquelado / galvanizado','trat','chrome','Recubrimientos electrolíticos',43),
('blast','Cabina de granallado / arenado','trat','booth','Limpieza y preparación de superficies',44),
('paint','Cabina de pintura','trat','booth','Pintado y acabado de componentes',45),
('wash','Lavadora industrial de piezas','trat','wash','Desengrase de componentes desarmados',46),
('usonic','Limpieza ultrasónica','trat','wash','Limpieza de piezas finas e inyectores',47),
('crane','Grúa puente','izaje','crane','Izaje de equipos y componentes en la bahía',48),
('gantry','Pórtico móvil','izaje','crane','Izaje en zonas sin grúa fija',49),
('jib','Grúa pluma','izaje','jib','Izaje local en un puesto de trabajo',50),
('hoist','Polipasto','izaje','hoist','Izaje liviano sobre riel',51),
('fork','Montacargas','izaje','fork','Traslado de componentes y repuestos',52),
('stand','Caballetes y soportes de componentes','izaje','stand','Apoyo de componentes durante el desarmado',53),
('bench','Banco de pruebas hidráulico','prue','bench','Prueba de presión y caudal',54),
('pump','Banco de pruebas de bombas','prue','bench','Rendimiento de bombas hidráulicas',55),
('cyl','Banco de pruebas de cilindros','prue','bench','Estanqueidad y carrera de cilindros',56),
('inj','Banco de inyectores','prue','bench','Calibración de inyectores diésel',57),
('dyno','Dinamómetro','prue','bench','Potencia y torque de motores y reductores',58),
('motorb','Banco de pruebas de motores eléctricos','prue','bench','Vacío y carga de motores eléctricos',59),
('bal','Balanceadora dinámica','prue','lathe','Balanceo de rotores, ejes y ventiladores',60),
('cmm','Máquina de medición (CMM)','prue','cmm','Control dimensional de piezas',61),
('laserA','Alineación láser','prue','cmm','Alineamiento de ejes y bancadas',62),
('hardt','Durómetro','prue','cmm','Dureza de piezas tratadas',63),
('compr','Compresor de aire','serv','compr','Aire comprimido para herramientas y pruebas',64),
('gen','Generador eléctrico','serv','compr','Respaldo de energía del taller',65),
('vacuum','Bomba de vacío','serv','compr','Vacío para pruebas y llenado',66),
('rewind','Bobinadora','serv','lathe','Rebobinado de motores y bobinas',67)
ON CONFLICT (clave) DO NOTHING;

-- 2) Catálogo por empresa (editable por cada tenant)
CREATE TABLE IF NOT EXISTS public.planner_maquina_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  clave text NOT NULL,
  nombre text NOT NULL,
  familia text NOT NULL CHECK (familia IN ('mec','rect','corte','conf','sold','trat','izaje','prue','serv')),
  base_3d text NOT NULL,
  descripcion text,
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  es_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, clave)
);
CREATE INDEX IF NOT EXISTS idx_planner_mt_empresa ON public.planner_maquina_tipos (empresa_id);
ALTER TABLE public.planner_maquina_tipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS planner_mt_select ON public.planner_maquina_tipos;
DROP POLICY IF EXISTS planner_mt_insert ON public.planner_maquina_tipos;
DROP POLICY IF EXISTS planner_mt_update ON public.planner_maquina_tipos;
CREATE POLICY planner_mt_select ON public.planner_maquina_tipos FOR SELECT
  USING (usuario_tiene_empresa(empresa_id));
CREATE POLICY planner_mt_insert ON public.planner_maquina_tipos FOR INSERT
  WITH CHECK (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'planner', 'crear'));
CREATE POLICY planner_mt_update ON public.planner_maquina_tipos FOR UPDATE
  USING (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'planner', 'editar'))
  WITH CHECK (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'planner', 'editar'));
DROP TRIGGER IF EXISTS trg_planner_mt_updated ON public.planner_maquina_tipos;
CREATE TRIGGER trg_planner_mt_updated BEFORE UPDATE ON public.planner_maquina_tipos
  FOR EACH ROW EXECUTE FUNCTION public.planner_set_updated_at();

CREATE OR REPLACE FUNCTION public.planner_sembrar_catalogo_maquinas(p_empresa_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.planner_maquina_tipos (empresa_id, clave, nombre, familia, base_3d, descripcion, orden)
  SELECT p_empresa_id, d.clave, d.nombre, d.familia, d.base_3d, d.descripcion, d.orden
  FROM public.planner_maquina_tipos_default d
  ON CONFLICT (empresa_id, clave) DO NOTHING;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.planner_sembrar_catalogo_maquinas(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_planner_sembrar_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.planner_sembrar_catalogo_maquinas(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_empresas_planner_catalogo ON public.empresas;
CREATE TRIGGER trg_empresas_planner_catalogo AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.trg_planner_sembrar_empresa();

-- Sembrado para todas las empresas existentes
SELECT public.planner_sembrar_catalogo_maquinas(e.id) FROM public.empresas e;

-- 3) Bahías y puestos
CREATE TABLE IF NOT EXISTS public.planner_bahias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid REFERENCES public.sociedades(id),
  codigo text NOT NULL,
  nombre text NOT NULL,
  categoria text NOT NULL DEFAULT 'general' CHECK (categoria IN ('general','pesada','sold','crom','mec','hidr')),
  orden integer NOT NULL DEFAULT 0,
  activa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_planner_bahias_emp ON public.planner_bahias (empresa_id, sociedad_id);

CREATE TABLE IF NOT EXISTS public.planner_puestos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  bahia_id uuid NOT NULL REFERENCES public.planner_bahias(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  nombre text,
  capacidad integer NOT NULL DEFAULT 1 CHECK (capacidad BETWEEN 1 AND 6),
  orden integer NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_planner_puestos_bahia ON public.planner_puestos (bahia_id);

-- 4) Máquinas de taller (recurso que consume horas-máquina; opcionalmente vinculadas a un activo, solo lectura)
CREATE TABLE IF NOT EXISTS public.planner_maquinas_taller (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid REFERENCES public.sociedades(id),
  tipo_clave text NOT NULL,
  codigo text,
  nombre text NOT NULL,
  bahia_id uuid REFERENCES public.planner_bahias(id) ON DELETE SET NULL,
  puesto_id uuid REFERENCES public.planner_puestos(id) ON DELETE SET NULL,
  activo_id text,
  horas_dia numeric NOT NULL DEFAULT 8 CHECK (horas_dia > 0 AND horas_dia <= 24),
  estado text NOT NULL DEFAULT 'disponible' CHECK (estado IN ('disponible','mantenimiento','baja')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (empresa_id, tipo_clave) REFERENCES public.planner_maquina_tipos (empresa_id, clave)
);
CREATE INDEX IF NOT EXISTS idx_planner_maq_emp ON public.planner_maquinas_taller (empresa_id, sociedad_id);
CREATE INDEX IF NOT EXISTS idx_planner_maq_bahia ON public.planner_maquinas_taller (bahia_id);

-- 5) Ocupación de puestos por OT y asignación de máquinas por OT/día
CREATE TABLE IF NOT EXISTS public.planner_ocupaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid REFERENCES public.sociedades(id),
  ot_id text NOT NULL,
  puesto_id uuid NOT NULL REFERENCES public.planner_puestos(id) ON DELETE CASCADE,
  fecha_desde date NOT NULL,
  fecha_hasta date NOT NULL,
  estado text NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado','ejecutado','cancelado')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fecha_hasta >= fecha_desde)
);
CREATE INDEX IF NOT EXISTS idx_planner_ocup_puesto ON public.planner_ocupaciones (puesto_id, fecha_desde, fecha_hasta);
CREATE INDEX IF NOT EXISTS idx_planner_ocup_ot ON public.planner_ocupaciones (empresa_id, ot_id);

CREATE TABLE IF NOT EXISTS public.planner_asignaciones_equipo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid REFERENCES public.sociedades(id),
  ot_id text NOT NULL,
  maquina_id uuid NOT NULL REFERENCES public.planner_maquinas_taller(id) ON DELETE CASCADE,
  tarea_id text,
  fecha date NOT NULL,
  horas_estimadas numeric NOT NULL DEFAULT 8 CHECK (horas_estimadas > 0 AND horas_estimadas <= 24),
  estado text NOT NULL DEFAULT 'programado' CHECK (estado IN ('programado','ejecutado','reprogramado','cancelado')),
  motivo_reprogramacion text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, ot_id, maquina_id, fecha)
);
CREATE INDEX IF NOT EXISTS idx_planner_aeq_maq_fecha ON public.planner_asignaciones_equipo (maquina_id, fecha);

-- 6) planner_asignaciones: columnas nuevas (nullables; filas existentes intactas)
ALTER TABLE public.planner_asignaciones
  ADD COLUMN IF NOT EXISTS sociedad_id uuid REFERENCES public.sociedades(id),
  ADD COLUMN IF NOT EXISTS puesto_id uuid REFERENCES public.planner_puestos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tarea_id text,
  ADD COLUMN IF NOT EXISTS horas_estimadas numeric CHECK (horas_estimadas IS NULL OR (horas_estimadas > 0 AND horas_estimadas <= 24));

-- 7) RLS + updated_at de las tablas nuevas (ver: planner/ver; crear: planner/crear; editar y borrar: planner/editar)
DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['planner_bahias','planner_puestos','planner_maquinas_taller','planner_ocupaciones','planner_asignaciones_equipo'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_sel', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_ins', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_upd', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_del', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR SELECT USING (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'planner', 'ver'))$f$, t||'_sel', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'planner', 'crear'))$f$, t||'_ins', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR UPDATE USING (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'planner', 'editar')) WITH CHECK (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'planner', 'editar'))$f$, t||'_upd', t);
    EXECUTE format($f$CREATE POLICY %I ON public.%I FOR DELETE USING (usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'planner', 'editar'))$f$, t||'_del', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.planner_set_updated_at()', t, t);
  END LOOP;
END $do$;

-- 8) Mover una asignación de persona entre OTs (atómico; no permite destinos cerrados)
CREATE OR REPLACE FUNCTION public.planner_mover_asignacion(p_asignacion_id uuid, p_ot_destino text, p_motivo text DEFAULT NULL)
RETURNS public.planner_asignaciones LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a public.planner_asignaciones; v_estado text;
BEGIN
  SELECT * INTO a FROM public.planner_asignaciones WHERE id = p_asignacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asignación no encontrada o sin acceso'; END IF;
  IF a.estado <> 'programado' THEN RAISE EXCEPTION 'Solo se pueden mover asignaciones programadas (estado actual: %)', a.estado; END IF;
  SELECT estado INTO v_estado FROM public.ordenes_trabajo WHERE id = p_ot_destino AND empresa_id = a.empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La OT destino no existe en la empresa'; END IF;
  IF v_estado IN ('anulada','cerrada','cerrado_conforme','valorizada') THEN
    RAISE EXCEPTION 'La OT destino está % y no admite asignaciones; reábrela primero', v_estado;
  END IF;
  IF EXISTS (SELECT 1 FROM public.planner_asignaciones x WHERE x.empresa_id=a.empresa_id AND x.ot_id=p_ot_destino AND x.tecnico_id=a.tecnico_id AND x.fecha=a.fecha AND x.id<>a.id) THEN
    RAISE EXCEPTION 'El técnico ya está asignado a la OT destino ese día';
  END IF;
  UPDATE public.planner_asignaciones
     SET ot_id = p_ot_destino, estado = 'programado', motivo_reprogramacion = COALESCE(p_motivo, motivo_reprogramacion), tarea_id = NULL
   WHERE id = a.id RETURNING * INTO a;
  RETURN a;
END $$;
GRANT EXECUTE ON FUNCTION public.planner_mover_asignacion(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.planner_mover_asignacion_equipo(p_asignacion_id uuid, p_ot_destino text, p_motivo text DEFAULT NULL)
RETURNS public.planner_asignaciones_equipo LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE a public.planner_asignaciones_equipo; v_estado text;
BEGIN
  SELECT * INTO a FROM public.planner_asignaciones_equipo WHERE id = p_asignacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asignación de equipo no encontrada o sin acceso'; END IF;
  IF a.estado <> 'programado' THEN RAISE EXCEPTION 'Solo se pueden mover asignaciones programadas (estado actual: %)', a.estado; END IF;
  SELECT estado INTO v_estado FROM public.ordenes_trabajo WHERE id = p_ot_destino AND empresa_id = a.empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La OT destino no existe en la empresa'; END IF;
  IF v_estado IN ('anulada','cerrada','cerrado_conforme','valorizada') THEN
    RAISE EXCEPTION 'La OT destino está % y no admite asignaciones; reábrela primero', v_estado;
  END IF;
  IF EXISTS (SELECT 1 FROM public.planner_asignaciones_equipo x WHERE x.empresa_id=a.empresa_id AND x.ot_id=p_ot_destino AND x.maquina_id=a.maquina_id AND x.fecha=a.fecha AND x.id<>a.id) THEN
    RAISE EXCEPTION 'La máquina ya está asignada a la OT destino ese día';
  END IF;
  UPDATE public.planner_asignaciones_equipo
     SET ot_id = p_ot_destino, motivo_reprogramacion = COALESCE(p_motivo, motivo_reprogramacion), tarea_id = NULL
   WHERE id = a.id RETURNING * INTO a;
  RETURN a;
END $$;
GRANT EXECUTE ON FUNCTION public.planner_mover_asignacion_equipo(uuid, text, text) TO authenticated;

-- 9) Comprobación: si algo falla, toda la migración se revierte
DO $chk$
DECLARE n_def integer; n_emp integer; n_mal integer;
BEGIN
  SELECT count(*) INTO n_def FROM public.planner_maquina_tipos_default;
  IF n_def <> 67 THEN RAISE EXCEPTION 'Catálogo default esperado 67, hay %', n_def; END IF;
  SELECT count(*) INTO n_emp FROM public.empresas;
  SELECT count(*) INTO n_mal FROM public.empresas e WHERE (SELECT count(*) FROM public.planner_maquina_tipos t WHERE t.empresa_id=e.id) <> 67;
  IF n_mal > 0 THEN RAISE EXCEPTION '% de % empresas sin los 67 tipos de máquina', n_mal, n_emp; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_empresas_planner_catalogo') THEN RAISE EXCEPTION 'Falta el trigger de siembra en empresas'; END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('planner_bahias','planner_puestos','planner_maquinas_taller','planner_ocupaciones','planner_asignaciones_equipo') AND rowsecurity) <> 5 THEN
    RAISE EXCEPTION 'Alguna tabla nueva sin RLS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='planner_asignaciones' AND column_name='sociedad_id') THEN RAISE EXCEPTION 'Falta planner_asignaciones.sociedad_id'; END IF;
END $chk$;
