import RevealObserver from "@/components/RevealObserver";

// template.tsx remounts on every navigation, so each page gets its own enter animation and reveal pass.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-enter">
      {children}
      <RevealObserver />
    </div>
  );
}
