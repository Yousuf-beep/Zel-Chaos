// Thick gradient ribbon that draws itself behind large type once its section is revealed.
export default function Ribbon({ id, from, to, d, className = "" }: { id: string; from: string; to: string; d: string; className?: string }) {
  return (
    <svg className={`ribbon ${className}`} viewBox="0 0 1900 1500" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id}>
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path d={d} stroke={`url(#${id})`} pathLength={1} />
    </svg>
  );
}
