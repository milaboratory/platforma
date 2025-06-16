import type { InferComponentProps } from '../types';
import { computed, type Component, type ComputedRef } from 'vue';

/**
 * A utility function that creates a reactive computed property
 * based on a specific prop of a Vue component.
 *
 *
 * @template C - The Vue component type.
 * @template P - The prop name.
 *
 * @param cb - A factory function that returns the value of the prop from the inferred component props.
 *
 * @returns A `ComputedRef` of the specified prop
 *
 * @example
 * ```ts
 * import { ref, defineComponent } from 'vue';
 * import { useComponentProp } from '@platforma-sdk/ui-vue';
 *
 * const MyComponent = defineComponent({
 *   props: {
 *     myProp: {
 *       type: String,
 *       required: true
 *     }
 *   }
 * });
 *
 * const propValue = useComponentProp<typeof MyComponent, 'myProp'>(() => 'example');
 * console.log(propValue.value); // Outputs: 'example'
 * ```
 */
export function useComponentProp<C extends Component, P extends keyof InferComponentProps<C>>(cb: () => InferComponentProps<C>[P]): ComputedRef<InferComponentProps<C>[P]> {
  return computed(cb);
}
