import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig({ plugins: [react(), tailwindcss()], resolve: {alias: {'@': fileURLToPath(new URL('./src', import.meta.url))}}, define: { 'process.env.NODE_ENV': JSON.stringify('production') }, base: './', server: {proxy: {'/api': 'http://127.0.0.1:3199'}}, build: {lib: {entry:'src/main.tsx',name:'NeonWorkbench',formats:['iife'],fileName:()=> 'workbench.js'},cssCodeSplit:false} })
