import type { Linter } from 'eslint'

declare const base: Linter.Config[]
declare const node: Linter.Config[]
declare const vue: Linter.Config[]

export {
  base,
  node,
  vue
}
