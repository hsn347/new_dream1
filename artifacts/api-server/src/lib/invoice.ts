import puppeteer, { type Browser } from "puppeteer";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { db } from "@workspace/db";
import {
  ordersTable,
  businessesTable,
  userSettingsTable,
  whatsappConnectionsTable,
  systemSettingsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { sendEvolutionDocument, fetchInstancePhone } from "./providers/evolution.js";
import { normalizePhone } from "./phoneNormalizer.js";
import { logger } from "./logger.js";

const FONT_PATH = path.join(__dirname, "assets", "Cairo.ttf");

export interface InvoiceGlobalSettings {
  template: "classic" | "modern" | "minimal";
  showNotes: boolean;
  showDelivery: boolean;
  showDeposit: boolean;
  watermark: boolean;
  footerText: string;
  invoiceEnabled: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findChromium(): string {
  const env = process.env["CHROMIUM_PATH"] ?? process.env["PUPPETEER_EXECUTABLE_PATH"];
  if (env && fs.existsSync(env)) return env;
  try { return execSync("which chromium", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
  try { return execSync("which google-chrome", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
  throw new Error("لا يوجد Chromium مثبت في النظام");
}

// ── Puppeteer browser singleton ────────────────────────────────────────────
// Reuse a single browser process across all invoice generations instead of
// launching a new Chromium for every PDF — dramatically reduces memory and
// CPU overhead under concurrent load.

let _browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser?.connected) return _browser;
  const chromiumPath = findChromium();
  _browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    timeout: 60_000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
      "--no-zygote",
      "--single-process",
    ],
  });
  _browser.on("disconnected", () => {
    _browser = null;
    logger.warn("Puppeteer browser disconnected — will relaunch on next invoice");
  });
  return _browser;
}

function escHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function toDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    if (url.startsWith("data:")) return url;
    if (url.startsWith("http")) {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const mime = res.headers.get("content-type") ?? "image/jpeg";
      return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`;
    }
  } catch {}
  return null;
}

function fmtDate(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString("ar-YE", { year: "numeric", month: "long", day: "numeric" });
}

function fmtDueDate(d: Date | string): string {
  const dt = d instanceof Date ? d : new Date(d);
  const due = new Date(dt.getTime() + 7 * 24 * 60 * 60 * 1000);
  return due.toLocaleDateString("ar-YE", { year: "numeric", month: "long", day: "numeric" });
}

interface ParsedItem {
  name: string;
  qty: number;
  unit?: string;
  price: string;
  total: string;
}

// ── HTML builder — exact match to the attached template ───────────────────────

function buildInvoiceHtml(opts: {
  fontBase64: string;
  logoDataUrl: string | null;
  qrDataUrl: string | null;
  agentPhone: string;
  color: string;
  watermarkEnabled: boolean;
  invoiceNo: string;
  date: string;
  dueDate: string;
  sellerName: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  paymentStatus: "Paid" | "Partial" | "Credit";
  currency: string;
  items: ParsedItem[];
  subtotal: string;
  deliveryCost: string;
  totalAmount: string;
  paidAmount: string;
  remainingAmount: string;
  businessPhone: string;
  businessAddress: string;
  storeUrl: string;
  terms: string;
  showDelivery: boolean;
  showNotes: boolean;
  showDeposit: boolean;
  notes: string;
  depositReference: string;
  footerText: string;
}): string {
  const {
    fontBase64, logoDataUrl, qrDataUrl, agentPhone, color, watermarkEnabled,
    invoiceNo, date, dueDate, sellerName, customerName, customerPhone,
    customerAddress, paymentStatus, currency, items,
    subtotal, deliveryCost, totalAmount, paidAmount, remainingAmount,
    businessPhone, businessAddress, storeUrl, terms,
    showDelivery, showNotes, showDeposit, notes, depositReference, footerText,
  } = opts;

  const gold = color.startsWith("#") ? color : `#${color}`;

  // Watermark CSS — show logo watermark whenever logo exists (admin can disable via setting)
  const watermarkCss = logoDataUrl && watermarkEnabled !== false
    ? `--watermark-url: url('${logoDataUrl}');`
    : `--watermark-url: none;`;

  // Logo HTML
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="شعار">`
    : `<div class="logo-placeholder">${escHtml(sellerName.charAt(0))}</div>`;

  // Payment status
  let statusHtml = "";
  if (paymentStatus === "Paid") {
    statusHtml = `<span style="color:#28a745;font-weight:700;">مدفوع بالكامل</span>`;
  } else if (paymentStatus === "Partial") {
    statusHtml = `<span style="color:#ff8c00;font-weight:700;">مدفوع جزئياً</span>`;
  } else {
    statusHtml = `<span style="color:#dc3545;font-weight:700;">آجل / غير مدفوع</span>`;
  }

  // Items rows
  const SPLIT_THRESHOLD = 10;
  const ITEMS_PER_PAGE = 16;
  const MIN_LAST_PAGE = 3;

  function paginateItems(arr: ParsedItem[]): ParsedItem[][] {
    if (arr.length <= SPLIT_THRESHOLD) return [arr];
    const pages: ParsedItem[][] = [];
    let remaining = [...arr];
    while (remaining.length > 0) {
      if (remaining.length <= SPLIT_THRESHOLD) {
        pages.push(remaining); remaining = [];
      } else {
        const take = Math.min(remaining.length - MIN_LAST_PAGE, ITEMS_PER_PAGE);
        pages.push(remaining.slice(0, take));
        remaining = remaining.slice(take);
      }
    }
    return pages;
  }

  function buildTableRows(pageItems: ParsedItem[], startIdx: number): string {
    return pageItems.map((item, i) => {
      const idx = String(startIdx + i + 1).padStart(2, "0");
      const unitPrice = parseFloat(item.price || "0");
      const lineTotal = parseFloat(item.total || "0");
      return `
        <tr>
          <td><span class="item-index">${idx}</span></td>
          <td>${escHtml(item.name)}</td>
          <td style="text-align:center;">${unitPrice.toLocaleString("ar")}</td>
          <td style="text-align:center;font-weight:700;">${item.qty}</td>
          <td style="text-align:left;">${lineTotal.toLocaleString("ar")}</td>
        </tr>`;
    }).join("");
  }

  const pages = paginateItems(items);
  const totalPages = pages.length;

  // Delivery row
  const delivCost = parseFloat(deliveryCost || "0");
  const deliveryRow = showDelivery && delivCost > 0
    ? `<div class="total-line"><span>تكلفة التوصيل:</span><span class="tl-value">${delivCost.toLocaleString("ar")} ${escHtml(currency)}</span></div>
       <div class="total-line"><span>المجموع الفرعي:</span><span class="tl-value">${parseFloat(subtotal || "0").toLocaleString("ar")} ${escHtml(currency)}</span></div>`
    : "";

  // Deposit & notes extras
  const depositBlock = showDeposit && depositReference
    ? `<div style="margin:4px 35px 6px;padding:8px 14px;background:#fef9e7;border-right:3px solid ${gold};border-radius:4px;font-size:12px;display:flex;align-items:center;gap:8px;">
        <span>🧾</span><span>رقم الإيصال: <strong>${escHtml(depositReference)}</strong></span>
       </div>`
    : "";

  const notesBlock = showNotes && notes
    ? `<div style="margin:4px 35px 8px;padding:8px 14px;background:#fefce8;border-right:3px solid #ca8a04;border-radius:4px;font-size:12px;color:#854d0e;">
        <strong>ملاحظات:</strong> ${escHtml(notes)}
       </div>`
    : "";

  // Footer extras
  const storeUrlHtml = storeUrl
    ? `<p>🌐 <span>${escHtml(storeUrl)}</span></p>` : "";
  const footerNoteHtml = footerText
    ? `<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:4px 35px 8px;background:var(--bg-main);">${escHtml(footerText)}</div>`
    : "";

  // QR img — links to agent's WhatsApp with pre-filled order inquiry message
  const qrHtml = qrDataUrl
    ? `<div class="qr-block">
        <img src="${qrDataUrl}" alt="QR واتساب">
        <div class="qr-label">امسح للاستفسار عن طلبك</div>
       </div>`
    : "";

  // Build each page
  let pagesHtml = "";
  let globalIdx = 0;
  pages.forEach((pageItems, p) => {
    const isLastPage = p === totalPages - 1;
    const pageIndicator = totalPages > 1
      ? `<div class="page-indicator">صفحة ${p + 1} من ${totalPages}</div>` : "";

    const summaryHtml = isLastPage ? `
      <div class="summary-row">
        <div class="terms-col">
          <h4>الشروط والأحكام</h4>
          <p>${escHtml(terms)}</p>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label">توقيع المفوض</div>
          </div>
        </div>
        <div class="totals-col">
          ${deliveryRow}
          <div class="total-line"><span>المبلغ المدفوع:</span><span class="tl-value" style="color:#28a745;">${parseFloat(paidAmount || "0").toLocaleString("ar")} ${escHtml(currency)}</span></div>
          <div class="total-line"><span>المبلغ المتبقي:</span><span class="tl-value" style="color:#dc3545;">${parseFloat(remainingAmount || "0").toLocaleString("ar")} ${escHtml(currency)}</span></div>
          <div class="grand-total-box">
            <span class="gt-label">الإجمالي الكلي</span>
            <span class="gt-value">${parseFloat(totalAmount || "0").toLocaleString("ar")} ${escHtml(currency)}</span>
          </div>
        </div>
      </div>
      ${depositBlock}
      ${notesBlock}` : "";

    pagesHtml += `
    <div class="invoice-page">
      <!-- HEADER -->
      <div class="invoice-header">
        <div class="header-diagonal"></div>
        <div class="logo-area">
          ${logoHtml}
          <div class="logo-text">${escHtml(sellerName)}</div>
        </div>
        <div class="invoice-title-area">
          <h1>فاتورة</h1>
          <div class="invoice-meta-grid">
            <span class="label">رقم الفاتورة</span><span class="value">${escHtml(invoiceNo)}</span>
            <span class="label">التاريخ</span><span class="value">${date}</span>
            <span class="label">تاريخ الاستحقاق</span><span class="value">${dueDate}</span>
            <span class="label">البائع</span><span class="value">${escHtml(sellerName)}</span>
          </div>
        </div>
      </div>
      <div class="gold-divider"></div>

      <!-- INFO -->
      <div class="info-row">
        <div class="invoice-to-block">
          <div class="block-label">فاتورة إلى</div>
          <div class="customer-name-display">${escHtml(customerName || "عميل")}</div>
          ${customerPhone ? `<div class="customer-contact">📞 ${escHtml(customerPhone)}</div>` : ""}
          ${customerAddress ? `<div class="customer-sub">📍 ${escHtml(customerAddress)}</div>` : ""}
          <div class="customer-sub">عميلنا العزيز، شكراً لاختيارك ${escHtml(sellerName)}.</div>
        </div>
        <div class="payment-info-block">
          <div class="block-label" style="text-align:left;border-right:none;border-left:3px solid var(--gold);padding-right:0;padding-left:8px;">معلومات الدفع</div>
          <div class="payment-grid">
            <span class="pg-label">طريقة الدفع:</span><span class="pg-value">تحويل بنكي / نقدي</span>
            <span class="pg-label">حالة الدفع:</span><span class="pg-value">${statusHtml}</span>
          </div>
        </div>
      </div>

      <!-- TABLE -->
      <div class="table-section">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>اسم المنتج / الخدمة</th>
              <th style="text-align:center;width:120px;">سعر الوحدة</th>
              <th style="text-align:center;width:70px;">الكمية</th>
              <th style="text-align:left;width:110px;">الإجمالي (${escHtml(currency)})</th>
            </tr>
          </thead>
          <tbody>${buildTableRows(pageItems, globalIdx)}</tbody>
        </table>
      </div>

      ${summaryHtml}
      ${pageIndicator}

      <!-- FOOTER -->
      <div class="gold-divider"></div>
      <div class="footer-bar">
        <div class="contact-block">
          ${businessAddress ? `<p>📍 <span>العنوان:</span> ${escHtml(businessAddress)}</p>` : ""}
          ${businessPhone ? `<p>📞 <span>الهاتف:</span> ${escHtml(businessPhone)}</p>` : ""}
          ${storeUrlHtml}
        </div>
        <div class="thank-you-stamp">
          <strong>شكراً لتعاملكم معنا</strong>
          نسعد بخدمتكم دائماً<br>${escHtml(sellerName)}
        </div>
        ${qrHtml}
      </div>
      ${footerNoteHtml}
    </div>`;

    globalIdx += pageItems.length;
  });

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<title>فاتورة #${invoiceNo}</title>
<style>
@font-face {
  font-family: 'Cairo';
  src: url('data:font/truetype;base64,${fontBase64}') format('truetype');
  font-weight: 100 900;
  font-style: normal;
}
:root {
  --gold: ${gold};
  --gold-dark: ${gold};
  --bg-main: #f6f6f6;
  --bg-card: #f6f6f6;
  --bg-row: #ffffff;
  --bg-row-alt: #f1f3f5;
  --text-main: #2b2b2b;
  --text-muted: #6c757d;
  --text-dark: #111111;
  --border: #e9ecef;
  ${watermarkCss}
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: 'Cairo', sans-serif;
  background-color: #e8e8e8;
  margin: 0;
  padding: 20px;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.invoice-page {
  width: 800px;
  min-height: 1050px;
  margin: 0 auto 30px;
  background-color: var(--bg-card);
  color: var(--text-main);
  overflow: hidden;
  box-shadow: 0 10px 50px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 0;
}
.invoice-page::before {
  content: "";
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%,-50%);
  width: 620px; height: 620px;
  background-image: var(--watermark-url);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  opacity: 0.13;
  z-index: 0;
  pointer-events: none;
}
/* HEADER */
.invoice-header {
  background-color: var(--bg-main);
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  min-height: 105px;
  overflow: hidden;
}
.header-diagonal {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  z-index: 0;
}
.header-diagonal::before {
  content: "";
  position: absolute;
  top: 0; right: 0;
  width: 380px; height: 100%;
  background: linear-gradient(135deg, var(--bg-main) 50%, var(--gold) 50%);
}
.header-diagonal::after {
  content: "";
  position: absolute;
  top: 0; right: 0;
  width: 190px; height: 100%;
  background-color: var(--gold);
}
.logo-area {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 10px 10px 10px 35px;
}
.logo-area img {
  width: 90px; height: 90px;
  object-fit: cover;
  border-radius: 50%;
  border: 3px solid var(--gold);
  background-color: var(--bg-card);
  box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}
.logo-placeholder {
  width: 90px; height: 90px;
  border-radius: 50%;
  background-color: var(--gold);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 36px;
  font-weight: 900;
  color: var(--text-dark);
  border: 3px solid var(--gold);
}
.logo-text {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dark);
  margin-top: 8px;
  letter-spacing: 0.5px;
  background-color: var(--gold);
  padding: 5px 14px;
  border-radius: 20px;
  max-width: 160px;
  text-align: center;
  word-break: break-word;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.invoice-title-area {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-end;
  padding: 15px 35px;
  text-align: left;
}
.invoice-title-area h1 {
  font-size: 32px;
  font-weight: 900;
  color: var(--text-dark);
  line-height: 1.2;
}
.invoice-meta-grid {
  margin-top: 10px;
  display: grid;
  grid-template-columns: auto auto;
  gap: 2px 15px;
  text-align: left;
}
.invoice-meta-grid .label {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.invoice-meta-grid .value {
  font-size: 11px;
  color: var(--text-dark);
  font-weight: 700;
}
/* INFO */
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px 35px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 1;
}
.block-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 2px;
  color: var(--gold-dark);
  font-weight: 700;
  margin-bottom: 8px;
  border-right: 3px solid var(--gold);
  padding-right: 8px;
}
.customer-name-display {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 4px;
}
.customer-contact {
  font-size: 11px;
  color: var(--text-dark);
  margin-bottom: 6px;
  font-weight: 500;
}
.customer-sub {
  font-size: 12px;
  color: var(--text-muted);
}
.payment-info-block { text-align: left; }
.payment-grid {
  display: grid;
  grid-template-columns: auto auto;
  gap: 4px 20px;
  margin-top: 8px;
}
.payment-grid .pg-label { font-size: 11px; color: var(--text-muted); text-align: right; }
.payment-grid .pg-value { font-size: 11px; color: var(--text-main); font-weight: 700; text-align: left; }
/* TABLE */
.table-section { padding: 0 25px 10px; flex: 1; position: relative; z-index: 1; }
table { width: 100%; border-collapse: collapse; }
thead tr { background: var(--gold); }
thead th {
  padding: 6px 15px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-dark);
  text-align: right;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}
thead th:first-child { text-align: center; width: 50px; }
thead th:last-child { text-align: left; }
tbody tr { border-bottom: 1px solid var(--border); }
tbody tr:nth-child(even) { background-color: var(--bg-row-alt); }
tbody tr:nth-child(odd) { background-color: var(--bg-row); }
tbody tr:last-child { border-bottom: none; }
tbody td {
  padding: 5px 15px;
  font-size: 14px;
  color: var(--text-main);
  text-align: right;
  vertical-align: middle;
}
tbody td:first-child { text-align: center; font-size: 12px; color: var(--text-muted); font-weight: 700; }
tbody td:last-child { text-align: left; font-weight: 700; color: var(--gold-dark); font-size: 15px; }
.item-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border-radius: 50%;
  background-color: var(--gold);
  color: var(--text-dark);
  font-size: 12px;
  font-weight: 700;
}
/* SUMMARY */
.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 15px 35px 20px;
  border-top: 1px solid var(--border);
  gap: 30px;
  position: relative;
  z-index: 1;
}
.terms-col { flex: 1; }
.terms-col h4 {
  font-size: 12px;
  font-weight: 700;
  color: var(--gold-dark);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.terms-col p { font-size: 12px; color: var(--text-muted); line-height: 1.7; }
.signature-box { margin-top: 25px; display: inline-block; }
.signature-line { width: 140px; height: 1px; background-color: var(--border); margin-bottom: 6px; }
.signature-label { font-size: 11px; color: var(--text-muted); text-align: center; }
.totals-col { width: 260px; flex-shrink: 0; }
.total-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
  color: var(--text-muted);
}
.total-line .tl-value { color: var(--text-main); font-weight: 700; }
.grand-total-box {
  margin-top: 12px;
  background: var(--gold);
  border-radius: 6px;
  padding: 14px 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.grand-total-box .gt-label { font-size: 16px; font-weight: 900; color: var(--text-dark); }
.grand-total-box .gt-value { font-size: 20px; font-weight: 900; color: var(--text-dark); letter-spacing: 0.5px; }
/* FOOTER */
.gold-divider {
  width: 100%;
  height: 3px;
  background: linear-gradient(90deg, var(--gold) 0%, var(--gold-dark) 50%, transparent 100%);
  position: relative;
  z-index: 1;
}
.footer-bar {
  background-color: var(--bg-main);
  padding: 16px 35px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  position: relative;
  z-index: 1;
}
.contact-block p { font-size: 12px; color: var(--text-muted); line-height: 1.9; }
.contact-block p span { color: var(--gold-dark); font-weight: 700; }
.qr-block { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.qr-block img {
  width: 75px; height: 75px;
  border-radius: 8px;
  background: white;
  padding: 4px;
  border: 1px solid var(--border);
}
.qr-label { font-size: 10px; color: var(--text-muted); text-align: center; }
.thank-you-stamp {
  font-size: 11px;
  color: var(--text-muted);
  border: 1px solid var(--border);
  background-color: var(--bg-card);
  border-radius: 4px;
  padding: 8px 14px;
  text-align: center;
  max-width: 180px;
  line-height: 1.6;
}
.thank-you-stamp strong { display: block; color: var(--gold-dark); font-size: 13px; }
.page-indicator {
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  padding: 4px 35px;
  background: var(--bg-card);
}
@media print {
  @page { size: A4; margin: 0; }
  body { padding: 0; background: white; }
  .invoice-page {
    box-shadow: none;
    margin: 0;
    width: 100%;
    min-height: 100vh;
    page-break-after: always;
  }
  .invoice-page:last-child { page-break-after: avoid; }
}
</style>
</head>
<body>
${pagesHtml}
</body>
</html>`;
}

// ── Main PDF builder ──────────────────────────────────────────────────────────

export async function buildInvoicePDF(
  order: typeof ordersTable.$inferSelect,
  business: {
    name: string | null;
    phones: string[] | null;
    storeUrl: string | null;
    logoUrl: string | null;
    returnPolicy: string | null;
    branches: string[] | null;
  },
  color: string,
  settings: InvoiceGlobalSettings,
  agentPhone: string = "",
): Promise<Buffer> {
  // Font
  let fontBase64 = "";
  try { fontBase64 = fs.readFileSync(FONT_PATH).toString("base64"); } catch {}

  // Logo data URL
  const logoDataUrl = await toDataUrl(business.logoUrl);

  // QR — links to agent's WhatsApp with pre-filled order inquiry message
  const phone0 = (business.phones ?? []).filter(Boolean)[0] ?? "";
  const qrPhone = (agentPhone || phone0).replace(/\D/g, "");
  let qrDataUrl: string | null = null;
  if (qrPhone) {
    try {
      const prefilledMsg = encodeURIComponent(`استفسار عن الطلب رقم #${order.id}`);
      const waUrl = `https://wa.me/${qrPhone}?text=${prefilledMsg}`;
      qrDataUrl = await (QRCode as unknown as { toDataURL: (url: string, opts: object) => Promise<string> })
        .toDataURL(waUrl, {
          width: 150, margin: 1,
          color: { dark: "#000000", light: "#ffffff" },
        });
    } catch {}
  }

  // Parse items
  let items: ParsedItem[] = [];
  try { items = JSON.parse(order.items) as ParsedItem[]; } catch {}

  // Payment amounts
  const total = parseFloat(order.total || "0");
  let paymentStatus: "Paid" | "Partial" | "Credit" = "Credit";
  let paidAmount = 0;
  let remainingAmount = total;
  if (order.status === "approved") {
    paymentStatus = "Paid"; paidAmount = total; remainingAmount = 0;
  } else if (order.status === "pending_review" && order.depositReference) {
    paymentStatus = "Partial"; paidAmount = 0; remainingAmount = total;
  }

  // Business address — first branch or empty
  const branches = business.branches ?? [];
  const businessAddress = branches.filter(Boolean)[0] ?? "";

  // Terms — from returnPolicy or default
  const terms = business.returnPolicy
    || "جميع المنتجات مكفولة. في حال وجود أي ملاحظة أو عيب يرجى التواصل خلال 7 أيام من تاريخ استلام الطلب. لا يحق إرجاع المنتجات بعد التركيب. الأسعار شاملة وغير خاضعة للضريبة.";

  const html = buildInvoiceHtml({
    fontBase64,
    logoDataUrl,
    qrDataUrl,
    agentPhone,
    color,
    watermarkEnabled: settings.watermark,
    invoiceNo: `#${String(order.id).padStart(4, "0")}`,
    date: fmtDate(order.createdAt),
    dueDate: fmtDueDate(order.createdAt),
    sellerName: business.name || "المتجر",
    customerName: order.customerName || "عميل",
    customerPhone: order.customerPhone || order.senderPhone || "",
    customerAddress: order.customerAddress || "",
    paymentStatus,
    currency: order.currency || "ر.ي",
    items,
    subtotal: order.subtotal,
    deliveryCost: order.deliveryCost,
    totalAmount: String(total),
    paidAmount: String(paidAmount),
    remainingAmount: String(remainingAmount),
    businessPhone: phone0,
    businessAddress,
    storeUrl: business.storeUrl || "",
    terms,
    showDelivery: settings.showDelivery,
    showNotes: settings.showNotes,
    showDeposit: settings.showDeposit,
    notes: order.notes || "",
    depositReference: order.depositReference || "",
    footerText: settings.footerText,
  });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}

// ── Load global invoice settings ─────────────────────────────────────────────

async function loadInvoiceGlobalSettings(): Promise<InvoiceGlobalSettings & { enabled: boolean }> {
  const rows = await db.select().from(systemSettingsTable);
  const m: Record<string, string> = {};
  for (const r of rows) m[r.key] = r.value;
  return {
    enabled:        m["invoice_enabled"]       !== "false",
    invoiceEnabled: m["invoice_enabled"]       !== "false",
    template:       (m["invoice_template"]     as InvoiceGlobalSettings["template"]) || "classic",
    showNotes:      m["invoice_show_notes"]    !== "false",
    showDelivery:   m["invoice_show_delivery"] !== "false",
    showDeposit:    m["invoice_show_deposit"]  !== "false",
    watermark:      m["invoice_watermark"]     !== "false",
    footerText:     m["invoice_footer_text"]   || "",
  };
}

// ── Public entry: generate & send via WhatsApp ────────────────────────────────

export async function generateAndSendInvoice(userId: number, orderId: number): Promise<void> {
  try {
    const globalCfg = await loadInvoiceGlobalSettings();
    if (!globalCfg.enabled) return;

    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
    if (!order) return;

    const [settings] = await db.select().from(userSettingsTable).where(eq(userSettingsTable.userId, userId)).limit(1);
    if (settings?.invoiceEnabled === false) return;

    const [biz] = await db.select().from(businessesTable).where(eq(businessesTable.userId, userId)).limit(1);
    const [wa]  = await db.select().from(whatsappConnectionsTable).where(eq(whatsappConnectionsTable.userId, userId)).limit(1);
    if (!wa?.baseUrl || !wa.apiKey || !wa.instanceName) return;

    const rawPhone = (order.customerPhone?.trim() || order.senderPhone?.trim()) ?? "";
    if (!rawPhone) return;
    const phone = normalizePhone(rawPhone);

    const parseJsonArray = (raw: string | null | undefined): unknown[] => {
      if (!raw) return [];
      try { return JSON.parse(raw) as unknown[]; } catch { return []; }
    };

    const business = {
      name:         biz?.name         ?? null,
      phones:       parseJsonArray(biz?.phones) as string[],
      storeUrl:     biz?.storeUrl     ?? null,
      logoUrl:      biz?.logoUrl      ?? null,
      returnPolicy: biz?.returnPolicy ?? null,
      branches:     parseJsonArray(biz?.branches) as string[],
    };

    // Fetch the agent's own WhatsApp phone for QR code
    const waConfig = { baseUrl: wa.baseUrl, apiKey: wa.apiKey, instanceName: wa.instanceName };
    const agentPhone = await fetchInstancePhone(waConfig) ?? "";

    const color     = settings?.invoiceColor || "#ffbf40";
    const pdfBuffer = await buildInvoicePDF(order, business, color, globalCfg, agentPhone);
    const base64    = pdfBuffer.toString("base64");
    const fileName  = `invoice-${order.id}.pdf`;
    const caption   = `📄 فاتورة طلبك رقم #${order.id}`;

    const sent = await sendEvolutionDocument(waConfig, phone, base64, fileName, caption);

    logger.info({ userId, orderId, phone, sent }, "Invoice PDF sent");
  } catch (err) {
    logger.error({ err, userId, orderId }, "generateAndSendInvoice error");
  }
}
