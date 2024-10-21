import { defineConfig } from 'vitepress';
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
    'text-area.md': `${uikitPrefix}text-area.md`,
    'number-field.md': `${uikitPrefix}number-field.md`,
    'dropdown.md': `${uikitPrefix}dropdown.md`,
    'dropdown-multi.md': `${uikitPrefix}dropdown-multi.md`,
    'dropdown-line.md': `${uikitPrefix}dropdown-line.md`,
    'checkbox.md': `${uikitPrefix}checkbox.md`,
    'checkbox-group.md': `${uikitPrefix}checkbox-group.md`,
    'toggle-switch.md': `${uikitPrefix}toggle-switch.md`,
    'btn-group.md': `${uikitPrefix}btn-group.md`,
    'file-input.md': `${uikitPrefix}file-input.md`
  },

  srcDir: 'uikit-docs',

  vite: {
    resolve: {
      alias: [
        {
          find: '@app-components',
          replacement: fileURLToPath(
            new URL(resolve(resolve(__dirname), 'app-components'), import.meta.url)
          )
        },
        {
          find: /^.*\/VPSidebarGroup\.vue$/,
          replacement: fileURLToPath(
            new URL('./app-components/PlDocSidebar/PlSidebar.vue', import.meta.url)
          )
        }
      ]
    }
  },
  appearance: true,
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
          { text: 'PlTextArea', link: `${uikitPrefix}text-area` },
          { text: 'PlNumberField', link: `${uikitPrefix}number-field` },
          { text: 'PlDropdown', link: `${uikitPrefix}dropdown` },
          { text: 'PlDropdownMulti', link: `${uikitPrefix}dropdown-multi` },
          { text: 'PlDropdownLine', link: `${uikitPrefix}dropdown-line` },
          { text: 'PlCheckbox', link: `${uikitPrefix}checkbox` },
          { text: 'PlCheckboxGroup', link: `${uikitPrefix}checkbox-group` },
          { text: 'PlToggleSwitch', link: `${uikitPrefix}toggle-switch` },
          { text: 'PlBtnGroup', link: `${uikitPrefix}btn-group` },
          { text: 'PlFileInput', link: `${uikitPrefix}file-input` }
        ]
      }
    ],

    socialLinks: [{ icon: 'github', link: 'https://github.com/milaboratory/platforma' }]
  }
});
