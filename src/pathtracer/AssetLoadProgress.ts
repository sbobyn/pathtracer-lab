/** Progress belongs to a load promise, so replaced scenes cannot update a newer load. */
const transfers = new WeakMap<Promise<unknown>, AssetTransfer>();

export class AssetTransfer {
  loaded = 0;
  total = 0;

  update = (event: ProgressEvent) => {
    this.loaded = Math.max(0, event.loaded);
    this.total = event.lengthComputable && event.total > 0 ? event.total : 0;
  };

  get percent(): number | undefined {
    return this.total ? Math.min(100, Math.floor(this.loaded / this.total * 100)) : undefined;
  }
}

export function trackAssetTransfer<T>(promise: Promise<T>, transfer: AssetTransfer): Promise<T> {
  transfers.set(promise, transfer);
  return promise;
}

export function getAssetTransfer(promise: Promise<unknown> | null) {
  return promise ? transfers.get(promise) : undefined;
}
