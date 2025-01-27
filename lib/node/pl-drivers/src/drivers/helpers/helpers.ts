import {
  BasicResourceData,
  getField,
  isNullResourceId,
  PlClient,
  ResourceId,
  valErr,
} from '@milaboratories/pl-client';

/** Throws when a driver gets a resource with a wrong resource type. */
export class WrongResourceTypeError extends Error {}

/** Updater incorporates a pattern when someone wants to run a callback
 * that updates something only when it's not already running. */
export class Updater {
  private updating: Promise<void> | undefined;

  constructor(private readonly onUpdate: () => Promise<void>) {}

  schedule() {
    if (this.updating == undefined) {
      this.updating = (async () => {
        try {
          await this.onUpdate();
        } catch (e) {
          console.log(`error while updating in Updater: ${e}`);
        } finally {
          this.updating = undefined;
        }
      })();
    }
  }
}
