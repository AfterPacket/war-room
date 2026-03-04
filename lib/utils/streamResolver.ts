export type StreamType = 'youtube' | 'twitch' | 'hls' | 'unknown';

export interface ResolvedStream {
  type: StreamType;
  embedUrl: string;
  videoId?: string;
  channelName?: string;
}

export function resolveStreamUrl(url: string): ResolvedStream {
  try {
    const parsed = new URL(url);

    // YouTube
    if (parsed.hostname.includes('youtube.com') || parsed.hostname === 'youtu.be') {
      let videoId = '';
      if (parsed.hostname === 'youtu.be') {
        videoId = parsed.pathname.slice(1);
      } else {
        videoId = parsed.searchParams.get('v') || parsed.pathname.split('/').pop() || '';
      }
      return {
        type: 'youtube',
        embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`,
        videoId,
      };
    }

    // Twitch
    if (parsed.hostname.includes('twitch.tv')) {
      const channelName = parsed.pathname.split('/').filter(Boolean)[0];
      return {
        type: 'twitch',
        embedUrl: `https://player.twitch.tv/?channel=${channelName}&parent=${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}&autoplay=true&muted=true`,
        channelName,
      };
    }

    // Proxy HLS (Nimble / header-protected streams)
    if (parsed.pathname === '/api/proxy/hls') {
      return { type: 'hls', embedUrl: url };
    }

    // HLS
    if (url.endsWith('.m3u8') || url.includes('.m3u8?')) {
      return { type: 'hls', embedUrl: url };
    }

    return { type: 'unknown', embedUrl: url };
  } catch {
    return { type: 'unknown', embedUrl: url };
  }
}

export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === 'youtu.be') return parsed.pathname.slice(1);
    if (parsed.hostname.includes('youtube.com')) {
      return parsed.searchParams.get('v') || parsed.pathname.split('/').pop() || null;
    }
    return null;
  } catch {
    return null;
  }
}
