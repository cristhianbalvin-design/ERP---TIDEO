// vite.config.js
import { defineConfig } from "file:///D:/VIBECODING/ERP%20-%20TIDEO/node_modules/vite/dist/node/index.js";
import react from "file:///D:/VIBECODING/ERP%20-%20TIDEO/node_modules/@vitejs/plugin-react/dist/index.js";
import { VitePWA } from "file:///D:/VIBECODING/ERP%20-%20TIDEO/node_modules/vite-plugin-pwa/dist/index.js";
import { execSync } from "node:child_process";
function getCommitMessage() {
  try {
    return execSync("git log -1 --pretty=%s").toString().trim();
  } catch {
    return "";
  }
}
var vite_config_default = defineConfig({
  define: {
    __COMMIT_MSG__: JSON.stringify(getCommitMessage())
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "TIDEO ERP",
        short_name: "TIDEO ERP",
        description: "ERP modular multitenant con CRM, operaciones, finanzas, campo m\xF3vil, BI e IA.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        lang: "es",
        background_color: "#EEF2F6",
        theme_color: "#0D1B2E",
        icons: [
          { src: "/icons/tideo-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/tideo-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/tideo-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icons/tideo-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        // Precachea todos los assets del build (JS, CSS, HTML, imágenes, fuentes)
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,webp,woff,woff2,webmanifest}"],
        // El bundle principal del ERP supera el límite por defecto de 2 MiB
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          // Fuentes de Google — cache-first, 1 año
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheet",
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxWSUJFQ09ESU5HXFxcXEVSUCAtIFRJREVPXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxWSUJFQ09ESU5HXFxcXEVSUCAtIFRJREVPXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9WSUJFQ09ESU5HL0VSUCUyMC0lMjBUSURFTy92aXRlLmNvbmZpZy5qc1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnO1xuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0JztcbmltcG9ydCB7IFZpdGVQV0EgfSBmcm9tICd2aXRlLXBsdWdpbi1wd2EnO1xuaW1wb3J0IHsgZXhlY1N5bmMgfSBmcm9tICdub2RlOmNoaWxkX3Byb2Nlc3MnO1xuXG5mdW5jdGlvbiBnZXRDb21taXRNZXNzYWdlKCkge1xuICB0cnkge1xuICAgIHJldHVybiBleGVjU3luYygnZ2l0IGxvZyAtMSAtLXByZXR0eT0lcycpLnRvU3RyaW5nKCkudHJpbSgpO1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4gJyc7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgZGVmaW5lOiB7XG4gICAgX19DT01NSVRfTVNHX186IEpTT04uc3RyaW5naWZ5KGdldENvbW1pdE1lc3NhZ2UoKSksXG4gIH0sXG4gIHBsdWdpbnM6IFtcbiAgICByZWFjdCgpLFxuICAgIFZpdGVQV0Eoe1xuICAgICAgcmVnaXN0ZXJUeXBlOiAnYXV0b1VwZGF0ZScsXG5cbiAgICAgIG1hbmlmZXN0OiB7XG4gICAgICAgIG5hbWU6ICdUSURFTyBFUlAnLFxuICAgICAgICBzaG9ydF9uYW1lOiAnVElERU8gRVJQJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdFUlAgbW9kdWxhciBtdWx0aXRlbmFudCBjb24gQ1JNLCBvcGVyYWNpb25lcywgZmluYW56YXMsIGNhbXBvIG1cdTAwRjN2aWwsIEJJIGUgSUEuJyxcbiAgICAgICAgc3RhcnRfdXJsOiAnLycsXG4gICAgICAgIHNjb3BlOiAnLycsXG4gICAgICAgIGRpc3BsYXk6ICdzdGFuZGFsb25lJyxcbiAgICAgICAgbGFuZzogJ2VzJyxcbiAgICAgICAgYmFja2dyb3VuZF9jb2xvcjogJyNFRUYyRjYnLFxuICAgICAgICB0aGVtZV9jb2xvcjogJyMwRDFCMkUnLFxuICAgICAgICBpY29uczogW1xuICAgICAgICAgIHsgc3JjOiAnL2ljb25zL3RpZGVvLWljb24tMTkyLnBuZycsIHNpemVzOiAnMTkyeDE5MicsIHR5cGU6ICdpbWFnZS9wbmcnLCBwdXJwb3NlOiAnYW55JyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb25zL3RpZGVvLWljb24tNTEyLnBuZycsIHNpemVzOiAnNTEyeDUxMicsIHR5cGU6ICdpbWFnZS9wbmcnLCBwdXJwb3NlOiAnYW55JyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb25zL3RpZGVvLW1hc2thYmxlLTE5Mi5wbmcnLCBzaXplczogJzE5MngxOTInLCB0eXBlOiAnaW1hZ2UvcG5nJywgcHVycG9zZTogJ21hc2thYmxlJyB9LFxuICAgICAgICAgIHsgc3JjOiAnL2ljb25zL3RpZGVvLW1hc2thYmxlLTUxMi5wbmcnLCBzaXplczogJzUxMng1MTInLCB0eXBlOiAnaW1hZ2UvcG5nJywgcHVycG9zZTogJ21hc2thYmxlJyB9LFxuICAgICAgICBdLFxuICAgICAgfSxcblxuICAgICAgd29ya2JveDoge1xuICAgICAgICBza2lwV2FpdGluZzogdHJ1ZSxcbiAgICAgICAgY2xpZW50c0NsYWltOiB0cnVlLFxuICAgICAgICAvLyBQcmVjYWNoZWEgdG9kb3MgbG9zIGFzc2V0cyBkZWwgYnVpbGQgKEpTLCBDU1MsIEhUTUwsIGltXHUwMEUxZ2VuZXMsIGZ1ZW50ZXMpXG4gICAgICAgIGdsb2JQYXR0ZXJuczogWycqKi8qLntqcyxjc3MsaHRtbCxpY28scG5nLHN2ZyxqcGcsanBlZyx3ZWJwLHdvZmYsd29mZjIsd2VibWFuaWZlc3R9J10sXG4gICAgICAgIC8vIEVsIGJ1bmRsZSBwcmluY2lwYWwgZGVsIEVSUCBzdXBlcmEgZWwgbFx1MDBFRG1pdGUgcG9yIGRlZmVjdG8gZGUgMiBNaUJcbiAgICAgICAgbWF4aW11bUZpbGVTaXplVG9DYWNoZUluQnl0ZXM6IDQgKiAxMDI0ICogMTAyNCxcblxuICAgICAgICBydW50aW1lQ2FjaGluZzogW1xuICAgICAgICAgIC8vIEZ1ZW50ZXMgZGUgR29vZ2xlIFx1MjAxNCBjYWNoZS1maXJzdCwgMSBhXHUwMEYxb1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIHVybFBhdHRlcm46IC9eaHR0cHM6XFwvXFwvZm9udHNcXC5nb29nbGVhcGlzXFwuY29tXFwvLiovaSxcbiAgICAgICAgICAgIGhhbmRsZXI6ICdDYWNoZUZpcnN0JyxcbiAgICAgICAgICAgIG9wdGlvbnM6IHtcbiAgICAgICAgICAgICAgY2FjaGVOYW1lOiAnZ29vZ2xlLWZvbnRzLXN0eWxlc2hlZXQnLFxuICAgICAgICAgICAgICBleHBpcmF0aW9uOiB7IG1heEVudHJpZXM6IDUsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICB1cmxQYXR0ZXJuOiAvXmh0dHBzOlxcL1xcL2ZvbnRzXFwuZ3N0YXRpY1xcLmNvbVxcLy4qL2ksXG4gICAgICAgICAgICBoYW5kbGVyOiAnQ2FjaGVGaXJzdCcsXG4gICAgICAgICAgICBvcHRpb25zOiB7XG4gICAgICAgICAgICAgIGNhY2hlTmFtZTogJ2dvb2dsZS1mb250cy13ZWJmb250cycsXG4gICAgICAgICAgICAgIGV4cGlyYXRpb246IHsgbWF4RW50cmllczogMjAsIG1heEFnZVNlY29uZHM6IDYwICogNjAgKiAyNCAqIDM2NSB9LFxuICAgICAgICAgICAgICBjYWNoZWFibGVSZXNwb25zZTogeyBzdGF0dXNlczogWzAsIDIwMF0gfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgfSksXG4gIF0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBdVEsU0FBUyxvQkFBb0I7QUFDcFMsT0FBTyxXQUFXO0FBQ2xCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG1CQUFtQjtBQUMxQixNQUFJO0FBQ0YsV0FBTyxTQUFTLHdCQUF3QixFQUFFLFNBQVMsRUFBRSxLQUFLO0FBQUEsRUFDNUQsUUFBUTtBQUNOLFdBQU87QUFBQSxFQUNUO0FBQ0Y7QUFFQSxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixRQUFRO0FBQUEsSUFDTixnQkFBZ0IsS0FBSyxVQUFVLGlCQUFpQixDQUFDO0FBQUEsRUFDbkQ7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE1BQU07QUFBQSxJQUNOLFFBQVE7QUFBQSxNQUNOLGNBQWM7QUFBQSxNQUVkLFVBQVU7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxRQUNaLGFBQWE7QUFBQSxRQUNiLFdBQVc7QUFBQSxRQUNYLE9BQU87QUFBQSxRQUNQLFNBQVM7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLGtCQUFrQjtBQUFBLFFBQ2xCLGFBQWE7QUFBQSxRQUNiLE9BQU87QUFBQSxVQUNMLEVBQUUsS0FBSyw2QkFBNkIsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLE1BQU07QUFBQSxVQUN4RixFQUFFLEtBQUssNkJBQTZCLE9BQU8sV0FBVyxNQUFNLGFBQWEsU0FBUyxNQUFNO0FBQUEsVUFDeEYsRUFBRSxLQUFLLGlDQUFpQyxPQUFPLFdBQVcsTUFBTSxhQUFhLFNBQVMsV0FBVztBQUFBLFVBQ2pHLEVBQUUsS0FBSyxpQ0FBaUMsT0FBTyxXQUFXLE1BQU0sYUFBYSxTQUFTLFdBQVc7QUFBQSxRQUNuRztBQUFBLE1BQ0Y7QUFBQSxNQUVBLFNBQVM7QUFBQSxRQUNQLGFBQWE7QUFBQSxRQUNiLGNBQWM7QUFBQTtBQUFBLFFBRWQsY0FBYyxDQUFDLHFFQUFxRTtBQUFBO0FBQUEsUUFFcEYsK0JBQStCLElBQUksT0FBTztBQUFBLFFBRTFDLGdCQUFnQjtBQUFBO0FBQUEsVUFFZDtBQUFBLFlBQ0UsWUFBWTtBQUFBLFlBQ1osU0FBUztBQUFBLFlBQ1QsU0FBUztBQUFBLGNBQ1AsV0FBVztBQUFBLGNBQ1gsWUFBWSxFQUFFLFlBQVksR0FBRyxlQUFlLEtBQUssS0FBSyxLQUFLLElBQUk7QUFBQSxjQUMvRCxtQkFBbUIsRUFBRSxVQUFVLENBQUMsR0FBRyxHQUFHLEVBQUU7QUFBQSxZQUMxQztBQUFBLFVBQ0Y7QUFBQSxVQUNBO0FBQUEsWUFDRSxZQUFZO0FBQUEsWUFDWixTQUFTO0FBQUEsWUFDVCxTQUFTO0FBQUEsY0FDUCxXQUFXO0FBQUEsY0FDWCxZQUFZLEVBQUUsWUFBWSxJQUFJLGVBQWUsS0FBSyxLQUFLLEtBQUssSUFBSTtBQUFBLGNBQ2hFLG1CQUFtQixFQUFFLFVBQVUsQ0FBQyxHQUFHLEdBQUcsRUFBRTtBQUFBLFlBQzFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Y7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
