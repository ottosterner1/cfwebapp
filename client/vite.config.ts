// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    cors: true,
    origin: 'http://localhost:5173',
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true,
    manifest: true,
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
      },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]'
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})