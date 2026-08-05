/**
 * Boolean prop types for components that are generic over one of their boolean props.
 *
 * A valueless attribute (`<PlTextField required />`) passes the empty string, and Vue coerces that
 * to `true` only for props whose *runtime* type includes `Boolean`. The SFC compiler derives those
 * runtime types from the source, and it cannot resolve either a bare type parameter or a
 * conditional type — it emits a prop with no type at all, which silently ignores the attribute.
 *
 * Both aliases below keep `boolean` at the top level of the type so the compiler still emits
 * `Boolean`, without giving up the type parameter that correlates the props.
 */

/** A `boolean` prop whose literal value is still inferred into `Flag`. */
export type BooleanProp<Flag extends boolean> = Flag & boolean;

/** A `boolean` prop that is not accepted at all when `Condition` is `true`. */
export type BooleanPropUnless<Condition extends boolean> = boolean &
  ([Condition] extends [true] ? never : unknown);
