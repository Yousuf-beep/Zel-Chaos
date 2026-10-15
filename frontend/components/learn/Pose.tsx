"use client";

// Side-view illustrations of the stretches, drawn as soft rounded strokes in the app's colours. Each pose is a function
// of `b`, the breath (0 = fully out, 1 = fully in), so the practice timer can move the figure in time with the cue:
// cat-cow arches and dips, bridge lifts and lowers, happy baby rocks, child's pose breathes into the back.

export type PoseId = "child" | "catcow" | "happybaby" | "bridge";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pt = (a: [number, number], b: [number, number], t: number) => `${lerp(a[0], b[0], t).toFixed(1)} ${lerp(a[1], b[1], t).toFixed(1)}`;

function Head({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="12" className="pose-skin" />
      <path d={`M${x - 11} ${y - 3} A12 12 0 0 1 ${x + 11} ${y - 4} Q${x + 2} ${y - 9} ${x - 11} ${y - 3}Z`} className="pose-hair" />
    </g>
  );
}

function Child({ b }: { b: number }) {
  // The back rises a little with each breath in.
  const lift = b * 5;
  return (
    <g>
      <path d="M158 124 L104 124" className="pose-limb leg" />
      <path d={`M150 ${106 - lift * 0.4} L104 122`} className="pose-limb leg" />
      <path d={`M150 ${106 - lift * 0.4} Q118 ${92 - lift} 86 ${110 - lift * 0.3}`} className="pose-torso" />
      <path d={`M86 ${110 - lift * 0.3} L56 122 L26 124`} className="pose-limb arm" />
      <Head x={66} y={116 - lift * 0.15} />
      <circle cx="162" cy="124" r="5" className="pose-skin" />
    </g>
  );
}

function CatCow({ b }: { b: number }) {
  // b = 1: cow (belly drops, head up, breathing in); b = 0: cat (back rounds, head tucks, breathing out).
  const spineMid = pt([116, 56], [116, 104], b);
  const head: [number, number] = [lerp(54, 46, b), lerp(104, 70, b)];
  return (
    <g>
      <path d="M162 86 L162 124 L206 124" className="pose-limb leg" />
      <path d={`M162 86 Q${spineMid} 72 86`} className="pose-torso" />
      <path d={`M72 86 L${lerp(60, 56, b).toFixed(1)} ${lerp(98, 78, b).toFixed(1)}`} className="pose-limb neck" />
      <Head x={head[0]} y={head[1]} />
      <path d="M72 88 L72 124" className="pose-limb arm" />
      <circle cx="72" cy="124" r="5" className="pose-skin" />
    </g>
  );
}

function HappyBaby({ b }: { b: number }) {
  // A slow side-to-side rock along the spine.
  const angle = (b - 0.5) * 7;
  return (
    <g transform={`rotate(${angle.toFixed(2)} 92 120)`}>
      <path d="M58 118 L122 118" className="pose-torso" />
      <path d="M122 116 L100 82 L104 46" className="pose-limb leg" />
      <path d="M104 46 L124 44" className="pose-limb foot" />
      <path d="M62 114 L102 52" className="pose-limb arm" />
      <circle cx="103" cy="50" r="5" className="pose-skin" />
      <Head x={42} y={114} />
    </g>
  );
}

function Bridge({ b }: { b: number }) {
  // b = 1: hips lifted (breathing in); b = 0: lowered to the mat.
  const hip: [number, number] = [lerp(120, 124, b), lerp(118, 82, b)];
  const knee: [number, number] = [lerp(150, 156, b), lerp(80, 78, b)];
  return (
    <g>
      <path d={`M60 120 Q${lerp(90, 88, b)} ${lerp(120, 108, b)} ${hip[0]} ${hip[1]}`} className="pose-torso" />
      <path d={`M${hip[0]} ${hip[1]} L${knee[0]} ${knee[1]} L170 122`} className="pose-limb leg" />
      <path d="M170 124 L186 124" className="pose-limb foot" />
      <path d="M62 122 L112 124" className="pose-limb arm" />
      <circle cx="114" cy="124" r="5" className="pose-skin" />
      <Head x={44} y={114} />
    </g>
  );
}

const POSES: Record<PoseId, (p: { b: number }) => React.ReactNode> = { child: Child, catcow: CatCow, happybaby: HappyBaby, bridge: Bridge };

export default function Pose({ id, breath, label }: { id: PoseId; breath: number; label: string }) {
  const P = POSES[id];
  return (
    <svg className="pose" viewBox="0 0 230 150" role="img" aria-label={label}>
      <ellipse cx="115" cy="70" rx="96" ry="58" className="pose-glow" />
      <rect x="14" y="128" width="202" height="8" rx="4" className="pose-mat" />
      <P b={breath} />
    </svg>
  );
}
