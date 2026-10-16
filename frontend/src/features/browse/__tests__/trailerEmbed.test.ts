import { describe, expect, it } from 'vitest';
import {
  extractIframeSrc,
  isYoutubePlayingMessage,
  youtubeEmbedUrl,
  youtubePreviewUrl,
} from '../trailerEmbed';

const ID = 'YoHD9XEInc0';

describe('extractIframeSrc', () => {
  it('pulls the src out of a pasted <iframe> embed snippet', () => {
    const snippet = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${ID}" title="YouTube video player" frameborder="0" allowfullscreen></iframe>`;
    expect(extractIframeSrc(snippet)).toBe(`https://www.youtube.com/embed/${ID}`);
  });

  it('returns the input unchanged when it is not an iframe snippet', () => {
    expect(extractIframeSrc(`https://youtu.be/${ID}`)).toBe(`https://youtu.be/${ID}`);
  });
});

describe('youtubeEmbedUrl', () => {
  it('embeds a pasted <iframe> snippet, not just a bare link', () => {
    const snippet = `<iframe src="https://www.youtube.com/embed/${ID}"></iframe>`;
    expect(youtubeEmbedUrl(snippet)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`
    );
  });

  it('embeds the watch URL the dev data actually stores', () => {
    expect(youtubeEmbedUrl(`https://www.youtube.com/watch?v=${ID}`)).toBe(
      `https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`
    );
  });

  it('accepts the short link and an already-embedded link', () => {
    // Operators paste whatever their browser gave them.
    expect(youtubeEmbedUrl(`https://youtu.be/${ID}`)).toContain(`/embed/${ID}`);
    expect(youtubeEmbedUrl(`https://www.youtube.com/embed/${ID}`)).toContain(`/embed/${ID}`);
    expect(youtubeEmbedUrl(`https://m.youtube.com/watch?v=${ID}&t=42`)).toContain(`/embed/${ID}`);
  });

  it('uses the no-cookie host', () => {
    expect(youtubeEmbedUrl(`https://www.youtube.com/watch?v=${ID}`)).toContain(
      'youtube-nocookie.com'
    );
  });

  it('returns null for anything it cannot embed, so the caller opens a tab instead', () => {
    expect(youtubeEmbedUrl('')).toBeNull();
    expect(youtubeEmbedUrl(null)).toBeNull();
    expect(youtubeEmbedUrl('not a url')).toBeNull();
    expect(youtubeEmbedUrl('https://vimeo.com/12345')).toBeNull();
    expect(youtubeEmbedUrl('https://www.youtube.com/')).toBeNull();
    // An 11-character id is the whole format; a short or long one is not a video.
    expect(youtubeEmbedUrl('https://youtu.be/tooshort')).toBeNull();
  });
});

describe('youtubePreviewUrl', () => {
  it('builds a muted, chromeless, looping embed for the same id', () => {
    const url = new URL(youtubePreviewUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ') ?? '');
    expect(url.hostname).toBe('www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('mute')).toBe('1');
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('controls')).toBe('0');
    // YouTube only loops a single video when it is also its own playlist.
    expect(url.searchParams.get('playlist')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for a link that cannot be embedded', () => {
    expect(youtubePreviewUrl('https://vimeo.com/123')).toBeNull();
    expect(youtubePreviewUrl(null)).toBeNull();
  });
});

describe('isYoutubePlayingMessage', () => {
  it('recognises both shapes the IFrame API uses for "playing"', () => {
    expect(isYoutubePlayingMessage(JSON.stringify({ event: 'onStateChange', info: 1 }))).toBe(true);
    expect(
      isYoutubePlayingMessage(JSON.stringify({ event: 'infoDelivery', info: { playerState: 1 } }))
    ).toBe(true);
  });

  it('ignores buffering, other events and junk', () => {
    expect(isYoutubePlayingMessage(JSON.stringify({ event: 'onStateChange', info: 3 }))).toBe(
      false
    );
    expect(
      isYoutubePlayingMessage(JSON.stringify({ event: 'infoDelivery', info: { currentTime: 2 } }))
    ).toBe(false);
    expect(isYoutubePlayingMessage('not json')).toBe(false);
    expect(isYoutubePlayingMessage({ event: 'onStateChange', info: 1 })).toBe(false);
  });
});
