'use client';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface HLSPlayerProps {
  url: string;
  isMuted: boolean;
  onVideoReady?: (el: HTMLVideoElement) => void;
}

export function HLSPlayer({ url, isMuted, onVideoReady }: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let hls: { destroy: () => void } | null = null;
    setError(null);

    const init = async () => {
      if (!videoRef.current) return;

      const HlsLib = (await import('hls.js')).default;

      if (videoRef.current && onVideoReady) onVideoReady(videoRef.current);

      if (HlsLib.isSupported()) {
        const hlsInstance = new HlsLib({
          enableWorker: false,
          lowLatencyMode: true,
          // Don't hammer a failing stream — back off quickly
          manifestLoadingMaxRetry: 1,
          levelLoadingMaxRetry: 1,
          fragLoadingMaxRetry: 1,
        });
        hls = { destroy: () => hlsInstance.destroy() };

        hlsInstance.on(HlsLib.Events.ERROR, (_, data) => {
          if (data.fatal) {
            const is403 = data.response?.code === 403;
            const is404 = data.response?.code === 404;
            if (is403) {
              setError('403 — Session expired or access denied. Re-add the stream with a fresh URL.');
            } else if (is404) {
              setError('404 — Stream URL not found. The stream may have ended.');
            } else {
              setError(`Stream error${data.response?.code ? ` (${data.response.code})` : ''} — check URL and network.`);
            }
            hlsInstance.destroy();
          }
        });

        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(videoRef.current);
        hlsInstance.on(HlsLib.Events.MANIFEST_PARSED, () => {
          videoRef.current?.play().catch(() => {});
        });
      } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
        videoRef.current.src = url;
        videoRef.current.play().catch(() => {});
        videoRef.current.onerror = () => setError('Stream failed to load. Check URL or proxy config.');
      }
    };

    init();
    return () => { hls?.destroy(); };
  }, [url, retryKey]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = isMuted;
  }, [isMuted]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 px-4" style={{ backgroundColor: '#0a0a0a' }}>
        <AlertTriangle size={20} style={{ color: 'var(--severity-critical)', flexShrink: 0 }} />
        <span className="font-data text-center leading-relaxed" style={{ color: 'var(--severity-critical)', fontSize: '10px' }}>
          {error}
        </span>
        <button
          onClick={() => setRetryKey((k) => k + 1)}
          className="flex items-center gap-1 px-2 py-1 font-data uppercase mt-1"
          style={{ border: '1px solid var(--border-active)', color: 'var(--text-accent)', fontSize: '10px' }}
        >
          <RefreshCw size={10} /> Retry
        </button>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      muted={isMuted}
      playsInline
      className="w-full h-full object-cover"
      style={{ backgroundColor: '#000' }}
    />
  );
}
