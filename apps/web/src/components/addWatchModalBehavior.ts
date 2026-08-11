export function completeAddWatch(onAdded: () => void, onClose: () => void): void {
  onAdded();
  onClose();
}
