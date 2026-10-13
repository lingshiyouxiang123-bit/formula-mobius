export function XIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    home: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z', search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    bell: 'M5 17h14l-2-3V9a5 5 0 0 0-10 0v5Zm5 3h4', bookmark: 'M6 3h12v19l-6-4-6 4Z',
    user: 'M20 21v-2a8 8 0 0 0-16 0v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0', reply: 'M21 11a9 8 0 0 1-9 8H8l-5 3v-6a8 8 0 1 1 18-5Z',
    repost: 'M4 8h13l-4-4m4 4-4 4M20 16H7l4 4m-4-4 4-4', heart: 'M12 21 3 12a5 5 0 0 1 9-7 5 5 0 0 1 9 7Z',
    team: 'M4 21V3h16v18M8 7h2m4 0h2M8 11h2m4 0h2M9 21v-5h6v5', archive: 'M3 4h18v5H3Zm2 5v12h14V9M9 13h6',
    compose: 'm16 3 5 5-12 12-6 1 1-6ZM14 5l5 5', more: 'M4 12h.01M12 12h.01M20 12h.01',
    close: 'm6 6 12 12M18 6 6 18', back: 'M20 12H4m7-7-7 7 7 7', quote: 'M3 5h18v12H9l-6 4ZM7 9h4m2 0h4M7 13h8',
    globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
    pause: 'M8 5v14M16 5v14', play: 'm8 4 12 8-12 8Z',
  };
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] ?? paths.reply}/></svg>;
}
