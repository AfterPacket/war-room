'use client';
import { useState } from 'react';
import { Plus, X, GripVertical, RotateCcw } from 'lucide-react';
import { useSettingsStore, DEFAULT_WORLD_CLOCKS, type WorldClock } from '@/lib/store/useSettingsStore';
import { GlobalClockStrip } from '@/components/layout/GlobalClockStrip';

export function WorldClocksTab() {
  const { worldClocks, showClockStrip, showFlags, setWorldClocks, setShowClockStrip, setShowFlags } = useSettingsStore();
  const [searchTz, setSearchTz] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newFlag, setNewFlag] = useState('');
  const [selectedTz, setSelectedTz] = useState('');

  const allTimezones = typeof Intl !== 'undefined'
    ? (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') || []
    : [];

  const filteredTz = searchTz.length > 1
    ? allTimezones.filter((tz) => tz.toLowerCase().includes(searchTz.toLowerCase())).slice(0, 20)
    : [];

  const addClock = () => {
    if (!selectedTz || !newLabel.trim()) return;
    const newClock: WorldClock = {
      id: `custom-${Date.now()}`,
      label: newLabel.trim().toUpperCase().slice(0, 6),
      timezone: selectedTz,
      flag: newFlag.trim() || undefined,
    };
    setWorldClocks([...worldClocks, newClock]);
    setNewLabel('');
    setNewFlag('');
    setSearchTz('');
    setSelectedTz('');
  };

  const removeClock = (id: string) => {
    setWorldClocks(worldClocks.filter((c) => c.id !== id));
  };

  const resetClocks = () => {
    setWorldClocks(DEFAULT_WORLD_CLOCKS);
  };

  return (
    <div className="max-w-2xl">
      {/* Preview */}
      <div className="mb-6">
        <h3 className="font-data uppercase mb-2" style={{ color: 'var(--text-accent)', fontSize: '11px' }}>
          Preview
        </h3>
        <div style={{ border: '1px solid var(--border-subtle)' }}>
          <GlobalClockStrip />
        </div>
      </div>

      {/* Toggle options */}
      <div className="mb-6 flex flex-col gap-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showClockStrip}
            onChange={(e) => setShowClockStrip(e.target.checked)}
            style={{ accentColor: 'var(--text-accent)', width: '14px', height: '14px' }}
          />
          <span style={{ color: 'var(--text-primary)', fontSize: '13px' }}>Show clock strip</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showFlags}
            onChange={(e) => setShowFlags(e.target.checked)}
            style={{ accentColor: 'var(--text-accent)', width: '14px', height: '14px' }}
          />
          <span style={{ color: 'var(--text-primary)', fontSize: '13px' }}>Show flag emojis</span>
        </label>
      </div>

      {/* Current clocks */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-data uppercase" style={{ color: 'var(--text-accent)', fontSize: '11px' }}>
            Active Clocks ({worldClocks.length})
          </h3>
          <button
            onClick={resetClocks}
            className="flex items-center gap-1 font-data uppercase"
            style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}
          >
            <RotateCcw size={10} /> Reset to defaults
          </button>
        </div>
        <div className="border" style={{ borderColor: 'var(--border-subtle)' }}>
          {worldClocks.map((clock, idx) => (
            <div
              key={clock.id}
              className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-elevated"
              style={{ borderColor: 'var(--border-subtle)' }}
            >
              <GripVertical size={12} style={{ color: 'var(--text-tertiary)', cursor: 'grab' }} />
              {clock.flag && <span style={{ fontSize: '14px' }}>{clock.flag}</span>}
              <span className="font-data uppercase w-12" style={{ color: 'var(--text-accent)', fontSize: '12px' }}>
                {clock.label}
              </span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: '11px', flex: 1 }}>
                {clock.timezone}
              </span>
              <button
                onClick={() => removeClock(clock.id)}
                style={{ color: 'var(--text-tertiary)' }}
                className="hover:text-primary transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Add new clock */}
      <div>
        <h3 className="font-data uppercase mb-3" style={{ color: 'var(--text-accent)', fontSize: '11px' }}>
          Add Clock
        </h3>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g., NYC)"
              className="w-28 px-2 py-1.5 font-data uppercase"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none',
              }}
              maxLength={6}
            />
            <input
              value={newFlag}
              onChange={(e) => setNewFlag(e.target.value)}
              placeholder="Flag emoji"
              className="w-24 px-2 py-1.5 font-data"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
              }}
              maxLength={4}
            />
          </div>
          <div className="relative">
            <input
              value={searchTz}
              onChange={(e) => { setSearchTz(e.target.value); setSelectedTz(''); }}
              placeholder="Search timezone (e.g., New_York, London...)"
              className="w-full px-2 py-1.5 font-data"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none',
              }}
            />
            {filteredTz.length > 0 && !selectedTz && (
              <div
                className="absolute top-full left-0 right-0 z-50 max-h-48 overflow-y-auto"
                style={{
                  backgroundColor: 'var(--bg-overlay)',
                  border: '1px solid var(--border-active)',
                }}
              >
                {filteredTz.map((tz) => (
                  <button
                    key={tz}
                    onClick={() => { setSelectedTz(tz); setSearchTz(tz); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-elevated transition-colors"
                    style={{ color: 'var(--text-secondary)', fontSize: '12px' }}
                  >
                    {tz}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedTz && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
              Selected: <span style={{ color: 'var(--text-accent)' }}>{selectedTz}</span>
            </div>
          )}
          <button
            onClick={addClock}
            disabled={!selectedTz || !newLabel.trim()}
            className="flex items-center justify-center gap-1 py-2 font-data uppercase transition-opacity disabled:opacity-40"
            style={{
              backgroundColor: 'var(--text-accent)',
              color: 'var(--bg-base)',
              fontSize: '11px',
            }}
          >
            <Plus size={12} /> Add Clock
          </button>
        </div>
      </div>
    </div>
  );
}
