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
    // Assuming your entry point is src/index.js
    entry: {
      index: './src/index.js',
    },
  },
  // Define environment variables to be injected into the code
  define: {
    'process.env.REACT_APP_API_BASE_URL': JSON.stringify(process.env.REACT_APP_API_BASE_URL),
  },
  output: {
    // Match the default output dir of create-react-app
    distPath: {
      root: 'build',
    },
    // Ensure index.html is generated
    html: {
      template: './public/index.html',
      inject: true,
    },
    // Ensure assets are handled correctly
    assetPrefix: '/',
  },
  // Add direct control over the HTML plugin
  tools: {
    htmlPlugin: (config) => {
      // Override the title with the one from the template
      config.title = 'Tally Reading';
      // Ensure the template is used as-is
      config.templateContent = undefined;
      return config;
    },
  },
});