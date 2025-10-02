/**
 * Utility functions for context menu actions
 */

/**
 * Wraps an action with setTimeout to ensure the context menu closes
 * before executing the action. This prevents UI interaction issues
 * when opening modals or dialogs from context menu items.
 *
 * @param action - The action to delay
 * @param delay - Optional delay in milliseconds (defaults to 0)
 * @returns A wrapped function that executes the action after the delay
 */
export function delayedAction(action: () => void, delay: number = 0): () => void {
  return () => {
    setTimeout(action, delay);
  };
}

/**
 * Helper specifically for modal-opening actions from context menus
 * Uses delayedAction with a 0ms delay to ensure proper UI flow
 *
 * @param action - The modal-opening action to wrap
 * @returns A wrapped function suitable for context menu items
 */
export function modalAction(action: () => void): () => void {
  return delayedAction(action, 0);
}