import { useEffect, useRef } from 'react';
import type { Sample } from '../lib/telemetry';

interface Props {
  history: Sample[];
  target: number;
  max: number;
  windowSeconds: number;
}

export function TrendChart({ history, target, max, windowSeconds }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padLeft = 8;
    const padRight = 46;
    const padTop = 10;
    const padBottom = 18;
    const plotWidth = Math.max(10, width - padLeft - padRight);
    const plotHeight = Math.max(10, height - padTop - padBottom);
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const start = now - windowMs;

    const points = history.filter((p) => p.t >= start);
    const peak = points.reduce((acc, p) => Math.max(acc, p.v), 0);
    const yMax = Math.max(max * 1.15, peak * 1.1, 10);

    const xFor = (t: number) => padLeft + ((t - start) / windowMs) * plotWidth;
    const yFor = (v: number) => padTop + plotHeight - (v / yMax) * plotHeight;

    // horizontal grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = padTop + (plotHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotWidth, y);
      ctx.stroke();
    }

    const drawLimit = (value: number, color: string, label: string) => {
      if (value > yMax) return;
      const y = yFor(value);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotWidth, y);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = color;
      ctx.font = '500 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(label, padLeft + plotWidth + 8, y + 3);
    };

    drawLimit(target, 'rgba(246, 167, 35, 0.75)', 'TGT');
    drawLimit(max, 'rgba(255, 75, 100, 0.8)', 'MAX');

    if (points.length > 1) {
      const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotHeight);
      gradient.addColorStop(0, 'rgba(246, 167, 35, 0.35)');
      gradient.addColorStop(1, 'rgba(246, 167, 35, 0.01)');

      ctx.beginPath();
      points.forEach((point, index) => {
        const x = xFor(point.t);
        const y = yFor(point.v);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      const lastX = xFor(points[points.length - 1].t);
      const firstX = xFor(points[0].t);
      ctx.lineTo(lastX, padTop + plotHeight);
      ctx.lineTo(firstX, padTop + plotHeight);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.beginPath();
      points.forEach((point, index) => {
        const x = xFor(point.t);
        const y = yFor(point.v);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#f6a723';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();

      const last = points[points.length - 1];
      ctx.beginPath();
      ctx.arc(xFor(last.t), yFor(last.v), 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd18a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(xFor(last.t), yFor(last.v), 6.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(246, 167, 35, 0.18)';
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(139, 156, 176, 0.75)';
    ctx.font = '500 9.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`-${Math.round(windowSeconds / 60)}m`, padLeft, height - 4);
    ctx.textAlign = 'right';
    ctx.fillText('now', padLeft + plotWidth, height - 4);
  }, [history, target, max, windowSeconds]);

  return (
    <div className="trend" ref={hostRef}>
      <canvas ref={canvasRef} />
      {history.length < 2 && <span className="trend__empty">Trend appears once telemetry arrives</span>}
    </div>
  );
}
