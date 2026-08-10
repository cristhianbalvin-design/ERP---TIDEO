export const resolverSociedadInicialFormularioCentro = ({
  multisociedadHabilitado,
  permiteEscritura,
  sociedadIdEscritura,
}) => (
  multisociedadHabilitado && permiteEscritura ? sociedadIdEscritura || '' : ''
);
