import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Turn off HMR to prevent refresh loops
    hmr: false,
    // Add CORS headers
    cors: {
      origin: ['https://cfwebapp.local'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      credentials: true
    },
    // Keep your existing proxy configuration
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
    // Increase warning limit since we know we have a few large chunks
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),  
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
        super_admin_dashboard: path.resolve(__dirname, 'src/entry/super_admin_dashboard.tsx'),
        registers: path.resolve(__dirname, 'src/entry/registers.tsx'),
        create_register: path.resolve(__dirname, 'src/entry/create_register.tsx'),
        edit_register: path.resolve(__dirname, 'src/entry/edit_register.tsx'),
        view_register: path.resolve(__dirname, 'src/entry/view_register.tsx'),
        invoices: path.resolve(__dirname, 'src/entry/invoices.tsx'),
        home: path.resolve(__dirname, 'src/entry/home.tsx'),
      },
      output: {
        manualChunks: (id) => {
          // Put react in a vendor chunk
          if (id.includes('node_modules/react') || 
              id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
          
          // Put PDF-related dependencies in separate chunks
          if (id.includes('node_modules/html2canvas')) {
            return 'vendor-html2canvas';
          }
          
          if (id.includes('node_modules/jspdf')) {
            return 'vendor-jspdf';
          }
        }
      }
    }
  }
})