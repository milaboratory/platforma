import { node } from '@milaboratories/eslint-config';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['**/*.test.ts'] },
  ...node,
  {
    rules: {
      /**
       * IMPORTANCE: HIGH
       * Prevents using the 'any' type which defeats TypeScript's type checking.
       * 'any' undermines type safety, can hide bugs, and makes refactoring more difficult.
       * Currently disabled due to legacy code, but should be addressed as part of improving type safety.
       */
      '@typescript-eslint/no-explicit-any': 'off',

      /**
       * IMPORTANCE: HIGH
       * Prevents assigning values from 'any' type to more specific types without proper type checking.
       * Unsafe assignments can introduce runtime errors that TypeScript wouldn't catch.
       * Disabled to support legacy patterns, but should be fixed to ensure type safety.
       */
      '@typescript-eslint/no-unsafe-assignment': 'off',

      /**
       * IMPORTANCE: HIGH
       * Prevents accessing properties on values typed as 'any'.
       * Without this rule, you can access properties that might not exist at runtime.
       * Temporarily disabled to support legacy code, but should be addressed systematically.
       */
      '@typescript-eslint/no-unsafe-member-access': 'off',

      /**
       * IMPORTANCE: MEDIUM
       * Prevents passing values typed as 'any' to functions expecting specific types.
       * This can lead to unexpected behavior when functions receive incorrectly typed arguments.
       * Currently disabled but should be enabled after proper typing is implemented.
       */
      '@typescript-eslint/no-unsafe-argument': 'off',

      /**
       * IMPORTANCE: MEDIUM
       * The reason is that the lexical declaration is visible in the entire switch block 
       * but it only gets initialized when it is assigned, which will only happen if the case where 
       * it is defined is reached
       */
      'no-case-declarations': 'off',
    },
  },
];
