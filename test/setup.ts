// jsdom lacks a few browser APIs the library relies on.

// ResizeObserver: controllable mock so tests can trigger entries manually
class MockResizeObserver implements ResizeObserver {
  static instances: MockResizeObserver[] = [];

  observed = new Set<Element>();

  constructor(public callback: ResizeObserverCallback) {
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.observed.add(target);
  }

  unobserve(target: Element) {
    this.observed.delete(target);
  }

  disconnect() {
    this.observed.clear();
  }
}

globalThis.ResizeObserver = MockResizeObserver;
(globalThis as Record<string, unknown>).MockResizeObserver =
  MockResizeObserver;

// requestAnimationFrame: forced onto the timeout queue so tests can flush
// frame callbacks deterministically with a single setTimeout(0) await
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 0) as unknown as number;
globalThis.cancelAnimationFrame = (handle: number) => clearTimeout(handle);

// scrollTo: jsdom throws "Not implemented"
Element.prototype.scrollTo = function (
  this: Element,
  options?: ScrollToOptions | number,
  y?: number
) {
  if (typeof options === "object" && options !== null) {
    this.scrollTop = options.top ?? this.scrollTop;
    this.scrollLeft = options.left ?? this.scrollLeft;
  } else if (typeof options === "number" && typeof y === "number") {
    this.scrollLeft = options;
    this.scrollTop = y;
  }
} as Element["scrollTo"];

export { MockResizeObserver };
