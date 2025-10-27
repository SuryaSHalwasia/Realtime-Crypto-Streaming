"use client";
export default function Sparkline({ data, up, down }: { data: number[]; up: boolean; down: boolean }) {
  const w = 160, h = 44, pad = 4;
  if (!data?.length) return <div className="h-11 w-full rounded bg-gray-100" />;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || Math.max(1, max || 1);
  const toX = (i: number) => pad + (i * (w - pad * 2)) / Math.max(1, data.length - 1);
  const toY = (v: number) => pad + (h - pad * 2) * (1 - (v - min) / span);
  const d = data.map((v, i) => `${i ? "L" : "M"}${toX(i)},${toY(v)}`).join(" ");
  const stroke = up ? "#16a34a" : down ? "#dc2626" : "#9ca3af";
  const id = `grad-${Math.random().toString(36).slice(2)}`;
  const areaPath = `${d} L${toX(data.length - 1)},${h - pad} L${toX(0)},${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-11">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" />
    </svg>
  );
}
