import type { Linter } from 'eslint'

declare const model: Linter.Config[]
declare const ui: Linter.Config[]
declare const test: Linter.Config[]

export {
  model,
  ui,
  test,
}