import { build } from 'vite';
await build({ configFile: false, define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: { outDir: 'dist', emptyOutDir: false, target: 'es2022',
    lib: { entry: 'design-sources/canvas-document-reader-entry.js', formats: ['es'], fileName: () => 'canvas-document-reader.js' } } });
