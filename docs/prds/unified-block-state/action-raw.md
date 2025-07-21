# Low-level action API

## Action anatomy

Action is a function that receives it's inputs via the context found in global variable, similar to the output lambdas, and returns result in a standartized form:

```typescript
{
  /** If not undefined, instructs runtime to update the state */
  state?: any;
  /** If not undefined, instructs runtime to update the localState */
  localState?: any;
  /** Value to return to the caller */
  result: ValueOrError<any>;
  /** List of other things the action instructs runtime to execute */
  effects: Effect[];
}
```

`Effect` can be things like:
- request to switch focus to another block
- request to add specific version of specific blocks before or after a specific block
- potentially other things, maybe calling other actions or writing to soem global project state (to be added in the future)

Overall list of potential effects is not a focus of this document.

Actions can be executed in different environments:
- "persistent" - the environment where action can write to the persistent `state` (and this write is guaranteed to be atomic in respect to the `state`, because the lambda will be executed within transaction)
- "local" - where action can't write to persistent `state`, yet can read it; writing to `state` should be considered an error in this context
