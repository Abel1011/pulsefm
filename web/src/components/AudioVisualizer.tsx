"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRadio } from "./RadioProvider";

// Smooth noise via layered sinusoidal harmonics
function fbm(x: number, y: number, octaves: number): number {
  let val = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * (Math.sin(x * freq + y * freq * 0.7) * 0.5 + Math.cos(y * freq * 1.3 - x * freq * 0.4) * 0.5);
    amp *= 0.5;
    freq *= 2.1;
  }
  return val;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  hue: number;
}

interface Tendril {
  baseAngle: number;
  length: number;
  width: number;
  phase: number;
  speed: number;
}

const BLOB_POINTS = 180;
const MAX_PARTICLES = 80;
const NUM_TENDRILS = 12;
const SMOOTHING = 0.06;

export default function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state } = useRadio();
  const isPlayingRef = useRef(state.isPlaying);
  const stationColorRef = useRef(state.currentStation.color);
  const timeRef = useRef(0);
  const energyRef = useRef(0);
  const targetEnergyRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const tendrilsRef = useRef<Tendril[]>([]);
  const frameRef = useRef(0);
  const dimsRef = useRef({ w: 0, h: 0 });
  const pulsePhaseRef = useRef(0);

  isPlayingRef.current = state.isPlaying;
  stationColorRef.current = state.currentStation.color;

  // Parse hex color to RGB
  const hexToRgb = useCallback((hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }, []);

  // Initialize tendrils
  useEffect(() => {
    const tendrils: Tendril[] = [];
    for (let i = 0; i < NUM_TENDRILS; i++) {
      tendrils.push({
        baseAngle: (i / NUM_TENDRILS) * Math.PI * 2,
        length: 0.3 + Math.random() * 0.5,
        width: 1 + Math.random() * 2,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.5,
      });
    }
    tendrilsRef.current = tendrils;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      dimsRef.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      if (!running) return;

      const { w, h } = dimsRef.current;
      if (w === 0) {
        frameRef.current = requestAnimationFrame(draw);
        return;
      }

      const cx = w / 2;
      const cy = h / 2;
      const minDim = Math.min(w, h);
      const baseR = minDim * 0.26;

      const playing = isPlayingRef.current;
      const col = hexToRgb(stationColorRef.current);

      // Smooth energy with micro-variations
      const rawTarget = playing ? 0.65 + Math.sin(Date.now() * 0.002) * 0.15 + Math.random() * 0.2 : 0.03;
      targetEnergyRef.current = rawTarget;
      energyRef.current += (targetEnergyRef.current - energyRef.current) * SMOOTHING;
      const energy = energyRef.current;

      timeRef.current += playing ? 0.014 : 0.003;
      const t = timeRef.current;

      // Beat pulse (simulated rhythmic emphasis)
      pulsePhaseRef.current += playing ? 0.08 : 0.01;
      const beat = Math.pow(Math.max(Math.sin(pulsePhaseRef.current), 0), 3) * energy;

      ctx.clearRect(0, 0, w, h);

      // === Deep ambient atmosphere ===
      const atmR = baseR * (2.5 + energy * 0.8);
      const atm = ctx.createRadialGradient(cx, cy, 0, cx, cy, atmR);
      atm.addColorStop(0, `rgba(${col.r}, ${col.g}, ${col.b}, ${0.07 + energy * 0.06 + beat * 0.04})`);
      atm.addColorStop(0.3, `rgba(${col.r}, ${col.g}, ${col.b}, ${0.025 + energy * 0.025})`);
      atm.addColorStop(0.6, `rgba(${col.r * 0.6 | 0}, ${col.g * 0.4 | 0}, ${col.b * 0.3 | 0}, ${energy * 0.012})`);
      atm.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = atm;
      ctx.fillRect(0, 0, w, h);

      // === Spectral tendrils ===
      if (playing) {
        const tendrils = tendrilsRef.current;
        for (const tendril of tendrils) {
          const angle = tendril.baseAngle + Math.sin(t * tendril.speed + tendril.phase) * 0.4;
          const len = baseR * (1.1 + tendril.length * energy * 1.5 + beat * 0.3);
          const segments = 30;

          ctx.beginPath();
          for (let s = 0; s <= segments; s++) {
            const ratio = s / segments;
            const wobble = fbm(ratio * 3 + t, tendril.phase, 3) * energy * baseR * 0.15;
            const dist = baseR * 0.9 + (len - baseR * 0.9) * ratio;
            const perpAngle = angle + Math.PI / 2;
            const x = cx + Math.cos(angle) * dist + Math.cos(perpAngle) * wobble;
            const y = cy + Math.sin(angle) * dist + Math.sin(perpAngle) * wobble;

            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }

          const alpha = (0.04 + energy * 0.08) * (1 - 0.3 * Math.abs(Math.sin(tendril.phase)));
          ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${alpha})`;
          ctx.lineWidth = tendril.width * (0.5 + energy);
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }

      // === Multi-layer organic blob ===
      const layers = [
        { scale: 1.2, alpha: 0.025, noise: 2.2, fill: false },
        { scale: 1.08, alpha: 0.05, noise: 2.0, fill: false },
        { scale: 1.0, alpha: 1, noise: 1.8, fill: true },
      ];

      for (const layer of layers) {
        const points: { x: number; y: number }[] = [];

        for (let i = 0; i < BLOB_POINTS; i++) {
          const angle = (i / BLOB_POINTS) * Math.PI * 2;
          const nx = Math.cos(angle);
          const ny = Math.sin(angle);

          const n1 = fbm(nx * layer.noise + t, ny * layer.noise + t * 0.6, 4);
          const n2 = fbm(nx * 3.5 + t * 1.2, ny * 3.5 - t * 0.3, 3) * 0.4;
          const beatWarp = beat * Math.pow(Math.abs(Math.sin(angle * 3 + t)), 2) * 0.15;
          const distortion = (n1 + n2) * energy * baseR * 0.28 + beatWarp * baseR;

          const r = baseR * layer.scale + distortion;
          points.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
          });
        }

        // Draw smooth bezier path through points
        ctx.beginPath();
        ctx.moveTo(
          (points[BLOB_POINTS - 1].x + points[0].x) / 2,
          (points[BLOB_POINTS - 1].y + points[0].y) / 2,
        );
        for (let i = 0; i < BLOB_POINTS; i++) {
          const next = points[(i + 1) % BLOB_POINTS];
          const mx = (points[i].x + next.x) / 2;
          const my = (points[i].y + next.y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, mx, my);
        }
        ctx.closePath();

        if (layer.fill) {
          // Main blob: rich radial gradient
          const grad = ctx.createRadialGradient(
            cx - baseR * 0.15, cy - baseR * 0.15, baseR * 0.1,
            cx, cy, baseR * layer.scale * 1.3,
          );
          const bright = Math.min(col.r + 60, 255);
          const brightG = Math.min(col.g + 40, 255);
          const brightB = Math.min(col.b + 30, 255);

          grad.addColorStop(0, `rgba(${bright}, ${brightG}, ${brightB}, ${0.15 + energy * 0.25 + beat * 0.1})`);
          grad.addColorStop(0.35, `rgba(${col.r}, ${col.g}, ${col.b}, ${0.2 + energy * 0.35})`);
          grad.addColorStop(0.7, `rgba(${col.r * 0.7 | 0}, ${col.g * 0.5 | 0}, ${col.b * 0.4 | 0}, ${0.12 + energy * 0.2})`);
          grad.addColorStop(1, `rgba(${col.r * 0.3 | 0}, ${col.g * 0.2 | 0}, ${col.b * 0.15 | 0}, ${0.05 + energy * 0.08})`);
          ctx.fillStyle = grad;
          ctx.fill();

          // Inner glow edge
          ctx.strokeStyle = `rgba(${bright}, ${brightG}, ${brightB}, ${0.08 + energy * 0.15 + beat * 0.08})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else {
          ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${layer.alpha * (0.5 + energy)})`;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }

      // === Core luminance ===
      const coreR = baseR * (0.18 + energy * 0.12 + beat * 0.06);
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0, `rgba(255, 255, 255, ${0.06 + energy * 0.12 + beat * 0.08})`);
      core.addColorStop(0.3, `rgba(${Math.min(col.r + 80, 255)}, ${Math.min(col.g + 60, 255)}, ${Math.min(col.b + 40, 255)}, ${0.04 + energy * 0.1})`);
      core.addColorStop(0.7, `rgba(${col.r}, ${col.g}, ${col.b}, ${0.02 + energy * 0.04})`);
      core.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // === Particles ===
      const particles = particlesRef.current;

      if (playing && particles.length < MAX_PARTICLES && Math.random() > 0.5) {
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist = baseR * (0.8 + Math.random() * 0.3);
        particles.push({
          x: cx + Math.cos(spawnAngle) * spawnDist,
          y: cy + Math.sin(spawnAngle) * spawnDist,
          vx: Math.cos(spawnAngle) * (0.3 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5,
          vy: Math.sin(spawnAngle) * (0.3 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5,
          size: 0.5 + Math.random() * 2.5,
          life: 0,
          maxLife: 80 + Math.random() * 120,
          hue: Math.random(),
        });
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx * (playing ? 1 : 0.2);
        p.y += p.vy * (playing ? 1 : 0.2);
        // Slight orbit drift
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
          p.x += (-dy / dist) * 0.15;
          p.y += (dx / dist) * 0.15;
        }

        const lifeRatio = p.life / p.maxLife;
        const fadeIn = Math.min(lifeRatio * 5, 1);
        const fadeOut = Math.max(1 - lifeRatio, 0);
        const alpha = 0.6 * fadeIn * fadeOut * (playing ? 1 : 0.2);

        if (p.life >= p.maxLife || alpha < 0.005) {
          particles.splice(i, 1);
          continue;
        }

        // Lerp particle color from station color to white
        const pr = Math.min(col.r + p.hue * 80, 255) | 0;
        const pg = Math.min(col.g + p.hue * 60, 255) | 0;
        const pb = Math.min(col.b + p.hue * 40, 255) | 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + energy * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${pr}, ${pg}, ${pb}, ${alpha})`;
        ctx.fill();

        // Connect nearby particles with faint lines
        for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
          const q = particles[j];
          const ddx = p.x - q.x;
          const ddy = p.y - q.y;
          const d = ddx * ddx + ddy * ddy;
          const threshold = 3600; // 60px
          if (d < threshold) {
            const lineAlpha = alpha * 0.2 * (1 - d / threshold);
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${lineAlpha})`;
            ctx.lineWidth = 0.4;
            ctx.stroke();
          }
        }
      }

      // === Orbit arcs (subtle, rotating) ===
      for (let ring = 1; ring <= 3; ring++) {
        const ringR = baseR * (1.35 + ring * 0.22);
        const ringAlpha = (0.012 + energy * 0.018) / ring;
        const arcLen = Math.PI * (0.3 + energy * 0.4);
        const offset = t * (0.3 / ring) * (ring % 2 === 0 ? -1 : 1);

        ctx.beginPath();
        ctx.arc(cx, cy, ringR, offset, offset + arcLen);
        ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${ringAlpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Opposite arc
        ctx.beginPath();
        ctx.arc(cx, cy, ringR, offset + Math.PI, offset + Math.PI + arcLen * 0.6);
        ctx.strokeStyle = `rgba(${col.r}, ${col.g}, ${col.b}, ${ringAlpha * 0.6})`;
        ctx.stroke();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    frameRef.current = requestAnimationFrame(draw);

    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [hexToRgb]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}
