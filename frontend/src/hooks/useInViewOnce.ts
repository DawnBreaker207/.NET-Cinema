import { useEffect, useState } from 'react';

// Scroll reveal fires once at ~20% visibility (motion rule), then stops observing.
const REVEAL_AMOUNT = 0.2;

/**
 * True once the element has scrolled ~20% into view; never flips back.
 * Callback ref, not useRef: the target often mounts after data loads, and a ref object
 * read in a mount effect would stay null and leave the content hidden forever.
 */
export const useInViewOnce = <T extends Element>() => {
  const [node, setNode] = useState<T | null>(null);
  // No observer (old browser, jsdom): show immediately so content is never stuck hidden.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (inView || !node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: REVEAL_AMOUNT }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, node]);

  return { ref: setNode, inView };
};

export default useInViewOnce;
