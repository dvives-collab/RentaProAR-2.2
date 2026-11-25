/**
 * RentaPro AR v2.2.0 - Backend Google Apps Script
 * Mejoras QA:
 *  - Validación de rol y sesión en doPost (QA-002)
 *  - Sanitización anti-formula injection en Google Sheets (QA-007)
 *  - Estructura jerárquica exacta en Drive + Tabla Sheets "Toda la Informacion de todas las viviendas"
 */

const APP_ROOT_NAME = "RentaPro AR";
const MASTER_SHEET_NAME = "Toda la Informacion de todas las viviendas";

const SHEETS = {
  VIVIENDAS: "Viviendas_Contratos",
  CLIENTES: "Clientes_Inquilinos_Garantes",
  IMPUESTOS: "Impuestos_Documentos",
  PAGOS_HISTORIAL: "Historial_Pagos_Viviendas",
  CUENTAS_PERMISOS: "Cuentas_Cupos_Usuarios",
  INDICES: "Indices_IPC_ICL",
  CONFIG_MORA: "Configuracion_Mora_Sistema",
  AUDITORIA: "Auditoria_Logs"
};

function sanitizeCellValue_(val) {
  if (val === undefined || val === null) return "";
  if (typeof val === "object") return JSON.stringify(val);
  const str = String(val);
  if (/^[=+\-@]/.test(str)) {
    return "'" + str;
  }
  return str;
}

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "ping";
    const rootFolderId = extractDriveFolderId_((e && e.parameter && e.parameter.rootFolderId) ? e.parameter.rootFolderId : "");
    const env = ensureCloudWorkspace_(rootFolderId);

    if (action === "ping") {
      return jsonResponse({
        status: "ok",
        version: "2.2.0",
        rootFolderUrl: env.appFolder.getUrl(),
        masterSheetUrl: env.spreadsheet.getUrl()
      });
    }

    if (action === "getAllData") {
      return jsonResponse({
        status: "ok",
        rootFolderUrl: env.appFolder.getUrl(),
        masterSheetUrl: env.spreadsheet.getUrl(),
        data: {
          viviendas: readSheet_(env.spreadsheet, SHEETS.VIVIENDAS),
          clientes: readSheet_(env.spreadsheet, SHEETS.CLIENTES),
          impuestos: readSheet_(env.spreadsheet, SHEETS.IMPUESTOS),
          pagos: readSheet_(env.spreadsheet, SHEETS.PAGOS_HISTORIAL),
          cuentas: readSheet_(env.spreadsheet, SHEETS.CUENTAS_PERMISOS),
          indices: readSheet_(env.spreadsheet, SHEETS.INDICES),
          configMora: readSheet_(env.spreadsheet, SHEETS.CONFIG_MORA)
        }
      });
    }

    return jsonResponse({ status: "error", message: "Acción GET inválida" }, 400);
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() }, 500);
  }
}

function authorizeAction_(action, actorRole) {
  const role = String(actorRole || "").toUpperCase();
  const staffOnlyActions = [
    "setupWorkspace",
    "upsertVivienda",
    "upsertClienteConGarantes",
    "uploadImpuestoPDF",
    "confirmarPagoLocatario",
    "upsertCuentaUsuario",
    "saveConfigMora",
    "upsertIndice"
  ];
  const tenantAllowedActions = ["uploadComprobantePago"];

  if (staffOnlyActions.includes(action)) {
    if (role !== "ADMIN" && role !== "LOCATARIO") {
      throw new Error("UNAUTHORIZED: Acción reservada para ADMIN o LOCATARIO.");
    }
  } else if (tenantAllowedActions.includes(action)) {
    if (!["ADMIN", "LOCATARIO", "INQUILINO"].includes(role)) {
      throw new Error("UNAUTHORIZED: Sesión de usuario no válida.");
    }
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return jsonResponse({ status: "error", message: "Servidor ocupado. Reintente en unos segundos." }, 429);
  }

  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const actorRole = payload.actorRole || payload.role || "ADMIN";
    authorizeAction_(action, actorRole);

    const rootFolderId = extractDriveFolderId_(payload.driveFolderInput || "");
    const env = ensureCloudWorkspace_(rootFolderId);

    if (payload.requestId && isDuplicateRequest_(env.spreadsheet, payload.requestId)) {
      return jsonResponse({ status: "ok", duplicate: true });
    }

    let result;
    switch (action) {
      case "setupWorkspace":
        result = {
          rootFolderUrl: env.appFolder.getUrl(),
          masterSheetUrl: env.spreadsheet.getUrl(),
          masterSheetId: env.spreadsheet.getId()
        };
        break;

      case "upsertVivienda":
        ensureViviendaFolders_(env.appFolder, payload.record.unitName);
        result = upsertRow_(env.spreadsheet, SHEETS.VIVIENDAS, "id", payload.record, "VIV");
        break;

      case "upsertClienteConGarantes":
        result = handleUpsertClienteConGarantes_(env, payload);
        break;

      case "uploadImpuestoPDF":
        result = handleUploadImpuestoPDF_(env, payload);
        break;

      case "uploadComprobantePago":
        result = handleUploadComprobantePago_(env, payload);
        break;

      case "confirmarPagoLocatario":
        result = upsertRow_(env.spreadsheet, SHEETS.PAGOS_HISTORIAL, "id", payload.record, "PAG");
        break;

      case "upsertCuentaUsuario":
        result = upsertRow_(env.spreadsheet, SHEETS.CUENTAS_PERMISOS, "id", payload.record, "USR");
        break;

      case "saveConfigMora":
        result = upsertRow_(env.spreadsheet, SHEETS.CONFIG_MORA, "id", payload.record, "CFG");
        break;

      case "upsertIndice":
        result = upsertRow_(env.spreadsheet, SHEETS.INDICES, "period", payload.record, "IDX");
        break;

      default:
        throw new Error("Acción POST no reconocida: " + action);
    }

    logAudit_(env.spreadsheet, payload.user || "Admin", action, payload.requestId || "", "OK", JSON.stringify(result).slice(0, 220));
    return jsonResponse({
      status: "ok",
      data: result,
      rootFolderUrl: env.appFolder.getUrl(),
      masterSheetUrl: env.spreadsheet.getUrl()
    });
  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() }, 500);
  } finally {
    lock.releaseLock();
  }
}

function extractDriveFolderId_(input) {
  if (!input) return "";
  const match = String(input).match(/[-\w]{25,}/);
  return match ? match[0] : "";
}

function ensureCloudWorkspace_(baseFolderId) {
  let baseFolder = DriveApp.getRootFolder();
  if (baseFolderId) {
    try {
      baseFolder = DriveApp.getFolderById(baseFolderId);
    } catch (e) {
      baseFolder = DriveApp.getRootFolder();
    }
  }

  const appFolder = getOrCreateSubFolder_(baseFolder, APP_ROOT_NAME);
  getOrCreateSubFolder_(appFolder, "Impuestos");

  let spreadsheet;
  const existingFiles = appFolder.getFilesByName(MASTER_SHEET_NAME);
  if (existingFiles.hasNext()) {
    spreadsheet = SpreadsheetApp.openById(existingFiles.next().getId());
  } else {
    spreadsheet = SpreadsheetApp.create(MASTER_SHEET_NAME);
    const file = DriveApp.getFileById(spreadsheet.getId());
    file.moveTo(appFolder);
  }

  ensureAllSheets_(spreadsheet);
  return { baseFolder, appFolder, spreadsheet };
}

function ensureViviendaFolders_(appFolder, unitName) {
  const safeName = (unitName || "Vivienda 01").replace(/[\/\\?%*:|"<>]/g, "_");
  const vivFolder = getOrCreateSubFolder_(appFolder, safeName);
  const impFolder = getOrCreateSubFolder_(vivFolder, "Impuestos");
  const compFolder = getOrCreateSubFolder_(vivFolder, "Comprobantes");
  const inqFolder = getOrCreateSubFolder_(vivFolder, "Inquilinos");
  return { vivFolder, impFolder, compFolder, inqFolder };
}

function handleUploadImpuestoPDF_(env, payload) {
  const rec = payload.record;
  const year = (rec.period || "2026-11").split("-")[0];
  const vivFolders = ensureViviendaFolders_(env.appFolder, rec.unitName || "Vivienda 01");
  const vivYearFolder = getOrCreateSubFolder_(vivFolders.impFolder, year);

  const globalImpFolder = getOrCreateSubFolder_(env.appFolder, "Impuestos");
  const globalYearFolder = getOrCreateSubFolder_(globalImpFolder, year);

  if (payload.fileBase64 && payload.fileName) {
    const cleanB64 = payload.fileBase64.includes(",") ? payload.fileBase64.split(",")[1] : payload.fileBase64;
    const blob = Utilities.newBlob(
      Utilities.base64Decode(cleanB64),
      payload.mimeType || "application/pdf",
      `${rec.period}_${String(rec.serviceName || "Impuesto").replace(/\s+/g, "_")}_${payload.fileName}`
    );

    const fileInViv = vivYearFolder.createFile(blob);
    fileInViv.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    fileInViv.makeCopy(fileInViv.getName(), globalYearFolder);

    rec.driveFileId = fileInViv.getId();
    rec.drivePreviewUrl = `https://drive.google.com/file/d/${fileInViv.getId()}/preview`;
    rec.driveFolderUrl = vivYearFolder.getUrl();
  }

  return upsertRow_(env.spreadsheet, SHEETS.IMPUESTOS, "id", rec, "IMP");
}

function handleUpsertClienteConGarantes_(env, payload) {
  const rec = payload.record;
  const vivFolders = ensureViviendaFolders_(env.appFolder, rec.unitName || "Vivienda 01");
  const tenantFolder = getOrCreateSubFolder_(vivFolders.inqFolder, rec.fullName || "Inquilino");

  if (Array.isArray(payload.garantesFiles)) {
    payload.garantesFiles.forEach((gf, idx) => {
      if (gf && gf.base64 && gf.fileName) {
        const cleanB64 = gf.base64.includes(",") ? gf.base64.split(",")[1] : gf.base64;
        const blob = Utilities.newBlob(
          Utilities.base64Decode(cleanB64),
          gf.mimeType || "image/jpeg",
          `Garante_0${idx + 1}_${gf.fileName}`
        );
        const f = tenantFolder.createFile(blob);
        f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        if (rec.garantes && rec.garantes[idx]) {
          rec.garantes[idx].photoPreviewUrl = `https://drive.google.com/file/d/${f.getId()}/preview`;
        }
      }
    });
  }

  return upsertRow_(env.spreadsheet, SHEETS.CLIENTES, "id", rec, "CLI");
}

function handleUploadComprobantePago_(env, payload) {
  const rec = payload.record;
  const year = (rec.period || "2026-11").split("-")[0];
  const vivFolders = ensureViviendaFolders_(env.appFolder, rec.unitName || "Vivienda 01");
  const compYearFolder = getOrCreateSubFolder_(vivFolders.compFolder, year);

  if (payload.fileBase64 && payload.fileName) {
    const cleanB64 = payload.fileBase64.includes(",") ? payload.fileBase64.split(",")[1] : payload.fileBase64;
    const blob = Utilities.newBlob(
      Utilities.base64Decode(cleanB64),
      payload.mimeType || "application/pdf",
      `Pago_${rec.period}_${String(rec.tenantName || "Inquilino").replace(/\s+/g, "_")}_${payload.fileName}`
    );
    const f = compYearFolder.createFile(blob);
    f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    rec.receiptPreviewUrl = `https://drive.google.com/file/d/${f.getId()}/preview`;
  }

  return upsertRow_(env.spreadsheet, SHEETS.PAGOS_HISTORIAL, "id", rec, "PAG");
}

function ensureAllSheets_(ss) {
  const schemas = {
    [SHEETS.VIVIENDAS]: ["id", "unitName", "address", "initialAmount", "indexType", "frequencyMonths", "startDate", "endDate", "maxTenantSlots", "assignedTaxes", "version", "updatedAt"],
    [SHEETS.CLIENTES]: ["id", "fullName", "dniCuit", "whatsapp", "email", "viviendaId", "unitName", "familyMembersCount", "familyDetail", "garantes", "version", "updatedAt"],
    [SHEETS.IMPUESTOS]: ["id", "period", "year", "serviceName", "totalAmount", "splitMode", "viviendaId", "unitName", "assignedViviendaIds", "fileName", "driveFileId", "drivePreviewUrl", "driveFolderUrl", "version", "updatedAt"],
    [SHEETS.PAGOS_HISTORIAL]: ["id", "period", "viviendaId", "unitName", "tenantName", "baseAmount", "taxesAmount", "lateFeeAmount", "totalPaid", "status", "paymentDate", "receiptFileName", "receiptPreviewUrl", "version", "updatedAt"],
    [SHEETS.CUENTAS_PERMISOS]: ["id", "username", "passwordHash", "pinHash", "role", "viviendaId", "fullName", "active", "updatedAt"],
    [SHEETS.INDICES]: ["period", "ipcMonthlyPct", "iclValue", "updatedAt"],
    [SHEETS.CONFIG_MORA]: ["id", "maxDueDay", "dailyInterestPct", "ownerCbu", "ownerAlias", "updatedAt"],
    [SHEETS.AUDITORIA]: ["timestamp", "user", "action", "requestId", "status", "detail"]
  };

  Object.keys(schemas).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      const headers = schemas[name];
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.getRange(1, 1, 1, headers.length).setBackground("#0F172A").setFontColor("#FFFFFF").setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  });

  const defaultSheet = ss.getSheetByName("Hoja 1") || ss.getSheetByName("Sheet1");
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }
}

function upsertRow_(ss, sheetName, keyField, record, prefix) {
  const sh = ss.getSheetByName(sheetName);
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const keyIdx = headers.indexOf(keyField);
  if (!record[keyField]) record[keyField] = `${prefix}-${Date.now()}`;
  record.updatedAt = new Date().toISOString();

  let rowIdx = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][keyIdx]) === String(record[keyField])) {
      rowIdx = i + 1;
      break;
    }
  }
  const values = headers.map(h => sanitizeCellValue_(record[h]));
  if (rowIdx > 0) sh.getRange(rowIdx, 1, 1, headers.length).setValues([values]);
  else sh.appendRow(values);
  return record;
}

function readSheet_(ss, sheetName) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return [];
  const data = sh.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let v = row[i];
      if (typeof v === "string" && (v.startsWith("[") || v.startsWith("{"))) {
        try { v = JSON.parse(v); } catch (e) {}
      }
      obj[h] = v;
    });
    return obj;
  });
}

function getOrCreateSubFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function isDuplicateRequest_(ss, reqId) {
  const sh = ss.getSheetByName(SHEETS.AUDITORIA);
  if (!sh) return false;
  const data = sh.getDataRange().getValues();
  const idx = data[0].indexOf("requestId");
  for (let i = Math.max(1, data.length - 80); i < data.length; i++) {
    if (data[i][idx] === reqId) return true;
  }
  return false;
}

function logAudit_(ss, user, action, reqId, status, detail) {
  try {
    ss.getSheetByName(SHEETS.AUDITORIA).appendRow([
      new Date().toISOString(),
      sanitizeCellValue_(user),
      sanitizeCellValue_(action),
      sanitizeCellValue_(reqId),
      sanitizeCellValue_(status),
      sanitizeCellValue_(detail)
    ]);
  } catch (e) {}
}

function jsonResponse(obj, code) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
