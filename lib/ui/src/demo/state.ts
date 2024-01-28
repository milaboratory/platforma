import { reactive } from 'vue';

export const state = reactive({
  menuOpen: false,
  toggleMenu() {
    this.menuOpen = !this.menuOpen;
  },
});
