import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import PluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import stylistic from '@stylistic/eslint-plugin';
import eslintN from 'eslint-plugin-n';

// Common ignore patterns
const commonIgnores = [
  '**/coverage',
  '**/dist',
];

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
      // Hint: use _ as a prefix for ignored variables
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
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      'no-var': 'off',
    },
  }
);

// Common configuration for packages used in both browser and Node.js
export const common = tseslint.config(
  {
    ignores: [
      ...commonIgnores,
      'eslint.config.mjs',
      'eslint.config.js',
      'jest.config.cjs',
      'vite.config.mts',
      'vite.config.mts.*' 
    ],
  },
  {
    files: ['**/*.ts'],
    extends: [
      ...base,
      tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      // Don't include any globals by default
      globals: {
        // Add only truly universal globals or those with consistent polyfills
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Other universal APIs
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Rules for universal JavaScript
      '@typescript-eslint/no-namespace': 'off',
      // Enforce environment checking for ALL environment-specific globals
      'no-restricted-globals': [
        'error', 
        // Browser-specific globals
        { name: 'window', message: 'Use `typeof window !== "undefined"` check before using window' },
        { name: 'document', message: 'Use `typeof document !== "undefined"` check before using document' },
        { name: 'navigator', message: 'Use environment checks before using navigator' },
        // Node.js-specific globals
        { name: 'global', message: 'Use `typeof global !== "undefined"` check before using global' },
        { name: 'process', message: 'Use `typeof process !== "undefined"` check before using process' },
        { name: '__dirname', message: 'Use environment checks before using __dirname' },
        { name: '__filename', message: 'Use environment checks before using __filename' }
      ],
      // Enforce environment-agnostic code
      'no-process-env': 'warn',
    }
  },
  {
    files: ['**/*.d.ts'],
    rules: {
      'no-var': 'off',
    },
  }
);

export const node = tseslint.config(
  { 
    ignores: [
      '**/coverage',
      '**/dist',
      '**/bin',
      'eslint.config.mjs',
      'eslint.config.js',
      'jest.config.cjs',
      'vite.config.mts',
      'vitest.config.mts',
      'vite.config.mts.*'
    ] 
  },
  {
    extends: [
      ...base,
      tseslint.configs.recommendedTypeChecked
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
  }
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

