const PATHS = {
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  facebook: ['M15 8h-2a2 2 0 0 0-2 2v2H8v4h3v6h4v-6h3l1-4h-4v-1.5c0-.8.2-1.5 1.5-1.5H19V5h-3c-3.1 0-5 1.9-5 5v2'],
  globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M2 12h20', 'M12 2a15.3 15.3 0 0 1 0 20', 'M12 2a15.3 15.3 0 0 0 0 20'],
  heart: ['M20.8 8.6a5.4 5.4 0 0 0-9.8-3A5.4 5.4 0 0 0 1.2 8.6c0 6.2 10.8 12 10.8 12s10.8-5.8 10.8-12Z'],
  info: ['M12 16v-4', 'M12 8h.01', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'],
  instagram: ['M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Z', 'M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37Z', 'M17.5 6.5h.01'],
  play: ['M9 6l10 6-10 6V6Z'],
  playCircle: ['M10 8l7 4-7 4V8Z', 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z'],
  x: ['M4 4l16 16', 'M20 4 4 20'],
  youtube: ['M22 12s0-3.2-.4-4.7c-.2-.8-.9-1.5-1.7-1.7C18.4 5.2 12 5.2 12 5.2s-6.4 0-7.9.4c-.8.2-1.5.9-1.7 1.7C2 8.8 2 12 2 12s0 3.2.4 4.7c.2.8.9 1.5 1.7 1.7 1.5.4 7.9.4 7.9.4s6.4 0 7.9-.4c.8-.2 1.5-.9 1.7-1.7.4-1.5.4-4.7.4-4.7Z', 'M10 9l5 3-5 3V9Z'],
};

export default function InlineIcon({ name, className = '', size = 24, strokeWidth = 2.1 }) {
  const paths = PATHS[name] || PATHS.play;

  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {paths.map((path) => (
        <path key={path} d={path} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
