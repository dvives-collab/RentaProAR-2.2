import { ClientProfile, Vivienda, TaxDocument, PaymentRecord, EconomicIndex, UserAccount, MoraSettings } from '../types/models';

export async function sha256Hex(plainText: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(plainText);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 2166136261;
  for (let i = 0; i < plainText.length; i++) {
    hash ^= plainText.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export async function postToAppsScript<T = unknown>(
  appsScriptUrl: string,
  payload: Record<string, unknown>
): Promise<{ status: 'ok' | 'error'; data?: T; message?: string; rootFolderUrl?: string; masterSheetUrl?: string }> {
  if (!appsScriptUrl) {
    return { status: 'error', message: 'URL de Apps Script no configurada.' };
  }
  const body = JSON.stringify({
    ...payload,
    requestId: `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  });
  const res = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

export async function fetchCloudWorkspaceData(appsScriptUrl: string, rootFolderId?: string): Promise<{
  status: 'ok' | 'error';
  rootFolderUrl?: string;
  masterSheetUrl?: string;
  data?: {
    viviendas?: Vivienda[];
    clientes?: ClientProfile[];
    impuestos?: TaxDocument[];
    pagos?: PaymentRecord[];
    cuentas?: UserAccount[];
    indices?: EconomicIndex[];
    configMora?: MoraSettings[];
  };
}> {
  const qs = new URLSearchParams({ action: 'getAllData' });
  if (rootFolderId) qs.set('rootFolderId', rootFolderId);
  const sep = appsScriptUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${appsScriptUrl}${sep}${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}
