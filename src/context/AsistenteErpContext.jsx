import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const AsistenteErpContext = createContext(null);
const solicitarAperturaVacia = () => {};

export function AsistenteErpProvider({ children }) {
  const [contexto, setContexto] = useState(null);
  const [solicitudApertura, setSolicitudApertura] = useState(0);
  const publicarContexto = useCallback(value => setContexto(value?.tipo && value?.id ? value : null), []);
  const solicitarApertura = useCallback(() => setSolicitudApertura(nonce => nonce + 1), []);
  const value = useMemo(() => ({ contexto, publicarContexto, solicitudApertura, solicitarApertura }), [contexto, publicarContexto, solicitudApertura, solicitarApertura]);
  return <AsistenteErpContext.Provider value={value}>{children}</AsistenteErpContext.Provider>;
}

export function useAsistenteContexto(value) {
  const context = useContext(AsistenteErpContext);
  React.useEffect(() => {
    if (!context) return undefined;
    context.publicarContexto(value);
    return () => context.publicarContexto(null);
  }, [context, value?.modulo, value?.tipo, value?.id, value?.etiqueta]);
}

export function useAsistenteErp() {
  return useContext(AsistenteErpContext) || { contexto: null, solicitudApertura: 0, solicitarApertura: solicitarAperturaVacia };
}
