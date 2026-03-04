'use client';
import { useRef, useState } from 'react';
import { Volume2, VolumeX, X, Plus, PictureInPicture2, GripVertical } from 'lucide-react';
import { YouTubeEmbed } from './YouTubeEmbed';
import { HLSPlayer } from './HLSPlayer';
import { resolveStreamUrl, extractYouTubeId } from '@/lib/utils/streamResolver';
import type { StreamTile, StreamChannel } from '@/lib/store/useStreamStore';

interface VideoTileProps {
  tile: StreamTile;
  isActive: boolean;
  isDragOver: boolean;
  onActivate: () => void;
  onMuteToggle: () => void;
  onRemove: () => void;
  onChannelSelect: () => void;
  onDragStart: () => void;
  onDragOver: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

export function VideoTile({
  tile, isActive, isDragOver,
  onActivate, onMuteToggle, onRemove, onChannelSelect,
  onDragStart, onDragOver, onDragEnd, onDrop,
}: VideoTileProps) {
  const [showControls, setShowControls] = useState(false);
  const hlsVideoRef = useRef<HTMLVideoElement | null>(null);

  const handlePiP = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tile.channel) return;
    const ch = tile.channel;

    if (ch.type === 'youtube') {
      const videoId = extractYouTubeId(ch.url) || '';
      if ('documentPictureInPicture' in window) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const pipWin: Window = await (window as any).documentPictureInPicture.requestWindow({ width: 640, height: 360 });
          pipWin.document.body.style.cssText = 'margin:0;padding:0;background:#000;overflow:hidden;';
          const iframe = pipWin.document.createElement('iframe');
          iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=1&mute=0`;
          iframe.style.cssText = 'width:100%;height:100%;border:none;';
          iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
          pipWin.document.body.appendChild(iframe);
          return;
        } catch { /* fall through */ }
      }
      window.open(
        `https://www.youtube.com/watch?v=${videoId}`,
        `pip-${tile.id}`,
        'width=640,height=360,popup=1,resizable=yes'
      );
    } else if (ch.type === 'hls' && hlsVideoRef.current) {
      if (document.pictureInPictureEnabled) {
        try { await hlsVideoRef.current.requestPictureInPicture(); } catch { /* ignore */ }
      }
    } else {
      window.open(ch.url, `pip-${tile.id}`, 'width=640,height=360,popup=1,resizable=yes');
    }
  };

  if (!tile.channel) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full cursor-pointer group transition-colors"
        style={{
          backgroundColor: isDragOver ? 'var(--bg-overlay)' : 'var(--bg-elevated)',
          border: isDragOver ? '2px dashed var(--text-accent)' : '1px solid var(--border-subtle)',
        }}
        onClick={onChannelSelect}
        onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
        onDrop={(e) => { e.preventDefault(); onDrop(); }}
      >
        <Plus size={24} style={{ color: 'var(--text-tertiary)' }} className="group-hover:text-accent transition-colors" />
        <span
          className="mt-2 font-data uppercase"
          style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}
        >
          Add Stream
        </span>
      </div>
    );
  }

  const resolved = resolveStreamUrl(tile.channel.url);

  return (
    <div
      className="relative w-full h-full overflow-hidden"
      style={{
        backgroundColor: '#000',
        outline: isDragOver
          ? '2px dashed var(--text-accent)'
          : isActive
          ? '2px solid var(--text-accent)'
          : '1px solid var(--border-subtle)',
      }}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDragEnd={onDragEnd}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      onClick={onActivate}
    >
      {/* Video content */}
      {resolved.type === 'youtube' && (
        <YouTubeEmbed url={tile.channel.url} isMuted={tile.isMuted} isActive={isActive} />
      )}
      {resolved.type === 'hls' && (
        <HLSPlayer url={tile.channel.url} isMuted={tile.isMuted} onVideoReady={(el) => { hlsVideoRef.current = el; }} />
      )}
      {resolved.type === 'twitch' && (
        <iframe
          src={resolved.embedUrl}
          className="w-full h-full"
          allow="autoplay"
          style={{ border: 'none' }}
        />
      )}
      {resolved.type === 'unknown' && (
        <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-tertiary)' }}>
          <span className="font-data text-xs">Unsupported stream format</span>
        </div>
      )}

      {/* Click-to-activate overlay — iframes never bubble DOM events to React,
          so this transparent overlay captures clicks for inactive tiles. */}
      {!isActive && (
        <div
          className="absolute inset-0"
          style={{ zIndex: 1, cursor: 'pointer' }}
          onClick={(e) => { e.stopPropagation(); onActivate(); }}
        />
      )}

      {/* Channel name badge */}
      {!showControls && (
        <div
          className="absolute bottom-1 left-1 px-1.5 py-0.5 font-data uppercase"
          style={{
            zIndex: 2,
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'var(--text-tertiary)',
            fontSize: '10px',
          }}
        >
          {tile.channel.name}
        </div>
      )}

      {/* Active audio indicator */}
      {isActive && !tile.isMuted && (
        <div
          className="absolute top-1 left-1 w-2 h-2 rounded-full"
          style={{ zIndex: 2, backgroundColor: 'var(--text-accent)' }}
          title="Audio active"
        />
      )}

      {/* Controls overlay */}
      {showControls && (
        <div
          className="absolute inset-0 flex flex-col justify-between p-2"
          style={{ zIndex: 2, background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.6) 100%)' }}
          onClick={(e) => { e.stopPropagation(); if (!isActive) onActivate(); }}
        >
          {/* Top controls */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-1">
              {/* Drag handle */}
              <div
                title="Drag to swap position"
                style={{ color: 'var(--text-tertiary)', cursor: 'grab', padding: '2px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical size={12} />
              </div>
              <span
                className="font-data uppercase px-1.5 py-0.5"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  color: 'var(--text-primary)',
                  fontSize: '11px',
                }}
              >
                {tile.channel.name}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="p-1 rounded transition-colors"
              style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--text-secondary)' }}
              title="Remove stream"
            >
              <X size={12} />
            </button>
          </div>

          {/* Bottom controls */}
          <div className="flex justify-between items-end">
            <div className="flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onMuteToggle(); }}
                className="p-1.5 rounded transition-colors"
                style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: tile.isMuted ? 'var(--text-tertiary)' : 'var(--text-accent)' }}
                title={tile.isMuted ? 'Unmute' : 'Mute'}
              >
                {tile.isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button
                onClick={handlePiP}
                className="p-1.5 rounded transition-colors"
                style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: 'var(--text-secondary)' }}
                title="Picture in Picture"
              >
                <PictureInPicture2 size={14} />
              </button>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onChannelSelect(); }}
              className="px-2 py-1 font-data uppercase"
              style={{
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'var(--text-secondary)',
                fontSize: '10px',
              }}
            >
              Change
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
