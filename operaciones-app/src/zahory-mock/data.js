import { ZAHORY_SAC_DATA as SOURCE_ZAHORY_DATA } from './mocks/data.js';

const assetBase = `${import.meta.env.BASE_URL}zahory-mock/images/`;

export const ZAHORY_SAC_DATA = {
  ...SOURCE_ZAHORY_DATA,
  flota_equipos_rental: SOURCE_ZAHORY_DATA.flota_equipos_rental.map(equipo => ({
    ...equipo,
    imagen: equipo.imagen?.replace('/images/', assetBase),
  })),
};
