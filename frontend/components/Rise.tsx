import type { ElementType, ReactNode } from "react";

// Each line rises out of its own mask. Inside a [data-reveal] parent it waits until scrolled into view.
export default function Rise({ as: Tag = "h1", lines, className = "", delay = 0, id }: {
  as?: ElementType; lines: ReactNode[]; className?: string; delay?: number; id?: string;
}) {
  return (
    <Tag id={id} className={`rise tight ${className}`}>
      {lines.map((line, i) => (
        <span key={i} className="ln">
          <span style={{ "--i": i + delay } as React.CSSProperties}>{line}</span>
        </span>
      ))}
    </Tag>
  );
}
