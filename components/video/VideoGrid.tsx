'use client';
import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Plus, Minus } from 'lucide-react';
import { VideoTile } from './VideoTile';
import { ChannelSidebar } from './ChannelSidebar';
import { Panel } from '@/components/layout/Panel';
import { useStreamStore, type StreamChannel } from '@/lib/store/useStreamStore';

export function VideoGrid() {
  const {
    tiles, activeAudioTileId,
    setGridSize, addTile, removeTile, swapTileChannels,
    setTileChannel, setActiveAudioTile, setTileMuted,
    videoAutoRotate, videoRotateInterval, setVideoAutoRotate, setVideoRotateInterval,
  } = useStreamStore();
  const [sidebarTileId, setSidebarTileId] = useState<string | null>(null);

  // ── Drag-to-swap ─────────────────────────────────────────────────────────
  const dragSrcId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDragStart = (tileId: string) => { dragSrcId.current = tileId; };
  const handleDragOver  = (tileId: string) => { setDragOverId(tileId); };
  const handleDragEnd   = () => { dragSrcId.current = null; setDragOverId(null); };
  const handleDrop      = (tileId: string) => {
    if (dragSrcId.current && dragSrcId.current !== tileId) {
      swapTileChannels(dragSrcId.current, tileId);
    }
    dragSrcId.current = null;
    setDragOverId(null);
  };

  // ── Auto-rotation ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoAutoRotate) return;

    const id = setInterval(() => {
      const { tiles: t, activeAudioTileId: cur, setActiveAudioTile: activate } =
        useStreamStore.getState();
      const occupied = t.filter((tile) => tile.channel !== null);
      if (occupied.length < 2) return;
      const curIdx = occupied.findIndex((tile) => tile.id === cur);
      const next   = occupied[(curIdx + 1) % occupied.length];
      activate(next.id);
    }, videoRotateInterval * 1000);

    return () => clearInterval(id);
  }, [videoAutoRotate, videoRotateInterval]);

  const tileCount = tiles.length;
  const cols = tileCount <= 1 ? 1 : tileCount <= 4 ? 2 : tileCount <= 9 ? 3 : 4;
  const rows = Math.ceil(tileCount / cols);

  const ROTATE_OPTIONS = [15, 30, 60, 120, 300] as const;

  const gridControls = (
    <div className="flex items-center gap-1">
      {/* Grid size presets */}
      {([1, 4, 9, 16] as const).map((size) => (
        <button
          key={size}
          onClick={(e) => { e.stopPropagation(); setGridSize(size); }}
          className="px-1.5 py-0.5 font-data transition-colors"
          style={{
            fontSize: '10px',
            color: tileCount === size ? 'var(--text-accent)' : 'var(--text-tertiary)',
            backgroundColor: tileCount === size ? 'var(--bg-elevated)' : 'transparent',
          }}
        >
          {size === 1 ? '1×1' : size === 4 ? '2×2' : size === 9 ? '3×3' : '4×4'}
        </button>
      ))}

      {/* Divider */}
      <span style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-subtle)', flexShrink: 0 }} />

      {/* +/- single tile */}
      <button
        onClick={(e) => { e.stopPropagation(); removeTile(); }}
        disabled={tileCount <= 1}
        className="p-0.5 font-data transition-colors"
        style={{
          color: tileCount <= 1 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
          opacity: tileCount <= 1 ? 0.4 : 1,
        }}
        title="Remove one tile"
      >
        <Minus size={10} />
      </button>
      <span
        className="font-data"
        style={{ fontSize: '10px', color: 'var(--text-tertiary)', minWidth: '16px', textAlign: 'center' }}
      >
        {tileCount}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); addTile(); }}
        disabled={tileCount >= 16}
        className="p-0.5 font-data transition-colors"
        style={{
          color: tileCount >= 16 ? 'var(--text-tertiary)' : 'var(--text-secondary)',
          opacity: tileCount >= 16 ? 0.4 : 1,
        }}
        title="Add one tile"
      >
        <Plus size={10} />
      </button>

      {/* Divider */}
      <span style={{ width: '1px', height: '12px', backgroundColor: 'var(--border-subtle)', flexShrink: 0 }} />

      {/* Auto-rotate toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); setVideoAutoRotate(!videoAutoRotate); }}
        className="px-1.5 py-0.5 font-data transition-colors flex items-center gap-1"
        style={{
          fontSize: '10px',
          color: videoAutoRotate ? 'var(--text-accent)' : 'var(--text-tertiary)',
          backgroundColor: videoAutoRotate ? 'rgba(74,222,128,0.1)' : 'transparent',
          border: videoAutoRotate ? '1px solid rgba(74,222,128,0.25)' : '1px solid transparent',
        }}
        title="Auto-rotate feeds"
      >
        <RotateCcw size={9} />
        AUTO
      </button>

      {/* Interval selector — only visible when auto-rotate is on */}
      {videoAutoRotate && (
        <select
          value={videoRotateInterval}
          onChange={(e) => { setVideoRotateInterval(Number(e.target.value)); }}
          onClick={(e) => e.stopPropagation()}
          className="font-data"
          style={{
            fontSize: '10px',
            color: 'var(--text-accent)',
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            padding: '1px 3px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {ROTATE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s < 60 ? `${s}s` : `${s / 60}m`}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <Panel title="Video Grid" panelId="video" controls={gridControls} noPadding>
      <div className="relative h-full">
        <div
          className="grid h-full"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: '1px',
            backgroundColor: 'var(--border-subtle)',
          }}
        >
          {tiles.map((tile) => (
            <VideoTile
              key={tile.id}
              tile={tile}
              isActive={activeAudioTileId === tile.id}
              isDragOver={dragOverId === tile.id}
              onActivate={() => setActiveAudioTile(tile.id)}
              onMuteToggle={() => {
                if (activeAudioTileId === tile.id) {
                  setActiveAudioTile(null);
                  setTileMuted(tile.id, true);
                } else {
                  setActiveAudioTile(tile.id);
                }
              }}
              onRemove={() => setTileChannel(tile.id, null)}
              onChannelSelect={() => setSidebarTileId(tile.id)}
              onDragStart={() => handleDragStart(tile.id)}
              onDragOver={() => handleDragOver(tile.id)}
              onDragEnd={handleDragEnd}
              onDrop={() => handleDrop(tile.id)}
            />
          ))}
        </div>

        {/* Channel picker sidebar */}
        {sidebarTileId && (
          <ChannelSidebar
            onSelect={(channel: StreamChannel) => {
              setTileChannel(sidebarTileId, channel);
              setSidebarTileId(null);
            }}
            onClose={() => setSidebarTileId(null)}
          />
        )}
      </div>
    </Panel>
  );
}
