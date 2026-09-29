import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

function getCommitMessage() {
  try {
    return execSync('git log -1 --pretty=%s').toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Se puede cambiar para la plataforma de despliegue sin afectar la app administrativa.
    base: env.VITE_APP_BASE_PATH || '/operaciones/',
    define: {
      __COMMIT_MSG__: JSON.stringify(getCommitMessage()),
    },
    plugins: [react()],
    // Puerto fijo para no coincidir con el Vite administrativo ni crear un
    // proxy recursivo cuando este último se inicia en un puerto alternativo.
    server: { port: 5175, strictPort: true },
  };
});

