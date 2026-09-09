import "@testing-library/jest-dom/vitest";

/**
 * Popover API stubs.
 *
 * jsdom implements neither `showPopover` nor `hidePopover`. DateRangePicker feature-detects
 * on `showPopover` to decide whether to render the calendar or the native date inputs, so
 * WITHOUT these stubs every test renders the unenhanced path and the keyboard tests pass
 * while exercising nothing. A green suite that never ran the component is worse than a red
 * one, which is why this lives here rather than in one test file.
 *
 * The behaviour modelled is the part the component depends on: toggling visibility and
 * firing a `toggle` event carrying `newState`.
 *
 * GUARDED ON `HTMLElement` EXISTING, because setupFiles run for EVERY test file including
 * the ones marked `@vitest-environment node` — which have no DOM, so touching
 * HTMLElement.prototype there is a ReferenceError that fails the whole file before a single
 * test runs. Nothing in a node-environment test wants a popover anyway.
 */
if (typeof HTMLElement !== "undefined" && typeof HTMLElement.prototype.showPopover !== "function") {
  const fire = (el: HTMLElement, newState: "open" | "closed") => {
    const event = new Event("toggle") as Event & { newState?: string; oldState?: string };
    event.newState = newState;
    event.oldState = newState === "open" ? "closed" : "open";
    el.dispatchEvent(event);
  };

  HTMLElement.prototype.showPopover = function showPopover(this: HTMLElement) {
    this.removeAttribute("hidden");
    this.setAttribute("data-open", "");
    fire(this, "open");
  };

  HTMLElement.prototype.hidePopover = function hidePopover(this: HTMLElement) {
    this.removeAttribute("data-open");
    fire(this, "closed");
  };

  HTMLElement.prototype.togglePopover = function togglePopover(this: HTMLElement) {
    const open = this.hasAttribute("data-open");
    if (open) this.hidePopover();
    else this.showPopover();
    return !open;
  };
}
