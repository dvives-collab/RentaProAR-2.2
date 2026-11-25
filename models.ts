export type UserRole = 'ADMIN' | 'LOCATARIO' | 'INQUILINO';
export type IndexType = 'IPC' | 'ICL';
export type FrequencyMonths = 1 | 2 | 3 | 6;
export type SplitMode = 'IGUAL' | 'PORCENTAJE' | 'UNICO';
export type ThemeColorId = 'ESMERALDA_SLATE' | 'OCEANO_AZUL' | 'VIOLETA_MODERNO' | 'TERRACOTA_ARENA';

export interface UserAccount {
  id: string;
  username: string;
  passwordHash: string;
  pinHash: string;
  biometricCredentialId?: string;
  role: UserRole;
  fullName: string;
  viviendaId?: string;
  active: boolean;
}

export interface GaranteInfo {
  slot: 1 | 2 | 3;
  fullName: string;
  relationship: string;
  address: string;
  phone: string;
  dni: string;
  photoPreviewUrl?: string;
  photoFileName?: string;
  loaded: boolean;
}

export interface Vivienda {
  id: string;
  unitName: string;
  address: string;
  initialAmount: number;
  indexType: IndexType;
  frequencyMonths: FrequencyMonths;
  startDate: string;
  endDate: string;
  maxTenantSlots: number;
  divisibleTaxTypes: string[];
}

export interface ClientProfile {
  id: string;
  fullName: string;
  dni: string;
  whatsapp: string;
  email: string;
  viviendaId: string;
  familyCount: number;
  familyNames: string;
  garantes: [GaranteInfo, GaranteInfo, GaranteInfo];
  notes: string;
}

export interface TaxDocument {
  id: string;
  period: string;
  year: string;
  serviceName: string;
  totalAmount: number;
  splitMode: SplitMode;
  viviendaId: string;
  assignedViviendaIds: string[];
  customPercentages?: Record<string, number>;
  fileName: string;
  localPreviewUrl?: string;
  drivePreviewUrl?: string;
  driveFolderPath: string;
}

export interface PaymentRecord {
  id: string;
  period: string;
  viviendaId: string;
  tenantName: string;
  baseRent: number;
  taxesAmount: number;
  lateFeeAmount: number;
  totalAmount: number;
  status: 'PENDIENTE' | 'EN_REVISION' | 'CONFIRMADO';
  receiptFileName?: string;
  receiptPreviewUrl?: string;
  submittedAt?: string;
  confirmedAt?: string;
}

export interface EconomicIndex {
  period: string;
  ipcMonthlyPct: number;
  iclValue: number;
}

export interface MoraSettings {
  maxDueDay: number;
  dailyInterestPct: number;
  useRealSystemDate: boolean;
  simulatedCurrentDay: number;
  ownerCbu: string;
  ownerAlias: string;
}

export interface VisualizationPrefs {
  theme: ThemeColorId;
  showBarChart: boolean;
  showPieChart: boolean;
  showGanttChart: boolean;
  showIndicesCard: boolean;
  showPaymentHistory: boolean;
  showNextInstallments: boolean;
  showPaymentCalendar: boolean;
  showOwnerCbu: boolean;
}
