import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
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
      title: 'Kids Reading Manager',
    },
    // Ensure assets are handled correctly
    assetPrefix: '/',
  },
  // Add any other necessary configurations here
});