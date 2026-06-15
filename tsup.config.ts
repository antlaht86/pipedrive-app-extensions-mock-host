import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // ESM for bundlers, CJS for Node/require, IIFE for a plain <script> tag.
  format: ['esm', 'cjs', 'iife'],
  // Global exposed by the IIFE build: window.PipedriveMockHost
  globalName: 'PipedriveMockHost',
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  target: 'es2022',
  // The Mock Host uses internal copies of the wire-protocol constants (asserted
  // equal to the Real SDK's enums by a test), so it has no runtime dependency on
  // @pipedrive/app-extensions-sdk — keeping the IIFE build self-contained.
});
