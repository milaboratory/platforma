import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import PlTextField from '../PlTextField.vue';

describe('TextField', () => {
  it('renders properly', () => {
    const wrapper = mount(PlTextField, {
      props: {
        label: 'TextField Label',
      },
    });
    expect(wrapper.text()).toContain('TextField Label');
  });

  it('modelValue', async () => {
    const wrapper = mount(PlTextField, {
      props: {
        modelValue: 'initialText',
        'onUpdate:modelValue': (e: string) => wrapper.setProps({ modelValue: e }),
      },
    });

    await wrapper.find('input').setValue('test');
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error @TODO generic component issue
    expect(wrapper.props('modelValue')).toBe('test');
  });
});
