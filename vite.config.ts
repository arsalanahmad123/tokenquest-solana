import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';
import path from 'path';

export default defineConfig({
    plugins: [
        {
            name: 'solana-buffer-inject',
            transform(code, id) {
                if (
                    id.includes('node_modules') &&
                    (id.includes('@solana') || id.includes('@coral-xyz')) &&
                    code.includes('Buffer')
                ) {
                    return {
                        code: `import { Buffer } from 'buffer';\n${code}`,
                        map: null,
                    };
                }
            },
        },
        react({
            babel: {
                plugins: [['babel-plugin-react-compiler']],
            },
        }),
        tailwindcss(),
        cssInjectedByJsPlugin({
            injectCode: (cssCode) => {
                return `(function() {
      try {
        if (!window.__WIDGET_STYLES__) window.__WIDGET_STYLES__ = [];
        window.__WIDGET_STYLES__.push(${cssCode});
        if (window.__WIDGET_SHADOWS__) {
          window.__WIDGET_SHADOWS__.forEach(function(shadow) {
            var s = document.createElement('style');
            s.textContent = ${cssCode};
            shadow.appendChild(s);
          });
        }
      } catch(e) { console.error('CSS injection failed', e); }
    })();`;
            },
        }),
    ],
    build: {
        lib: {
            entry: path.resolve(__dirname, 'src/loader.tsx'),
            name: 'TokenQuestWidget',
            fileName: (format) => `widget.${format}.js`,
            formats: ['umd', 'iife'],
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            buffer: 'buffer',
        },
    },
    optimizeDeps: {
        include: [
            'buffer',
            '@coral-xyz/anchor',
            '@solana/web3.js',
            '@solana/spl-token',
        ],
        esbuildOptions: {
            define: {
                global: 'globalThis',
            },
        },
    },
});
