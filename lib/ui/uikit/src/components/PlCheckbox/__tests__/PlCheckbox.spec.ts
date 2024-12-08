import { describe, it, expect } from 'vitest';

import { mount } from '@vue/test-utils';
import PlCheckbox from '../PlCheckbox.vue';

describe('PlCheckbox', () => {
  it('renders properly', async () => {
    const wrapper = mount(PlCheckbox, {
      slots: {
        default: 'Slot text',
      },
      props: {
        'modelValue': false,
        'onUpdate:modelValue': (e) => wrapper.setProps({ modelValue: e }),
      },
    });

    expect(wrapper.text()).toContain('Slot text');

    await wrapper.find('.pl-checkbox-base').trigger('click');
    expect(wrapper.props('modelValue')).toBe(true);

    await wrapper.find('.pl-checkbox-base').trigger('click');
    expect(wrapper.props('modelValue')).toBe(false);

    await wrapper.find('.pl-checkbox-base').trigger('click');
    expect(wrapper.props('modelValue')).toBe(true);
  });
});
