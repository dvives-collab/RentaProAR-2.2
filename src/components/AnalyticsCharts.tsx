import React from 'react';
import { Vivienda } from '../types/models';

interface Props {
  showBar: boolean;
  showPie: boolean;
  showGantt: boolean;
  barData: { label: string; rent: number; taxes: number; mora: number }[];
  pieData: { label: string; value: number; color: string }[];
  viviendas: Vivienda[];
}

export const AnalyticsCharts: React.FC<Props> = ({ showBar, showPie, showGantt, barData, pieData, viviendas }) => {
  if (!showBar && !showPie && !showGantt) return null;
  const maxBar = Math.max(1, ...barData.map((d) => d.rent + d.taxes + d.mora));
  const totalPie = Math.max(1, pieData.reduce((acc, p) => acc + p.value, 0));
  let cum = 0;
  const slices = pieData.map((s) => {
    const pct = (s.value / totalPie) * 100;
    const start = cum;
    cum += pct;
    return { ...s, pct, start };
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {showBar && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Gráfica de Barras</h4>
          <div className="space-y-3">
            {barData.map((d, i) => {
              const total = d.rent + d.taxes + d.mora;
              const pct = Math.min(100, Math.round((total / maxBar) * 100));
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span>{d.label}</span>
                    <span>${total.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
                    <div style={{ width: `${(d.rent / Math.max(1, total)) * pct}%` }} className="bg-emerald-500 h-full" />
                    <div style={{ width: `${(d.taxes / Math.max(1, total)) * pct}%` }} className="bg-sky-500 h-full" />
                    {d.mora > 0 && <div style={{ width: `${(d.mora / Math.max(1, total)) * pct}%` }} className="bg-rose-500 h-full" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {showPie && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Gráfica de Torta</h4>
          <div className="flex items-center gap-4">
            <svg viewBox="0 0 36 36" className="w-24 h-24 shrink-0 -rotate-90">
              {slices.map((s, i) => (
                <circle key={i} cx="18" cy="18" r="15.915" fill="transparent" stroke={s.color} strokeWidth="4.5" strokeDasharray={`${s.pct} ${100 - s.pct}`} strokeDashoffset={-s.start} />
              ))}
            </svg>
            <div className="space-y-1 text-xs flex-1">
              {slices.map((s, i) => (
                <div key={i} className="flex justify-between">
                  <span className="truncate">{s.label}</span>
                  <strong>{Math.round(s.pct)}%</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {showGantt && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Diagrama de Gantt</h4>
          <div className="space-y-2.5">
            {viviendas.map((v) => (
              <div key={v.id} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <strong>{v.unitName}</strong>
                  <span className="text-slate-400 font-mono text-[11px]">{v.startDate} → {v.endDate}</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="w-2/3 h-full bg-indigo-500 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
