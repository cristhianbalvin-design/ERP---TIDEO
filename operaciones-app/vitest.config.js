import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

// Estas pruebas usan el runner nativo de Node (node:test) y se ejecutan con `npm run test:node`.
export const NODE_TESTS = [
  'src/services/emisionInformeFlujo.test.js',
  'src/services/emisorPersonal.test.js',
  'src/zahory-mock/pages/dibujoHallazgoLogic.test.mjs',
  'src/zahory-mock/pages/informeSnapshotDibujo.test.mjs',
  'src/zahory-mock/pages/transporte/transporteUtils.test.mjs',
  'tests/hallazgosValidation.test.mjs',
  'tests/informeFotosFilas.native.test.js',
  'tests/informeSnapshot.native.test.js',
  'tests/validarBorradorDiagnostico.test.js'
];

export default defineConfig(env => mergeConfig(viteConfig(env), {
  test: {
    exclude: [...configDefaults.exclude, ...NODE_TESTS],
  },
}));
