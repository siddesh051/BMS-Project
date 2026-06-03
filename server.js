const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const XLSX = require('xlsx');
const multer = require('multer');
const archiver = require('archiver');
const nodemailer  = require('nodemailer');

const ExcelJS = require('exceljs');
let config;
try {
  config = require('./config.json');
} catch (err) {
  try {
    config = require('../config.json');
  } catch (error) {
    console.error('Config load failed');
    process.exit(1);
  }
}
const currentEnv = process.env.NODE_ENV || config.environment || 'production';
const envConfig = config.environments[currentEnv];
if (!envConfig) {
  console.error(`Environment '${currentEnv}' not found in config`);
  process.exit(1);
}
const activeConfig = { ...config, ...envConfig, currentEnvironment: currentEnv };
function validateConfig() {
  const requiredFields = ['port', 'excelFilePath', 'userDataFilePath'];
  const missingFields = requiredFields.filter(field => !activeConfig[field]);
  if (missingFields.length > 0) {
    console.error(`Missing config fields in ${currentEnv}:`, missingFields);
    process.exit(1);
  }
}
const dataDir = path.resolve(__dirname, 'data');
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const trackerJsonPath = path.join(dataDir, 'tracker-bids.json');
  if (!fs.existsSync(trackerJsonPath)) {
    fs.writeFileSync(trackerJsonPath, JSON.stringify({ bids: [] }, null, 2), 'utf8');
  }
} catch (e) {
  console.error('[Tracker Store] Failed to initialize data store:', e);
}
function cleanAndValidateFilePath(filePath) {
  if (!filePath) return null;
  let cleanPath = filePath.toString().replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  if (cleanPath.includes('172.17.1.6e$')) {
    cleanPath = cleanPath.replace('172.17.1.6e$', '172.17.1.6\\e$');
  }
  if (cleanPath.includes('172.17.1.6') && !cleanPath.startsWith('\\\\')) {
    cleanPath = cleanPath.startsWith('\\') ? '\\' + cleanPath : '\\\\' + cleanPath;
  }
  return cleanPath;
}
function normalizePathForComparison(filePath) {
  if (!filePath) return '';
  return path.normalize(cleanAndValidateFilePath(filePath).toLowerCase());
}
function tryFileAccess(filePaths) {
  if (typeof filePaths === 'string') filePaths = [filePaths];
  for (const filePath of filePaths) {
    try {
      if (fs.existsSync(filePath)) return filePath;
    } catch (error) {}
  }
  return null;
}
function getFilePath(configKey) {
  const primaryPath = activeConfig[configKey];
  const fallbackKey = currentEnv;
  if (config.fallbackPaths?.[fallbackKey]?.[configKey]) {
    return tryFileAccess(config.fallbackPaths[fallbackKey][configKey]);
  }
  return tryFileAccess(primaryPath);
}
function resolveFilePath(filePath) {
  if (!filePath) return null;
  const cleanedPath = cleanAndValidateFilePath(filePath);
  if (!cleanedPath) return null;
  if (path.isAbsolute(cleanedPath)) return cleanedPath;
  if (activeConfig.baseBidsProposalPath) {
    return path.normalize(path.join(activeConfig.baseBidsProposalPath, cleanedPath));
  }
  return cleanedPath;
}
function isPathAllowed(requestedPath) {
  if (!requestedPath || !activeConfig.allowedDownloadPaths) return false;
  const cleanedRequestPath = cleanAndValidateFilePath(requestedPath);
  if (!cleanedRequestPath) return false;
  const normalizedRequestPath = normalizePathForComparison(cleanedRequestPath);
  return activeConfig.allowedDownloadPaths.some(allowedPath => {
    const normalizedAllowedPath = normalizePathForComparison(allowedPath);
    return normalizedRequestPath.startsWith(normalizedAllowedPath);
  });
}
function discoverProjectFolders() {
  const bidMasterFile = getFilePath('excelFilePath');
  if (!bidMasterFile) return [];
  try {
    const workbook = XLSX.readFile(bidMasterFile);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const projectFolders = new Set();
    rows.forEach((row, index) => {
      if (index === 0) return;
      const filePath = row[1] ? row[1].toString().trim() : "";
      if (filePath) {
        const resolvedPath = resolveFilePath(filePath);
        const relativePath = path.relative(activeConfig.baseBidsProposalPath, resolvedPath);
        const pathParts = relativePath.split(path.sep);
        if (pathParts.length > 2) {
          projectFolders.add(pathParts[1]);
        }
      }
    });
    return Array.from(projectFolders);
  } catch (error) {
    return [];
  }
}
validateConfig();
const app = express();
const PORT = activeConfig.port;
const HOST = activeConfig.host || '0.0.0.0';
if (activeConfig.enableCors !== false) app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
const staticPath = path.resolve(__dirname, activeConfig.staticFilesPath || './');
app.use(express.static(staticPath, {
  setHeaders: (res, pathArg) => {
    if (pathArg.endsWith('.xlsx')) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
  }
}));
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.resolve(__dirname)),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!['.xlsx', '.xls'].includes(ext)) return cb(new Error('Only .xlsx/.xls files allowed'));
      const base = path.basename(file.originalname, ext).replace(/[^a-z0-9_-]/gi, '_');
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
      req._storedFileName = `${base}_${ts}${ext}`;
      cb(null, req._storedFileName);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }
});
const docUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadFolder = activeConfig.folders?.uploads || 'tmp_uploads';
      const tmp = path.resolve(__dirname, uploadFolder);
      try { fs.mkdirSync(tmp, { recursive: true }); } catch {}
      cb(null, tmp);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext).replace(/[^a-z0-9._-]/gi, '_');
      cb(null, `${base}_${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 200 * 1024 * 1024 }
});
let userDataCache = null;
let userDataLastLoaded = null;
let bidDataCache = null;
let bidDataLastLoaded = null;
let trackerBidsCache = null;
let trackerBidsLastLoaded = null;
const CACHE_DURATION = activeConfig.cacheDuration || 300000;

/* ═══════════════════════════════════════════════════
   EMAIL NOTIFICATION SYSTEM
   Triggered when an engineer uploads a document.
   Sends to all Manager/Director emails in user list.
═══════════════════════════════════════════════════ */
let _mailerTransport = null;

function getMailTransport() {
  if (_mailerTransport) return _mailerTransport;
  const cfg = activeConfig.email;
  if (!cfg || !cfg.enabled || !cfg.smtp?.host || !cfg.smtp?.user || !cfg.smtp?.pass
      || ['your-app-password','YOUR_PASSWORD_HERE','YOUR_PASSWORD','your-password','YOUR_OUTLOOK_PASSWORD_HERE'].includes(cfg.smtp.pass)) {
    console.log('[Email] SMTP not configured — edit email.smtp.pass in config.json');
    return null;
  }
  try {
    _mailerTransport = nodemailer.createTransport({
      host:       cfg.smtp.host,          // smtp.office365.com
      port:       cfg.smtp.port || 587,
      secure:     false,                  // false for STARTTLS on port 587
      requireTLS: true,                   // force STARTTLS upgrade
      auth: {
        type: 'LOGIN',                    // Office365 needs LOGIN auth type
        user: cfg.smtp.user,
        pass: cfg.smtp.pass
      },
      tls: {
        ciphers:               'SSLv3',
        rejectUnauthorized:    false      // allow self-signed certs on internal servers
      }
    });
    console.log(`[Email] Transport ready — ${cfg.smtp.host} as ${cfg.smtp.user}`);
    return _mailerTransport;
  } catch (e) {
    console.error('[Email] Transport creation failed:', e.message);
    return null;
  }
}

async function sendDocumentUploadNotification({ bid, docType, category, docName, uploadedByUser }) {
  try {
    const transport = getMailTransport();
    if (!transport) return;  // email not configured — silent skip

    const cfg = activeConfig.email;
    const notifyRoles = cfg.notifyRoles || ['Manager', 'Director'];

    // Get all manager/director emails from user data
    const userData = loadUserData();
    // Resolve email regardless of column name in Excel (Email / email / EmailID / E-Mail)
    const getEmail = u => (u.Email || u.email || u.EmailID || u['E-Mail'] || u.EmailAddress || '').toString().trim();
    const recipients = (userData?.users || [])
      .filter(u => notifyRoles.includes(u.UserType) && getEmail(u))
      .map(u => getEmail(u));

    if (!recipients.length) {
      console.log('[Email] No manager/director email addresses found — check Email column in Bidportal_Userinfo.xlsx');
      return;
    }

    const bidName     = bid.name || bid.bidName || bid.id;
    const uploaderName = uploadedByUser?.FullName || uploadedByUser?.Username || 'An engineer';
    const bidViewUrl  = `http://${activeConfig.host || 'localhost'}:${activeConfig.port || 5003}/bid-tracker/bid-view.html?id=${encodeURIComponent(bid.id)}`;
    const uploadedAt  = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const subject = `[QG BMS] Document uploaded — ${bidName}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f0f4fb">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4fb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10)">
        
        <!-- Header -->
        <tr><td style="background:linear-gradient(90deg,#1a3f8a,#2563c8,#2f79e0);padding:28px 32px">
          <table width="100%"><tr>
            <td>
              <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.5px">Quadgen Wireless</div>
              <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:2px">Bid Management System</div>
            </td>
            <td align="right">
              <div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:6px 14px;color:#fff;font-size:12px;font-weight:600">
                📄 Document Alert
              </div>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0f1e36">
            A document has been uploaded and is awaiting your review.
          </p>
          <p style="margin:0 0 24px;font-size:14px;color:#5a6a84">
            ${uploaderName} uploaded a document to <strong>${bidName}</strong>.
          </p>

          <!-- Info card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border:1px solid #c7ddf5;border-radius:10px;margin-bottom:24px">
            <tr><td style="padding:20px">
              <table width="100%" cellpadding="6" cellspacing="0">
                <tr>
                  <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;width:130px">Bid</td>
                  <td style="font-size:14px;font-weight:600;color:#0f1e36">${bidName}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Document Type</td>
                  <td style="font-size:14px;color:#0f1e36">${docType}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Category</td>
                  <td style="font-size:14px;color:#0f1e36">${category}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Document</td>
                  <td style="font-size:14px;color:#0f1e36">${docName}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Uploaded By</td>
                  <td style="font-size:14px;color:#0f1e36">${uploaderName}</td>
                </tr>
                <tr>
                  <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.06em">Time</td>
                  <td style="font-size:14px;color:#0f1e36">${uploadedAt} IST</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA button -->
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${bidViewUrl}" style="display:inline-block;background:linear-gradient(90deg,#1a3f8a,#2563c8);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;box-shadow:0 4px 12px rgba(37,99,200,0.35)">
              Review Document →
            </a>
          </td></tr></table>

          <p style="margin:24px 0 0;font-size:13px;color:#94a3b8">
            Please approve or reject the document after reviewing. The engineer will be able to see the status update.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f4;background:#f8faff">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">
            QG Bid Management System &nbsp;·&nbsp; This is an automated notification &nbsp;·&nbsp; Do not reply to this email
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const text = `QG BMS — Document Upload Notification\n\nBid: ${bidName}\nDocument Type: ${docType}\nCategory: ${category}\nDocument: ${docName}\nUploaded By: ${uploaderName}\nTime: ${uploadedAt} IST\n\nReview at: ${bidViewUrl}`;

    await transport.sendMail({
      from:    cfg.from || 'QG BMS <no-reply@quadgenwireless.com>',
      to:      recipients.join(', '),
      subject,
      text,
      html
    });

    console.log(`[Email] Sending upload notification to: ${recipients.join(', ')}`);
  } catch (e) {
    // Never let email failure break the upload
    console.error('[Email] Notification failed (non-fatal):', e.message);
  }
}
const activeSessions = new Map();
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = activeConfig.maxLoginAttempts || 5;
const LOCKOUT_DURATION = activeConfig.lockoutDuration || 900000;
const STATUS = {
  ADDED: 'Added Attachment',
  REVIEW: 'In Review',
  PENDING: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};
// toKey: MUST stay consistent with bid-view.js — simple lowercase only
const toDocKey = (type, category, name) =>
  `${(type||'').trim().toLowerCase()}||${(category||'').trim().toLowerCase()}||${(name||'').trim().toLowerCase()}`;
const APPROVAL_STATUS = {
  APPROVED: 'Document Approved',
  REJECTED: 'Document Rejected',
  PENDING: 'Pending Review',
};
function loadBidData() {
  const now = Date.now();
  if (activeConfig.enableCaching && bidDataCache && bidDataLastLoaded && (now - bidDataLastLoaded) < CACHE_DURATION) {
    return bidDataCache;
  }
  const bidMasterFile = getFilePath('excelFilePath');
  if (!bidMasterFile) return null;
  try {
    const workbook = XLSX.readFile(bidMasterFile);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return null;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const bidData = { bids: [], lastUpdated: now };
    rows.forEach((row, index) => {
      if (index === 0) {
        const firstCell = row[0]?.toString().trim().toLowerCase() || "";
        if ((firstCell.includes('bid') && firstCell.includes('name')) || 
            (firstCell.includes('master') && firstCell.includes('file'))) return;
      }
      const bidName = row[0]?.toString().trim() || "";
      const filePath = row[1]?.toString().trim() || "";
      if (!bidName || !filePath) return;
      bidData.bids.push({
        id: bidName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
        name: bidName,
        filePath: resolveFilePath(filePath),
        originalPath: filePath,
        rowIndex: index + 1,
        status: 'active'
      });
    });
    if (activeConfig.enableCaching) {
      bidDataCache = bidData;
      bidDataLastLoaded = now;
    }
    return bidData;
  } catch (error) {
    return null;
  }
}
function loadUserData() {
  const now = Date.now();
  // User data: cache for 60 seconds regardless of cacheDuration setting
  // This prevents repeated slow network Excel reads on every API call
  const USER_CACHE_TTL = 60000;
  if (userDataCache && userDataLastLoaded && (now - userDataLastLoaded) < USER_CACHE_TTL) {
    return userDataCache;
  }
  const userDataFile = getFilePath('userDataFilePath');
  if (!userDataFile) return null;
  try {
    const workbook = XLSX.readFile(userDataFile);
    const userData = { users: [], permissions: [], sessions: [] };
    if (workbook.Sheets['All Users']) {
      userData.users = XLSX.utils.sheet_to_json(workbook.Sheets['All Users']);
    } else return null;
    if (workbook.Sheets['Permission Data']) {
      userData.permissions = XLSX.utils.sheet_to_json(workbook.Sheets['Permission Data']);
    }
    if (workbook.Sheets['Sessions']) {
      userData.sessions = XLSX.utils.sheet_to_json(workbook.Sheets['Sessions']);
    }
    userDataCache = userData;
    userDataLastLoaded = now;
    return userData;
  } catch (error) {
    // Return stale cache if Excel is temporarily unreachable
    if (userDataCache) {
      console.warn('[UserData] Excel read failed, using stale cache:', error.message);
      return userDataCache;
    }
    return null;
  }
}
// 
async function sendDocumentFinalizedNotification({ bid, docType, category, docName, engineerUser }) {
  try {
    const transport = getMailTransport();
    if (!transport) return;

    const cfg = activeConfig.email;
    const notifyRoles = cfg.notifyRoles || ['Manager', 'Director'];
    const userData = loadUserData();
    const getEmail = u => (u.Email || u.email || u.EmailID || u['E-Mail'] || u.EmailAddress || '').toString().trim();
    const recipients = (userData?.users || [])
      .filter(u => notifyRoles.includes(u.UserType) && getEmail(u))
      .map(u => getEmail(u));

    if (!recipients.length) return;

    const bidName      = bid.name || bid.bidName || bid.id;
    const engineerName = engineerUser?.FullName || engineerUser?.Username || 'An engineer';
    const bidViewUrl   = `http://${activeConfig.host || 'localhost'}:${activeConfig.port || 5003}/bid-tracker/bid-view.html?id=${encodeURIComponent(bid.id)}`;
    const submittedAt  = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });

    const subject = `[QG BMS] Document submitted for review — ${bidName}`;

    const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background:#f0f4fb">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4fb;padding:32px 16px">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.10)">
        <tr><td style="background:linear-gradient(90deg,#1a3f8a,#2563c8,#2f79e0);padding:28px 32px">
          <table width="100%"><tr>
            <td><div style="color:#fff;font-size:20px;font-weight:700">Quadgen Wireless</div>
                <div style="color:rgba(255,255,255,0.65);font-size:12px;margin-top:2px">Bid Management System</div></td>
            <td align="right"><div style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:8px;padding:6px 14px;color:#fff;font-size:12px;font-weight:600">✅ Awaiting Approval</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px">
          <p style="margin:0 0 8px;font-size:15px;font-weight:600;color:#0f1e36">A document has been submitted and requires your approval.</p>
          <p style="margin:0 0 24px;font-size:14px;color:#5a6a84">${engineerName} has finalized a document in <strong>${bidName}</strong> and marked it ready for review.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7ff;border:1px solid #c7ddf5;border-radius:10px;margin-bottom:24px">
            <tr><td style="padding:20px">
              <table width="100%" cellpadding="6" cellspacing="0">
                <tr><td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;width:130px">Bid</td><td style="font-size:14px;font-weight:600;color:#0f1e36">${bidName}</td></tr>
                <tr><td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Document Type</td><td style="font-size:14px;color:#0f1e36">${docType}</td></tr>
                <tr><td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Category</td><td style="font-size:14px;color:#0f1e36">${category}</td></tr>
                <tr><td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Document</td><td style="font-size:14px;color:#0f1e36">${docName}</td></tr>
                <tr><td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Submitted By</td><td style="font-size:14px;color:#0f1e36">${engineerName}</td></tr>
                <tr><td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase">Time</td><td style="font-size:14px;color:#0f1e36">${submittedAt} IST</td></tr>
              </table>
            </td></tr>
          </table>
          <table cellpadding="0" cellspacing="0"><tr><td>
            <a href="${bidViewUrl}" style="display:inline-block;background:linear-gradient(90deg,#1a3f8a,#2563c8);color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;box-shadow:0 4px 12px rgba(37,99,200,0.35)">
              Approve / Reject →
            </a>
          </td></tr></table>
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e2e8f4;background:#f8faff">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center">QG BMS &nbsp;·&nbsp; Automated notification &nbsp;·&nbsp; Do not reply</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    await transport.sendMail({
      from: cfg.from || 'QG BMS <no-reply@quadgenwireless.com>',
      to:   recipients.join(', '),
      subject, html,
      text: `QG BMS - Document Submitted\n\n${engineerName} submitted ${docName} (${docType} / ${category}) in bid ${bidName} at ${submittedAt} IST.\n\nReview: ${bidViewUrl}`
    });
    console.log(`[Email] Finalized notification sent to: ${recipients.join(', ')}`);
  } catch (e) {
    console.error('[Email] Finalized notification failed (non-fatal):', e.message);
  }
}


function loadTrackerBids() {
  const now = Date.now();
  if (activeConfig.enableCaching && trackerBidsCache && trackerBidsLastLoaded && (now - trackerBidsLastLoaded) < CACHE_DURATION) {
    return trackerBidsCache;
  }

  const configured = activeConfig.bidTrackerFilePath;
  const isExcel = configured && /\.xlsx?$/i.test(configured);
  const trackerFile = (!configured || isExcel)
    ? path.resolve(__dirname, 'data', 'tracker-bids.json')
    : configured;

  let data;
  try {
    if (!fs.existsSync(trackerFile)) {
      data = { bids: [], lastUpdated: now };
    } else {
      const raw = fs.readFileSync(trackerFile, 'utf8');
      data = raw && raw.trim().length ? JSON.parse(raw) : { bids: [], lastUpdated: now };
    }
  } catch (e) {
    data = { bids: [], lastUpdated: now };
  }

  if (!data || typeof data !== 'object' || !Array.isArray(data.bids)) {
    data = { bids: [], lastUpdated: now };
  }
  if (data.lastUpdated == null) {
    data.lastUpdated = now;
  }

  if (activeConfig.enableCaching) {
    trackerBidsCache = data;
    trackerBidsLastLoaded = now;
  }
  return data;
}

// function saveTrackerBids(trackerBidsData) {
//   try {
//     // const trackerFile = activeConfig.bidTrackerFilePath || path.resolve(__dirname, 'data', 'tracker-bids.json');
//     const configured = activeConfig.bidTrackerFilePath;
//     const isExcel = configured && /\.xlsx?$/i.test(configured);
//     const trackerFile = (!configured || isExcel)
//       ? path.resolve(__dirname, 'data', 'tracker-bids.json')
//       : configured;
//     const dataDir = path.dirname(trackerFile);
//     if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
//     fs.writeFileSync(trackerFile, JSON.stringify(trackerBidsData, null, 2));
//     trackerBidsCache = trackerBidsData;
//     trackerBidsLastLoaded = Date.now();
//     return true;
//   } catch (error) {
//     return false;
//   }
// }
function saveTrackerBids(trackerBidsData) {
  try {
    const configured = activeConfig.bidTrackerFilePath;
    const isExcel = configured && /\.xlsx?$/i.test(configured);
    const trackerFile = (!configured || isExcel)
      ? path.resolve(__dirname, 'data', 'tracker-bids.json')
      : configured;

    const dir = path.dirname(trackerFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const now = Date.now();
    const data = (trackerBidsData && typeof trackerBidsData === 'object') ? trackerBidsData : { bids: [] };
    if (!Array.isArray(data.bids)) data.bids = [];
    data.lastUpdated = now;

    // Always recompute live doc counts from docMeta before saving — keeps stored values correct
    data.bids.forEach(bid => {
      const docs = Object.values(bid.docMeta || {});

      // ── Sync docTypes with docMeta — every docMeta entry must appear in docTypes ──
      // This fixes the mismatch where manually-added docs land in docMeta but not docTypes
      bid.docTypes = bid.docTypes || [];
      docs.forEach(meta => {
        const t = meta.type, c = meta.category, n = meta.name;
        if (!t || !c || !n) return;
        let dtObj = bid.docTypes.find(x => x.type === t);
        if (!dtObj) { dtObj = { type: t, categories: [] }; bid.docTypes.push(dtObj); }
        let catObj = dtObj.categories.find(x => x.category === c);
        if (!catObj) { catObj = { category: c, names: [] }; dtObj.categories.push(catObj); }
        if (!catObj.names.includes(n)) catObj.names.push(n);
      });

      bid.documentsRequired = docs.length;
      bid.documentsApproved = docs.filter(d => (d.status || '').trim() === 'Approved').length;
      bid.documentsRejected = docs.filter(d => ['Rejected','reject'].includes((d.status || '').trim())).length;
      bid.documentsPending  = docs.filter(d => !d.attachment).length;
    });

    fs.writeFileSync(trackerFile, JSON.stringify(data, null, 2), 'utf8');

    // Always update cache after write so next read gets fresh data
    trackerBidsCache = data;
    trackerBidsLastLoaded = now;
    return true;
  } catch (e) {
    console.error('[Tracker Store] Save failed:', e);
    return false;
  }
}



function loadBidTemplate() {
  try {
    const templateFile = path.resolve(__dirname, 'NewBidTemplate.xlsx');
    if (!fs.existsSync(templateFile)) return null;
    const workbook = XLSX.readFile(templateFile);
    if (!workbook.Sheets['BidTypeDocuments']) return null;
    const templateData = XLSX.utils.sheet_to_json(workbook.Sheets['BidTypeDocuments']);
    const organizedTemplate = {};
    templateData.forEach(row => {
      const docType = row.DocumentType;
      if (!organizedTemplate[docType]) organizedTemplate[docType] = {};
      const category = row.Categories;
      if (!organizedTemplate[docType][category]) organizedTemplate[docType][category] = [];
      organizedTemplate[docType][category].push({
        file: row.Files,
        priority: row.Priority
      });
    });
    return { template: organizedTemplate, lastUpdated: Date.now() };
  } catch (error) {
    return null;
  }
}
function checkUserAccess(user) {
  const portalAccess = user['Portal Access'] === 'Yes' || user['Portal Access'] === true;
  const trackerAccess = user['Tracker Access'] === 'Yes' || user['Tracker Access'] === true;
  return { portal: portalAccess, tracker: trackerAccess, hasAnyAccess: portalAccess || trackerAccess };
}
function authenticateUser(username, password) {
  const userData = loadUserData();
  if (!userData) return { success: false, message: 'Unable to load user data' };
  const user = userData.users.find(u => u.Username && u.Username.toLowerCase() === username.toLowerCase());
  if (!user) return { success: false, message: 'Invalid username or password' };
  if (user.Status !== 'Active') return { success: false, message: 'Account is not active' };
  if (user.Password !== password) return { success: false, message: 'Invalid username or password' };
  const accessPermissions = checkUserAccess(user);
  if (!accessPermissions.hasAnyAccess) return { success: false, message: 'Account does not have access permissions' };
  return {
    success: true,
    userData: {
      UserID: user.UserID,
      Username: user.Username,
      UserType: user.UserType,
      FullName: user.FullName,
      Email: user.Email,
      Department: user.Department,
      PortalAccess: accessPermissions.portal,
      TrackerAccess: accessPermissions.tracker,
      AccessPermissions: accessPermissions
    }
  };
}
function isUserLockedOut(username) {
  const attempts = loginAttempts.get(username.toLowerCase());
  if (!attempts) return false;
  const now = Date.now();
  attempts.attempts = attempts.attempts.filter(timestamp => (now - timestamp) < LOCKOUT_DURATION);
  if (attempts.attempts.length >= MAX_LOGIN_ATTEMPTS) {
    const oldestAttempt = Math.min(...attempts.attempts);
    const timeUntilUnlock = LOCKOUT_DURATION - (now - oldestAttempt);
    if (timeUntilUnlock > 0) return true;
  }
  return false;
}
function recomputeBidDocCounts(bid) {
  const required = countRequiredDocs(bid.docTypes || []);
  const docs = Object.values(bid.docMeta || {});
  const approved = docs.filter(d => (d.status || '').toLowerCase() === 'approved').length;
  const rejected = docs.filter(d => (d.status || '').toLowerCase() === 'rejected').length;
  bid.documentsRequired = required;
  bid.documentsApproved = approved;
  bid.documentsRejected = rejected;
  bid.documentsPending = Math.max(0, required - approved - rejected);
}
function recordLoginAttempt(username, success) {
  const key = username.toLowerCase();
  const now = Date.now();
  if (success) {
    loginAttempts.delete(key);
  } else {
    if (!loginAttempts.has(key)) {
      loginAttempts.set(key, { attempts: [] });
    }
    const attempts = loginAttempts.get(key);
    attempts.attempts.push(now);
  }
}
function validateBidFile(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (error) {
    return false;
  }
}
function getBidFilePath(bidId) {
  const bidData = loadBidData();
  if (!bidData) return null;
  const bid = bidData.bids.find(b => b.id === bidId || b.name === bidId);
  return bid ? bid.filePath : null;
}
function generateBidId(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '_');
}
function getTrackerBids() {
  return loadTrackerBids() || { bids: [], lastUpdated: Date.now() };
}
function safeSeg(s) {
  return (s || '').toString().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').trim();
}
function ensureDocTypeInBid(bid, type, category, name) {
  bid.docTypes = bid.docTypes || [];
  let t = bid.docTypes.find(x => x.type === type);
  if (!t) {
    t = { type, categories: [] };
    bid.docTypes.push(t);
  }
  let c = t.categories.find(x => x.category === category);
  if (!c) {
    c = { category, names: [] };
    t.categories.push(c);
  }
  if (!c.names.includes(name)) c.names.push(name);
}
function countRequiredDocs(docTypes) {
  return (docTypes || []).reduce((sum, t) => 
    sum + t.categories.reduce((s, c) => s + c.names.length, 0), 0);
}
function upsertBid(bid) {
  const data = getTrackerBids();
  const id = bid.id || generateBidId(bid.name || 'bid_' + Date.now());
  const nowIso = new Date().toISOString();
  const newBid = {
    id,
    name: bid.name || id,
    status: bid.status || 'Planning',
    createdBy: bid.createdBy || '',
    owner: bid.owner || '',
    deadline: bid.deadline || '',
    lastUpdated: nowIso,
    documentsRequired: bid.documentsRequired ?? 0,
    documentsPending: bid.documentsPending ?? 0,
    documentsApproved: bid.documentsApproved ?? 0,
    documentsRejected: bid.documentsRejected ?? 0,
    teamMembers: Array.isArray(bid.teamMembers) ? bid.teamMembers : [],
    docType: bid.docType || '',
    docCategory: bid.docCategory || '',
    docName: bid.docName || '',
    docTypes: bid.docTypes || [],
    clientName: bid.clientName || '',
    description: bid.description || '',
    docMeta: bid.docMeta || {}
  };
  const idx = data.bids.findIndex(b => b.id === id);
  if (idx >= 0) {
    data.bids[idx] = { ...data.bids[idx], ...newBid };
  } else {
    data.bids.unshift(newBid);
  }
  data.lastUpdated = Date.now();
  saveTrackerBids(data);
  return data.bids.find(b => b.id === id);
}
async function updateUserLastLogin(userID) {
  // Run in background — never block the login response
  setImmediate(async () => {
    try {
      const userDataFile = getFilePath('userDataFilePath');
      if (!userDataFile) return;
      const workbook = XLSX.readFile(userDataFile);
      if (workbook.Sheets['All Users']) {
        const worksheet = workbook.Sheets['All Users'];
        const data = XLSX.utils.sheet_to_json(worksheet);
        let updated = false;
        data.forEach(row => {
          if (row.UserID === userID) {
            row.LastLogin = new Date().toISOString();
            updated = true;
          }
        });
        if (updated) {
          const newWorksheet = XLSX.utils.json_to_sheet(data);
          workbook.Sheets['All Users'] = newWorksheet;
          XLSX.writeFile(workbook, userDataFile);
          userDataCache = null; // clear cache so next read gets fresh data
        }
      }
    } catch (error) {
      // Non-fatal — login still succeeded
    }
  });
}
app.get('/', (req, res) => {
  const defaultRoute = activeConfig.defaultRoute || './auth/login.html';
  res.sendFile(path.resolve(__dirname, defaultRoute));
});
app.get('/api/bids', (req, res) => {
  const bidData = loadBidData();
  if (!bidData) {
    return res.status(500).json({
      error: 'Unable to load bid data',
      path: getFilePath('excelFilePath') || 'File not found'
    });
  }
  const validatedBids = bidData.bids.map(bid => ({
    ...bid,
    fileExists: validateBidFile(bid.filePath),
    accessible: isPathAllowed(bid.filePath)
  }));
  res.json({
    success: true,
    bids: validatedBids,
    totalBids: validatedBids.length,
    masterFile: getFilePath('excelFilePath'),
    lastUpdated: bidData.lastUpdated,
    environment: currentEnv
  });
});
// Add this endpoint to your server.js file

app.delete('/api/bid-tracker/delete-bid', async (req, res) => {
  try {
    const { bidId, reason, deletedBy, deletedByName } = req.body;
    
    // Validate required fields
    if (!bidId || !reason || !deletedBy) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: bidId, reason, and deletedBy are required'
      });
    }

    // Load user data to check permissions
    const userData = loadUserData();
    if (!userData) {
      return res.status(500).json({
        success: false,
        message: 'Unable to load user data'
      });
    }

    // Find the user and verify delete permissions
    const user = userData.users.find(u => u.UserID === deletedBy);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has permission to delete bids (managers/admin/directors)
    const userType = user.UserType?.toLowerCase() || '';
    const canDelete = ['manager', 'director'].some(role => 
      userType.includes(role)
    );

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete bids. Only managers, admins, and directors can delete bids.'
      });
    }

    // Load tracker bids
    const data = getTrackerBids();
    const bidIndex = data.bids.findIndex(b => b.id === bidId);
    
    if (bidIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Bid not found'
      });
    }

    const bidToDelete = data.bids[bidIndex];
    console.log(`Deleting bid: ${bidToDelete.name} (ID: ${bidId}) by user: ${deletedByName || deletedBy}`);
    console.log(`Deletion reason: ${reason}`);

    // Optional: Clean up physical folders/files if they exist
    try {
      if (bidToDelete.folderPath && fs.existsSync(bidToDelete.folderPath)) {
        console.log(`Attempting to remove bid folder: ${bidToDelete.folderPath}`);
        await fs.promises.rmdir(bidToDelete.folderPath, { recursive: true });
        console.log(`Successfully removed bid folder: ${bidToDelete.folderPath}`);
      } else {
        // Try alternative path construction
        const trackerBidsPath = activeConfig.trackerBidsPath || 
          path.join(activeConfig.baseBidsProposalPath, 'New_Bids_Test');
        const altFolderPath = path.join(trackerBidsPath, safeSeg(bidToDelete.name));
        
        if (fs.existsSync(altFolderPath)) {
          console.log(`Attempting to remove alternative bid folder: ${altFolderPath}`);
          await fs.promises.rmdir(altFolderPath, { recursive: true });
          console.log(`Successfully removed alternative bid folder: ${altFolderPath}`);
        }
      }
    } catch (folderError) {
      console.warn(`Warning: Could not remove bid folder: ${folderError.message}`);
      // Don't fail the deletion if folder cleanup fails
    }

    // Remove the bid from the array
    data.bids.splice(bidIndex, 1);

    // Log the deletion (you could also save this to a separate deletions log file)
    const deletionRecord = {
      deletedBid: {
        id: bidToDelete.id,
        name: bidToDelete.name,
        createdBy: bidToDelete.createdBy,
        createdAt: bidToDelete.createdAt,
        documentsCount: Object.keys(bidToDelete.docMeta || {}).length
      },
      deletedBy: deletedBy,
      deletedByName: deletedByName || user.FullName || user.Username,
      deletedAt: new Date().toISOString(),
      reason: reason
    };

    console.log('Deletion record:', JSON.stringify(deletionRecord, null, 2));

    // Update the last modified timestamp
    data.lastUpdated = Date.now();
    
    // Save the updated tracker data
    const saveSuccess = saveTrackerBids(data);
    if (!saveSuccess) {
      return res.status(500).json({
        success: false,
        message: 'Failed to save updated bid data after deletion'
      });
    }

    // Optional: You might want to save deletion records to a separate log file
    try {
      const deletionsLogPath = activeConfig.deletionsLogPath || path.resolve(__dirname, 'data', 'bid-deletions.json');
      const deletionsDir = path.dirname(deletionsLogPath);
      
      if (!fs.existsSync(deletionsDir)) {
        await fs.promises.mkdir(deletionsDir, { recursive: true });
      }

      let deletionsLog = [];
      if (fs.existsSync(deletionsLogPath)) {
        const logData = await fs.promises.readFile(deletionsLogPath, 'utf8');
        deletionsLog = JSON.parse(logData);
      }

      deletionsLog.unshift(deletionRecord); // Add to beginning of array (most recent first)
      
      // Keep only the last 1000 deletion records to prevent file from growing too large
      if (deletionsLog.length > 1000) {
        deletionsLog = deletionsLog.slice(0, 1000);
      }

      await fs.promises.writeFile(deletionsLogPath, JSON.stringify(deletionsLog, null, 2));
      console.log(`Deletion logged to: ${deletionsLogPath}`);
    } catch (logError) {
      console.warn(`Warning: Could not save deletion log: ${logError.message}`);
      // Don't fail the request if logging fails
    }

    // Clear cache to ensure fresh data on next load
    trackerBidsCache = null;
    trackerBidsLastLoaded = null;

    res.json({
      success: true,
      message: `Bid "${bidToDelete.name}" has been successfully deleted`,
      deletedBid: {
        id: bidToDelete.id,
        name: bidToDelete.name,
        documentsDeleted: Object.keys(bidToDelete.docMeta || {}).length
      },
      deletionRecord: deletionRecord
    });

  } catch (error) {
    console.error('Delete bid error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete bid due to server error',
      error: error.message
    });
  }
});
app.get('/api/bids/:bidId', (req, res) => {
  const { bidId } = req.params;
  const bidData = loadBidData();
  if (!bidData) return res.status(500).json({ error: 'Unable to load bid data' });
  const bid = bidData.bids.find(b => b.id === bidId || b.name === bidId);
  if (!bid) {
    return res.status(404).json({
      error: 'Bid not found',
      bidId: bidId,
      availableBids: bidData.bids.map(b => ({ id: b.id, name: b.name }))
    });
  }
  res.json({
    success: true,
    bid: {
      ...bid,
      fileExists: validateBidFile(bid.filePath),
      accessible: isPathAllowed(bid.filePath)
    }
  });
});
app.get('/api/excel/:bidId', (req, res) => {
  const { bidId } = req.params;
  const excelPath = getBidFilePath(bidId);
  if (!excelPath) return res.status(404).json({ error: 'Bid not found', bidId });
  fs.access(excelPath, fs.constants.R_OK, err => {
    if (err) {
      return res.status(404).json({
        error: 'Excel file not accessible',
        path: excelPath,
        details: err.message
      });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const fileStream = fs.createReadStream(excelPath);
    fileStream.on('error', streamError => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading Excel file' });
      }
    });
    fileStream.pipe(res);
  });
});
app.get('/api/excel', async (req, res) => {
  try {
    const bidData = loadBidData();
    if (!bidData || !bidData.bids || bidData.bids.length === 0) {
      return res.status(500).json({
        error: 'No bid data available',
        details: 'Unable to load bid master file or no bids found'
      });
    }
    const consolidatedWorkbook = XLSX.utils.book_new();
    let totalSheetsAdded = 0;
    for (const bid of bidData.bids) {
      if (!validateBidFile(bid.filePath) || !isPathAllowed(bid.filePath)) continue;
      try {
        const bidWorkbook = XLSX.readFile(bid.filePath);
        bidWorkbook.SheetNames.forEach(sheetName => {
          const sheet = bidWorkbook.Sheets[sheetName];
          if (sheet) {
            const newSheetName = `${bid.name}_${sheetName}`.substring(0, 31);
            consolidatedWorkbook.Sheets[newSheetName] = sheet;
            consolidatedWorkbook.SheetNames.push(newSheetName);
            totalSheetsAdded++;
          }
        });
      } catch (error) {}
    }
    if (totalSheetsAdded === 0) {
      return res.status(500).json({
        error: 'No valid bid files found',
        details: 'All bid files are either missing or inaccessible'
      });
    }
    const buffer = XLSX.write(consolidatedWorkbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create consolidated Excel file',
      details: error.message
    });
  }
});
app.get('/api/project-folders', (req, res) => {
  const projectFolders = discoverProjectFolders();
  res.json({
    success: true,
    projectFolders: projectFolders,
    totalFolders: projectFolders.length,
    basePath: activeConfig.baseBidsProposalPath
  });
});
app.post('/api/bids/refresh', (req, res) => {
  bidDataCache = null;
  bidDataLastLoaded = null;
  const bidData = loadBidData();
  if (bidData) {
    res.json({
      success: true,
      message: 'Bid data refreshed successfully',
      totalBids: bidData.bids.length,
      lastUpdated: bidData.lastUpdated
    });
  } else {
    res.status(500).json({
      success: false,
      message: 'Failed to refresh bid data'
    });
  }
});
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  if (isUserLockedOut(username)) {
    return res.status(423).json({ success: false, message: 'Account temporarily locked due to multiple failed attempts' });
  }
  const authResult = authenticateUser(username, password);
  recordLoginAttempt(username, authResult.success);
  if (authResult.success) {
    updateUserLastLogin(authResult.userData.UserID); // fire-and-forget
    res.json({
      success: true,
      userData: authResult.userData,
      message: 'Login successful',
      environment: currentEnv
    });
  } else {
    res.status(401).json({ success: false, message: authResult.message });
  }
});
app.post('/api/auth/login-attempt', (req, res) => {
  res.json({ success: true });
});
app.post('/api/auth/log-activity', (req, res) => {
  res.json({ success: true });
});
app.get('/api/auth/permissions/:userType', (req, res) => {
  const { userType } = req.params;
  const userData = loadUserData();
  if (!userData) return res.status(500).json({ error: 'Unable to load user data' });
  const permissions = userData.permissions.filter(p => p.UserType === userType);
  res.json({ success: true, permissions: permissions });
});
app.get('/api/auth/access/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = loadUserData();
  if (!userData) return res.status(500).json({ error: 'Unable to load user data' });
  const user = userData.users.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const accessPermissions = checkUserAccess(user);
  res.json({ success: true, userId: userId, access: accessPermissions });
});
app.post('/api/auth/validate-access', (req, res) => {
  const { userId, requiredAccess } = req.body;
  const userData = loadUserData();
  if (!userData) return res.status(500).json({ error: 'Unable to load user data' });
  const user = userData.users.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const accessPermissions = checkUserAccess(user);
  let hasRequiredAccess = false;
  if (requiredAccess === 'portal') {
    hasRequiredAccess = accessPermissions.portal;
  } else if (requiredAccess === 'tracker') {
    hasRequiredAccess = accessPermissions.tracker;
  }
  res.json({
    success: hasRequiredAccess,
    access: accessPermissions,
    message: hasRequiredAccess ? 'Access granted' : `No ${requiredAccess} access`
  });
});
app.post('/api/auth/logout', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) activeSessions.delete(sessionId);
  res.json({ success: true, message: 'Logout successful' });
});
app.get('/api/bid-tracker/user-access/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = loadUserData();
  if (!userData) return res.status(500).json({ error: 'Unable to load user data' });
  const user = userData.users.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const accessPermissions = checkUserAccess(user);
  const hasTrackerAccess = accessPermissions.tracker;
  const userRole = user.UserType;
  const isAdmin = userRole === 'Admin';
  res.json({
    success: true,
    userId: userId,
    hasTrackerAccess: hasTrackerAccess,
    userRole: userRole,
    userType: userRole,
    fullName: user.FullName,
    isAdminOnly: isAdmin,
    canCreateBids:     ['Director', 'Manager'].includes(userRole),
    canApproveBids:    ['Director', 'Manager'].includes(userRole),
    canDeleteBids:     ['Director', 'Manager'].includes(userRole),
    canDeleteDocuments:['Director', 'Manager'].includes(userRole),
    canUnfinalize:     ['Director', 'Manager'].includes(userRole),
    canUploadDocuments:['Director', 'Manager', 'Engineer'].includes(userRole)
  });
});
app.get('/api/bid-tracker/stats/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = loadUserData();
  if (!userData) return res.status(500).json({ error: 'Unable to load user data' });
  const user = userData.users.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const accessPermissions = checkUserAccess(user);
  if (!accessPermissions.tracker) return res.status(403).json({ error: 'No tracker access' });
  const userRole = user.UserType;
  const trackerBids = loadTrackerBids();
  const totalUsers = userData.users.filter(u => u.Status === 'Active').length;
  const trackerUsers = userData.users.filter(u => checkUserAccess(u).tracker && u.Status === 'Active').length;
  let stats = {};
  if (userRole === 'Engineer') {
    const myBids = trackerBids.bids.filter(bid => bid.teamMembers.includes(userId));
    const myTotalDocs = myBids.reduce((sum, bid) => sum + bid.documentsRequired, 0);
    const myPendingDocs = myBids.reduce((sum, bid) => sum + bid.documentsPending, 0);
    const myApprovedDocs = myBids.reduce((sum, bid) => sum + bid.documentsApproved, 0);
    const myRejectedDocs = myBids.reduce((sum, bid) => sum + bid.documentsRejected, 0);
    stats = {
      assignedBids: myBids.length,
      pendingDocuments: myPendingDocs,
      approvedDocuments: myApprovedDocs,
      rejectedDocuments: myRejectedDocs,
      upcomingDeadlines: myBids.filter(bid => {
        const daysUntilDeadline = Math.ceil((new Date(bid.deadline) - new Date()) / (1000 * 60 * 60 * 24));
        return daysUntilDeadline <= 7 && daysUntilDeadline > 0;
      }).length,
      overdueTasks: myBids.filter(bid => new Date(bid.deadline) < new Date()).length,
      completionRate: myTotalDocs > 0 ? Math.round((myApprovedDocs / myTotalDocs) * 100) : 0,
      totalDocuments: myTotalDocs
    };
  } else if (['Manager', 'Admin', 'Director'].includes(userRole)) {
    const totalBids = trackerBids.bids.length;
    const activeBids = trackerBids.bids.filter(bid => ['Planning', 'In Progress', 'Review'].includes(bid.status)).length;
    const completedBids = trackerBids.bids.filter(bid => bid.status === 'Completed').length;
    const totalDocs = trackerBids.bids.reduce((sum, bid) => sum + bid.documentsRequired, 0);
    const pendingDocs = trackerBids.bids.reduce((sum, bid) => sum + bid.documentsPending, 0);
    const approvedDocs = trackerBids.bids.reduce((sum, bid) => sum + bid.documentsApproved, 0);
    const rejectedDocs = trackerBids.bids.reduce((sum, bid) => sum + bid.documentsRejected, 0);
    stats = {
      totalBids: totalBids,
      activeBids: activeBids,
      pendingApprovals: pendingDocs,
      completedBids: completedBids,
      teamMembers: trackerUsers,
      upcomingDeadlines: trackerBids.bids.filter(bid => {
        const daysUntilDeadline = Math.ceil((new Date(bid.deadline) - new Date()) / (1000 * 60 * 60 * 24));
        return daysUntilDeadline <= 7 && daysUntilDeadline > 0;
      }).length,
      overdueItems: trackerBids.bids.filter(bid => new Date(bid.deadline) < new Date()).length,
      recentActivity: trackerBids.bids.filter(bid => {
        const daysSinceUpdate = Math.ceil((new Date() - new Date(bid.lastUpdated)) / (1000 * 60 * 60 * 24));
        return daysSinceUpdate <= 7;
      }).length,
      totalDocuments: totalDocs,
      approvedDocuments: approvedDocs,
      pendingDocuments: pendingDocs,
      rejectedDocuments: rejectedDocs
    };
  }
  res.json({
    success: true,
    stats: stats,
    userRole: userRole,
    lastUpdated: new Date().toISOString()
  });
});
app.get('/api/bid-tracker/template', (req, res) => {
  const templateData = loadBidTemplate();
  if (!templateData) return res.status(500).json({ error: 'Unable to load bid template' });
  res.json({
    success: true,
    template: templateData.template,
    lastUpdated: templateData.lastUpdated
  });
});
app.post('/api/bid-tracker/template-upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const storedName = req._storedFileName || req.file.filename;
    const fullPath = path.resolve(__dirname, storedName);
    const wb = XLSX.readFile(fullPath);
    const sheetName = 'BidTypeDocuments';
    const ws = wb.Sheets[sheetName];
    if (!ws) return res.status(400).json({ success: false, message: 'Sheet "BidTypeDocuments" not found' });
    const rawRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const rows = rawRows.map(r => {
      const type = (r.Type || r.DocumentType || r['Document Type'] || '').toString().trim();
      const category = (r.Category || r.Categories || r['Document Category'] || '').toString().trim();
      const name = (r.Name || r.Document || r['Document Name'] || r.Files || '').toString().trim();
      const priority = (r['Document Type Priority'] || r.Priority || r.priority || '').toString().trim();
      const section = (r['Section/ClauseNo'] || r.Section || r.Clause || '').toString().trim();
      const assignedTo = (r['Assigned To'] || r.AssignedTo || r.assignedTo || '').toString().trim();
      const dueDate = r['Due Date(DD/MM/YYYY)'] || r['Due Date'] || r.DueDate || r.dueDate || '';
      return { 
        type, 
        category, 
        name, 
        priority, 
        section, 
        assignedTo, 
        dueDate 
      };
    }).filter(r => r.type && r.category && r.name);
    const map = new Map();
    for (const { type, category, name } of rows) {
      const tkey = type.toLowerCase();
      const ckey = category.toLowerCase();
      const nkey = name.toLowerCase();
      if (!map.has(tkey)) map.set(tkey, { type, categories: new Map() });
      const tObj = map.get(tkey);
      if (!tObj.categories.has(ckey)) tObj.categories.set(ckey, { category, names: new Set() });
      tObj.categories.get(ckey).names.add(nkey + '::' + name);
    }
    const docTypes = [];
    map.forEach(tObj => {
      const cats = [];
      tObj.categories.forEach(cObj => {
        const names = [];
        cObj.names.forEach(v => names.push(v.split('::')[1]));
        cats.push({ category: cObj.category, names });
      });
      docTypes.push({ type: tObj.type, categories: cats });
    });
    res.json({
      success: true,
      storedName,
      filename: storedName,
      originalName: req.file.originalname,
      sheet: sheetName,
      rows,
      docTypes
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to process template', error: e.message });
  }
});
app.get('/api/bid-tracker/download-template', (req, res) => {
try {
    const possibleNames = ['BidTemplate.xlsx', 'NewBidTemplate.xlsx'];
    let templatePath = null;
    for (const fileName of possibleNames) {
      const testPath = path.resolve(__dirname, fileName);
      console.log(`Checking for template at: ${testPath}`);
      if (fs.existsSync(testPath)) {
        templatePath = testPath;
        console.log(`Found template: ${templatePath}`);
        break;
      }
    }
    if (!templatePath) {
      console.log(`Template not found. __dirname: ${__dirname}`);
      console.log('Files in directory:', fs.readdirSync(__dirname).filter(f => f.includes('.xlsx')));
      return res.status(404).json({ 
        success: false, 
        message: 'Template file not found',
        searchedPaths: possibleNames.map(name => path.resolve(__dirname, name))
      });
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="BidTemplate.xlsx"');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.download(templatePath, 'BidTemplate.xlsx');
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to download template', 
      error: error.message 
    });
  }
});
app.get('/api/bid-tracker/bids/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = loadUserData();
  const trackerBids = loadTrackerBids();
  if (!userData) return res.status(500).json({ error: 'Unable to load data' });
  const user = userData.users.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const accessPermissions = checkUserAccess(user);
  if (!accessPermissions.tracker) return res.status(403).json({ error: 'No tracker access' });
  const userRole = user.UserType;
  let bidTrackerData = [];
  if (userRole === 'Engineer') {
    bidTrackerData = trackerBids.bids.filter(bid => bid.teamMembers.includes(userId));
  } else if (['Manager', 'Admin', 'Director'].includes(userRole)) {
    bidTrackerData = trackerBids.bids;
  }
  res.json({
    success: true,
    bids: bidTrackerData,
    totalBids: bidTrackerData.length,
    userRole: userRole
  });
});
app.get('/api/bid-tracker/activity/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = loadUserData();
  const trackerBids = loadTrackerBids();
  if (!userData) return res.status(500).json({ error: 'Unable to load data' });
  const user = userData.users.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const accessPermissions = checkUserAccess(user);
  if (!accessPermissions.tracker) return res.status(403).json({ error: 'No tracker access' });
  const userRole = user.UserType;
  let activities = [];
  if (userRole === 'Engineer') {
    const myBids = trackerBids.bids.filter(bid => bid.teamMembers.includes(userId));
    const activityTypes = ['document_upload', 'document_approved', 'assignment', 'document_rejected', 'deadline'];
    activities = myBids.slice(0, 5).map((bid, index) => ({
      id: index + 1,
      type: activityTypes[index % activityTypes.length],
      title: `Activity for ${bid.name}`,
      description: `${bid.name}: Document ${index + 1} activity`,
      timestamp: new Date(Date.now() - index * 3 * 60 * 60 * 1000).toISOString(),
      priority: ['medium', 'high', 'medium', 'high', 'medium'][index % 5],
      bidId: bid.id,
      bidName: bid.name
    }));
  } else if (['Manager', 'Admin', 'Director'].includes(userRole)) {
    const activityTypes = ['bid_created', 'approval_request', 'team_assignment', 'document_approved', 'bid_completed', 'deadline_alert'];
    activities = trackerBids.bids.slice(0, 6).map((bid, index) => ({
      id: index + 1,
      type: activityTypes[index % activityTypes.length],
      title: `Management Activity for ${bid.name}`,
      description: `${bid.name}: Management action ${index + 1}`,
      timestamp: new Date(Date.now() - index * 2 * 60 * 60 * 1000).toISOString(),
      priority: ['high', 'high', 'medium', 'medium', 'high', 'medium'][index % 6],
      bidId: bid.id,
      bidName: bid.name,
      user: user.Username
    }));
  }
  res.json({
    success: true,
    activities: activities,
    totalActivities: activities.length,
    userRole: userRole
  });
});
app.get('/api/bid-tracker/notifications/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = loadUserData();
  const trackerBids = loadTrackerBids();
  if (!userData) return res.status(500).json({ error: 'Unable to load data' });
  const user = userData.users.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const userRole = user.UserType;
  let notifications = [];
  if (userRole === 'Engineer') {
    const myBids = trackerBids.bids.filter(bid => bid.teamMembers.includes(userId));
    const notifTypes = ['document_due', 'feedback', 'assignment', 'approval'];
    notifications = myBids.slice(0, 4).map((bid, index) => ({
      id: index + 1,
      type: notifTypes[index % notifTypes.length],
      title: `Notification for ${bid.name}`,
      message: `${bid.name}: Notification message ${index + 1}`,
      priority: ['high', 'medium', 'medium', 'low'][index % 4],
      timestamp: new Date(Date.now() - index * 6 * 60 * 60 * 1000).toISOString(),
      bidId: bid.id,
      isRead: index > 1
    }));
  } else if (['Manager', 'Admin', 'Director'].includes(userRole)) {
    const notifTypes = ['approval_needed', 'bid_deadline', 'team_update', 'bid_completed', 'system'];
    notifications = trackerBids.bids.slice(0, 5).map((bid, index) => ({
      id: index + 3,
      type: notifTypes[index % notifTypes.length],
      title: `Management Notification for ${bid.name}`,
      message: `${bid.name}: Management notification ${index + 1}`,
      priority: ['high', 'medium', 'high', 'low', 'low'][index % 5],
      timestamp: new Date(Date.now() - index * 4 * 60 * 60 * 1000).toISOString(),
      bidId: bid.id,
      isRead: index > 2
    }));
  }
  res.json({
    success: true,
    notifications: notifications,
    totalNotifications: notifications.length,
    unreadCount: notifications.filter(n => !n.isRead).length,
    userRole: userRole
  });
});
app.get('/api/bid-tracker/documents/:userId', (req, res) => {
  const { userId } = req.params;
  const userData = loadUserData();
  const trackerBids = loadTrackerBids();
  if (!userData) return res.status(500).json({ error: 'Unable to load data' });
  const user = userData.users.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const accessPermissions = checkUserAccess(user);
  if (!accessPermissions.tracker) return res.status(403).json({ error: 'No tracker access' });
  const userRole = user.UserType;
  let documents = [];
  const statusOptions = ['approved', 'pending', 'rejected', 'not_started'];
  const categories = ['Technical Docs', 'Financial Docs', 'Management Docs'];
  if (userRole === 'Engineer') {
    const myBids = trackerBids.bids.filter(bid => bid.teamMembers.includes(userId));
    documents = myBids.slice(0, 4).map((bid, index) => ({
      id: `DOC-${String(index + 1).padStart(3, '0')}`,
      name: `Document ${index + 1} for ${bid.name}`,
      bidId: bid.id,
      bidName: bid.name,
      category: categories[index % categories.length],
      status: statusOptions[index % statusOptions.length],
      priority: ['high', 'medium', 'high', 'low'][index % 4],
      assignedTo: userId,
      dueDate: new Date(Date.now() + (5 + index * 3) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      uploadedDate: index < 3 ? new Date(Date.now() - (1 + index) * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null,
      version: index < 3 ? `${index + 1}.${index}` : '',
      fileSize: index < 3 ? `${1 + index * 0.5} MB` : '',
      comments: `Comments for document ${index + 1}`
    }));
  } else if (['Manager', 'Admin', 'Director'].includes(userRole)) {
    documents = trackerBids.bids.slice(0, 3).map((bid, index) => ({
      id: `DOC-${String(index + 1).padStart(3, '0')}`,
      name: `Management Document ${index + 1} for ${bid.name}`,
      bidId: bid.id,
      bidName: bid.name,
      category: categories[index % categories.length],
      status: ['pending_approval', 'pending_approval', 'approved'][index % 3],
      priority: ['high', 'high', 'medium'][index % 3],
      assignedTo: `U${String(index + 4).padStart(3, '0')}`,
      assignedToName: `Engineer${index + 1}`,
      dueDate: new Date(Date.now() + (2 + index) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      uploadedDate: new Date(Date.now() - (1 + index) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      version: `${index + 1}.${index + 5}`,
      fileSize: `${2 + index * 0.3} MB`,
      comments: `Management review comment ${index + 1}`
    }));
  }
  res.json({
    success: true,
    documents: documents,
    totalDocuments: documents.length,
    userRole: userRole,
    statusCounts: {
      pending: documents.filter(d => d.status === 'pending' || d.status === 'pending_approval').length,
      approved: documents.filter(d => d.status === 'approved').length,
      rejected: documents.filter(d => d.status === 'rejected').length,
      not_started: documents.filter(d => d.status === 'not_started').length
    }
  });
});
app.get('/api/bid-tracker/users', (req, res) => {
  try {
    const userData = loadUserData();
    if (!userData) {
      return res.status(500).json({
        success: false,
        message: 'Unable to load user data'
      });
    }
    const activeUsers = userData.users.filter(user => user.Status === 'Active');
    const formattedUsers = activeUsers.map(user => ({
      UserID: user.UserID,
      username: user.Username,
      firstName: user.FullName?.split(' ')[0] || user.Username,
      lastName: user.FullName?.split(' ').slice(1).join(' ') || '',
      fullName: user.Name || user.FullName || [user.FirstName, user.LastName].filter(Boolean).join(' ') || user.Username,
      userType: user.UserType,
      department: user.Department,
      email: user.Email || user.email || user.EmailID || user['E-Mail'] || user.EmailAddress || ''
    }));
    res.json({
      success: true,
      users: formattedUsers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to load users',
      error: error.message
    });
  }
});

// ── Admin-only: user info without any bid data ──
app.get('/api/admin/users', (req, res) => {
  try {
    const userData = loadUserData();
    if (!userData) return res.status(500).json({ success: false, message: 'Unable to load user data' });
    const users = userData.users.map(user => ({
      UserID:     user.UserID,
      username:   user.Username,
      fullName:   user.FullName || user.Name || user.Username,
      userType:   user.UserType,
      department: user.Department || '',
      status:     user.Status || 'Active',
      lastLogin:  user.LastLogin || null,
      portalAccess:  user['Portal Access'] === 'Yes' || user['Portal Access'] === true,
      trackerAccess: user['Tracker Access'] === 'Yes' || user['Tracker Access'] === true
    }));
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load users', error: err.message });
  }
});

app.get('/api/bid-tracker/bid', (req, res) => {
  try {
    const bidId = req.query.id;
    if (!bidId) return res.status(400).json({ success: false, message: 'Missing bid id' });
    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === bidId);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
    const documents = [];
    if (bid.docMeta) {
      Object.values(bid.docMeta).forEach(meta => {
        documents.push({
          type: meta.type,
          category: meta.category,
          name: meta.name,
          status: meta.status || '',
          notes: meta.notes || '',
          attachment: meta.attachment,
          url: meta.url,
          uploadDate: meta.updatedAt,
          approvalStatus: meta.approvalStatus || 'Pending Review',
          priority: meta.priority || '',
          section: meta.section || '',
          assignedTo: meta.assignedTo || '',
          dueDate: meta.dueDate || '',
          isFinalized: meta.isFinalized || false,
          finalizedBy: meta.finalizedBy || null,
          finalizedAt: meta.finalizedAt || null,
          tee: meta.tee || '',
          fee: meta.fee || '',
          pee: meta.pee || '',
          priorities: meta.priorities || {
            tee: { slNo: '', category: '' },
            fee: { slNo: '', category: '' },
            pee: { slNo: '', category: '' }
          }
        });
      });
    }
    if (documents.length > 0) {
    }
    const formattedBid = {
      ...bid,
      bidId: bid.id,
      bidName: bid.name,
      documents: documents,
      docTypes: bid.docTypes || []
    };
    res.json({ success: true, bid: formattedBid });
  } catch (error) {
    console.error('Get bid error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve bid', error: error.message });
  }
});
app.get('/api/bid-tracker/bids/:id', (req, res) => {
  try {
    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === req.params.id);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
    const documents = [];
    if (bid.docMeta) {
      Object.values(bid.docMeta).forEach(meta => {
        documents.push({
          type: meta.type,
          category: meta.category,
          name: meta.name,
          status: meta.status || '',
          notes: meta.notes || '',
          attachment: meta.attachment,
          url: meta.url,
          uploadDate: meta.updatedAt,
          approvalStatus: meta.approvalStatus || 'Pending Review',
          priority: meta.priority || '',
          section: meta.section || '',
          assignedTo: meta.assignedTo || '',
          dueDate: meta.dueDate || '',
          isFinalized: meta.isFinalized || false,
          finalizedBy: meta.finalizedBy || null,
          finalizedAt: meta.finalizedAt || null,
          tee: meta.tee || '',
          fee: meta.fee || '',
          pee: meta.pee || '',
          priorities: meta.priorities || {
            tee: { slNo: '', category: '' },
            fee: { slNo: '', category: '' },
            pee: { slNo: '', category: '' }
          }
        });
      });
    }
    const formattedBid = {
      ...bid,
      bidId: bid.id,
      bidName: bid.name,
      documents: documents,
      docTypes: bid.docTypes || []
    };
    res.json({ success: true, bid: formattedBid });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve bid', error: error.message });
  }
});
app.get('/api/bid-tracker/attachments', (req, res) => {
  try {
    const bidId = req.query.bidId;
    if (!bidId) return res.status(400).json({ success: false, message: 'Missing bidId parameter' });
    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === bidId);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
    const attachments = [];
    if (bid.docMeta) {
      Object.values(bid.docMeta).forEach(meta => {
        if (meta.attachment) {
          attachments.push({
            type: meta.type,
            category: meta.category,
            name: meta.name,
            attachment: meta.attachment,
            url: meta.url,
            uploadDate: meta.updatedAt,
            uploadedBy: meta.uploadedBy,
            status: meta.status || '',
            notes: meta.notes || '',
            approvalStatus: meta.approvalStatus || 'Pending Review'
          });
        }
      });
    }
    res.json({ success: true, attachments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve attachments', error: error.message });
  }
});
app.post('/api/create-priority-zip', async (req, res) => {
  try {
    const { files, zipFileName, folderName } = req.body || {};
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }
    const safeItems = [];
    for (const f of files) {
      const rawPath = f.filePath;
      const fileName = (f.fileName || 'document').toString();
      const priority = (f.priority || '').toString();
      const sheet = (f.sheet || '').toString();
      const cleanedPath = cleanAndValidateFilePath(rawPath);
      if (!cleanedPath) continue;
      if (!isPathAllowed(cleanedPath)) continue;
      try {
        const st = fs.statSync(cleanedPath);
        if (!st.isFile()) continue;
      } catch {
        continue;
      }
      const folder = (folderName || 'Priority_Files').toString().replace(/[<>:"|?*\\\/]/g, '_');
      const prfx = priority ? `${priority} - ` : '';
      const sfx = sheet ? `${sheet} - ` : '';
      const entryName = `${folder}/${prfx}${sfx}${fileName}`.replace(/\s+/g, ' ').trim();
      safeItems.push({ absPath: cleanedPath, entryName });
    }
    if (safeItems.length === 0) {
      return res.status(404).json({ error: 'No downloadable files were valid or accessible' });
    }
    const zipName = (zipFileName || 'Priority_Files.zip').replace(/[^\w.\- ]/g, '');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', err => {
      if (!res.headersSent) res.status(500).end();
    });
    archive.pipe(res);
    for (const item of safeItems) {
      archive.file(item.absPath, { name: item.entryName });
    }
    await archive.finalize();
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create zip', details: err.message });
    }
  }
});
app.post('/api/bid-tracker/add-document', (req, res) => {
  try {
    const { bidId, documentType, category, document, attachment, url,
            status, notes, priority, section, assignedTo, dueDate } = req.body;
    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === bidId);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
    // Hard block — cannot add docs to an approved/finalized bid
    if (bid.status === 'Approved') {
      return res.status(403).json({ success: false, message: 'Bid is finalized — no new documents can be added' });
    }
    bid.docMeta = bid.docMeta || {};
    const key = toDocKey(documentType, category, document);
    bid.docMeta[key] = {
      type: documentType,
      category: category,
      name: document,
      attachment: attachment || null,
      url: url || null,
      status: status || '',
      notes: notes || '',
      priority: priority || '',
      section: section || '',
      assignedTo: assignedTo || '',
      dueDate: dueDate || '',
      tee: '', fee: '', pee: '',
      isFinalized: false,
      finalizedBy: null, finalizedAt: null,
      approvalStatus: 'Pending Review',
      uploadedBy: null, uploadDate: null,
      updatedAt: new Date().toISOString(),
    };
    ensureDocTypeInBid(bid, documentType, category, document);
    const saved = saveTrackerBids(data);
    if (!saved) return res.status(500).json({ success: false, message: 'Failed to persist add' });
    return res.json({ success: true, saved: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to add document', error: error.message });
  }
});
app.post('/api/bid-tracker/update-bid', (req, res) => {
  try {
    const { bidId, deadline, teamMembers, docTypes, documents, userId } = req.body;
    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === bidId);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
    if (deadline) bid.deadline = deadline;
    if (teamMembers) bid.teamMembers = teamMembers;
    if (docTypes) bid.docTypes = docTypes;
        if (documents && Array.isArray(documents)) {
        const oldMeta = bid.docMeta || {};
        // Start with ALL existing docs — never drop any (manually added docs must survive)
        const newMeta = { ...oldMeta };
        documents.forEach(doc => {
        const key = toDocKey(doc.type, doc.category, doc.name);
        const prev = oldMeta[key] || {};
        newMeta[key] = {
          type: doc.type,
          category: doc.category,
          name: doc.name,
          section: doc.section ?? prev.section ?? '',
          assignedTo: doc.assignedTo ?? prev.assignedTo ?? '',
          dueDate: doc.dueDate ?? prev.dueDate ?? '',
          attachment: doc.attachment ?? prev.attachment ?? null,
          url: doc.url ?? prev.url ?? null,
          // Status: NEVER downgrade a terminal state (Approved/Rejected/In Review)
          // Priority: Approved > Rejected > In Review > Added Attachment > ''
          status: (() => {
            const ps = (prev.status || '').trim();
            const ds = (doc.status || '').trim();
            // Terminal states — never overwrite
            if (ps === 'Approved')  return 'Approved';
            if (ps === 'Rejected')  return 'Rejected';
            if (ps === 'In Review') return ds || 'In Review'; // manager may clear it
            // Non-terminal: use doc value if provided, else keep prev
            return ds || ps;
          })(),
          notes: doc.notes ?? prev.notes ?? '',
          uploadedBy: doc.uploadedBy ?? prev.uploadedBy ?? null,
          uploadDate: prev.uploadDate ?? doc.uploadDate ?? null,
          // isFinalized: never un-finalize an approved doc
          isFinalized: (() => {
            if (prev.status === 'Approved') return true; // always finalized if approved
            if (doc.isFinalized !== undefined) return doc.isFinalized;
            return prev.isFinalized ?? false;
          })(),
          finalizedBy: doc.finalizedBy ?? prev.finalizedBy ?? null,
          finalizedAt: doc.finalizedAt ?? prev.finalizedAt ?? null,
          // approvalStatus: never overwrite Document Approved from update-bid
          approvalStatus: (() => {
            if (prev.approvalStatus === 'Document Approved') return 'Document Approved';
            if (prev.approvalStatus === 'Document Rejected') return 'Document Rejected';
            return doc.approvalStatus || prev.approvalStatus || 'Pending Review';
          })(),
          priorities: doc.priorities ?? prev.priorities ?? {},
          tee: doc.tee ?? prev.tee ?? '',
          fee: doc.fee ?? prev.fee ?? '',
          pee: doc.pee ?? prev.pee ?? '',
          // Preserve rejection info
          rejectedAt: prev.rejectedAt ?? null,
          rejectedBy: prev.rejectedBy ?? null,
        };
        newMeta[key].updatedAt = new Date().toISOString();
      });
        // Merge: keep any docs in oldMeta that weren't in the sent list
        // (manually added docs, docs from other sources)
        bid.docMeta = newMeta;
    }
    bid.lastUpdated = new Date().toISOString();

    // Detect newly uploaded documents — compare new vs old attachment fields
    const newlyUploaded = [];
    if (documents && Array.isArray(documents)) {
      documents.forEach(doc => {
        const key = toDocKey(doc.type, doc.category, doc.name);
        const prev = (bid.docMeta && bid.docMeta[key]) || {};
        const hadFile  = !!prev.attachment;
        const hasFile  = !!(doc.attachment ?? prev.attachment);
        if (hasFile && !hadFile) {
          // New file just attached
          newlyUploaded.push({ doc, key });
        }
      });
    }

    const saved = saveTrackerBids(data);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Failed to persist update-bid (tracker file not updated)'
      });
    }

    // Send email notifications for each newly uploaded document
    if (newlyUploaded.length > 0) {
      const userData = loadUserData();
      const uploadedByUser = userId ? userData?.users?.find(u => u.UserID === userId) : null;
      newlyUploaded.forEach(({ doc }) => {
        setImmediate(() => sendDocumentUploadNotification({
          bid,
          docType:        doc.type,
          category:       doc.category,
          docName:        doc.name,
          uploadedByUser: uploadedByUser
        }));
      });
    }

    return res.json({ success: true, saved: true });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update bid', error: error.message });
  }
});
// app.post('/api/bid-tracker/finalize-document', (req, res) => {
//   try {
//     const { bidId, type, category, name, finalize } = req.body || {};
//     if (!bidId || !type || !category || !name || typeof finalize === 'undefined') {
//       return res.status(400).json({ success: false, message: 'bidId, type, category, name, finalize are required' });
//     }
//     const data = getTrackerBids();
//     const bid = data.bids.find(b => b.id === bidId);
//     if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
//     const key = toDocKey(type, category, name);
//     bid.docMeta = bid.docMeta || {};
//     const meta = bid.docMeta[key];
//     if (!meta) return res.status(404).json({ success: false, message: 'Document not found in bid' });
//     meta.isFinalized = finalize;
//     if (finalize) {
//       meta.finalizedAt = new Date().toISOString();
//       meta.finalizedBy = req.body.finalizedBy || 'system';
//     } else {
//       meta.finalizedAt = null;
//       meta.finalizedBy = null;
//     }
//     meta.updatedAt = new Date().toISOString();
//     bid.lastUpdated = new Date().toISOString();
//     const saved = saveTrackerBids(data);
//     if (!saved) {
//       return res.status(500).json({
//         success: false,
//         message: 'Failed to persist finalize (tracker file not updated)'
//       });
//     }
//     return res.json({ success: true, ok: true, saved: true });

//   } catch (error) {
//     return res.status(500).json({ success: false, message: 'Failed to finalize document', error: error.message });
//   }
// });
app.post('/api/bid-tracker/finalize-document', (req, res) => {
  try {
    const { bidId, type, category, name, finalize, userId, userRole, resetStatus } = req.body || {};
    if (!bidId || !type || !category || !name || typeof finalize === 'undefined') {
      return res.status(400).json({ success: false, message: 'bidId, type, category, name, finalize are required' });
    }

    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === bidId);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });

    const key = toDocKey(type, category, name);
    bid.docMeta = bid.docMeta || {};
    const meta = bid.docMeta[key];
    if (!meta) return res.status(404).json({ success: false, message: `Document not found. Key: "${key}"` });

    // Use role sent from client (already authenticated via session)
    const actingRole = userRole || '';
    const isManager = /manager|director|admin/i.test(actingRole);

    // ── Update finalization status using SEPARATE flags ──
    // engineerFinalized — controls engineer upload lock + submit flow
    // managerFinalized  — manager's own reference, independent
    // isFinalized       — kept in sync with engineerFinalized for backward compat

    if (finalize) {
      // Finalize
      if (isManager) {
        meta.managerFinalized = true;
        meta.managerFinalizedAt = new Date().toISOString();
        meta.managerFinalizedBy = userId;
      } else {
        // Engineer finalize
        meta.engineerFinalized = true;
        meta.isFinalized = true;  // keep in sync
        meta.finalizedAt = new Date().toISOString();
        meta.finalizedBy = userId;
        // Reset status when re-finalizing after rejection
        if (resetStatus || meta.status === 'Rejected') {
          meta.status = STATUS.ADDED;
        }
      }
    } else {
      // Unfinalize
      if (isManager) {
        meta.managerFinalized = false;
        meta.managerFinalizedAt = null;
        meta.managerFinalizedBy = null;
      } else {
        // Engineer unfinalize — reset their flow
        meta.engineerFinalized = false;
        meta.isFinalized = false;  // keep in sync
        meta.finalizedAt = null;
        meta.finalizedBy = null;
        // Reset status so engineer can re-upload and re-submit
        if (meta.status === STATUS.REVIEW || meta.status === '' || resetStatus) {
          meta.status = meta.attachment ? STATUS.ADDED : '';
        }
      }
    }
    
    meta.updatedAt = new Date().toISOString();
    bid.lastUpdated = new Date().toISOString();
    
    const saved = saveTrackerBids(data);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Failed to persist finalize (tracker file not updated)'
      });
    }

    // Notify managers when an engineer finalizes a document
    if (finalize && !isManager) {
      const allUsers2 = loadUserData()?.users || [];
      const engineerUser = allUsers2.find(u => u.UserID === userId) || null;
      setImmediate(() => sendDocumentFinalizedNotification({
        bid, docType: type, category, docName: name, engineerUser
      }));
    }

    return res.json({ success: true, ok: true, saved: true });

  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to finalize document', error: error.message });
  }
});

app.post('/api/bid-tracker/upload-document', upload.single('file'), async (req, res) => {
  try {
    const { bidId, type, category, name } = req.body;
    const storedName = req.file.filename;
    const destPath = path.join('uploads', storedName);
    await fs.promises.copyFile(req.file.path, destPath);
    const url = `/view?path=${encodeURIComponent(destPath)}`;
    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === bidId);
    if (bid) {
      const key = toDocKey(type, category, name);
      bid.docMeta = bid.docMeta || {};
      if (bid.docMeta[key]) {
        bid.docMeta[key].status = 'In Review';
        bid.docMeta[key].updatedAt = new Date().toISOString();
      }
      const saved = saveTrackerBids(data);
      if (!saved) {
        return res.status(500).json({
          success: false,
          message: 'Failed to persist upload-document (tracker file not updated)'
        });
      }
    }
    return res.json({ success: true, saved: true, filename: storedName, url, finalPath: destPath });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'File upload failed', error: error.message });
  }
});
app.post('/api/bid-tracker/document-upload', docUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
    const { bidId, bidName, type, category, name } = req.body;
    if (!bidId || !type || !category || !name) {
      return res.status(400).json({ success: false, message: 'Missing bidId/type/category/name' });
    }
    const data = getTrackerBids();
    const bid = (data.bids || []).find(b => b.id === bidId);
    const finalBidName = safeSeg(bid?.name || bid?.bidName || bidName || 'Bid');
    const newBidsRoot = activeConfig.trackerBidsPath ||
      (activeConfig.allowedDownloadPaths || []).find(p => /new_bids/i.test(p)) ||
      (activeConfig.allowedDownloadPaths || [])[0];
    if (!newBidsRoot) {
      return res.status(500).json({ success: false, message: 'No allowed path configured for uploads' });
    }
    const destDir = path.join(newBidsRoot, finalBidName, safeSeg(type), safeSeg(category));
    try { await fs.promises.mkdir(destDir, { recursive: true }); } catch {}
    const originalExt = path.extname(req.file.originalname);
    const originalBase = path.basename(req.file.originalname, originalExt).replace(/[^a-z0-9._-]/gi, '_');
    const storedName = `${originalBase}${originalExt}`;
    const destPath = path.join(destDir, storedName);
    await fs.promises.copyFile(req.file.path, destPath);
    const url = `/view?path=${encodeURIComponent(destPath)}`;
    res.json({ success: true, filename: storedName, url, finalPath: destPath });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Upload failed', error: e.message });
  }
});
app.post('/api/bid-tracker/document-update', (req, res) => {
  try {
    const { bidId, type, category, name, status, notes, attachment, url, priorities, tee, fee, pee } = req.body || {};
    if (!bidId || !type || !category || !name) {
      return res.status(400).json({ success: false, message: 'Missing bidId/type/category/name' });
    }
    const data = getTrackerBids();
    const idx = (data.bids || []).findIndex(b => b.id === bidId);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Bid not found' });
    const bid = data.bids[idx];
    bid.docMeta = bid.docMeta || {};
    const key = toDocKey(type, category, name);
    const prev = bid.docMeta[key] || {};
    // Merge: keep ALL existing fields, only override what was explicitly sent
    bid.docMeta[key] = {
      ...prev,
      type, category, name,
      // NEVER downgrade from Approved or Rejected
      status: (() => {
        const ps = (prev.status || '').trim();
        const ds = (status !== undefined ? status : ps);
        if (ps === 'Approved' || ps === 'Rejected') return ps;
        return ds || ps;
      })(),
      notes:          notes         !== undefined ? notes         : (prev.notes  || ''),
      attachment:     attachment    !== undefined ? attachment    : (prev.attachment || null),
      url:            url           !== undefined ? url           : (prev.url || null),
      tee:            tee           !== undefined ? tee           : (prev.tee || ''),
      fee:            fee           !== undefined ? fee           : (prev.fee || ''),
      pee:            pee           !== undefined ? pee           : (prev.pee || ''),
      // Preserve finalization and approval — never reset via document-update
      isFinalized:    (prev.status === 'Approved') ? true : (prev.isFinalized ?? false),
      finalizedBy:    prev.finalizedBy ?? null,
      finalizedAt:    prev.finalizedAt ?? null,
      approvalStatus: prev.approvalStatus === 'Document Approved' ? 'Document Approved' :
                      (prev.approvalStatus || 'Pending Review'),
      updatedAt:      new Date().toISOString()
    };
    const allMeta = Object.values(bid.docMeta);
    bid.documentsRequired = countRequiredDocs(bid.docTypes);
    bid.documentsApproved = allMeta.filter(m => (m.status || '').trim() === 'Approved').length;
    bid.documentsRejected = allMeta.filter(m => (m.status || '').trim() === 'Rejected').length;
    bid.documentsPending = Math.max(bid.documentsRequired - bid.documentsApproved - bid.documentsRejected, 0);
    bid.lastUpdated = new Date().toISOString();
    const isNewUpload = attachment && !prev.attachment;  // attachment just added
    const saved = saveTrackerBids(data);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Failed to persist document update (tracker file not updated)'
      });
    }

    // Send email notification when a file is newly uploaded
    if (isNewUpload) {
      const userData = loadUserData();
      const uploadedByUser = userData?.users?.find(u => u.UserID === bid.docMeta[key]?.uploadedBy) || null;
      setImmediate(() => sendDocumentUploadNotification({
        bid, docType: type, category, docName: name, uploadedByUser
      }));
    }

    return res.json({ success: true, saved: true });

  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to update document', error: e.message });
  }
});

app.post('/api/bid-tracker/remove-document', (req, res) => {
  const { bidId, type, category, name } = req.body || {};
  const data = getTrackerBids();
  const bid = (data.bids || []).find(b => b.id === bidId);
  if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });

  const norm = s => (s || '')
    .toString()
    .replace(/\s*_\s*/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Remove from docTypes using normalized comparisons
  const t = (bid.docTypes || []).find(x => norm(x.type) === norm(type));
  const c = t?.categories?.find(x => norm(x.category) === norm(category));
  if (c) {
    c.names = (c.names || []).filter(n => norm(n) !== norm(name));
    if (!c.names.length) {
      t.categories = (t.categories || []).filter(x => x !== c);
    }
    if (!t.categories || !t.categories.length) {
      bid.docTypes = (bid.docTypes || []).filter(x => x !== t);
    }
  }

  // Remove matching docMeta entry (normalize stored keys)
  if (bid.docMeta) {
    const target = [type, category, name].map(norm).join('||');
    for (const k of Object.keys(bid.docMeta)) {
      const parts = (k || '').split('||');
      const kNorm = [parts[0] || '', parts[1] || '', parts[2] || ''].map(norm).join('||');
      if (kNorm === target) {
        delete bid.docMeta[k];
        break;
      }
    }
  }

  const allMeta = Object.values(bid.docMeta || {});
  bid.documentsRequired = countRequiredDocs(bid.docTypes);
  bid.documentsApproved = allMeta.filter(m => (m.status || '').trim() === 'Approved').length;
  bid.documentsRejected = allMeta.filter(m => (m.status || '').trim() === 'Rejected').length;
  bid.documentsPending = Math.max(bid.documentsRequired - bid.documentsApproved - bid.documentsRejected, 0);
  bid.lastUpdated = new Date().toISOString();

  const saved = saveTrackerBids(data);
  if (!saved) {
    return res.status(500).json({
      success: false,
      message: 'Failed to persist deletion (tracker file not updated)'
    });
  }
  return res.json({ success: true, saved: true });
});

app.post('/api/bid-tracker/document-approve', (req, res) => {
  try {
    const { bidId, type, category, name, action } = req.body || {};
    if (!bidId || !type || !category || !name || !action) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === bidId);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
    bid.docMeta = bid.docMeta || {};
    const key = toDocKey(type, category, name);
    const meta = bid.docMeta[key];
    if (!meta) {
      // Log what keys exist to help debug
      const available = Object.keys(bid.docMeta).slice(0, 5);
      console.error(`[Approve] Key not found: "${key}". First 5 keys: ${JSON.stringify(available)}`);
      return res.status(404).json({ success: false, message: `Document not found. Key: "${key}"` });
    }
    if (action === 'approve') {
      meta.status         = STATUS.APPROVED;
      meta.approvalStatus = APPROVAL_STATUS.APPROVED;
      meta.rejectedAt     = null;
      meta.rejectedBy     = null;
    } else if (action === 'reject') {
      meta.status         = STATUS.REJECTED;   // was '' — now correctly 'Rejected'
      meta.approvalStatus = APPROVAL_STATUS.REJECTED;
      meta.isFinalized    = false;             // reset so engineer must re-finalize
      meta.rejectedAt     = new Date().toISOString();
    }
    meta.updatedAt = new Date().toISOString();
    bid.lastUpdated = new Date().toISOString();
    recomputeBidDocCounts(bid);
    const saved = saveTrackerBids(data);
    if (!saved) {
      return res.status(500).json({
        success: false,
        message: 'Failed to persist document-approve (tracker file not updated)'
      });
    }
    return res.json({ success: true, saved: true });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to approve/reject document', error: error.message });
  }
});
app.post('/api/bid-tracker/approve-bid', (req, res) => {
  const { bidId, userId } = req.body || {};
  if (!bidId || !userId) {
    return res.status(400).json({ success: false, message: 'Missing bidId or userId' });
  }
  const userData = loadUserData();
  const user = userData?.users?.find(u => u.UserID === userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const role = user.UserType;
  const allowed = ['Manager', 'Admin', 'Director'].includes(role);
  if (!allowed) {
    return res.status(403).json({ success: false, message: 'Only Manager/Admin/Director can approve bids' });
  }
  const data = getTrackerBids();
  const bid = (data.bids || []).find(b => b.id === bidId);
  if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
  bid.status = 'Approved';
  bid.lastUpdated = new Date().toISOString();

  const saved = saveTrackerBids(data);
  if (!saved) {
    return res.status(500).json({
      success: false,
      message: 'Failed to persist approve-bid (tracker file not updated)'
    });
  }
  return res.json({ success: true, saved: true });
});

app.post('/api/bid-tracker/generate-master-file', async (req, res) => {
  try {
    // 1. Log initial request
    console.log('=== MASTER FILE GENERATION STARTED ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { bidId } = req.body || {};
    if (!bidId) {
      console.log('ERROR: Missing bidId in request');
      return res.status(400).json({ success: false, message: 'Missing bidId' });
    }
    console.log('Processing bidId:', bidId);

    // 2. Log bid lookup
    const data = getTrackerBids();
    console.log('Total bids in tracker:', data.bids.length);
    
    const bid = (data.bids || []).find(b => b.id === bidId);
    if (!bid) {
      console.log('ERROR: Bid not found. Available bid IDs:', data.bids.map(b => b.id));
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }
    console.log('Found bid:', bid.name);

    // 3. Log path setup
    const trackerBidsPath = activeConfig.trackerBidsPath || 
      path.join(activeConfig.baseBidsProposalPath, 'New_Bids_Test');
    console.log('Tracker bids path:', trackerBidsPath);
    
    const bidRootDir = path.join(trackerBidsPath, safeSeg(bid.name || bid.bidName || 'Bid'));
    console.log('Output directory:', bidRootDir);
    
    await fs.promises.mkdir(bidRootDir, { recursive: true });
    console.log('Directory created/verified');

    // 4. Log document extraction
    console.log('=== EXTRACTING DOCUMENT DATA ===');
    const wb = XLSX.utils.book_new();
    const docRows = [];
    
    if (bid.docMeta && typeof bid.docMeta === 'object') {
      console.log('Processing docMeta with', Object.keys(bid.docMeta).length, 'entries');
      
      Object.values(bid.docMeta).forEach((meta, index) => {
        console.log(`Document ${index + 1}:`, {
          type: meta.type,
          category: meta.category, 
          name: meta.name,
          tee: meta.tee,
          fee: meta.fee,
          pee: meta.pee
        });
        
        docRows.push({
          type: meta.type || '',
          category: meta.category || '',
          name: meta.name || '',
          status: meta.status || '',
          notes: meta.notes || '',
          attachment: meta.attachment || '',
          url: meta.url || '',
          section: meta.section || '',
          assignedTo: meta.assignedTo || '',
          dueDate: meta.dueDate || '',
          priority: meta.priority || '',
          approvalStatus: meta.approvalStatus || 'Pending Review',
          TEE: meta.tee || '',
          FEE: meta.fee || '',
          PEE: meta.pee || '',
          isFinalized: meta.isFinalized || false,
          uploadDate: meta.updatedAt || '',
          uploadedBy: meta.uploadedBy || ''
        });
      });
    } else {
      console.log('WARNING: bid.docMeta is empty or invalid');
      console.log('bid.docMeta type:', typeof bid.docMeta);
      console.log('bid.docMeta value:', bid.docMeta);
    }

    console.log('Total docRows extracted:', docRows.length);

    // 5. Log document types
    const uniqueTypes = [...new Set(docRows.map(r => r.type).filter(Boolean))];
    console.log('Unique document types found:', uniqueTypes);
    
    if (uniqueTypes.length === 0) {
      console.log('ERROR: No document types found - cannot generate sheets');
      return res.status(400).json({ success: false, message: 'No documents found to generate master file' });
    }

    // 6. Helper functions (same as original)
    const safeSheetName = (s) => {
      const name = String(s || 'Sheet').replace(/[:\\/?*\[\]]/g, '').slice(0, 31);
      return name || 'Sheet';
    };

    const buildActualWindowsPath = (rawLink, attachment, docType, category, bidName) => {
      if (!attachment) return '';
      const newBidsRoot = 
        activeConfig.trackerBidsPath ||
        (activeConfig.allowedDownloadPaths || []).find(p => /new_bids/i.test(p)) ||
        (activeConfig.allowedDownloadPaths || [])[0];
      if (!newBidsRoot) return '';
      const safeBidName = safeSeg(bidName || 'Bid');
      const safeType = safeSeg(docType || 'Documents');
      const safeCategory = safeSeg(category || 'Uncategorized');
      const fullPath = path.join(newBidsRoot, safeBidName, safeType, safeCategory, attachment);
      return fullPath.replace(/\//g, '\\');
    };

    // 7. Create sheets for each document type
    console.log('=== CREATING EXCEL SHEETS ===');
    
    uniqueTypes.forEach((typeName, typeIndex) => {
      console.log(`Creating sheet ${typeIndex + 1}: "${typeName}"`);
      
      const sheetLabel = typeName;
      // const displayTitle = (sheetLabel || '').toLowerCase().includes('corporate')
      //   ? 'Corporate Generic Documents'
      //   : `${sheetLabel} Documents`;

      const displayTitle = (sheetLabel || '').toLowerCase().includes('qg')
        ? 'Corporate Generic Documents'
        : `${(sheetLabel || '').charAt(0).toUpperCase() + (sheetLabel || '').slice(1)} Documents`;
      
      const rows = [
        [displayTitle],
        [
          'SI No.', 'Document', 'Section / Clause No.',
          'Readiness Status (Yes/No)', 'Responsibility',
          'Due Date', 'Remarks',
          'Bid Submission Envelope Categorisation',
          '', '', 'Filepath'
        ],
        [
          '', '', '', '', '', '', '',
          'Technical / Commercial Docs\nSl no. & EE category',
          'Financial Bid / Priced BOQ / SOR\nSl no. & EE category', 
          'Physical Submission Documents\nSl no. & PE category',
          ''
        ]
      ];
      
      const typeRows = docRows.filter(r => r.type === typeName);
      const byCategory = new Map();
      for (const r of typeRows) {
        const cat = r.category.trim();
        if (!cat) continue;
        if (!byCategory.has(cat)) {
          byCategory.set(cat, new Map());
        }
        const docName = r.name.trim();
        if (!docName) continue;
        byCategory.get(cat).set(docName, r);
      }
      
      let si = 0;
      const sortedCats = [...byCategory.keys()].sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' })
      );
      
      for (const cat of sortedCats) {
        rows.push(['', cat, '', '', '', '', '', '', '', '', '']);
        const docMap = byCategory.get(cat);
        const sortedDocs = [...docMap.keys()].sort((a, b) =>
          a.localeCompare(b, undefined, { sensitivity: 'base' })
        );
        
        for (const docName of sortedDocs) {
          const r = docMap.get(docName);
          const tee = r.TEE || '';
          const fee = r.FEE || '';
          const pee = r.PEE || '';
          const rawLink = r.url || '';
          const filePathWin = buildActualWindowsPath(
            rawLink,
            r.attachment,
            r.type,
            r.category,
            bid.name
          );
          
          const sectionClause = r.section || '';
          const status = r.status.toLowerCase();
          const approval = r.approvalStatus.toLowerCase();
          const hasFile = !!(r.url || r.attachment);
          const isFinalized = r.isFinalized;
          const readiness = (
            approval.includes('approved') || 
            status === 'approved' || 
            status === 'completed' ||
            isFinalized ||
            hasFile
          ) ? 'Yes' : 'No';
          
          const responsibility = r.assignedTo || r.uploadedBy || '';
          const dueDate = r.dueDate || bid.deadline || '';
          const remarks = r.notes || '';
          
          si += 1;
          rows.push([
            si,
            docName,
            sectionClause,
            readiness,
            responsibility,
            dueDate,
            remarks,
            tee,
            fee,
            pee,
            filePathWin
          ]);
        }
      }
      
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!merges'] = ws['!merges'] || [];
      ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: 10 } });
      ws['!cols'] = [
        { wch: 6 },
        { wch: 160 },
        { wch: 22 },
        { wch: 18 },
        { wch: 18 },
        { wch: 14 },
        { wch: 28 },
        { wch: 28 },
        { wch: 28 },
        { wch: 28 },
        { wch: 580 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, safeSheetName(sheetLabel));
    });

    // 8. Create Priority sheet
    const priorityRows = [['SheetName', 'Priority']];
    const typeSheetNames = uniqueTypes.map(t => safeSheetName(String(t || 'Sheet')));
    typeSheetNames.forEach((sheetName, index) => {
      priorityRows.push([sheetName, index + 1, '']);
    });
    
    const priorityWs = XLSX.utils.aoa_to_sheet(priorityRows);
    priorityWs['!cols'] = [
      { wch: 40 },
      { wch: 10 },
      { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, priorityWs, 'Priority');

    // 9. Create Others sheet
    const othersRows = [
      ['Other Documents'],
      ['SI No.', 'Document', 'Section / Clause No.', 'FilePath']
    ];
    const othersWs = XLSX.utils.aoa_to_sheet(othersRows);
    othersWs['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    othersWs['!cols'] = [
      { wch: 6 },
      { wch: 40 },
      { wch: 22 },
      { wch: 80 }
    ];
    XLSX.utils.book_append_sheet(wb, othersWs, 'Others');

    // 10. Generate file in memory and return directly
    console.log('=== GENERATING FILE FOR DOWNLOAD ===');
    const fileName = `${safeSeg(bid.name || bid.bidName || 'Bid')}_MasterFileChecklist.xlsx`;
    
    // Generate Excel buffer in memory
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    
    // Set headers for file download
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Length', buffer.length);
    
    // Send the file
    res.send(buffer);
    console.log('=== MASTER FILE SENT FOR DOWNLOAD ===');
    console.log('File name:', fileName);
    console.log('Documents processed:', docRows.length);
    console.log('Document types:', uniqueTypes.length);

    // Optional: Still save to disk for backup/logging
    try {
      const trackerBidsPath = activeConfig.trackerBidsPath || 
        path.join(activeConfig.baseBidsProposalPath, 'New_Bids_Test');
      const bidRootDir = path.join(trackerBidsPath, safeSeg(bid.name || bid.bidName || 'Bid'));
      await fs.promises.mkdir(bidRootDir, { recursive: true });
      const outFile = path.join(bidRootDir, fileName);
      
      await fs.promises.writeFile(outFile, buffer);
      console.log('File also saved to disk:', outFile);
      
      // Update master bid list
      const masterListPath = getFilePath('excelFilePath');
      if (masterListPath) {
        const wbLog = XLSX.readFile(masterListPath);
        const sheetName = wbLog.SheetNames[0];
        const sheet = wbLog.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        rows.push([bid.name || bid.bidName || '', outFile]);
        const newSheet = XLSX.utils.aoa_to_sheet(rows);
        wbLog.Sheets[sheetName] = newSheet;
        XLSX.writeFile(wbLog, masterListPath);
        bidDataCache = null;
        bidDataLastLoaded = null;
        console.log('Master bid list updated successfully');
      }
    } catch (backupError) {
      console.warn('File backup/logging failed:', backupError.message);
      // Don't fail the request if backup fails
    }

  } catch (err) {
    console.log('=== MASTER FILE GENERATION FAILED ===');
    console.error('Error details:', err);
    console.error('Error stack:', err.stack);
    
    // Make sure we haven't started streaming yet before sending JSON error
    if (!res.headersSent) {
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to generate master file',
        error: err.message 
      });
    }
   }
  });
app.get('/api/bid-tracker/get-bid/:id', (req, res) => {
  try {
    const data = getTrackerBids();
    const bid = data.bids.find(b => b.id === req.params.id);
    if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
    res.json({ success: true, bid });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve bid', error: error.message });
  }
});
app.get('/api/bid-tracker/get-all-bids/:userId', (req, res) => {
  try {
    const userData = loadUserData();
    const trackerBids = getTrackerBids();
    const user = userData.users.find(u => u.UserID === req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const bids = trackerBids.bids;
    const bidList = bids.map(b => {
      // Compute live stats using the SAME logic as bid-view.js updateProgress()
      const docs = Object.values(b.docMeta || {});
      const req        = docs.length;
      // submitted = has an attachment file (matches bid-view: if (meta.attachment) submitted++)
      const submitted  = docs.filter(d => d.attachment).length;
      const approved   = docs.filter(d => (d.status || '').trim() === 'Approved').length;
      const rejected   = docs.filter(d => ['Rejected','reject'].includes((d.status || '').trim())).length;
      const pendingRev = docs.filter(d => (d.status || '').trim() === 'In Review').length;
      const notStarted = docs.filter(d => !d.attachment).length;

      return {
        id: b.id,
        name: b.name,
        clientName: b.clientName || '',
        description: b.description || '',
        bidUrl: `/bid-tracker/bid-view.html?id=${encodeURIComponent(b.id)}`,
        status: b.status,
        priority: b.priority || '',
        createdBy: b.createdBy,
        createdAt: b.createdAt,
        deadline: b.deadline,
        lastUpdated: b.lastUpdated,
        documentsRequired: req,
        documentsSubmitted: submitted,
        documentsApproved: approved,
        documentsRejected: rejected,
        documentsPendingReview: pendingRev,
        documentsNotStarted: notStarted,
        documentsPending: Math.max(0, req - submitted),
        teamMembers: b.teamMembers || []
      };
    });
    res.json({ success: true, bids: bidList, total: bidList.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to load bid list', error: error.message });
  }
});
app.put('/api/bid-tracker/update-bid/:id', (req, res) => {
  try {
    const bidData = req.body;
    bidData.id = req.params.id;
    const updated = upsertBid(bidData);
    res.json({ success: true, bid: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update bid', error: error.message });
  }
});
app.post('/api/bid-tracker/bid', (req, res) => {
  try {
    const saved = upsertBid(req.body || {});
    const viewUrl = `/bid-tracker/bid-view.html?id=${encodeURIComponent(saved.id)}`;
    res.json({ success: true, bid: saved, viewUrl });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Failed to save bid', error: e.message });
  }
});
app.get('/api/bid-tracker/bid/:id', (req, res) => {
  const data = getTrackerBids();
  const bid = data.bids.find(b => b.id === req.params.id);
  if (!bid) return res.status(404).json({ success: false, message: 'Bid not found' });
  // Recompute live counters from docMeta so the response is always fresh
  const docs = Object.values(bid.docMeta || {});
  const liveStats = {
    documentsRequired:    docs.length,
    documentsSubmitted:   docs.filter(d => d.attachment).length,
    documentsApproved:    docs.filter(d => (d.status||'').trim() === 'Approved').length,
    documentsRejected:    docs.filter(d => ['Rejected','reject'].includes((d.status||'').trim())).length,
    documentsPendingReview: docs.filter(d => (d.status||'').trim() === 'In Review').length,
    documentsNotStarted:  docs.filter(d => !d.attachment).length,
  };
  res.json({ success: true, bid: { ...bid, ...liveStats } });
});
app.get('/api/bid-tracker/list/:userId', (req, res) => {
  const userData = loadUserData();
  const trackerBids = loadTrackerBids();
  if (!userData) return res.status(500).json({ success: false, message: 'Unable to load user data' });
  const user = userData.users.find(u => u.UserID === req.params.userId);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const role = user.UserType;
  const isMgr = ['Manager', 'Admin', 'Director'].includes(role);
  const bids = isMgr ? trackerBids.bids : trackerBids.bids.filter(b => (b.teamMembers || []).includes(user.UserID));
  const withLinks = bids.map(b => ({
    id: b.id,
    name: b.name,
    status: b.status,
    deadline: b.deadline,
    lastUpdated: b.lastUpdated,
    viewUrl: `/bid-tracker/create-bid.html?bidId=${encodeURIComponent(b.id)}`
  }));
  res.json({ success: true, bids: withLinks, total: withLinks.length });
});
app.post('/api/bid-tracker/create-bid', async (req, res) => {
  try {
    const { 
      userId, 
      bidName, 
      deadline, 
      clientName, 
      description, 
      teamMembers, 
      docTypes, 
      documents,
      selectedDocuments,
      excelDocuments
    } = req.body;
    if (!userId || !bidName || !deadline || !docTypes || docTypes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userId, bidName, deadline, or docTypes'
      });
    }
    const trackerBidsPath = activeConfig.trackerBidsPath || path.join(activeConfig.baseBidsProposalPath, 'New_Bids_Test');
    const bidFolderPath = path.join(trackerBidsPath, bidName);
    await fs.promises.mkdir(bidFolderPath, { recursive: true });
    for (const docType of docTypes) {
      const typeFolderPath = path.join(bidFolderPath, docType.type);
      await fs.promises.mkdir(typeFolderPath, { recursive: true });
      for (const category of docType.categories) {
        const categoryFolderPath = path.join(typeFolderPath, category.category);
        await fs.promises.mkdir(categoryFolderPath, { recursive: true });
      }
    }
    const docMeta = {};
    const documentsToProcess = documents || selectedDocuments || excelDocuments || [];
    console.log('Processing documents for bid creation:', documentsToProcess.length);
    documentsToProcess.forEach((doc, index) => {
      console.log(`Processing document ${index + 1}:`, doc);
      const type = doc.type || doc.documentType || '';
      const category = doc.category || '';
      const name = doc.name || doc.document || '';
      if (!type || !category || !name) {
        console.warn('Skipping incomplete document:', doc);
        return;
      }
      const key = toDocKey(type, category, name);
      docMeta[key] = {
        type: type,
        category: category,
        name: name,
        priority: doc.priority || '',
        section: doc.section || doc.sectionClauseNo || '',
        assignedTo: doc.assignedTo || '',
        dueDate: doc.dueDate || '',
        status: '',
        notes: '',
        attachment: null,
        url: null,
        approvalStatus: 'Pending Review',
        uploadDate: doc.uploadDate || null,
        uploadedBy: doc.uploadedBy || null,
        isFinalized: doc.isFinalized || false,
        finalizedBy: doc.finalizedBy || null,
        finalizedAt: doc.finalizedAt || null,
        teeSlNo: doc.teeSlNo || '',
        teeCategory: doc.teeCategory || '',
        feeSlNo: doc.feeSlNo || '',
        feeCategory: doc.feeCategory || '',
        peeSlNo: doc.peeSlNo || '',
        peeCategory: doc.peeCategory || '',
        priorities: {
          tee: { 
            slNo: doc.teeSlNo || doc.priorities?.tee?.slNo || '', 
            category: doc.teeCategory || doc.priorities?.tee?.category || '' 
          },
          fee: { 
            slNo: doc.feeSlNo || doc.priorities?.fee?.slNo || '', 
            category: doc.feeCategory || doc.priorities?.fee?.category || '' 
          },
          pee: { 
            slNo: doc.peeSlNo || doc.priorities?.pee?.slNo || '', 
            category: doc.peeCategory || doc.priorities?.pee?.category || '' 
          }
        },
        tee: doc.tee || '',
        fee: doc.fee || '',
        pee: doc.pee || '',
        updatedAt: new Date().toISOString()
      };
    });
    console.log('Final docMeta for bid creation:', Object.keys(docMeta).length, 'documents');
    const trackerBids = loadTrackerBids();
    const newBid = {
      id: bidName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      name: bidName,
      clientName: clientName,
      description: description,
      deadline: deadline,
      status: 'Planning',
      priority: Math.min(...docTypes.map(dt => dt.priority || 999)),
      teamMembers: teamMembers || [],
      docTypes: docTypes,
      docMeta: docMeta,
      documentsRequired: docTypes.reduce((sum, dt) => 
        sum + dt.categories.reduce((catSum, cat) => 
          catSum + cat.names.length, 0), 0),
      documentsPending: 0,
      documentsApproved: 0,
      documentsRejected: 0,
      documentTypePriorities: req.body.documentTypePriorities || {},
      createdBy: userId,
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      folderPath: bidFolderPath
    };
    console.log('Created bid with docMeta:', Object.keys(newBid.docMeta).length, 'documents');
    trackerBids.bids.push(newBid);
    saveTrackerBids(trackerBids);
    res.json({
      success: true,
      message: 'Bid created successfully',
      bid: newBid,
      folderPath: bidFolderPath,
      documentsProcessed: Object.keys(docMeta).length
    });
  } catch (error) {
    console.error('Create bid error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create bid',
      error: error.message
    });
  }
});
app.get('/view', (req, res) => {
  const rawFilePath = decodeURIComponent(req.query.path);
  if (!rawFilePath) return res.status(400).json({ error: 'Missing "path" query parameter' });
  const cleanedFilePath = cleanAndValidateFilePath(rawFilePath);
  if (!cleanedFilePath) {
    return res.status(400).json({
      error: 'Invalid file path format',
      originalPath: rawFilePath,
      details: 'Path contains invalid characters or format'
    });
  }
  if (!isPathAllowed(cleanedFilePath)) {
    return res.status(403).json({
      error: 'Access denied: file path is not allowed',
      requestedPath: cleanedFilePath,
      originalPath: rawFilePath,
      allowedPaths: activeConfig.allowedDownloadPaths
    });
  }
  fs.stat(cleanedFilePath, (err, stats) => {
    if (err) {
      return res.status(404).json({
        error: 'File not found or inaccessible',
        path: cleanedFilePath,
        originalPath: rawFilePath,
        details: err.message
      });
    }
    if (!stats.isFile()) {
      return res.status(400).json({
        error: 'Path is not a file',
        path: cleanedFilePath
      });
    }
    const fileName = path.basename(cleanedFilePath);
    const ext = path.extname(fileName).toLowerCase();
    let contentType = 'application/octet-stream';
    switch (ext) {
      case '.pdf': contentType = 'application/pdf'; break;
      case '.txt': contentType = 'text/plain'; break;
      case '.doc': contentType = 'application/msword'; break;
      case '.docx': contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
      case '.xls': contentType = 'application/vnd.ms-excel'; break;
      case '.xlsx': contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; break;
      case '.ppt': contentType = 'application/vnd.ms-powerpoint'; break;
      case '.pptx': contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'; break;
      case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
      case '.png': contentType = 'image/png'; break;
      case '.gif': contentType = 'image/gif'; break;
      case '.html': case '.htm': contentType = 'text/html'; break;
      case '.css': contentType = 'text/css'; break;
      case '.js': contentType = 'application/javascript'; break;
      case '.json': contentType = 'application/json'; break;
      case '.xml': contentType = 'application/xml'; break;
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    const fileStream = fs.createReadStream(cleanedFilePath);
    fileStream.on('error', streamError => {
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Error reading file for view',
          details: streamError.message
        });
      }
    });
    fileStream.pipe(res);
  });
});
app.get('/download', (req, res) => {
  const rawFilePath = decodeURIComponent(req.query.path);
  if (!rawFilePath) return res.status(400).json({ error: 'Missing "path" query parameter' });
  const cleanedFilePath = cleanAndValidateFilePath(rawFilePath);
  if (!cleanedFilePath) {
    return res.status(400).json({
      error: 'Invalid file path format',
      originalPath: rawFilePath,
      details: 'Path contains invalid characters or format'
    });
  }
  if (!isPathAllowed(cleanedFilePath)) {
    return res.status(403).json({
      error: 'Access denied: file path is not allowed',
      requestedPath: cleanedFilePath,
      originalPath: rawFilePath,
      allowedPaths: activeConfig.allowedDownloadPaths
    });
  }
  fs.stat(cleanedFilePath, (err, stats) => {
    if (err) {
      return res.status(404).json({
        error: 'File not found or inaccessible',
        path: cleanedFilePath,
        originalPath: rawFilePath,
        details: err.message
      });
    }
    if (!stats.isFile()) {
      return res.status(400).json({
        error: 'Path is not a file',
        path: cleanedFilePath
      });
    }
    const fileName = path.basename(cleanedFilePath);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.download(cleanedFilePath, fileName, err2 => {
      if (err2) {
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Server error during file download',
            details: err2.message
          });
        }
      }
    });
  });
});

app.post('/api/upload-to-network', async (req, res) => {
  try {
    const { sourcePath, fileName, destinationPath, timestamp, bidId, bidName } = req.body || {};

    // Basic body validation
    if (!sourcePath || !fileName || !destinationPath) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: sourcePath, fileName, or destinationPath'
      });
    }

    // --- 1) Resolve & validate SOURCE path (unchanged logic) ---
    const cleanedSourcePath = cleanAndValidateFilePath(sourcePath);
    if (!cleanedSourcePath) {
      return res.status(400).json({
        success: false,
        message: `Invalid source path format: ${sourcePath}`
      });
    }

    let resolvedSourcePath;
    if (path.isAbsolute(cleanedSourcePath)) {
      resolvedSourcePath = cleanedSourcePath;
    } else {
      resolvedSourcePath = resolveFilePath(cleanedSourcePath);
      if (!resolvedSourcePath) {
        for (const allowedPath of activeConfig.allowedDownloadPaths) {
          const testPath = path.join(allowedPath, cleanedSourcePath);
          if (fs.existsSync(testPath)) {
            resolvedSourcePath = testPath;
            break;
          }
        }
      }
    }

    if (!resolvedSourcePath) {
      return res.status(404).json({
        success: false,
        message: `Source file not found: ${sourcePath}`,
        cleanedPath: cleanedSourcePath
      });
    }
    if (!fs.existsSync(resolvedSourcePath)) {
      return res.status(404).json({
        success: false,
        message: `Source file not found: ${resolvedSourcePath}`
      });
    }
    if (!isPathAllowed(resolvedSourcePath)) {
      return res.status(403).json({
        success: false,
        message: `Source file not in allowed paths: ${resolvedSourcePath}`,
        allowedPaths: activeConfig.allowedDownloadPaths
      });
    }

    // --- 2) Determine the BID NAME (no client changes required) ---
    function tryGetBidFromReferer(req) {
      try {
        const ref = req.headers.referer || req.headers.referrer || '';
        if (!ref) return null;
        const u = new URL(ref, 'http://localhost'); // base is required if ref is relative
        const qBidId = u.searchParams.get('bidId');
        return qBidId || null;
      } catch {
        return null;
      }
    }

    // Load tracker bids helper (available in your server)
    const data = getTrackerBids ? getTrackerBids() : { bids: [] };

    // 2a. Prefer explicit bidName, else resolve via bidId, else from Referer
    let finalBidName = (bidName || '').trim();
    let candidateBidId = (bidId || '').trim();

    if (!finalBidName && !candidateBidId) {
      const fromRef = tryGetBidFromReferer(req);
      if (fromRef) candidateBidId = fromRef;
    }

    if (!finalBidName && candidateBidId && data && Array.isArray(data.bids)) {
      const hit = data.bids.find(b => b.id === candidateBidId || b.name === candidateBidId);
      if (hit) finalBidName = hit.name || hit.bidName || candidateBidId;
    }

    if (!finalBidName) {
      // Fallback: still enforce a folder; use generic name
      finalBidName = 'Bid';
    }

    // Sanitize the bid folder name
    const safeBidFolder = safeSeg(finalBidName);

    // --- 3) Compute FINAL destination directory to ensure it's inside the bid folder ---
    // Incoming destinationPath typically looks like:  \\server\share\New_Bids_Test\<SomeFolder>
    // We want: \\server\share\New_Bids_Test\<BidName>\<SomeFolder>
    const destNoTrail = destinationPath.replace(/[\\\/]+$/, '');
    const parts = destNoTrail.split(/[/\\]+/);
    const hasBidFolder = parts.some(p => p.toLowerCase() === safeBidFolder.toLowerCase());

    // If already contains bid folder, use as-is; else insert bid folder before the last segment
    const baseDir = path.dirname(destNoTrail);
    const lastSeg = path.basename(destNoTrail);
    const finalDestDir = hasBidFolder
      ? destNoTrail
      : path.join(baseDir, safeBidFolder, lastSeg);

    // Ensure the destination directory exists
    try {
      await fs.promises.mkdir(finalDestDir, { recursive: true });
    } catch (e) {
      // Swallow mkdir errors here; copyFile will surface actionable errors below
    }

    const destinationFilePath = path.join(finalDestDir, fileName);

    // --- 4) Perform the copy + optional timestamping ---
    try {
      await fs.promises.copyFile(resolvedSourcePath, destinationFilePath);

      if (timestamp) {
        const fileDate = new Date(parseInt(timestamp, 10));
        if (!isNaN(fileDate.getTime())) {
          await fs.promises.utimes(destinationFilePath, fileDate, fileDate);
        }
      }

      return res.json({
        success: true,
        message: 'File transferred successfully',
        finalPath: destinationFilePath,
        sourcePath: resolvedSourcePath,
        timestamp: timestamp || null,
        bidFolder: safeBidFolder,
      });
    } catch (error) {
      let errorMessage = 'Failed to copy file to network location';
      if (error.code === 'ENOENT') {
        errorMessage = 'Network path not accessible or does not exist';
      } else if (error.code === 'EACCES') {
        errorMessage = 'Permission denied - check network folder permissions';
      } else if (error.code === 'ENOSPC') {
        errorMessage = 'Not enough space on destination';
      }
      return res.status(500).json({
        success: false,
        message: errorMessage,
        error: error.message,
        sourcePath: resolvedSourcePath,
        destinationPath: destinationFilePath
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error during file transfer',
      error: error.message
    });
  }
});

app.post('/api/create-network-folder', async (req, res) => {
  try {
    const { folderPath } = req.body;
    if (!folderPath) {
      return res.status(400).json({
        success: false,
        message: 'folderPath is required'
      });
    }
    await fs.promises.mkdir(folderPath, { recursive: true });
    res.json({
      success: true,
      message: 'Folder created successfully',
      folderPath: folderPath
    });
  } catch (error) {
    let errorMessage = 'Failed to create network folder';
    if (error.code === 'ENOENT') {
      errorMessage = 'Network path not accessible';
    } else if (error.code === 'EACCES') {
      errorMessage = 'Permission denied - cannot create folder';
    }
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: error.message
    });
  }
});

app.get('/api/health', (req, res) => {
  const userData = loadUserData();
  const bidData = loadBidData();
  const trackerBids = loadTrackerBids();
  let userDataStatus = 'error';
  let accessStats = null;
  let bidStats = null;
  if (userData) {
    userDataStatus = 'loaded';
    accessStats = {
      totalUsers: userData.users.length,
      portalUsers: userData.users.filter(u => checkUserAccess(u).portal).length,
      trackerUsers: userData.users.filter(u => checkUserAccess(u).tracker).length,
      bothAccess: userData.users.filter(u => {
        const access = checkUserAccess(u);
        return access.portal && access.tracker;
      }).length,
      noAccess: userData.users.filter(u => !checkUserAccess(u).hasAnyAccess).length
    };
  }
  if (bidData) {
    bidStats = {
      totalBids: bidData.bids.length,
      accessibleBids: bidData.bids.filter(b => validateBidFile(b.filePath) && isPathAllowed(b.filePath)).length,
      fileNotFound: bidData.bids.filter(b => !validateBidFile(b.filePath)).length,
      pathNotAllowed: bidData.bids.filter(b => validateBidFile(b.filePath) && !isPathAllowed(b.filePath)).length,
      lastUpdated: bidData.lastUpdated,
      trackerBids: trackerBids.bids.length,
      trackerLastUpdated: trackerBids.lastUpdated
    };
  }
  res.json({
    status: 'healthy',
    port: PORT,
    host: HOST,
    environment: currentEnv,
    bidMasterFile: getFilePath('excelFilePath'),
    userDataFile: getFilePath('userDataFilePath'),
    allowedPaths: activeConfig.allowedDownloadPaths,
    userDataStatus: userDataStatus,
    activeSessions: activeSessions.size,
    accessStats: accessStats,
    bidStats: bidStats,
    projectFolders: discoverProjectFolders(),
    timestamp: new Date().toISOString()
  });
});
app.use((err, req, res, next) => {
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.path
  });
});

// Debug endpoint — check email config and recipient list
app.get('/api/debug/email-check', (req, res) => {
  try {
    const userData = loadUserData();
    const getEmail = u => (u.Email || u.email || u.EmailID || u['E-Mail'] || u.EmailAddress || '').toString().trim();
    const users = (userData?.users || []).map(u => ({
      name: u.FullName || u.Username,
      role: u.UserType,
      email: getEmail(u) || '(no email)',
      allKeys: Object.keys(u)
    }));
    const cfg = activeConfig.email || {};
    res.json({
      emailEnabled: cfg.enabled,
      smtpHost: cfg.smtp?.host,
      smtpUser: cfg.smtp?.user,
      smtpPassSet: !!(cfg.smtp?.pass && cfg.smtp.pass !== 'your-app-password'),
      notifyRoles: cfg.notifyRoles,
      users
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Test email endpoint — call this to verify SMTP works
// GET http://172.17.1.20:5003/api/debug/test-email?to=your@email.com
app.get('/api/debug/test-email', async (req, res) => {
  try {
    const transport = getMailTransport();
    if (!transport) {
      return res.json({
        success: false,
        reason: 'SMTP not configured — check config.json email.smtp settings (host/user/pass)',
        currentConfig: {
          host: activeConfig.email?.smtp?.host,
          user: activeConfig.email?.smtp?.user,
          passSet: !!(activeConfig.email?.smtp?.pass && activeConfig.email?.smtp?.pass !== 'your-app-password')
        }
      });
    }
    const to = req.query.to || activeConfig.adminEmail || 'admin@quadgenwireless.com';
    await transport.sendMail({
      from: activeConfig.email?.from || 'QG BMS <no-reply@quadgenwireless.com>',
      to,
      subject: '[QG BMS] Test email — SMTP working ✅',
      text: 'If you received this, email notifications are configured correctly.',
      html: '<h2>QG BMS Email Test</h2><p>SMTP is working correctly. You will receive upload notifications.</p>'
    });
    res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});
app.listen(PORT, HOST, () => {
  console.log(`Server started on ${HOST}:${PORT} (${currentEnv} environment)`);
  const bidData = loadBidData();
  const trackerBids = loadTrackerBids();
  if (bidData)      console.log(`Portal bids loaded: ${bidData.bids.length}`);
  if (trackerBids)  console.log(`Tracker bids loaded: ${trackerBids.bids.length}`);

  // Pre-warm user data cache in background so first login is instant
  setImmediate(() => {
    try {
      const userData = loadUserData();
      if (userData) console.log(`Users loaded: ${userData.users.length}`);
    } catch (e) {
      console.warn('Could not pre-load user data (will retry on first request):', e.message);
    }
  });
  console.log(`Config: ${JSON.stringify({
    environment: currentEnv,
    port: PORT,
    host: HOST,
    excelFilePath: activeConfig.excelFilePath,
    userDataFilePath: activeConfig.userDataFilePath,
    allowedPaths: activeConfig.allowedDownloadPaths?.length || 0
  }, null, 2)}`);
});
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});
process.on('SIGTERM', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});