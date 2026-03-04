'use client';
const CHANNEL_NAME = 'warroom-sync';

export type SyncMessageType =
  | 'news-update'
  | 'stream-change'
  | 'settings-change'
  | 'alert'
  | 'ai-brief'
  | 'map-view';

export interface SyncMessage {
  type: SyncMessageType;
  payload: unknown;
  timestamp: number;
}

export function broadcastState(type: SyncMessageType, payload: unknown) {
  if (typeof window === 'undefined') return;
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.postMessage({ type, payload, timestamp: Date.now() } as SyncMessage);
  channel.close();
}

export function listenForSync(
  handler: (msg: SyncMessage) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<SyncMessage>) => handler(event.data);
  return () => channel.close();
}
