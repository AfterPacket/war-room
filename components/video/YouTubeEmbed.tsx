'use client';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { extractYouTubeId } from '@/lib/utils/streamResolver';

interface YouTubeEmbedProps {
  url: string;
  isMuted: boolean;
  isActive: boolean;
}

export function YouTubeEmbed({ url, isMuted, isActive }: YouTubeEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoId = extractYouTubeId(url) || url;
  const [ended, setEnded] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // enablejsapi=1 makes the YouTube player post state-change messages.
  // loop=0 is explicit (default, but belt-and-suspenders).
  const embedUrl =
    `https://www.youtube.com/embed/${videoId}` +
    `?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0` +
    `&modestbranding=1&rel=0&iv_load_policy=3&loop=0&enablejsapi=1`;

  // Reset ended state whenever the stream or retry key changes
  useEffect(() => { setEnded(false); }, [videoId, retryKey]);

  // Listen for YouTube player state messages.
  // playerState 0 = ended, -1 = unstarted, 1 = playing, 2 = paused, 3 = buffering.
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        // Only act on events from this specific iframe
        if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
        if (data?.event === 'infoDelivery' && data?.info?.playerState === 0) {
          setEnded(true);
        }
      } catch { /* malformed message — ignore */ }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="relative w-full h-full">
      <iframe
        key={`${videoId}-${isMuted}-${retryKey}`}
        ref={iframeRef}
        src={embedUrl}
        className="w-full h-full"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{ border: 'none' }}
      />
      {ended && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ backgroundColor: 'rgba(0,0,0,0.88)', zIndex: 10 }}
        >
          <span
            className="font-data uppercase"
            style={{ color: 'var(--text-tertiary)', fontSize: '11px', letterSpacing: '1px' }}
          >
            Stream Ended
          </span>
          <button
            onClick={() => { setRetryKey((k) => k + 1); }}
            className="flex items-center gap-1 px-2 py-1 font-data uppercase"
            style={{
              border: '1px solid var(--border-active)',
              color: 'var(--text-accent)',
              fontSize: '10px',
              backgroundColor: 'transparent',
            }}
          >
            <RefreshCw size={10} /> Retry
          </button>
        </div>
      )}
    </div>
  );
}
