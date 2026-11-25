import { Vivienda, EconomicIndex, TaxDocument } from '../types/models';

export interface RentStepBreakdown {
  label: string;
  variationPct: number;
  amount: number;
}

export interface RentCalculationResult {
  currentRent: number;
  nextMonthRent: number;
  breakdown: RentStepBreakdown[];
}

function enumeratePeriods(startDateStr: string, targetPeriod: string): string[] {
  const [sy, sm] = startDateStr.split('-').map(Number);
  const [ty, tm] = targetPeriod.split('-').map(Number);
  if (!sy || !sm || !ty || !tm) return [targetPeriod];
  const list: string[] = [];
  let y = sy;
  let m = sm;
  let guard = 0;
  while ((y < ty || (y === ty && m <= tm)) && guard < 120) {
    list.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    guard++;
  }
  return list.length ? list : [targetPeriod];
}

export function calculateDynamicContractRent(
  vivienda: Vivienda,
  targetPeriod: string,
  indices: EconomicIndex[]
): RentCalculationResult {
  const periods = enumeratePeriods(vivienda.startDate, targetPeriod);
  const elapsedMonths = Math.max(0, periods.length - 1);
  const completedCycles = Math.floor(elapsedMonths / Math.max(1, vivienda.frequencyMonths));

  let rent = vivienda.initialAmount;
  const breakdown: RentStepBreakdown[] = [
    { label: `Inicio contrato (${vivienda.startDate.slice(0, 7)})`, variationPct: 0, amount: rent }
  ];

  const fallbackIpc = indices[indices.length - 1]?.ipcMonthlyPct ?? 2.0;
  const fallbackIcl = indices[indices.length - 1]?.iclValue ?? 26.94;

  for (let c = 1; c <= completedCycles; c++) {
    const startIdx = (c - 1) * vivienda.frequencyMonths;
    const endIdx = c * vivienda.frequencyMonths;
    const slicePeriods = periods.slice(startIdx, endIdx);

    if (vivienda.indexType === 'IPC') {
      let factor = 1;
      slicePeriods.forEach((p) => {
        const found = indices.find((i) => i.period === p);
        const pct = found ? found.ipcMonthlyPct : fallbackIpc;
        factor *= 1 + pct / 100;
      });
      rent = Math.round(rent * factor);
      breakdown.push({
        label: `Ajuste IPC #${c} (${periods[endIdx] || targetPeriod})`,
        variationPct: Number(((factor - 1) * 100).toFixed(2)),
        amount: rent
      });
    } else {
      const pStart = periods[startIdx];
      const pEnd = periods[endIdx] || targetPeriod;
      const iclStart = indices.find((i) => i.period === pStart)?.iclValue ?? fallbackIcl;
      const iclEnd = indices.find((i) => i.period === pEnd)?.iclValue ?? fallbackIcl;
      const factor = iclStart > 0 ? iclEnd / iclStart : 1;
      rent = Math.round(rent * factor);
      breakdown.push({
        label: `Ajuste ICL #${c} (${pEnd})`,
        variationPct: Number(((factor - 1) * 100).toFixed(2)),
        amount: rent
      });
    }
  }

  const nextElapsed = elapsedMonths + 1;
  const adjustsNextMonth = nextElapsed > 0 && nextElapsed % Math.max(1, vivienda.frequencyMonths) === 0;
  const nextMonthRent = adjustsNextMonth
    ? Math.round(rent * Math.pow(1 + fallbackIpc / 100, vivienda.frequencyMonths))
    : rent;

  return { currentRent: rent, nextMonthRent, breakdown };
}

/**
 * Prorratea un impuesto sin pérdida de redondeo ($1) entre viviendas asignadas.
 */
export function getProratedTaxShare(tax: TaxDocument, viviendaId: string): number {
  const targets = tax.assignedViviendaIds.length ? tax.assignedViviendaIds : [tax.viviendaId];
  if (!targets.includes(viviendaId)) return 0;

  if (tax.splitMode === 'UNICO') {
    return targets[0] === viviendaId ? tax.totalAmount : 0;
  }

  if (tax.splitMode === 'PORCENTAJE' && tax.customPercentages) {
    const rawPct = tax.customPercentages[viviendaId];
    if (typeof rawPct === 'number' && !Number.isNaN(rawPct)) {
      return Math.round((tax.totalAmount * rawPct) / 100);
    }
  }

  const baseShare = Math.floor(tax.totalAmount / targets.length);
  const remainder = tax.totalAmount - baseShare * targets.length;
  const idx = targets.indexOf(viviendaId);
  return baseShare + (idx === targets.length - 1 ? remainder : 0);
}
