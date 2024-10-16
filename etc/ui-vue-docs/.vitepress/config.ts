import { defineConfig } from 'vitepress'
import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'path';

let uikitPrefix = '';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Platforma uikit',
  description: 'Platforma uikit docs',

  rewrites: {
    'index.md': 'index.md',
    'text-fields.md': `${uikitPrefix}text-fields.md`,
  },

  srcDir: 'uikit-docs',

  vite: {
    resolve: {
      alias: [
        {
          find: '@app-components',
          replacement: fileURLToPath(
            new URL(
              resolve(resolve(__dirname), 'app-components'),
              import.meta.url
            )
          ),
        },
      ]
    }
  },
  themeConfig: {
    search: { provider: 'local' },
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      // { text: 'Home', link: '/' },
      // { text: 'Examples', link: '/markdown-examples' }
    ],

    sidebar: [
      {
        text: 'Examples',
        items: [
          { text: 'PlTextField', link: `${uikitPrefix}text-fields` },
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/milaboratory/platforma' }
    ]
  }
})
