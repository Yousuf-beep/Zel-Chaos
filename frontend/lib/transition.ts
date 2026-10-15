"use client";

type Router = { push: (href: string) => void };

// A colour disc grows out of the pressed control to cover the screen, the route changes underneath, then it fades away.
export function circleNav(router: Router, href: string, from: { clientX: number; clientY: number }, color = "var(--accent)") {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return router.push(href);
  const { innerWidth: w, innerHeight: h } = window;
  const x = from.clientX || w / 2;
  const y = from.clientY || h / 2;
  const r = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  const el = document.createElement("div");
  el.className = "wipe";
  el.style.background = color;
  document.body.appendChild(el);
  el.animate([{ clipPath: `circle(0px at ${x}px ${y}px)` }, { clipPath: `circle(${r}px at ${x}px ${y}px)` }], {
    duration: 640,
    easing: "cubic-bezier(0.65, 0, 0.35, 1)",
    fill: "forwards",
  }).onfinish = () => {
    router.push(href);
    const target = href.split(/[?#]/)[0];
    const started = performance.now();
    const reveal = () => {
      // Wait for the new route to be on screen (dev compiles can be slow), but never longer than 3 s.
      if (location.pathname !== target && performance.now() - started < 3000) return void setTimeout(reveal, 50);
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, delay: 120, easing: "ease-out", fill: "forwards" }).onfinish = () => el.remove();
    };
    reveal();
  };
}
