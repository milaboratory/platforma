import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import PluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import eslintN from 'eslint-plugin-n';

export const base = tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  stylistic.configs.customize({
    semi: true,
    braceStyle: '1tbs',
    arrowParens: true
  }),
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          'argsIgnorePattern': '^_',
          'varsIgnorePattern': '^_',
          'caughtErrorsIgnorePattern': '^_'
        }
      ],
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off'
    },
  }
);

export const node = tseslint.config(
  { ignores: [
    '*.d.ts',
    '**/coverage',
    '**/dist',
    '**/bin',
    'eslint.config.mjs',
    'eslint.config.js',
    'jest.config.cjs',
    'vite.config.mts',
    'vite.config.mts.*' ] },
  eslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    extends: [
      ...base
    ],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'n': eslintN,
    },
    rules: {
      '@typescript-eslint/no-namespace': 'off',
      'n/global-require': 'error',
      'n/no-callback-literal': 'off',
      'n/no-extraneous-require': 'error',
      'n/no-missing-require': 'error',
      'n/no-unpublished-require': 'error',
      'n/no-unsupported-features/es-builtins': 'error',
      'n/no-unsupported-features/es-syntax': [
        'error',
        {
          ignores: ['modules', 'dynamicImport']
        }
      ],
      'n/no-unsupported-features/node-builtins': [
        'error',
        {
          ignores: ['worker_threads']
        }
      ],
      'n/prefer-node-protocol': 'error',
    }
  },
);

export const vue = tseslint.config(
  { ignores: ['*.d.ts', '**/coverage', '**/dist'] },
  {
    extends: [
      ...base,
      ...PluginVue.configs['flat/recommended'],
    ],
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.browser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/html-closing-bracket-spacing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/multi-word-component-names': 'off',
      'vue/no-mutating-props': 'off',
      'vue/v-on-event-hyphenation': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/no-v-html': 'off',
      'vue/no-undef-components': 'error',
      'vue/component-name-in-template-casing': 'warn',
      'vue/html-self-closing': ['warn', {
        html: {
          void: 'any',
          normal: 'always',
          component: 'always'
        },
        svg: 'always',
        math: 'always'
      }]
    }
  },
);

