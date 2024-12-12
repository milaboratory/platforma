# Milaboratories ESLint Config

Shareable code style and best practice for [Platforma] projects.

---

## Install

Pure JavaScript or TypeScript:

```sh
pnpm add --save-dev @milaboratories/eslint-config
```

## Usage

Create `eslint.config.mjs`.

For TypeScript project:

```ts
import { base } from '@milaboratories/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
export default [...base]
```

For TypeScript/Node.js project:

```ts
import { node } from '@milaboratories/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
export default [...node]
```

For Vue project:

```js
import { vue } from '@milaboratories/eslint-config'

/** @type {import('eslint').Linter.Config[]} */
export default [...vue]
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