// After a navigation, focus the first main heading (R17.4). tabindex="-1" is set at runtime, so the initial DOM is untouched.
export interface FocusableRoot {
  querySelector(selector: string): FocusableElement | null;
}
export interface FocusableElement {
  setAttribute(name: string, value: string): void;
  focus(options?: { preventScroll?: boolean }): void;
}
export function focusMainHeading(root: FocusableRoot): boolean {
  const el = root.querySelector("main h1") ?? root.querySelector('[role="alert"] h2');
  if (el === null) return false;
  el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
  return true;
}
