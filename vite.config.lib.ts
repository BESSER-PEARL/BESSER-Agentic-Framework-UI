import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib.ts'),
      name: 'BesserAgenticFrameworkUI',
      fileName: 'besser-agentic-framework-ui',
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        'dompurify',
        'plotly.js-dist-min',
        'react-markdown',
        'remark-gfm',
      ],
      output: {
        assetFileNames: 'style[extname]',
      },
    },
  },
})
