-- La HC hereda la moneda de la oportunidad desde la que se crea
ALTER TABLE hojas_costeo
  ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) NOT NULL DEFAULT 'PEN';
