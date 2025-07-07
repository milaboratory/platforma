import { h, render } from 'vue';
import PlConfirmDialog from '../components/PlConfirmDialog.vue';

export type ConfirmProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export function useConfirm(props: ConfirmProps) {
  return () => {
    return new Promise<boolean>((resolve) => {
      const vnode = h(PlConfirmDialog, {
        opened: true,
        title: props.title,
        message: props.message,
        confirmLabel: props.confirmLabel ?? 'Confirm',
        cancelLabel: props.cancelLabel ?? 'Cancel',
        onConfirm: () => finish(true),
        onCancel: () => finish(false),
      });

      const mountPoint = document.createElement('div');
      document.body.appendChild(mountPoint);
      render(vnode, mountPoint);

      function finish(result: boolean) {
        resolve(result);
        render(null, mountPoint);
        mountPoint.remove();
      }
    });
  };
}
