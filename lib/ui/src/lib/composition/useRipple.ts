import {onMounted, Ref} from 'vue';

export function useRipple(el: Ref<HTMLElement | undefined>) {
  function createRipple(event:MouseEvent) {
    const button = event.currentTarget as HTMLButtonElement;

    const circle = document.createElement("span");
    const diameter = Math.max(button.clientWidth, button.clientHeight);
    const radius = diameter / 2;

    circle.style.width = circle.style.height = `${diameter}px`;
    circle.style.left = `${event.clientX - button.offsetLeft - radius}px`;
    circle.style.top = `${event.clientY - button.offsetTop - radius}px`;
    circle.classList.add("ripple");

    const ripple = button.getElementsByClassName("ripple")[0];

    if (ripple) {
      ripple.remove();
    }

    button.appendChild(circle);
  }

  onMounted(() => {
    el.value?.addEventListener('click', createRipple);
  });
}
