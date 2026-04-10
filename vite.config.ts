import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { bafPlugin } from './vite-plugin-baf'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bafPlugin()],
})
