// SPDX-License-Identifier: GPL-3.0-or-later
import path from 'node:path';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyPlugin from 'copy-webpack-plugin';

export default {
  // Target 'web' so webpack doesn't try to polyfill/require Node built-ins
  // for browser bundles (wasmoon's UMD wrapper uses require('url') etc.).
  target: 'web',
  entry: { editor: './src/editor-page.ts', background: './src/background.ts' },
  output: { path: path.resolve('dist'), filename: '[name].js', clean: true },
  resolve: {
    extensions: ['.ts', '.js'],
    // Stub Node built-ins that appear in wasmoon's UMD wrapper but are never
    // actually called in the browser code path.
    fallback: {
      url: false,
      module: false,
      path: false,
      fs: false,
      crypto: false,
    },
  },
  module: {
    rules: [
      { test: /\.ts$/, loader: 'ts-loader', exclude: /node_modules/ },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
      // Inline .wasm as an asset/resource so webpack emits it to dist/
      // and returns a local URL — satisfying MV3 CSP (no remote fetch).
      { test: /\.wasm$/, type: 'asset/resource', generator: { filename: '[name][ext]' } },
      // Neutralize the dead-code CDN fallback URL inside wasmoon's UMD bundle.
      // The string `https://unpkg.com/wasmoon@…/dist/glue.wasm` is never reached
      // at runtime because we always pass a local chrome-extension:// URI as
      // `customWasmUri` to LuaFactory — but Web Store scanners flag any remote
      // URL literal in dist/*.js.  We replace the literal with an empty string
      // so the runtime behaviour is unchanged while the URL disappears from the
      // bundle.
      {
        test: /wasmoon\/dist\/index\.js$/,
        loader: 'string-replace-loader',
        options: {
          search: 'https://unpkg.com/wasmoon@',
          replace: '',
          flags: 'g',
        },
      },
    ],
  },
  experiments: {
    // Required so webpack can import .wasm files as async modules.
    asyncWebAssembly: true,
  },
  plugins: [
    new HtmlWebpackPlugin({ filename: 'editor.html', template: 'public/editor.html', chunks: ['editor'] }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json' },
        { from: 'public/icons', to: 'icons' },
        { from: 'public/favicon.ico', to: 'favicon.ico' },
        // PWA (File Handling API): web app manifest + service worker. Harmless in
        // the extension build (unused); used when dist/ is hosted over HTTPS.
        { from: 'public/manifest.webmanifest', to: 'manifest.webmanifest' },
        { from: 'public/sw.js', to: 'sw.js' },
        // Root redirect → editor.html so the site root (GitHub Pages sub-path)
        // opens the editor instead of 404. Unused by the extension build.
        { from: 'public/index.html', to: 'index.html' },
        // Copy Wasmoon's glue.wasm into dist/ so it's served from the
        // extension origin (chrome-extension://...) — no CDN, no remote URL.
        {
          from: 'node_modules/wasmoon/dist/glue.wasm',
          to: 'glue.wasm',
        },
      ],
    }),
  ],
};
