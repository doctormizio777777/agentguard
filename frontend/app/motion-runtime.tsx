"use client";

import { useEffect } from "react";


const REVEAL_SELECTOR = [
  ".landing-proof-section",
  ".landing-section",
  ".landing-built-with",
].join(",");

const STAGGER_GROUP_SELECTOR = ".landing-judge-grid,.landing-proof-links";
const STICKY_HEADER_SELECTOR = ".landing-nav,.topbar";


export function MotionRuntime() {
  useEffect(() => {
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const staggerItems = Array.from(document.querySelectorAll<HTMLElement>(STAGGER_GROUP_SELECTOR))
      .flatMap((group) => Array.from(group.children).slice(0, 3) as HTMLElement[]);
    const allTargets = [...new Set([...revealTargets, ...staggerItems])];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    document.querySelectorAll<HTMLElement>(STAGGER_GROUP_SELECTOR).forEach((group) => {
      Array.from(group.children).slice(0, 3).forEach((item, index) => {
        (item as HTMLElement).style.setProperty("--reveal-delay", `${index * 60}ms`);
      });
    });

    allTargets.forEach((target) => target.classList.add("motion-reveal"));
    document.documentElement.classList.add("motion-ready");

    let observer: IntersectionObserver | null = null;
    if (reducedMotion || !("IntersectionObserver" in window)) {
      allTargets.forEach((target) => target.classList.add("is-revealed"));
    } else {
      observer = new IntersectionObserver((entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          currentObserver.unobserve(entry.target);
        });
      }, { threshold: 0.15 });
      allTargets.forEach((target) => observer?.observe(target));
    }

    const headers = Array.from(document.querySelectorAll<HTMLElement>(STICKY_HEADER_SELECTOR));
    const syncHeaders = () => {
      const scrolled = window.scrollY > 40;
      headers.forEach((header) => header.classList.toggle("is-scrolled", scrolled));
    };
    syncHeaders();
    window.addEventListener("scroll", syncHeaders, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", syncHeaders);
      document.documentElement.classList.remove("motion-ready");
    };
  }, []);

  return null;
}
