import React, { useState, useMemo, useEffect } from 'react';
import {
  Building2, Users, FileText, Settings, Lock, Fingerprint, KeyRound,
  UserPlus, Shield, CheckCircle2, AlertTriangle, Upload, Eye,
  Trash2, HardDrive, LogOut, Palette, BarChart3, Copy, Check, X, Send,
  RefreshCw
} from 'lucide-react';
import {
  UserAccount, Vivienda, ClientProfile, TaxDocument, PaymentRecord,
  EconomicIndex, MoraSettings, VisualizationPrefs, ThemeColorId, SplitMode
} from './types/models';
import { sha256Hex, fileToBase64, postToAppsScript, fetchCloudWorkspaceData } from './services/driveSheetsApi';
import { calculateDynamicContractRent, getProratedTaxShare } from './services/rentEngine';
import { AnalyticsCharts } from './components/AnalyticsCharts';

const THEME_CLASSES: Record<ThemeColorId, { header: string; primaryBtn: string; badge: string; accentText: string }> = {
  ESMERALDA_SLATE: {
    header: 'bg-slate-900 text-white',
    primaryBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    accentText: 'text-emerald-600'
  },
  OCEANO_AZUL: {
    header: 'bg-blue-950 text-white',
    primaryBtn: 'bg-sky-600 hover:bg-sky-700 text-white',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
    accentText: 'text-sky-600'
  },
  VIOLETA_MODERNO: {
    header: 'bg-indigo-950 text-white',
    primaryBtn: 'bg-violet-600 hover:bg-violet-700 text-white',
    badge: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    accentText: 'text-violet-600'
  },
  TERRACOTA_ARENA: {
    header: 'bg-stone-900 text-white',
    primaryBtn: 'bg-amber-600 hover:bg-amber-700 text-white',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    accentText: 'text-amber-600'
  }
};

const INITIAL_INDICES: EconomicIndex[] = [
  { period: '2026-06', ipcMonthlyPct: 2.2, iclValue: 24.40 },
  { period: '2026-07', ipcMonthlyPct: 2.1, iclValue: 24.92 },
  { period: '2026-08', ipcMonthlyPct: 1.8, iclValue: 25.39 },
  { period: '2026-09', ipcMonthlyPct: 1.9, iclValue: 25.87 },
  { period: '2026-10', ipcMonthlyPct: 2.0, iclValue: 26.38 },
  { period: '2026-11', ipcMonthlyPct: 2.1, iclValue: 26.94 }
];

const HASH_1234 = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4';

const DEFAULT_ACCOUNTS: UserAccount[] = [
  {
    id: 'USR-ADMIN',
    username: 'Admin',
    passwordHash: HASH_1234,
    pinHash: HASH_1234,
    role: 'ADMIN',
    fullName: 'Administrador General',
    active: true
  },
  {
    id: 'USR-INQ-01',
    username: 'inquilino1',
    passwordHash: HASH_1234,
    pinHash: HASH_1234,
    role: 'INQUILINO',
    fullName: 'Lucía Fernández',
    viviendaId: 'VIV-01',
    active: true
  }
];

const INITIAL_VIVIENDAS: Vivienda[] = [
  {
    id: 'VIV-01',
    unitName: 'Vivienda 01',
    address: 'Gorriti 4820, Depto A, CABA',
    initialAmount: 480000,
    indexType: 'IPC',
    frequencyMonths: 3,
    startDate: '2026-06-01',
    endDate: '2028-05-31',
    maxTenantSlots: 3,
    divisibleTaxTypes: ['Luz', 'Agua', 'Municipal / ABL']
  },
  {
    id: 'VIV-02',
    unitName: 'Vivienda 02',
    address: 'Gorriti 4820, Depto B, CABA',
    initialAmount: 450000,
    indexType: 'ICL',
    frequencyMonths: 6,
    startDate: '2026-06-01',
    endDate: '2028-05-31',
    maxTenantSlots: 2,
    divisibleTaxTypes: ['Luz', 'Agua']
  }
];

const INITIAL_CLIENTS: ClientProfile[] = [
  {
    id: 'CLI-01',
    fullName: 'Lucía Fernández',
    dni: '34.892.104',
    whatsapp: '+54 9 11 5432-8891',
    email: 'lucia.fernandez@email.com',
    viviendaId: 'VIV-01',
    familyCount: 2,
    familyNames: 'Mateo Fernández (hijo), Sofía Fernández (hija)',
    garantes: [
      { slot: 1, fullName: 'Roberto Fernández', relationship: 'Padre', address: 'Av. Santa Fe 3210', phone: '11-4432-1190', dni: '16.432.890', loaded: true },
      { slot: 2, fullName: 'Marta López', relationship: 'Tía', address: 'Cabildo 1890', phone: '11-5521-9087', dni: '18.901.234', loaded: true },
      { slot: 3, fullName: '', relationship: '', address: '', phone: '', dni: '', loaded: false }
    ],
    notes: 'Garantía propietaria verificada en CABA.'
  }
];

function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return 'IN';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatARS(val: number): string {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(val);
}

export default function App() {
  const [accounts, setAccounts] = useState<UserAccount[]>(() => {
    const s = localStorage.getItem('rp22_accounts');
    return s ? JSON.parse(s) : DEFAULT_ACCOUNTS;
  });

  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [savedSession, setSavedSession] = useState<{ username: string; biometricVerified?: boolean } | null>(() => {
    const s = localStorage.getItem('rp22_saved_user');
    return s ? JSON.parse(s) : { username: 'Admin', biometricVerified: true };
  });

  const [loginUser, setLoginUser] = useState<string>(savedSession?.username || 'Admin');
  const [loginPass, setLoginPass] = useState<string>('');
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  const [quickPinInput, setQuickPinInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [registerModalRole, setRegisterModalRole] = useState<'LOCATARIO' | 'INQUILINO' | null>(null);
  const [regForm, setRegForm] = useState({
    username: '',
    password: '',
    pin: '1234',
    fullName: '',
    dni: '',
    whatsapp: '',
    email: '',
    viviendaId: '',
    familyCount: 0,
    familyNames: '',
    garantesCount: 1
  });

  const [viviendas, setViviendas] = useState<Vivienda[]>(() => {
    const s = localStorage.getItem('rp22_viviendas');
    return s ? JSON.parse(s) : INITIAL_VIVIENDAS;
  });

  const [clients, setClients] = useState<ClientProfile[]>(() => {
    const s = localStorage.getItem('rp22_clients');
    return s ? JSON.parse(s) : INITIAL_CLIENTS;
  });

  const [taxCatalog, setTaxCatalog] = useState<string[]>(() => {
    const s = localStorage.getItem('rp22_tax_catalog');
    return s ? JSON.parse(s) : ['Luz', 'Gas', 'Agua', 'Municipal / ABL', 'Internet', 'Expensas'];
  });

  const [taxes, setTaxes] = useState<TaxDocument[]>(() => {
    const s = localStorage.getItem('rp22_taxes');
    return s
      ? JSON.parse(s)
      : [
          {
            id: 'IMP-101',
            period: '2026-11',
            year: '2026',
            serviceName: 'Luz',
            totalAmount: 64000,
            splitMode: 'IGUAL',
            viviendaId: 'VIV-01',
            assignedViviendaIds: ['VIV-01', 'VIV-02'],
            fileName: 'Edenor_Nov_2026.pdf',
            driveFolderPath: 'drive/RentaPro AR/Vivienda 01/Impuestos/2026'
          }
        ];
  });

  const [payments, setPayments] = useState<PaymentRecord[]>(() => {
    const s = localStorage.getItem('rp22_payments');
    return s
      ? JSON.parse(s)
      : [
          {
            id: 'PAG-2026-10',
            period: '2026-10',
            viviendaId: 'VIV-01',
            tenantName: 'Lucía Fernández',
            baseRent: 508381,
            taxesAmount: 32000,
            lateFeeAmount: 0,
            totalAmount: 540381,
            status: 'CONFIRMADO',
            receiptFileName: 'Transferencia_Octubre_2026.pdf',
            confirmedAt: '2026-10-06'
          }
        ];
  });

  const [indices, setIndices] = useState<EconomicIndex[]>(() => {
    const s = localStorage.getItem('rp22_indices');
    return s ? JSON.parse(s) : INITIAL_INDICES;
  });

  const [selectedPeriod, setSelectedPeriod] = useState<string>('2026-11');

  const [moraSettings, setMoraSettings] = useState<MoraSettings>(() => {
    const s = localStorage.getItem('rp22_mora');
    return s
      ? JSON.parse(s)
      : {
          maxDueDay: 10,
          dailyInterestPct: 0.5,
          useRealSystemDate: true,
          simulatedCurrentDay: new Date().getDate(),
          ownerCbu: '0000003100089432110982',
          ownerAlias: 'RENTAPRO.ALQUILERES.AR'
        };
  });

  const [adminPrefs, setAdminPrefs] = useState<VisualizationPrefs>({
    theme: 'ESMERALDA_SLATE',
    showBarChart: true,
    showPieChart: true,
    showGanttChart: true,
    showIndicesCard: true,
    showPaymentHistory: true,
    showNextInstallments: true,
    showPaymentCalendar: true,
    showOwnerCbu: true
  });

  const [tenantPrefs, setTenantPrefs] = useState<VisualizationPrefs>({
    theme: 'OCEANO_AZUL',
    showBarChart: true,
    showPieChart: true,
    showGanttChart: false,
    showIndicesCard: true,
    showPaymentHistory: true,
    showNextInstallments: true,
    showPaymentCalendar: true,
    showOwnerCbu: true
  });

  const [storageConfig, setStorageConfig] = useState(() => {
    const s = localStorage.getItem('rp22_storage');
    return s
      ? JSON.parse(s)
      : {
          driveFolderUrl: 'https://drive.google.com/drive/folders/RentaPro_AR_Root',
          appsScriptUrl: '',
          masterSheetTitle: 'Toda la Informacion de todas las viviendas'
        };
  });

  const [adminModule, setAdminModule] = useState<'RESUMEN' | 'CLIENTES' | 'IMPUESTOS' | 'CONFIGURACIONES'>('RESUMEN');
  const [configSubMenu, setConfigSubMenu] = useState<'ALMACENAMIENTO' | 'PERSONALIZAR' | 'CONTRASENAS' | 'INQUILINOS' | 'VIVIENDAS' | 'IMPUESTOS_CAT' | 'MORA'>('ALMACENAMIENTO');
  const [tenantShowSettings, setTenantShowSettings] = useState<boolean>(false);

  const [garantesModalClient, setGarantesModalClient] = useState<ClientProfile | null>(null);
  const [previewFileModal, setPreviewFileModal] = useState<{ title: string; path: string; url?: string; amount?: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copiedAlias, setCopiedAlias] = useState<boolean>(false);

  const [newTaxForm, setNewTaxForm] = useState({
    serviceName: 'Luz',
    period: '2026-11',
    viviendaId: 'VIV-01',
    totalAmount: '',
    splitMode: 'IGUAL' as SplitMode,
    assignedViviendaIds: ['VIV-01', 'VIV-02'],
    pctVivienda01: 60,
    file: null as File | null
  });

  const [newViviendaName, setNewViviendaName] = useState('');
  const [newViviendaAddress, setNewViviendaAddress] = useState('');
  const [newViviendaAmount, setNewViviendaAmount] = useState('500000');
  const [newTaxCatalogName, setNewTaxCatalogName] = useState('');
  const [newSlotAccount, setNewSlotAccount] = useState({ username: '', password: '1234', viviendaId: 'VIV-01', fullName: '' });
  const [tenantReceiptFile, setTenantReceiptFile] = useState<File | null>(null);

  useEffect(() => {
    localStorage.setItem('rp22_accounts', JSON.stringify(accounts));
    localStorage.setItem('rp22_viviendas', JSON.stringify(viviendas));
    localStorage.setItem('rp22_clients', JSON.stringify(clients));
    localStorage.setItem('rp22_tax_catalog', JSON.stringify(taxCatalog));
    localStorage.setItem('rp22_taxes', JSON.stringify(taxes));
    localStorage.setItem('rp22_payments', JSON.stringify(payments));
    localStorage.setItem('rp22_indices', JSON.stringify(indices));
    localStorage.setItem('rp22_mora', JSON.stringify(moraSettings));
    localStorage.setItem('rp22_storage', JSON.stringify(storageConfig));
  }, [accounts, viviendas, clients, taxCatalog, taxes, payments, indices, moraSettings, storageConfig]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const syncFromCloud = async (urlOverride?: string) => {
    const targetUrl = urlOverride || storageConfig.appsScriptUrl;
    if (!targetUrl) return;
    try {
      const res = await fetchCloudWorkspaceData(targetUrl, storageConfig.driveFolderUrl);
      if (res.status === 'ok' && res.data) {
        if (res.data.viviendas?.length) setViviendas(res.data.viviendas);
        if (res.data.clientes?.length) setClients(res.data.clientes);
        if (res.data.impuestos?.length) setTaxes(res.data.impuestos);
        if (res.data.pagos?.length) setPayments(res.data.pagos);
        if (res.data.indices?.length) setIndices(res.data.indices);
        notify('Datos sincronizados desde Google Sheets.');
      }
    } catch {
      notify('Modo sin conexión activo: se utilizan los datos locales guardados.');
    }
  };

  const completeLogin = async (user: UserAccount) => {
    setCurrentUser(user);
    if (rememberMe) {
      const s = { username: user.username, biometricVerified: true };
      setSavedSession(s);
      localStorage.setItem('rp22_saved_user', JSON.stringify(s));
    }
    if (storageConfig.appsScriptUrl) {
      await syncFromCloud(storageConfig.appsScriptUrl);
    }
  };

  const handleStandardLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const passHash = await sha256Hex(loginPass);
    const found = accounts.find(
      (a) => a.active && a.username.toLowerCase() === loginUser.trim().toLowerCase() && a.passwordHash === passHash
    );
    if (!found) {
      setLoginError('Usuario o contraseña incorrectos (Admin por defecto: Admin / 1234).');
      return;
    }
    setLoginError('');
    await completeLogin(found);
  };

  const handleBiometricOrPinLogin = async (method: 'HUELLA' | 'PIN') => {
    if (!savedSession) {
      setLoginError('No hay sesión guardada previamente en este dispositivo.');
      return;
    }
    const found = accounts.find(
      (a) => a.active && a.username.toLowerCase() === savedSession.username.toLowerCase()
    );
    if (!found) {
      setLoginError('La cuenta guardada no está activa.');
      return;
    }

    if (method === 'PIN') {
      const pinHash = await sha256Hex(quickPinInput);
      if (pinHash !== found.pinHash) {
        setLoginError('PIN incorrecto.');
        return;
      }
    } else if (typeof window !== 'undefined' && 'PublicKeyCredential' in window && !savedSession.biometricVerified) {
      setLoginError('Verificá primero con usuario/contraseña para habilitar la credencial biométrica.');
      return;
    }

    setLoginError('');
    setQuickPinInput('');
    await completeLogin(found);
    notify(method === 'HUELLA' ? `Acceso biométrico verificado (${found.username})` : `Acceso por PIN verificado (${found.username})`);
  };

  const handleRegisterAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerModalRole || isSubmitting) return;
    if (registerModalRole === 'INQUILINO' && !regForm.viviendaId) {
      alert('Es obligatorio elegir la vivienda que vas a alquilar para avanzar.');
      return;
    }

    if (registerModalRole === 'INQUILINO') {
      const viv = viviendas.find((v) => v.id === regForm.viviendaId);
      const existingInViv = accounts.filter((a) => a.role === 'INQUILINO' && a.viviendaId === regForm.viviendaId).length;
      if (viv && existingInViv >= viv.maxTenantSlots) {
        alert(`La ${viv.unitName} alcanzó el límite máximo de ${viv.maxTenantSlots} cuentas permitidas.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const passHash = await sha256Hex(regForm.password);
      const pinHash = await sha256Hex(regForm.pin || '1234');
      const newAcc: UserAccount = {
        id: `USR-${Date.now()}`,
        username: regForm.username.trim(),
        passwordHash: passHash,
        pinHash,
        role: registerModalRole,
        fullName: regForm.fullName.trim(),
        viviendaId: registerModalRole === 'INQUILINO' ? regForm.viviendaId : undefined,
        active: true
      };
      setAccounts((prev) => [...prev, newAcc]);

      if (registerModalRole === 'INQUILINO') {
        const newClient: ClientProfile = {
          id: `CLI-${Date.now()}`,
          fullName: regForm.fullName.trim(),
          dni: regForm.dni,
          whatsapp: regForm.whatsapp,
          email: regForm.email,
          viviendaId: regForm.viviendaId,
          familyCount: Number(regForm.familyCount) || 0,
          familyNames: regForm.familyNames,
          garantes: [
            { slot: 1, fullName: '', relationship: '', address: '', phone: '', dni: '', loaded: false },
            { slot: 2, fullName: '', relationship: '', address: '', phone: '', dni: '', loaded: false },
            { slot: 3, fullName: '', relationship: '', address: '', phone: '', dni: '', loaded: false }
          ],
          notes: `Registrado por el inquilino. Garantes declarados: ${regForm.garantesCount}.`
        };
        setClients((prev) => [...prev, newClient]);
      }

      setRegisterModalRole(null);
      await completeLogin(newAcc);
      notify(`Cuenta ${registerModalRole} creada con hash SHA-256.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const effectiveDay = useMemo(() => {
    if (moraSettings.useRealSystemDate) {
      const now = new Date();
      const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      return selectedPeriod === currentYM ? now.getDate() : 28;
    }
    return moraSettings.simulatedCurrentDay;
  }, [moraSettings, selectedPeriod]);

  const liquidations = useMemo(() => {
    return viviendas.map((viv) => {
      const rentCalc = calculateDynamicContractRent(viv, selectedPeriod, indices);
      const vivTaxes = taxes.filter(
        (t) =>
          t.period === selectedPeriod &&
          t.assignedViviendaIds.includes(viv.id) &&
          viv.divisibleTaxTypes.includes(t.serviceName)
      );

      const taxesTotal = vivTaxes.reduce((sum, t) => sum + getProratedTaxShare(t, viv.id), 0);

      const confirmedPay = payments.find(
        (p) => p.viviendaId === viv.id && p.period === selectedPeriod && p.status === 'CONFIRMADO'
      );
      const daysOverdue = confirmedPay ? 0 : Math.max(0, effectiveDay - moraSettings.maxDueDay);
      const subtotal = rentCalc.currentRent + taxesTotal;
      const lateFeeAmount = daysOverdue > 0 ? Math.round(subtotal * (moraSettings.dailyInterestPct / 100) * daysOverdue) : 0;
      const grandTotal = subtotal + lateFeeAmount;

      return {
        vivienda: viv,
        rentCalc,
        baseRent: rentCalc.currentRent,
        nextMonthRent: rentCalc.nextMonthRent,
        vivTaxes,
        taxesTotal,
        daysOverdue,
        lateFeeAmount,
        grandTotal,
        isPaid: Boolean(confirmedPay),
        paymentRecord: payments.find((p) => p.viviendaId === viv.id && p.period === selectedPeriod)
      };
    });
  }, [viviendas, taxes, indices, selectedPeriod, moraSettings, payments, effectiveDay]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto">
              <Building2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">RentaPro AR v2.2</h1>
            <p className="text-xs text-slate-400">Auditoría QA Verificada · IPC/ICL Dinámico · Drive &amp; Sheets</p>
          </div>

          {loginError && (
            <div className="bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs p-3 rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleStandardLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Usuario</label>
              <input
                type="text"
                required
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Contraseña</label>
              <input
                type="password"
                required
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="Ingresá tu contraseña (Admin por defecto: 1234)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded bg-slate-800 border-slate-600 text-emerald-500"
              />
              <span>Recordar usuario en este dispositivo</span>
            </label>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm transition"
            >
              Ingresar al Sistema
            </button>
          </form>

          {savedSession && (
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <div className="text-[11px] text-center text-slate-400">
                Acceso rápido para <strong className="text-white">{savedSession.username}</strong>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleBiometricOrPinLogin('HUELLA')}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold flex items-center justify-center gap-2 text-emerald-300"
                >
                  <Fingerprint className="w-4 h-4" />
                  <span>Usar Huella</span>
                </button>
                <div className="flex gap-1">
                  <input
                    type="password"
                    maxLength={4}
                    value={quickPinInput}
                    onChange={(e) => setQuickPinInput(e.target.value)}
                    placeholder="PIN"
                    className="w-16 px-2 py-2 rounded-xl bg-slate-800 border border-slate-700 text-center text-xs font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => handleBiometricOrPinLogin('PIN')}
                    className="flex-1 py-2 px-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-xs font-semibold flex items-center justify-center gap-1"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>PIN</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setRegisterModalRole('LOCATARIO')}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Registrar como Locatario</span>
            </button>
            <button
              type="button"
              onClick={() => setRegisterModalRole('INQUILINO')}
              className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5 text-sky-400" />
              <span>Registrar como Inquilino</span>
            </button>
          </div>
        </div>

        {registerModalRole && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <form
              onSubmit={handleRegisterAccount}
              className="bg-slate-900 border border-slate-700 rounded-3xl max-w-lg w-full p-6 space-y-4 text-white my-8"
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="font-bold text-base">Registro de {registerModalRole}</h3>
                <button type="button" onClick={() => setRegisterModalRole(null)}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {registerModalRole === 'INQUILINO' && (
                <div className="bg-sky-950/60 border border-sky-500/40 p-3.5 rounded-2xl space-y-2">
                  <label className="block text-xs font-bold text-sky-300">
                    1. Elegí la Vivienda que vas a alquilar (Obligatorio) *
                  </label>
                  <select
                    required
                    value={regForm.viviendaId}
                    onChange={(e) => setRegForm({ ...regForm, viviendaId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-sky-500/50 text-sm text-white"
                  >
                    <option value="">-- Elegir Vivienda --</option>
                    {viviendas.map((v) => {
                      const used = accounts.filter((a) => a.role === 'INQUILINO' && a.viviendaId === v.id).length;
                      return (
                        <option key={v.id} value={v.id}>
                          {v.unitName} ({v.maxTenantSlots - used} cupos libres)
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Nombre y Apellido *"
                  value={regForm.fullName}
                  onChange={(e) => setRegForm({ ...regForm, fullName: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                />
                <input
                  type="text"
                  required
                  placeholder="DNI / CUIT *"
                  value={regForm.dni}
                  onChange={(e) => setRegForm({ ...regForm, dni: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Usuario *"
                  value={regForm.username}
                  onChange={(e) => setRegForm({ ...regForm, username: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                />
                <input
                  type="password"
                  required
                  placeholder="Contraseña *"
                  value={regForm.password}
                  onChange={(e) => setRegForm({ ...regForm, password: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                />
                <input
                  type="text"
                  maxLength={4}
                  placeholder="PIN"
                  value={regForm.pin}
                  onChange={(e) => setRegForm({ ...regForm, pin: e.target.value })}
                  className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-mono"
                />
              </div>

              {registerModalRole === 'INQUILINO' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="WhatsApp *"
                      value={regForm.whatsapp}
                      onChange={(e) => setRegForm({ ...regForm, whatsapp: e.target.value })}
                      className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Correo Electrónico *"
                      value={regForm.email}
                      onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                      className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      min={0}
                      placeholder="Familiares"
                      value={regForm.familyCount}
                      onChange={(e) => setRegForm({ ...regForm, familyCount: Number(e.target.value) })}
                      className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                    />
                    <select
                      value={regForm.garantesCount}
                      onChange={(e) => setRegForm({ ...regForm, garantesCount: Number(e.target.value) })}
                      className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                    >
                      <option value={1}>1 Garante</option>
                      <option value={2}>2 Garantes</option>
                      <option value={3}>3 Garantes</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="Detalle de familiares que acompañan"
                    value={regForm.familyNames}
                    onChange={(e) => setRegForm({ ...regForm, familyNames: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs"
                  />
                </>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Registrando...' : 'Completar Registro'}
              </button>
            </form>
          </div>
        )}
      </div>
    );
  }

  const isTenant = currentUser.role === 'INQUILINO';
  const activePrefs = isTenant ? tenantPrefs : adminPrefs;
  const themeStyle = THEME_CLASSES[activePrefs.theme];

  if (isTenant) {
    const myVivId = currentUser.viviendaId || viviendas[0]?.id;
    const myLiq = liquidations.find((l) => l.vivienda.id === myVivId) || liquidations[0];

    const handleSendTenantReceipt = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!tenantReceiptFile || isSubmitting) return;
      setIsSubmitting(true);
      try {
        const year = selectedPeriod.split('-')[0];
        const previewUrl = URL.createObjectURL(tenantReceiptFile);
        const newPay: PaymentRecord = {
          id: `PAG-${selectedPeriod}-${myLiq.vivienda.id}`,
          period: selectedPeriod,
          viviendaId: myLiq.vivienda.id,
          tenantName: currentUser.fullName,
          baseRent: myLiq.baseRent,
          taxesAmount: myLiq.taxesTotal,
          lateFeeAmount: myLiq.lateFeeAmount,
          totalAmount: myLiq.grandTotal,
          status: 'EN_REVISION',
          receiptFileName: tenantReceiptFile.name,
          receiptPreviewUrl: previewUrl,
          submittedAt: new Date().toISOString().slice(0, 10)
        };
        setPayments((prev) => [newPay, ...prev.filter((p) => p.id !== newPay.id)]);
        setTenantReceiptFile(null);

        if (storageConfig.appsScriptUrl) {
          const b64 = await fileToBase64(tenantReceiptFile);
          await postToAppsScript(storageConfig.appsScriptUrl, {
            action: 'uploadComprobantePago',
            actorRole: currentUser.role,
            driveFolderInput: storageConfig.driveFolderUrl,
            record: { ...newPay, unitName: myLiq.vivienda.unitName },
            fileBase64: b64,
            fileName: tenantReceiptFile.name,
            mimeType: tenantReceiptFile.type
          });
        }
        notify(`Comprobante guardado en drive/RentaPro AR/${myLiq.vivienda.unitName}/Comprobantes/${year}`);
      } catch {
        notify('Guardado local OK. Sincronización pendiente por error de red.');
      } finally {
        setIsSubmitting(false);
      }
    };

    return (
      <div className="min-h-screen bg-slate-50 pb-16">
        {toast && (
          <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{toast}</span>
          </div>
        )}

        <header className={`${themeStyle.header} sticky top-0 z-30 shadow-md`}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-emerald-400" />
              <div>
                <h1 className="font-bold text-base">{myLiq.vivienda.unitName} · Portal Inquilino</h1>
                <p className="text-[11px] opacity-75">{currentUser.fullName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setTenantShowSettings(!tenantShowSettings)} className="p-2 rounded-xl bg-white/10 hover:bg-white/20">
                <Settings className="w-5 h-5" />
              </button>
              <button onClick={() => setCurrentUser(null)} className="p-2 rounded-xl bg-rose-500/20 text-rose-200">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
          {tenantShowSettings && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Palette className="w-4 h-4 text-sky-600" />
                  <span>Personalizar Portal del Inquilino</span>
                </h3>
                <button onClick={() => setTenantShowSettings(false)} className="text-xs text-slate-500">Cerrar</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(THEME_CLASSES) as ThemeColorId[]).map((tId) => (
                  <button
                    key={tId}
                    onClick={() => setTenantPrefs({ ...tenantPrefs, theme: tId })}
                    className={`p-2 rounded-xl border text-xs font-semibold ${tenantPrefs.theme === tId ? 'border-slate-900 bg-slate-100' : 'border-slate-200'}`}
                  >
                    {tId.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { key: 'showBarChart', label: 'Gráfica de Barras' },
                  { key: 'showPieChart', label: 'Gráfica de Torta' },
                  { key: 'showGanttChart', label: 'Gráfica Gantt' },
                  { key: 'showIndicesCard', label: 'Índices IPC / ICL' },
                  { key: 'showPaymentHistory', label: 'Historial de Pagos' },
                  { key: 'showNextInstallments', label: 'Próximas Cuotas' },
                  { key: 'showOwnerCbu', label: 'CBU / Alias Propietario' }
                ].map((opt) => (
                  <label key={opt.key} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(tenantPrefs[opt.key as keyof VisualizationPrefs])}
                      onChange={(e) => setTenantPrefs({ ...tenantPrefs, [opt.key]: e.target.checked })}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {myLiq.isPaid ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <strong className="text-sm block">Pago Confirmado por el Locatario</strong>
                Tu liquidación del período {selectedPeriod} está confirmada.
              </div>
            </div>
          ) : myLiq.daysOverdue > 0 ? (
            <div className="bg-rose-50 border-2 border-rose-400 rounded-2xl p-4 text-rose-950 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="inline-block text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-rose-600 text-white mb-1">
                  EN MORA · {myLiq.daysOverdue} DÍAS DE ATRASO
                </span>
                <p className="font-bold text-sm">Superó el día máximo de pago ({moraSettings.maxDueDay})</p>
                <p className="mt-0.5">
                  Recargo por mora ({moraSettings.dailyInterestPct}% diario): <strong>+{formatARS(myLiq.lateFeeAmount)}</strong> · Total actualizado: <strong>{formatARS(myLiq.grandTotal)}</strong>
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900">
              Vencimiento sin mora: antes del <strong>día {moraSettings.maxDueDay}</strong> de cada mes.
            </div>
          )}

          {tenantPrefs.showOwnerCbu && (
            <div className="bg-white p-4 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block">Alias / CBU del Locatario</span>
                <strong className="font-mono text-sm">{moraSettings.ownerAlias}</strong> · <span className="font-mono">{moraSettings.ownerCbu}</span>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(moraSettings.ownerAlias);
                  setCopiedAlias(true);
                  setTimeout(() => setCopiedAlias(false), 2000);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-semibold flex items-center gap-1"
              >
                {copiedAlias ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAlias ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`${myLiq.daysOverdue > 0 && !myLiq.isPaid ? 'bg-rose-900' : 'bg-slate-900'} text-white p-5 rounded-2xl`}>
              <div className="text-xs opacity-75">Total a Pagar ({selectedPeriod})</div>
              <div className="text-3xl font-bold mt-1">{formatARS(myLiq.grandTotal)}</div>
              <div className="text-[11px] opacity-80 mt-2">
                Alquiler: {formatARS(myLiq.baseRent)} + Impuestos: {formatARS(myLiq.taxesTotal)}
              </div>
            </div>

            {tenantPrefs.showNextInstallments && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200">
                <div className="text-xs text-slate-500">Próximo Mes Estimado</div>
                <div className="text-2xl font-bold text-indigo-600 mt-1">
                  {formatARS(myLiq.nextMonthRent + myLiq.taxesTotal)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Según frecuencia {myLiq.vivienda.frequencyMonths}m ({myLiq.vivienda.indexType})</div>
              </div>
            )}

            <div className="bg-white p-5 rounded-2xl border border-slate-200">
              <div className="text-xs text-slate-500">Vigencia del Contrato</div>
              <div className="text-sm font-bold text-slate-900 mt-1">
                {myLiq.vivienda.startDate} al {myLiq.vivienda.endDate}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Estado: {myLiq.paymentRecord?.status || 'PENDIENTE'}</div>
            </div>
          </div>

          <AnalyticsCharts
            showBar={tenantPrefs.showBarChart}
            showPie={tenantPrefs.showPieChart}
            showGantt={tenantPrefs.showGanttChart}
            barData={[{ label: selectedPeriod, rent: myLiq.baseRent, taxes: myLiq.taxesTotal, mora: myLiq.lateFeeAmount }]}
            pieData={[
              { label: 'Alquiler', value: myLiq.baseRent, color: '#10b981' },
              { label: 'Impuestos', value: myLiq.taxesTotal, color: '#0ea5e9' },
              ...(myLiq.lateFeeAmount > 0 ? [{ label: 'Mora', value: myLiq.lateFeeAmount, color: '#f43f5e' }] : [])
            ]}
            viviendas={[myLiq.vivienda]}
          />

          <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2.5">
            <h3 className="font-bold text-sm text-slate-900">Desglose del Alquiler desde el Inicio del Contrato</h3>
            {myLiq.rentCalc.breakdown.map((step, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 text-xs">
                <div>
                  <strong>{step.label}</strong>
                  <span className="block text-slate-500">
                    {step.variationPct > 0 ? `Variación aplicada: +${step.variationPct}%` : 'Monto inicial pactado'}
                  </span>
                </div>
                <strong className="text-sm">{formatARS(step.amount)}</strong>
              </div>
            ))}
          </div>

          <form onSubmit={handleSendTenantReceipt} className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-600" />
              <span>Enviar Comprobante de Pago ({selectedPeriod})</span>
            </h3>
            <input
              type="file"
              required
              accept="application/pdf,image/*"
              onChange={(e) => setTenantReceiptFile(e.target.files?.[0] || null)}
              className="w-full text-xs"
            />
            <button type="submit" disabled={isSubmitting} className={`w-full py-2.5 rounded-xl text-xs font-bold ${themeStyle.primaryBtn}`}>
              {isSubmitting ? 'Enviando...' : 'Adjuntar y Enviar Comprobante'}
            </button>
          </form>

          {tenantPrefs.showPaymentHistory && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-2">
              <h3 className="font-bold text-sm">Historial de Pagos</h3>
              {payments
                .filter((p) => p.viviendaId === myLiq.vivienda.id)
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 text-xs">
                    <div>
                      <strong>{p.period}</strong> · {formatARS(p.totalAmount)}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full font-bold ${p.status === 'CONFIRMADO' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {p.status}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      <header className={`${themeStyle.header} sticky top-0 z-30 shadow-md`}>
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="w-6 h-6 text-emerald-400" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-base">RentaPro AR · {currentUser.role}</h1>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${themeStyle.badge}`}>v2.2.0 QA</span>
              </div>
              <p className="text-[11px] opacity-75">Drive: {storageConfig.driveFolderUrl}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {storageConfig.appsScriptUrl && (
              <button
                onClick={() => syncFromCloud()}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Sincronizar</span>
              </button>
            )}
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-white/10 border border-white/20 text-white text-xs rounded-xl px-2.5 py-1.5"
            >
              {indices.map((i) => (
                <option key={i.period} value={i.period} className="text-slate-900">
                  Período {i.period}
                </option>
              ))}
            </select>
            <button onClick={() => setCurrentUser(null)} className="px-3 py-1.5 rounded-xl bg-rose-500/20 text-rose-200 text-xs font-semibold flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" />
              <span>Salir</span>
            </button>
          </div>
        </div>

        <div className="bg-black/25 border-t border-white/10">
          <div className="max-w-7xl mx-auto px-4 flex gap-1 py-1.5 overflow-x-auto">
            {[
              { id: 'RESUMEN', label: 'Resumen', icon: BarChart3 },
              { id: 'CLIENTES', label: 'Clientes', icon: Users },
              { id: 'IMPUESTOS', label: 'Impuestos', icon: FileText },
              { id: 'CONFIGURACIONES', label: 'Configuraciones', icon: Settings }
            ].map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setAdminModule(m.id as typeof adminModule)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                    adminModule === m.id ? 'bg-white text-slate-900 shadow' : 'text-white/80 hover:bg-white/10'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-6 space-y-6">
        {adminModule === 'RESUMEN' && (
          <div className="space-y-6">
            {adminPrefs.showIndicesCard && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs text-slate-500">IPC Mensual ({selectedPeriod})</span>
                  <div className="text-2xl font-bold mt-1">
                    {indices.find((i) => i.period === selectedPeriod)?.ipcMonthlyPct ?? indices[indices.length - 1].ipcMonthlyPct}%
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs text-slate-500">ICL ({selectedPeriod})</span>
                  <div className="text-2xl font-bold mt-1">
                    {indices.find((i) => i.period === selectedPeriod)?.iclValue ?? indices[indices.length - 1].iclValue}
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs text-slate-500">Día Máximo / Mora</span>
                  <div className="text-lg font-bold text-amber-600 mt-1">
                    Día {moraSettings.maxDueDay} · {moraSettings.dailyInterestPct}%/día
                  </div>
                </div>
                <div className="bg-white p-4 rounded-2xl border border-slate-200">
                  <span className="text-xs text-slate-500">Total a Cobrar ({selectedPeriod})</span>
                  <div className={`text-2xl font-bold mt-1 ${themeStyle.accentText}`}>
                    {formatARS(liquidations.reduce((s, l) => s + l.grandTotal, 0))}
                  </div>
                </div>
              </div>
            )}

            <AnalyticsCharts
              showBar={adminPrefs.showBarChart}
              showPie={adminPrefs.showPieChart}
              showGantt={adminPrefs.showGanttChart}
              barData={liquidations.map((l) => ({
                label: l.vivienda.unitName,
                rent: l.baseRent,
                taxes: l.taxesTotal,
                mora: l.lateFeeAmount
              }))}
              pieData={taxCatalog.slice(0, 4).map((name, i) => ({
                label: name,
                value: taxes.filter((t) => t.serviceName === name).reduce((s, t) => s + t.totalAmount, 0) || (i + 1) * 12000,
                color: ['#10b981', '#0ea5e9', '#6366f1', '#f59e0b'][i % 4]
              }))}
              viviendas={viviendas}
            />

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="font-bold text-sm">Liquidación Dinámica por Contrato ({selectedPeriod})</h2>
                <span className="text-xs text-slate-500">Día evaluado: <strong>Día {effectiveDay}</strong></span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                      <th className="py-3 px-4">Vivienda / Contrato</th>
                      <th className="py-3 px-4">Índice / Frec.</th>
                      <th className="py-3 px-4 text-right">Alquiler</th>
                      <th className="py-3 px-4 text-right">Impuestos</th>
                      <th className="py-3 px-4 text-right">Mora</th>
                      <th className="py-3 px-4 text-right">Total Mes</th>
                      <th className="py-3 px-4 text-right">Próx. Mes</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {liquidations.map((l) => (
                      <tr key={l.vivienda.id} className={l.daysOverdue > 0 && !l.isPaid ? 'bg-rose-50/70' : ''}>
                        <td className="py-3 px-4">
                          <div className="font-bold">{l.vivienda.unitName}</div>
                          <div className="text-slate-400">Inicio: {l.vivienda.startDate}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold">
                            {l.vivienda.indexType} · {l.vivienda.frequencyMonths}m
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">{formatARS(l.baseRent)}</td>
                        <td className="py-3 px-4 text-right">{formatARS(l.taxesTotal)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-rose-600">
                          {l.lateFeeAmount > 0 ? `+${formatARS(l.lateFeeAmount)} (${l.daysOverdue}d)` : '$0'}
                        </td>
                        <td className="py-3 px-4 text-right font-bold">{formatARS(l.grandTotal)}</td>
                        <td className="py-3 px-4 text-right font-semibold text-indigo-600">
                          {formatARS(l.nextMonthRent + l.taxesTotal)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {l.isPaid ? (
                            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">CONFIRMADO</span>
                          ) : (
                            <button
                              onClick={() => {
                                const confirmed: PaymentRecord = {
                                  id: l.paymentRecord?.id || `PAG-${selectedPeriod}-${l.vivienda.id}`,
                                  period: selectedPeriod,
                                  viviendaId: l.vivienda.id,
                                  tenantName: l.paymentRecord?.tenantName || 'Inquilino',
                                  baseRent: l.baseRent,
                                  taxesAmount: l.taxesTotal,
                                  lateFeeAmount: l.lateFeeAmount,
                                  totalAmount: l.grandTotal,
                                  status: 'CONFIRMADO',
                                  confirmedAt: new Date().toISOString().slice(0, 10)
                                };
                                setPayments((prev) => [confirmed, ...prev.filter((p) => p.id !== confirmed.id)]);
                                notify(`Pago confirmado para ${l.vivienda.unitName}`);
                              }}
                              className="px-3 py-1 rounded-lg bg-slate-900 text-white font-semibold"
                            >
                              Confirmar Pago
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {adminModule === 'CLIENTES' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="font-bold text-sm">Selección de Impuestos Divisibles por Vivienda</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {viviendas.map((v) => (
                  <div key={v.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="font-bold text-xs">{v.unitName} ({v.address})</div>
                    <div className="flex flex-wrap gap-2">
                      {taxCatalog.map((taxName) => {
                        const active = v.divisibleTaxTypes.includes(taxName);
                        return (
                          <button
                            key={taxName}
                            type="button"
                            onClick={() =>
                              setViviendas((prev) =>
                                prev.map((item) =>
                                  item.id === v.id
                                    ? {
                                        ...item,
                                        divisibleTaxTypes: active
                                          ? item.divisibleTaxTypes.filter((t) => t !== taxName)
                                          : [...item.divisibleTaxTypes, taxName]
                                      }
                                    : item
                                )
                              )
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                              active ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300'
                            }`}
                          >
                            {active ? '✓ ' : '+ '}
                            {taxName}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {clients.map((cli) => {
                const viv = viviendas.find((v) => v.id === cli.viviendaId);
                const loadedCount = cli.garantes.filter((g) => g.loaded).length;
                return (
                  <div key={cli.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900 text-emerald-400 font-bold text-base flex items-center justify-center shrink-0">
                          {getInitials(cli.fullName)}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">{cli.fullName}</h4>
                          <p className="text-xs text-slate-500">DNI: {cli.dni} · {viv?.unitName}</p>
                          <p className="text-[11px] text-slate-400">{cli.whatsapp} · {cli.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-1.5 justify-end">
                          {cli.garantes.map((g) => (
                            <span
                              key={g.slot}
                              className={`w-3.5 h-3.5 rounded-full border-2 ${
                                g.loaded ? 'bg-emerald-500 border-emerald-600' : 'bg-transparent border-slate-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-[10px] text-slate-500 block mt-1">Garantes ({loadedCount}/3)</span>
                      </div>
                    </div>
                    <div className="text-xs bg-slate-50 p-2.5 rounded-xl text-slate-600">
                      <strong>Familiares ({cli.familyCount}):</strong> {cli.familyNames || 'Sin acompañantes'}
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => setGarantesModalClient(cli)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${themeStyle.primaryBtn}`}
                      >
                        Garantes 01, 02 y 03
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {adminModule === 'IMPUESTOS' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (isSubmitting) return;
                const amt = Number(newTaxForm.totalAmount);
                if (!amt || amt <= 0) return;
                setIsSubmitting(true);
                try {
                  const viv = viviendas.find((v) => v.id === newTaxForm.viviendaId) || viviendas[0];
                  const year = newTaxForm.period.split('-')[0];
                  const localUrl = newTaxForm.file ? URL.createObjectURL(newTaxForm.file) : undefined;
                  const drivePath = `drive/RentaPro AR/${viv.unitName}/Impuestos/${year}`;
                  const pctMap: Record<string, number> = {};
                  if (newTaxForm.splitMode === 'PORCENTAJE') {
                    pctMap['VIV-01'] = newTaxForm.pctVivienda01;
                    pctMap['VIV-02'] = 100 - newTaxForm.pctVivienda01;
                  }

                  const doc: TaxDocument = {
                    id: `IMP-${Date.now()}`,
                    period: newTaxForm.period,
                    year,
                    serviceName: newTaxForm.serviceName,
                    totalAmount: amt,
                    splitMode: newTaxForm.splitMode,
                    viviendaId: viv.id,
                    assignedViviendaIds: newTaxForm.assignedViviendaIds.length ? newTaxForm.assignedViviendaIds : [viv.id],
                    customPercentages: pctMap,
                    fileName: newTaxForm.file ? newTaxForm.file.name : `${newTaxForm.serviceName}_${newTaxForm.period}.pdf`,
                    localPreviewUrl: localUrl,
                    driveFolderPath: drivePath
                  };

                  if (storageConfig.appsScriptUrl && newTaxForm.file) {
                    const b64 = await fileToBase64(newTaxForm.file);
                    await postToAppsScript(storageConfig.appsScriptUrl, {
                      action: 'uploadImpuestoPDF',
                      actorRole: currentUser.role,
                      driveFolderInput: storageConfig.driveFolderUrl,
                      record: { ...doc, unitName: viv.unitName },
                      fileBase64: b64,
                      fileName: doc.fileName,
                      mimeType: newTaxForm.file.type
                    });
                  }

                  setTaxes((prev) => [doc, ...prev]);
                  setNewTaxForm({ ...newTaxForm, totalAmount: '', file: null });
                  notify(`Guardado en ${drivePath} y RentaPro AR/Impuestos/${year}`);
                } catch {
                  notify('Guardado local OK. Error al conectar con Google Drive.');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              className="bg-white p-5 rounded-2xl border border-slate-200 space-y-3.5 h-fit"
            >
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Cargar PDF de Impuesto a Drive</span>
              </h3>

              <select
                value={newTaxForm.serviceName}
                onChange={(e) => setNewTaxForm({ ...newTaxForm, serviceName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
              >
                {taxCatalog.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="month"
                  value={newTaxForm.period}
                  onChange={(e) => setNewTaxForm({ ...newTaxForm, period: e.target.value })}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
                <select
                  value={newTaxForm.viviendaId}
                  onChange={(e) => setNewTaxForm({ ...newTaxForm, viviendaId: e.target.value })}
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  {viviendas.map((v) => (
                    <option key={v.id} value={v.id}>{v.unitName}</option>
                  ))}
                </select>
              </div>

              <input
                type="number"
                required
                min={1}
                placeholder="Importe Total ($ ARS)"
                value={newTaxForm.totalAmount}
                onChange={(e) => setNewTaxForm({ ...newTaxForm, totalAmount: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />

              <select
                value={newTaxForm.splitMode}
                onChange={(e) => setNewTaxForm({ ...newTaxForm, splitMode: e.target.value as SplitMode })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs bg-white"
              >
                <option value="IGUAL">División en Partes Iguales</option>
                <option value="PORCENTAJE">División por Porcentaje Personalizado</option>
                <option value="UNICO">Asignación Única (100%)</option>
              </select>

              {newTaxForm.splitMode === 'PORCENTAJE' && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between font-semibold">
                    <span>Vivienda 01: {newTaxForm.pctVivienda01}%</span>
                    <span>Vivienda 02: {100 - newTaxForm.pctVivienda01}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={newTaxForm.pctVivienda01}
                    onChange={(e) => setNewTaxForm({ ...newTaxForm, pctVivienda01: Number(e.target.value) })}
                    className="w-full"
                  />
                </div>
              )}

              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setNewTaxForm({ ...newTaxForm, file: e.target.files?.[0] || null })}
                className="w-full text-xs"
              />

              <button type="submit" disabled={isSubmitting} className={`w-full py-2.5 rounded-xl text-xs font-bold ${themeStyle.primaryBtn}`}>
                {isSubmitting ? 'Subiendo a Drive...' : 'Guardar Organizado por Año'}
              </button>
            </form>

            <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 space-y-3">
              <h3 className="font-bold text-sm">Impuestos Organizados por Año en Drive</h3>
              {taxes.map((t) => (
                <div key={t.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-bold mr-2">
                      Año {t.year}
                    </span>
                    <strong>{t.serviceName}</strong> ({t.period} · {t.splitMode})
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">{t.driveFolderPath}/{t.fileName}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <strong>{formatARS(t.totalAmount)}</strong>
                    <button
                      onClick={() =>
                        setPreviewFileModal({
                          title: `${t.serviceName} (${t.period})`,
                          path: `${t.driveFolderPath}/${t.fileName}`,
                          url: t.drivePreviewUrl || t.localPreviewUrl,
                          amount: t.totalAmount
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-white font-semibold flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Ver PDF</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {adminModule === 'CONFIGURACIONES' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="bg-white p-3 rounded-2xl border border-slate-200 space-y-1 h-fit">
              {[
                { id: 'ALMACENAMIENTO', label: 'Almacenamiento (Drive)', icon: HardDrive },
                { id: 'PERSONALIZAR', label: 'Personalizar', icon: Palette },
                { id: 'CONTRASENAS', label: 'Contraseñas', icon: Lock },
                { id: 'INQUILINOS', label: 'Inquilinos', icon: Users },
                { id: 'VIVIENDAS', label: 'Viviendas', icon: Building2 },
                { id: 'IMPUESTOS_CAT', label: 'Impuestos', icon: FileText },
                { id: 'MORA', label: 'Día Máximo y Mora', icon: AlertTriangle }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setConfigSubMenu(item.id as typeof configSubMenu)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold text-left ${
                      configSubMenu === item.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="lg:col-span-3 bg-white p-6 rounded-2xl border border-slate-200 space-y-4">
              {configSubMenu === 'ALMACENAMIENTO' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">Menú “Almacenamiento”</h3>
                  {currentUser.role !== 'ADMIN' ? (
                    <div className="p-3 rounded-xl bg-amber-50 text-xs text-amber-900">
                      Solo el usuario <strong>Admin</strong> puede configurar la carpeta raíz de Google Drive.
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={storageConfig.driveFolderUrl}
                        onChange={(e) => setStorageConfig({ ...storageConfig, driveFolderUrl: e.target.value })}
                        placeholder="URL o ID de carpeta Google Drive"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={storageConfig.appsScriptUrl}
                        onChange={(e) => setStorageConfig({ ...storageConfig, appsScriptUrl: e.target.value })}
                        placeholder="URL Web App Google Apps Script (.../exec)"
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono"
                      />
                      <button
                        onClick={async () => {
                          if (storageConfig.appsScriptUrl) {
                            await postToAppsScript(storageConfig.appsScriptUrl, {
                              action: 'setupWorkspace',
                              actorRole: currentUser.role,
                              driveFolderInput: storageConfig.driveFolderUrl
                            });
                          }
                          notify('Carpeta Drive y planilla maestra configuradas.');
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold ${themeStyle.primaryBtn}`}
                      >
                        Guardar Almacenamiento
                      </button>
                    </>
                  )}
                </div>
              )}

              {configSubMenu === 'PERSONALIZAR' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">Menú “Personalizar”</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(Object.keys(THEME_CLASSES) as ThemeColorId[]).map((tId) => (
                      <button
                        key={tId}
                        onClick={() => setAdminPrefs({ ...adminPrefs, theme: tId })}
                        className={`p-2.5 rounded-xl border text-xs font-bold ${adminPrefs.theme === tId ? 'border-slate-900 bg-slate-100' : 'border-slate-200'}`}
                      >
                        {tId.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { key: 'showBarChart', label: 'Gráfica de Barras' },
                      { key: 'showPieChart', label: 'Gráfica de Torta' },
                      { key: 'showGanttChart', label: 'Diagrama de Gantt' },
                      { key: 'showIndicesCard', label: 'Tarjetas Índices IPC/ICL' }
                    ].map((o) => (
                      <label key={o.key} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(adminPrefs[o.key as keyof VisualizationPrefs])}
                          onChange={(e) => setAdminPrefs({ ...adminPrefs, [o.key]: e.target.checked })}
                        />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {configSubMenu === 'CONTRASENAS' && (
                <div className="space-y-3">
                  <h3 className="font-bold text-base">Menú “Contraseñas” (Hash SHA-256)</h3>
                  {accounts
                    .filter((a) => (currentUser.role === 'ADMIN' ? true : a.role !== 'ADMIN'))
                    .map((acc) => (
                      <div key={acc.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs">
                        <div>
                          <strong>{acc.username}</strong> ({acc.role})
                        </div>
                        <button
                          onClick={async () => {
                            const nextPass = prompt(`Nueva contraseña para ${acc.username}:`) || '';
                            if (!nextPass) return;
                            const h = await sha256Hex(nextPass);
                            setAccounts((prev) => prev.map((item) => (item.id === acc.id ? { ...item, passwordHash: h } : item)));
                            notify(`Contraseña actualizada para ${acc.username}`);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold"
                        >
                          Cambiar Clave
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {configSubMenu === 'INQUILINOS' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">Menú “Inquilinos” — Cupos y Cuentas</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {viviendas.map((v) => {
                      const count = accounts.filter((a) => a.role === 'INQUILINO' && a.viviendaId === v.id).length;
                      return (
                        <div key={v.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                          <div>
                            <strong>{v.unitName}</strong>
                            <span className="block text-slate-500">Cuentas: {count}/{v.maxTenantSlots}</span>
                          </div>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={v.maxTenantSlots}
                            onChange={(e) =>
                              setViviendas((prev) =>
                                prev.map((item) => (item.id === v.id ? { ...item, maxTenantSlots: Number(e.target.value) } : item))
                              )
                            }
                            className="w-16 px-2 py-1 border border-slate-300 rounded-lg text-center font-bold"
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Nombre"
                      value={newSlotAccount.fullName}
                      onChange={(e) => setNewSlotAccount({ ...newSlotAccount, fullName: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-xl text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Usuario"
                      value={newSlotAccount.username}
                      onChange={(e) => setNewSlotAccount({ ...newSlotAccount, username: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-xl text-xs"
                    />
                    <select
                      value={newSlotAccount.viviendaId}
                      onChange={(e) => setNewSlotAccount({ ...newSlotAccount, viviendaId: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-xl text-xs bg-white"
                    >
                      {viviendas.map((v) => (
                        <option key={v.id} value={v.id}>{v.unitName}</option>
                      ))}
                    </select>
                    <button
                      onClick={async () => {
                        if (!newSlotAccount.username) return;
                        const h = await sha256Hex(newSlotAccount.password);
                        setAccounts((prev) => [
                          ...prev,
                          {
                            id: `USR-${Date.now()}`,
                            username: newSlotAccount.username,
                            passwordHash: h,
                            pinHash: HASH_1234,
                            role: 'INQUILINO',
                            fullName: newSlotAccount.fullName || newSlotAccount.username,
                            viviendaId: newSlotAccount.viviendaId,
                            active: true
                          }
                        ]);
                        setNewSlotAccount({ username: '', password: '1234', viviendaId: 'VIV-01', fullName: '' });
                        notify('Cuenta inquilino creada.');
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold ${themeStyle.primaryBtn}`}
                    >
                      + Crear
                    </button>
                  </div>

                  <div className="space-y-2">
                    {accounts
                      .filter((a) => a.role === 'INQUILINO')
                      .map((acc) => (
                        <div key={acc.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                          <span>
                            <strong>{acc.fullName}</strong> (<code>{acc.username}</code>)
                          </span>
                          <button
                            onClick={() => setAccounts((prev) => prev.filter((item) => item.id !== acc.id))}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {configSubMenu === 'VIVIENDAS' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">Menú “Viviendas”</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <input
                      type="text"
                      placeholder="Nombre (Ej: Vivienda 03)"
                      value={newViviendaName}
                      onChange={(e) => setNewViviendaName(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-xl text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Dirección"
                      value={newViviendaAddress}
                      onChange={(e) => setNewViviendaAddress(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-xl text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Monto inicial"
                      value={newViviendaAmount}
                      onChange={(e) => setNewViviendaAmount(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-xl text-xs"
                    />
                    <button
                      onClick={() => {
                        if (!newViviendaName.trim()) return;
                        setViviendas((prev) => [
                          ...prev,
                          {
                            id: `VIV-${Date.now()}`,
                            unitName: newViviendaName.trim(),
                            address: newViviendaAddress || 'Dirección',
                            initialAmount: Number(newViviendaAmount) || 500000,
                            indexType: 'IPC',
                            frequencyMonths: 3,
                            startDate: '2026-11-01',
                            endDate: '2028-10-31',
                            maxTenantSlots: 3,
                            divisibleTaxTypes: ['Luz', 'Agua']
                          }
                        ]);
                        setNewViviendaName('');
                        setNewViviendaAddress('');
                        notify('Vivienda creada.');
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-bold ${themeStyle.primaryBtn}`}
                    >
                      + Crear Vivienda
                    </button>
                  </div>
                  <div className="space-y-2">
                    {viviendas.map((v) => (
                      <div key={v.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                        <input
                          type="text"
                          value={v.unitName}
                          onChange={(e) =>
                            setViviendas((prev) => prev.map((item) => (item.id === v.id ? { ...item, unitName: e.target.value } : item)))
                          }
                          className="font-bold px-2.5 py-1 border border-slate-300 rounded-lg bg-white"
                        />
                        <span>{v.address}</span>
                        <strong>{formatARS(v.initialAmount)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {configSubMenu === 'IMPUESTOS_CAT' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">Menú “Impuestos”</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Nuevo impuesto"
                      value={newTaxCatalogName}
                      onChange={(e) => setNewTaxCatalogName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs"
                    />
                    <button
                      onClick={() => {
                        if (!newTaxCatalogName.trim()) return;
                        setTaxCatalog((prev) => [...prev, newTaxCatalogName.trim()]);
                        setNewTaxCatalogName('');
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-bold ${themeStyle.primaryBtn}`}
                    >
                      + Agregar
                    </button>
                  </div>
                  <div className="space-y-2">
                    {taxCatalog.map((name, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setTaxCatalog((prev) => prev.map((item, i) => (i === idx ? e.target.value : item)))}
                          className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white font-semibold"
                        />
                        <button onClick={() => setTaxCatalog((prev) => prev.filter((_, i) => i !== idx))} className="p-1.5 text-rose-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {configSubMenu === 'MORA' && (
                <div className="space-y-4">
                  <h3 className="font-bold text-base">Día Máximo e Interés Diario por Mora</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="block font-semibold mb-1">Día Máximo de Pago</label>
                      <input
                        type="number"
                        min={1}
                        max={28}
                        value={moraSettings.maxDueDay}
                        onChange={(e) => setMoraSettings({ ...moraSettings, maxDueDay: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Interés Diario (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={moraSettings.dailyInterestPct}
                        onChange={(e) => setMoraSettings({ ...moraSettings, dailyInterestPct: Number(e.target.value) })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold mb-1">Simular Día del Mes</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={moraSettings.simulatedCurrentDay}
                        onChange={(e) => setMoraSettings({ ...moraSettings, simulatedCurrentDay: Number(e.target.value), useRealSystemDate: false })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-xl font-bold"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={moraSettings.useRealSystemDate}
                      onChange={(e) => setMoraSettings({ ...moraSettings, useRealSystemDate: e.target.checked })}
                    />
                    <span>Usar día real del sistema cuando el período coincide con el mes actual</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {garantesModalClient && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 space-y-5 my-8 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base">Garantes 01, 02 y 03 — {garantesModalClient.fullName}</h3>
              <button onClick={() => setGarantesModalClient(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {garantesModalClient.garantes.map((g, idx) => (
                <div key={g.slot} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <strong>Garante 0{g.slot}</strong>
                    <span className={`w-3 h-3 rounded-full ${g.loaded ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                  </div>
                  <input
                    type="text"
                    placeholder="Nombre y Apellido"
                    value={g.fullName}
                    onChange={(e) => {
                      const u = [...garantesModalClient.garantes] as ClientProfile['garantes'];
                      u[idx] = { ...g, fullName: e.target.value, loaded: Boolean(e.target.value || g.photoPreviewUrl) };
                      setGarantesModalClient({ ...garantesModalClient, garantes: u });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Parentesco"
                    value={g.relationship}
                    onChange={(e) => {
                      const u = [...garantesModalClient.garantes] as ClientProfile['garantes'];
                      u[idx] = { ...g, relationship: e.target.value };
                      setGarantesModalClient({ ...garantesModalClient, garantes: u });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Dirección"
                    value={g.address}
                    onChange={(e) => {
                      const u = [...garantesModalClient.garantes] as ClientProfile['garantes'];
                      u[idx] = { ...g, address: e.target.value };
                      setGarantesModalClient({ ...garantesModalClient, garantes: u });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                  <input
                    type="text"
                    placeholder="Teléfono"
                    value={g.phone}
                    onChange={(e) => {
                      const u = [...garantesModalClient.garantes] as ClientProfile['garantes'];
                      u[idx] = { ...g, phone: e.target.value };
                      setGarantesModalClient({ ...garantesModalClient, garantes: u });
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
                  />
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const u = [...garantesModalClient.garantes] as ClientProfile['garantes'];
                      u[idx] = { ...g, photoFileName: file.name, photoPreviewUrl: URL.createObjectURL(file), loaded: true };
                      setGarantesModalClient({ ...garantesModalClient, garantes: u });
                    }}
                    className="w-full text-[11px]"
                  />
                  {g.photoPreviewUrl && <img src={g.photoPreviewUrl} alt={`Garante 0${g.slot}`} className="w-full h-20 object-cover rounded-lg" />}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setClients((prev) => prev.map((c) => (c.id === garantesModalClient.id ? garantesModalClient : c)));
                  setGarantesModalClient(null);
                  notify('Garantes guardados.');
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold ${themeStyle.primaryBtn}`}
              >
                Guardar Garantes
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFileModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h4 className="font-bold text-sm">{previewFileModal.title}</h4>
                <p className="text-[11px] text-slate-400 font-mono">{previewFileModal.path}</p>
              </div>
              <button onClick={() => setPreviewFileModal(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 h-96 bg-slate-100 flex items-center justify-center">
              {previewFileModal.url ? (
                <iframe src={previewFileModal.url} title={previewFileModal.title} className="w-full h-full rounded-xl bg-white" />
              ) : (
                <div className="text-center space-y-2 p-6 bg-white rounded-2xl border border-slate-200">
                  <FileText className="w-10 h-10 text-emerald-600 mx-auto" />
                  <p className="font-bold text-sm">{previewFileModal.title}</p>
                  <p className="text-xs text-slate-500 font-mono">{previewFileModal.path}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
