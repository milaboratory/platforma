# Platforma.bio Block ESLint Config

Shareable code style and best practice for [Platforma] projects.

---

## Install

Pure JavaScript or TypeScript:

```sh
pnpm add --save-dev @platforma-sdk/eslint-config
```

## Usage

Create `eslint.config.mjs`.

For the block model:

```ts
import { model } from '@platforma-sdk/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
export default [...model]
```

For the block ui:

```js
import { ui } from '@platforma-sdk/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
export default [...ui]
```

Example with overriding:

```js
import { ui } from '@platforma-sdk/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
export default [{
  ignores: ['cache/*']
}, 
...ui, 
{
  files: ['src/pages/DraftsPage.vue'],
  rules: {
    '@stylistic/quotes': 'warn'
  }
}]
```

Optionally add the 'lint' command to the package.json "scripts" section

```json
"scripts": {
  "lint": "eslint ."
}
```

This project utilizes ESLint with a flat configuration.
You may need to enable its support in your workspace:

- **VS Code:** enable `eslint.experimental.useFlatConfig`.