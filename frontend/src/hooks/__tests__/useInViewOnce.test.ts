import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInViewOnce } from '../useInViewOnce';

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

const installObserver = () => {
  const instances: Array<{
    cb: Callback;
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }> = [];
  class FakeObserver {
    cb: Callback;
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(cb: Callback) {
      this.cb = cb;
      instances.push(this);
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return instances;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useInViewOnce', () => {
  it('shows immediately when IntersectionObserver is missing', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const { result } = renderHook(() => useInViewOnce<HTMLDivElement>());
    expect(result.current.inView).toBe(true);
  });

  it('observes a node that mounts late, then reveals once and disconnects', () => {
    const instances = installObserver();
    const { result } = renderHook(() => useInViewOnce<HTMLDivElement>());
    expect(result.current.inView).toBe(false);
    expect(instances).toHaveLength(0);

    act(() => result.current.ref(document.createElement('div')));
    expect(instances).toHaveLength(1);
    expect(instances[0].observe).toHaveBeenCalledTimes(1);

    act(() => instances[0].cb([{ isIntersecting: false }]));
    expect(result.current.inView).toBe(false);

    act(() => instances[0].cb([{ isIntersecting: true }]));
    expect(result.current.inView).toBe(true);
    expect(instances[0].disconnect).toHaveBeenCalled();
  });
});
