"use client";

import { useEffect, useRef } from "react";

// CSS confetti animation fired when all 3 onboarding tasks are completed.
// Ported from onboarding-celebrate.js (triggerOnboardingCelebration)
// and onboarding-flow.js fireConfetti(). Uses the same colors, particle
// count, and fall keyframe as legacy.

const COLORS = ["#003366", "#059669", "#E6EEF5", "#F59E0B", "#6366F1"];
const PARTICLE_COUNT = 60;
const CLEANUP_MS = 3000;

export function Confetti({ active }: { active: boolean }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active || firedRef.current) return;
    firedRef.current = true;

    // Inject the keyframe if not present
    const styleId = "pe-confetti-fall";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = `
        @keyframes confettiFall {
          0% { opacity: 1; transform: translateY(0) rotate(0deg); }
          100% { opacity: 0; transform: translateY(100vh) rotate(720deg); }
        }
      `;
      document.head.appendChild(style);
    }

    const particles: HTMLDivElement[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const el = document.createElement("div");
      const isCircle = Math.random() > 0.5;
      const size = Math.random() * 8 + 4;
      el.style.cssText = `
        position: fixed;
        top: -20px;
        left: ${Math.random() * 100}%;
        width: ${size}px;
        height: ${isCircle ? size : size * 0.4}px;
        background: ${COLORS[i % COLORS.length]};
        border-radius: ${isCircle ? "50%" : "2px"};
        pointer-events: none;
        z-index: 99999;
        animation: confettiFall ${1 + Math.random() * 1.5}s ease-out ${Math.random() * 0.4}s forwards;
      `;
      document.body.appendChild(el);
      particles.push(el);
    }

    const timer = setTimeout(() => {
      particles.forEach((p) => p.remove());
    }, CLEANUP_MS);

    return () => {
      clearTimeout(timer);
      particles.forEach((p) => p.remove());
    };
  }, [active]);

  return null;
}
