// Unwrap the embed src from an iframe snippet, drop the extra HTML, only allowlisted hosts embed.
export const extractIframeSrc = (input: string): string => {
  const match = input.match(/<iframe[^>]*\ssrc=["']([^"']+)["'][^>]*>/i);
  return match ? match[1] : input;
};

// The 11-char YouTube id behind trailer_url, or null for anything that is not an embeddable YouTube link.
export const youtubeVideoId = (trailerUrl?: string | null): string | null => {
  if (!trailerUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(extractIframeSrc(trailerUrl.trim()));
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '');
  let id = '';

  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1);
  } else if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    id = parsed.searchParams.get('v') ?? '';
    if (!id && parsed.pathname.startsWith('/embed/')) id = parsed.pathname.slice('/embed/'.length);
  }

  // Only an 11-char id embeds.
  return /^[\w-]{11}$/.test(id) ? id : null;
};

// Convert trailer_url to a nocookie embed; legacy links open the source instead of a broken iframe.
export const youtubeEmbedUrl = (trailerUrl?: string | null): string | null => {
  const id = youtubeVideoId(trailerUrl);
  return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0` : null;
};

// Hover preview: browsers only allow autoplay when muted; loop needs playlist=<same id>.
// enablejsapi + origin let the card hear "playing" and keep the poster up until then.
export const youtubePreviewUrl = (trailerUrl?: string | null, origin?: string): string | null => {
  const id = youtubeVideoId(trailerUrl);
  if (!id) return null;
  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: '0',
    playsinline: '1',
    loop: '1',
    playlist: id,
    rel: '0',
    modestbranding: '1',
    disablekb: '1',
    enablejsapi: '1',
  });
  if (origin) params.set('origin', origin);
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
};

export const YOUTUBE_EMBED_ORIGIN = 'https://www.youtube-nocookie.com';

// Player state 1 = playing, as posted by the IFrame API ("infoDelivery" or "onStateChange").
export const isYoutubePlayingMessage = (data: unknown): boolean => {
  if (typeof data !== 'string') return false;
  try {
    const msg = JSON.parse(data) as { event?: string; info?: unknown };
    if (msg.event === 'onStateChange') return msg.info === 1;
    if (msg.event === 'infoDelivery' && msg.info && typeof msg.info === 'object') {
      return (msg.info as { playerState?: number }).playerState === 1;
    }
  } catch {
    return false;
  }
  return false;
};
