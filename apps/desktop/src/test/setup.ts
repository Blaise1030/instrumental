/** Stabilize local-date helpers (thread sidebar date groups, etc.) across developer machines and CI. */
process.env.TZ = "UTC";

/**
 * jsdom does not implement ResizeObserver; reka-ui + `@pierre/trees` expect it.
 * Invoke the layout callback once per `observe`, otherwise virtualized trees never paint.
 */
class ResizeObserverMock {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(element: Element): void {
    void Promise.resolve().then(() =>
      this.callback(
        [
          {
            target: element,
            contentRect: {} as DOMRectReadOnly,
            borderBoxSize: [],
            contentBoxSize: [],
            devicePixelContentBoxSize: [],
          } as ResizeObserverEntry,
        ],
        this,
      ),
    );
  }

  unobserve(): void {}

  disconnect(): void {}
}

globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
