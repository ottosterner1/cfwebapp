import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'https://cfwebapp.local',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Forward cookies
            if (req.headers.cookie) {
              proxyReq.setHeader('cookie', req.headers.cookie);
            }
          });
        },
        headers: {
          'X-Forwarded-Proto': 'https'
        }
      }
    }
  },
  build: {
    manifest: true,
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        dashboard: path.resolve(__dirname, 'src/entry/dashboard.tsx'),
        navigation: path.resolve(__dirname, 'src/entry/navigation.tsx'),
        profile: path.resolve(__dirname, 'src/entry/profile.tsx'),
        lta_accreditation: path.resolve(__dirname, 'src/entry/lta_accreditation.tsx'),
        template_manager: path.resolve(__dirname, 'src/entry/template_manager.tsx'),
        create_report: path.resolve(__dirname, 'src/entry/create_report.tsx'),
        view_report: path.resolve(__dirname, 'src/entry/view_report.tsx'),
        edit_report: path.resolve(__dirname, 'src/entry/edit_report.tsx'),
        programme_management: path.resolve(__dirname, 'src/entry/programme_management.tsx'),
        edit_programme_player: path.resolve(__dirname, 'src/entry/edit_programme_player.tsx'),
        add_programme_player: path.resolve(__dirname, 'src/entry/add_programme_player.tsx'),
      }
    }
  }
})