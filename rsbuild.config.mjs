import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  source: {
    entry: {
      index: './src/index.js',
    },
  },
  define: {},
  output: {
    distPath: {
      root: 'build',
    },
    html: {
      template: './public/index.html',
      inject: true,
    },
    assetPrefix: '/',
    // Production source maps for debugging without exposing source
    sourceMap: {
      js: process.env.NODE_ENV === 'production' ? 'hidden-source-map' : 'cheap-module-source-map',
    },
    // Minimize in production
    minify: true,
  },
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
      override: {
        cacheGroups: {
          // MUI is large — split into its own chunk for better caching
          mui: {
            test: /[\\/]node_modules[\\/]@mui[\\/]/,
            name: 'lib-mui',
            chunks: 'all',
            priority: 20,
          },
          // Emotion (MUI's CSS-in-JS) as separate chunk
          emotion: {
            test: /[\\/]node_modules[\\/]@emotion[\\/]/,
            name: 'lib-emotion',
            chunks: 'all',
            priority: 15,
          },
          // React core as separate chunk (stable, rarely changes)
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom)[\\/]/,
            name: 'lib-react',
            chunks: 'all',
            priority: 10,
          },
        },
      },
    },
  },
  tools: {
    htmlPlugin: (config) => {
      config.title = 'Tally Reading';
      config.templateContent = undefined;
      return config;
    },
  },
});