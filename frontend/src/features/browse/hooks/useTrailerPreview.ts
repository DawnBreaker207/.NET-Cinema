import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { YOUTUBE_EMBED_ORIGIN, isYoutubePlayingMessage, youtubePreviewUrl } from '../trailerEmbed';

// Dwell before loading a player, like YouTube: sweeping the pointer across the grid loads nothing.
// An intent delay, not an animation, so it is not a motion token.
const HOVER_PREVIEW_DELAY_MS = 250;

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

// Warm DNS/TLS to the player host on the first hover, so the short dwell is not eaten by the handshake.
let preconnected = false;
const preconnectYoutube = () => {
  if (preconnected) return;
  preconnected = true;
  for (const href of [YOUTUBE_EMBED_ORIGIN, 'https://i.ytimg.com']) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = '';
    document.head.appendChild(link);
  }
};

/**
 * Muted hover preview of a movie's YouTube trailer.
 * `src` is set only while previewing; `playing` turns true once YouTube reports state 1, so the
 * poster stays up through the player's black loading frames and whenever playback is blocked.
 */
export const useTrailerPreview = (trailerUrl?: string | null) => {
  const reducedMotion = usePrefersReducedMotion();
  const [active, setActive] = useState(false);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const [frame, setFrame] = useState<HTMLIFrameElement | null>(null);

  const url =
    typeof window === 'undefined' ? null : youtubePreviewUrl(trailerUrl, window.location.origin);
  // No autoplay under reduced motion (motion rule), and hover never exists on touch.
  const enabled = Boolean(url) && !reducedMotion;

  const start = useCallback(() => {
    if (!enabled || !window.matchMedia(FINE_POINTER).matches) return;
    preconnectYoutube();
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setActive(true), HOVER_PREVIEW_DELAY_MS);
  }, [enabled]);

  const stop = useCallback(() => {
    window.clearTimeout(timerRef.current);
    // Unmounting the iframe is what actually stops playback and the network.
    setActive(false);
    setPlaying(false);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (!active) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== YOUTUBE_EMBED_ORIGIN) return;
      if (!frame || event.source !== frame.contentWindow) return;
      if (isYoutubePlayingMessage(event.data)) setPlaying(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [active, frame]);

  // The player only starts posting state after it is told someone is listening.
  const onFrameLoad = useCallback(() => {
    frame?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: 1 }),
      YOUTUBE_EMBED_ORIGIN
    );
  }, [frame]);

  return {
    src: active && enabled ? url : null,
    playing,
    attachFrame: setFrame,
    onFrameLoad,
    handlers: { onPointerEnter: start, onPointerLeave: stop },
  };
};

export default useTrailerPreview;
