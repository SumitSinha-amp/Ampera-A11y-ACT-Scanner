export const APP_WALKTHROUGH_EVENT = "a11y-start-walkthrough";

export function startAppWalkthrough() {
  window.dispatchEvent(new CustomEvent(APP_WALKTHROUGH_EVENT));
}