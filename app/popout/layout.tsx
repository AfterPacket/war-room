import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WAR ROOM — Panel',
};

// NOTE: This is a segment layout, NOT a root layout.
// <html> and <body> are handled by app/layout.tsx — do not add them here.
export default function PopoutLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
