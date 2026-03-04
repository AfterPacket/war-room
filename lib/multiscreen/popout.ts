'use client';

export type PopoutPanelId = 'video' | 'map' | 'news' | 'briefing' | 'ticker' | 'cyber';

interface PopoutConfig {
  panelId: PopoutPanelId;
  title: string;
  width?: number;
  height?: number;
  screenX?: number;
  screenY?: number;
}

const ACTIVE_WINDOWS = new Map<PopoutPanelId, Window>();

export function popOutPanel(config: PopoutConfig): Window | null {
  // Close existing window for this panel if open
  const existing = ACTIVE_WINDOWS.get(config.panelId);
  if (existing && !existing.closed) {
    existing.focus();
    return existing;
  }

  const width = config.width || 1280;
  const height = config.height || 800;
  const screenX = config.screenX ?? 0;
  const screenY = config.screenY ?? 0;

  const features = [
    `width=${width}`,
    `height=${height}`,
    `screenX=${screenX}`,
    `screenY=${screenY}`,
    'menubar=no',
    'toolbar=no',
    'location=no',
    'status=no',
    'resizable=yes',
  ].join(',');

  const popout = window.open(
    `/popout/${config.panelId}`,
    `warroom-${config.panelId}`,
    features
  );

  if (popout) {
    ACTIVE_WINDOWS.set(config.panelId, popout);
    popout.addEventListener('beforeunload', () => {
      ACTIVE_WINDOWS.delete(config.panelId);
    });
  }

  return popout;
}

export function getActiveWindows(): Map<PopoutPanelId, Window> {
  // Clean closed windows
  for (const [id, win] of ACTIVE_WINDOWS.entries()) {
    if (win.closed) ACTIVE_WINDOWS.delete(id);
  }
  return ACTIVE_WINDOWS;
}

export function recallAllWindows() {
  for (const [, win] of ACTIVE_WINDOWS.entries()) {
    if (!win.closed) win.close();
  }
  ACTIVE_WINDOWS.clear();
}
