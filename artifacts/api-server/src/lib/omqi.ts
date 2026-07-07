/**
 * omqi.ts — Al-Umqi Bank PDF Receipt Verifier
 * 9-layer verification ported from the reference JS implementation.
 * All logic is self-contained; the only runtime dependency is `pdf-parse`.
 */

// Use internal module to avoid pdf-parse@1.1.1 test-file read on import
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buf: Buffer, opts?: unknown) => Promise<{ text: string; info: Record<string, unknown>; numpages: number }>;

// ──────────────────────────────────────────────────────────────────────────────
//  Bank fingerprint — calibrated against authentic Al-Umqi deposit receipts
// ──────────────────────────────────────────────────────────────────────────────
const BANK_FINGERPRINT = {
  pdfVersion: "1.4",
  producerPattern: /iText[®\u00ae]\s+5\.\d+\.\d+/i,
  mediaBox: { width: 595, height: 842, tolerance: 2 },
  binaryMarkerHex: "25e2e3cfd3",
  objectCount: { min: 10, max: 25 },
  streamCount: { min: 4, max: 12 },
  imageXObjects: { min: 1, max: 5 },
  flatDecodeStreams: { min: 4, max: 12 },
  forbiddenFlags: [
    "/JavaScript", "/EmbeddedFiles", "/OpenAction", "/Encrypt",
    "/AcroForm", "/AA ", "/Launch", "/URI ",
  ],
  transferKeyword: "سحب حوالة",
  depositFromKeyword: "من حساب:",
  depositToKeyword: "الى حساب:",
  requiredPhrases: [
    "إشعار سحب",
    "هذا الإشعار آلي ولايحتاج إلى ختم أو توقيع",
  ],
  amountPattern: /\[\s*\d[\d,]*(?:\.\d+)?\s*\]/,
  datePattern: /\d{4}\/\d{2}\/\d{2}/,
  textLength: { min: 200, max: 1800 },
  pageCount: { min: 1, max: 1 },
  fileSize: { minKB: 50, maxKB: 700 },
};

// ──────────────────────────────────────────────────────────────────────────────
//  Currency aliases for smart matching
// ──────────────────────────────────────────────────────────────────────────────
const CURRENCY_ALIASES: Record<string, string[]> = {
  "ريال يمني": ["يمني", "yer", "yemeni", "yemeni rial"],
  "ريال سعودي": ["سعودي", "sar", "saudi", "riyal"],
  "دولار": ["dollar", "usd", "دولار امريكي", "امريكي"],
  "يورو": ["euro", "eur"],
  "دينار": ["dinar", "kwd", "iqd", "jod"],
  "درهم": ["dirham", "aed", "اماراتي"],
  "جنيه": ["pound", "egp", "جنيه مصري"],
};

// ──────────────────────────────────────────────────────────────────────────────
//  Normalization helpers
// ──────────────────────────────────────────────────────────────────────────────
function normalizeArabic(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/[\u0610-\u061A\u064B-\u065F]/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[\s\n\r]+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeAccountNumber(num: string | null | undefined): string {
  return String(num || "").replace(/\D/g, "").trim();
}

function normalizeCurrency(cur: string | null | undefined): string {
  if (!cur) return "";
  return normalizeArabic(cur).replace(/\s+/g, " ").trim();
}

function matchCurrency(expected: string, extracted: string): { match: boolean; method: string } {
  const normExp = normalizeCurrency(expected);
  const normExt = normalizeCurrency(extracted);
  if (!normExt) return { match: false, method: "none" };
  if (normExp === normExt) return { match: true, method: "direct" };
  if (normExt.includes(normExp) || normExp.includes(normExt)) return { match: true, method: "contains" };
  for (const [canonical, aliases] of Object.entries(CURRENCY_ALIASES)) {
    const normCanonical = normalizeCurrency(canonical);
    const allForms = [normCanonical, ...aliases.map(normalizeCurrency)];
    const expIsThis = allForms.some(f => normExp === f || normExp.includes(f) || f.includes(normExp));
    const extIsThis = allForms.some(f => normExt === f || normExt.includes(f) || f.includes(normExt));
    if (expIsThis && extIsThis) return { match: true, method: "alias" };
  }
  return { match: false, method: "none" };
}

// ──────────────────────────────────────────────────────────────────────────────
//  Currency extractor
// ──────────────────────────────────────────────────────────────────────────────
function extractCurrency(text: string): string | null {
  const currencyLineMatch = text.match(/\n([\u0600-\u06FF][^\n]*?)\[\s*[\d,]+\s*\]/);
  if (currencyLineMatch) {
    const lineContent = currencyLineMatch[1]!.trim();
    if (/^[\u0600-\u06FF\s]+$/.test(lineContent)) return lineContent.replace(/\s+/g, " ").trim();
    const words = lineContent.split(/\s+/).filter(w => /[\u0600-\u06FF]/.test(w));
    if (words.length >= 2) return words.slice(-2).join(" ");
    if (words.length === 1) return words[0]!;
  }
  const amountWordsMatch = text.match(/\]\s*المبلغ\s*\n([\u0600-\u06FF\s]+)/);
  if (amountWordsMatch) {
    const quantityWords = new Set([
      "الف", "ألف", "آلاف", "مائة", "مليون", "مليار",
      "واحد", "اثنان", "ثلاثة", "اربعة", "أربعة", "خمسة", "ستة",
      "سبعة", "ثمانية", "تسعة", "عشرة", "عشرون", "ثلاثون",
      "و", "فقط", "من",
    ]);
    const words = amountWordsMatch[1]!.trim().split(/\s+/).filter(Boolean);
    const currencyWords: string[] = [];
    for (let i = words.length - 1; i >= 0; i--) {
      if (quantityWords.has(normalizeArabic(words[i]!))) continue;
      currencyWords.unshift(words[i]!);
      if (i > 0 && !quantityWords.has(normalizeArabic(words[i - 1]!))) {
        const prevIsUnit = ["ريال", "دينار", "درهم", "دولار", "يورو", "جنيه"].some(
          u => normalizeArabic(words[i - 1]!).includes(u),
        );
        if (prevIsUnit) currencyWords.unshift(words[i - 1]!);
      }
      break;
    }
    if (currencyWords.length > 0) return currencyWords.join(" ");
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Deposit info extractor
// ──────────────────────────────────────────────────────────────────────────────
export interface ExtractedDepositInfo {
  receiptNumber: string | null;
  date: string | null;
  amount: string | null;
  destName: string | null;
  destAccount: string | null;
  sourceName: string | null;
  sourceAccount: string | null;
}

function extractDepositInfo(text: string): ExtractedDepositInfo {
  const toSectionRaw = text.split("الى حساب:")[1] || "";
  const nameBeforeSlash = (toSectionRaw.split("/")[0] || "").trim();
  const destNameFull = nameBeforeSlash.replace(/[\n\r\s]+/g, " ").trim();
  const destAccountMatch = toSectionRaw.match(/-رقم\s+(\d{5,15})/);
  const sourceNameMatch = text.match(/السيد:\s*([\u0600-\u06FF\s]+?)(?:\n|\/)/);
  const sourceAccountMatch = text.match(/(\d{5,15})رقم الحساب/);
  const receiptNoMatch = text.match(/(\d+-\d+)رقم الإشعار/);
  const dateMatch = text.match(/\d{4}\/\d{2}\/\d{2}/);
  const amountMatch = text.match(/\[\s*([\d,]+(?:\.\d+)?)\s*\]/);
  return {
    receiptNumber: receiptNoMatch ? receiptNoMatch[1]! : null,
    date: dateMatch ? dateMatch[0] : null,
    amount: amountMatch ? amountMatch[1]!.replace(/,/g, "") : null,
    destName: destNameFull || null,
    destAccount: destAccountMatch ? destAccountMatch[1]!.trim() : null,
    sourceName: sourceNameMatch ? sourceNameMatch[1]!.trim() : null,
    sourceAccount: sourceAccountMatch ? sourceAccountMatch[1]!.trim() : null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
//  Raw PDF structure analyzer
// ──────────────────────────────────────────────────────────────────────────────
interface RawPdfAnalysis {
  pdfVersion: string | null;
  producer: string | null;
  mediaBoxWidth: number | null;
  mediaBoxHeight: number | null;
  binaryLine: string;
  objCount: number;
  streamCount: number;
  imageCount: number;
  flateCount: number;
  dctCount: number;
  colorSpaceCount: number;
  flagsFound: string[];
  creationDatePrefix: string | null;
  modDatePrefix: string | null;
}

function analyzeRawPdf(buf: Buffer): RawPdfAnalysis {
  const raw = buf.toString("binary");
  const versionMatch = raw.match(/%PDF-(\d+\.\d+)/);
  const producerMatch = raw.match(/Producer[\s\S]{0,5}\(([^)]{1,120})\)/);
  const mediaBoxMatch = raw.match(/\/MediaBox\s*\[([^\]]+)\]/);
  const creationMatch = raw.match(/CreationDate[\s\S]{0,5}\(D:(\d{8})/);
  const modMatch = raw.match(/ModDate[\s\S]{0,5}\(D:(\d{8})/);
  const binaryLine = Buffer.from(raw.slice(5, 14), "binary").toString("hex");
  const objCount = (raw.match(/\d+ \d+ obj/g) || []).length;
  const streamCount = (raw.match(/\bstream\b/g) || []).length;
  const imageCount = (raw.match(/\/Subtype\s*\/Image/g) || []).length;
  const flateCount = (raw.match(/\/FlateDecode/g) || []).length;
  const dctCount = (raw.match(/\/DCTDecode/g) || []).length;
  const colorSpaceCount = (raw.match(/\/ColorSpace/g) || []).length;
  const flagsFound = BANK_FINGERPRINT.forbiddenFlags.filter(f => raw.includes(f));

  let mediaBoxWidth: number | null = null;
  let mediaBoxHeight: number | null = null;
  if (mediaBoxMatch) {
    const parts = mediaBoxMatch[1]!.trim().split(/\s+/).map(Number);
    if (parts.length >= 4) {
      mediaBoxWidth = parts[2]! - parts[0]!;
      mediaBoxHeight = parts[3]! - parts[1]!;
    }
  }

  return {
    pdfVersion: versionMatch ? versionMatch[1]! : null,
    producer: producerMatch ? producerMatch[1]! : null,
    mediaBoxWidth, mediaBoxHeight, binaryLine,
    objCount, streamCount, imageCount, flateCount, dctCount, colorSpaceCount, flagsFound,
    creationDatePrefix: creationMatch ? creationMatch[1]! : null,
    modDatePrefix: modMatch ? modMatch[1]! : null,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
//  Public types
// ──────────────────────────────────────────────────────────────────────────────
export interface OmqiLayerCheck {
  label: string;
  pass: boolean;
  detail: string;
}

export interface OmqiLayerSummary {
  layer: string;
  passed: number;
  total: number;
  score: number;
  checks: OmqiLayerCheck[];
}

export interface OmqiExtractedData {
  receiptNumber: string | null;
  amount: string | null;
  currency: string | null;
  date: string | null;
  destName: string | null;
  destAccount: string | null;
  sourceName: string | null;
  sourceAccount: string | null;
  producer: string | null;
  pageCount: number;
  fileSizeKB: number;
}

export interface OmqiVerifyResult {
  valid: boolean;
  confidence: number;
  criticalFailures: Array<{
    layer: string;
    failedChecks: Array<{ label: string; detail: string }>;
  }>;
  layers: OmqiLayerSummary[];
  extractedData: OmqiExtractedData;
  rejectionReason?: string;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Currency code → Arabic name mapping
// ──────────────────────────────────────────────────────────────────────────────
const CURRENCY_CODE_TO_ARABIC: Record<string, string> = {
  YER: "ريال يمني",
  SAR: "ريال سعودي",
  USD: "دولار",
  EUR: "يورو",
  KWD: "دينار",
  AED: "درهم",
  EGP: "جنيه",
};

function resolveExpectedCurrency(code: string | undefined): string {
  if (!code) return "ريال يمني";
  const upper = code.toUpperCase().trim();
  return CURRENCY_CODE_TO_ARABIC[upper] ?? code;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Admin-configurable settings (loaded from systemSettingsTable by caller)
// ──────────────────────────────────────────────────────────────────────────────
export interface OmqiConfig {
  minScore: number;
  fileSizeMinKB: number;
  fileSizeMaxKB: number;
  objectCountMin: number;
  objectCountMax: number;
  streamCountMin: number;
  streamCountMax: number;
  maxReceiptAgeDays: number;
}

export const DEFAULT_OMQI_CONFIG: OmqiConfig = {
  minScore: 80,
  fileSizeMinKB: 50,
  fileSizeMaxKB: 700,
  objectCountMin: 10,
  objectCountMax: 25,
  streamCountMin: 4,
  streamCountMax: 12,
  maxReceiptAgeDays: 3,
};

// ──────────────────────────────────────────────────────────────────────────────
//  Core 9-layer verifier
// ──────────────────────────────────────────────────────────────────────────────
function verifyPdfBuffer(
  buf: Buffer,
  parsedData: { text: string; info: Record<string, unknown>; numpages: number },
  expectedName: string,
  expectedAccount: string,
  cfg: OmqiConfig,
): OmqiVerifyResult {
  const raw = analyzeRawPdf(buf);
  // Normalize full PDF text to standard Arabic Unicode so all regex operations
  // work correctly regardless of whether the PDF uses Presentation Forms or not.
  const text = parsedData.text.normalize("NFKC");
  const { info, numpages } = parsedData;
  const fp = BANK_FINGERPRINT;
  const fileSizeKB = buf.length / 1024;

  const layers: Array<{ name: string; checks: OmqiLayerCheck[]; passed: number; total: number }> = [];

  function makeLayer(name: string) {
    const layer = { name, checks: [] as OmqiLayerCheck[], passed: 0, total: 0 };
    layers.push(layer);
    return {
      chk(label: string, pass: boolean, detail: string) {
        layer.total++;
        if (pass) layer.passed++;
        layer.checks.push({ label, pass, detail });
      },
    };
  }

  // ── Layer 1: PDF Technical Specification ──────────────────────────────────
  const L1 = makeLayer("PDF Technical Specification");
  L1.chk("PDF Version 1.4", raw.pdfVersion === fp.pdfVersion, `Found: ${raw.pdfVersion}`);
  L1.chk("iText 5.x Producer", fp.producerPattern.test(raw.producer || ""), `Found: ${raw.producer}`);
  const widthOk = raw.mediaBoxWidth !== null && Math.abs(raw.mediaBoxWidth - fp.mediaBox.width) <= fp.mediaBox.tolerance;
  const heightOk = raw.mediaBoxHeight !== null && Math.abs(raw.mediaBoxHeight - fp.mediaBox.height) <= fp.mediaBox.tolerance;
  L1.chk("A4 Page Dimensions (595×842)", widthOk && heightOk, `Found: ${raw.mediaBoxWidth}×${raw.mediaBoxHeight}`);
  L1.chk("Binary PDF Marker", raw.binaryLine.includes(fp.binaryMarkerHex), `Hex: ${raw.binaryLine}`);

  // ── Layer 2: PDF Object Structure ─────────────────────────────────────────
  const L2 = makeLayer("PDF Object Structure");
  L2.chk("Object Count Range", raw.objCount >= cfg.objectCountMin && raw.objCount <= cfg.objectCountMax, `Found: ${raw.objCount}`);
  L2.chk("Stream Count Range", raw.streamCount >= cfg.streamCountMin && raw.streamCount <= cfg.streamCountMax, `Found: ${raw.streamCount}`);
  L2.chk("Image XObjects Count", raw.imageCount >= fp.imageXObjects.min && raw.imageCount <= fp.imageXObjects.max, `Found: ${raw.imageCount}`);
  L2.chk("FlateDecode Streams", raw.flateCount >= fp.flatDecodeStreams.min && raw.flateCount <= fp.flatDecodeStreams.max, `Found: ${raw.flateCount}`);
  L2.chk("No JPEG (DCTDecode) Streams", raw.dctCount === 0, `Found: ${raw.dctCount}`);

  // ── Layer 3: Security & Integrity Flags ───────────────────────────────────
  const L3 = makeLayer("Security & Integrity Flags");
  L3.chk("No Forbidden PDF Features", raw.flagsFound.length === 0, raw.flagsFound.length ? `Flags: ${raw.flagsFound.join(", ")}` : "Clean");
  L3.chk("No Encryption", !info["IsEncrypted"], `Encrypted: ${!!info["IsEncrypted"]}`);
  L3.chk("No XFA Form", !info["IsXFAPresent"], `XFA: ${info["IsXFAPresent"]}`);
  L3.chk("No AcroForm", !info["IsAcroFormPresent"], `AcroForm: ${info["IsAcroFormPresent"]}`);
  L3.chk("Valid PDF Magic Bytes (%PDF)", buf.slice(0, 4).toString("ascii") === "%PDF", "Header check");

  // ── Layer 4: Receipt Type Verification ────────────────────────────────────
  const L4 = makeLayer("Receipt Type Verification (Deposit Only)");
  const isTransfer = text.includes(fp.transferKeyword);
  const hasDepositFrom = text.includes(fp.depositFromKeyword);
  const hasDepositTo = text.includes(fp.depositToKeyword);
  L4.chk("Not a Transfer Receipt", !isTransfer, isTransfer ? "❌ إيصال حوالة — مرفوض" : "✅ ليس حوالة");
  L4.chk("Deposit Source Field (من حساب:)", hasDepositFrom, hasDepositFrom ? "✅ موجود" : "❌ غائب");
  L4.chk("Deposit Destination Field (الى حساب:)", hasDepositTo, hasDepositTo ? "✅ موجود" : "❌ غائب");

  // ── Layer 5: Text Content Fingerprint ─────────────────────────────────────
  const L5 = makeLayer("Text Content Fingerprint");
  for (const phrase of fp.requiredPhrases) {
    L5.chk(`Required phrase: "${phrase}"`, text.includes(phrase), "");
  }
  L5.chk("Amount in Brackets [ N ]", fp.amountPattern.test(text), text.match(fp.amountPattern)?.[0] || "Not found");
  L5.chk("Date Format (YYYY/MM/DD)", fp.datePattern.test(text), text.match(fp.datePattern)?.[0] || "Not found");
  L5.chk("Text Length In Range", text.length >= fp.textLength.min && text.length <= fp.textLength.max, `Length: ${text.length}`);
  L5.chk("Page Count = 1", numpages >= fp.pageCount.min && numpages <= fp.pageCount.max, `Pages: ${numpages}`);

  // ── Layer 6: Metadata Consistency ─────────────────────────────────────────
  const L6 = makeLayer("Metadata Consistency");
  L6.chk("CreationDate Present", !!raw.creationDatePrefix, `CreationDate: ${raw.creationDatePrefix}`);
  L6.chk("ModDate Present", !!raw.modDatePrefix, `ModDate: ${raw.modDatePrefix}`);
  L6.chk("CreationDate == ModDate", raw.creationDatePrefix === raw.modDatePrefix, `Creation: ${raw.creationDatePrefix} / Mod: ${raw.modDatePrefix}`);
  L6.chk("Producer Field Present", !!raw.producer, `Producer: ${raw.producer}`);

  // ── Layer 7: File Size & Compression ──────────────────────────────────────
  const L7 = makeLayer("File Size & Compression");
  L7.chk(`File Size ${cfg.fileSizeMinKB}–${cfg.fileSizeMaxKB} KB`, fileSizeKB >= cfg.fileSizeMinKB && fileSizeKB <= cfg.fileSizeMaxKB, `Size: ${fileSizeKB.toFixed(1)} KB`);
  L7.chk("ColorSpace Objects Present", raw.colorSpaceCount >= 1 && raw.colorSpaceCount <= 8, `Found: ${raw.colorSpaceCount}`);
  L7.chk("FlateDecode is Primary Compression", raw.flateCount > raw.dctCount, `FlateDecode: ${raw.flateCount} vs DCT: ${raw.dctCount}`);
  L7.chk("Has Embedded Images", raw.imageCount >= 1, `Images: ${raw.imageCount}`);

  // ── Layer 8: Beneficiary Identity Verification ────────────────────────────
  const L8 = makeLayer("Beneficiary Identity Verification");
  const extracted = extractDepositInfo(text);
  const normExpectedName = normalizeArabic(expectedName);
  const expectedNameWords = normExpectedName.split(" ").filter(w => w.length > 1);
  const nameWordsInText = expectedNameWords.filter(w => normalizeArabic(text).includes(w));
  const nameWordsInToSection = expectedNameWords.filter(w =>
    normalizeArabic(text.split("الى حساب:")[1] || "").includes(w),
  );
  const nameRatioText = expectedNameWords.length ? nameWordsInText.length / expectedNameWords.length : 0;
  const nameRatioSection = expectedNameWords.length ? nameWordsInToSection.length / expectedNameWords.length : 0;
  const nameMatch = nameRatioText >= 0.8;
  L8.chk("Destination Name Matches (Full Text)", nameMatch,
    nameMatch
      ? `✅ تطابق ${Math.round(nameRatioText * 100)}% — المستخرج: "${extracted.destName}"`
      : `❌ تطابق ${Math.round(nameRatioText * 100)}% — المتوقع: "${expectedName}" | المستخرج: "${extracted.destName}"`,
  );
  L8.chk("Beneficiary Name in 'الى حساب' Section", nameRatioSection >= 0.8,
    nameRatioSection >= 0.8
      ? `✅ الاسم في القسم الصحيح (${Math.round(nameRatioSection * 100)}%)`
      : `❌ الاسم غير موجود في قسم المستلم (${Math.round(nameRatioSection * 100)}%)`,
  );
  const normExpectedAccount = normalizeAccountNumber(expectedAccount);
  const normExtractedAccount = normalizeAccountNumber(extracted.destAccount);
  const accountMatch = normExpectedAccount.length > 0 && normExtractedAccount === normExpectedAccount;
  L8.chk("Destination Account Number Matches", accountMatch,
    accountMatch
      ? `✅ رقم الحساب مطابق: ${extracted.destAccount}`
      : `❌ غير مطابق — المتوقع: "${normExpectedAccount}" | في الإيصال: "${normExtractedAccount}"`,
  );
  const toSectionText = text.split("الى حساب:")[1] || "";
  const accountInToSection = toSectionText.includes(normExpectedAccount);
  L8.chk("Account Number in 'الى حساب' Section", accountInToSection,
    accountInToSection ? "✅ رقم الحساب في قسم المستلم" : "❌ رقم الحساب غير موجود في قسم 'الى حساب'",
  );

  // ── Date Freshness Check (part of Layer 8) ────────────────────────────────
  if (cfg.maxReceiptAgeDays > 0 && extracted.date) {
    const parts = extracted.date.split("/").map(Number);
    const receiptDate = parts.length === 3 ? new Date(parts[0]!, parts[1]! - 1, parts[2]!) : null;
    if (receiptDate && !Number.isNaN(receiptDate.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - receiptDate.getTime()) / (1000 * 60 * 60 * 24));
      const dateFresh = diffDays <= cfg.maxReceiptAgeDays;
      L8.chk(
        `Receipt Date Freshness (max ${cfg.maxReceiptAgeDays} days)`,
        dateFresh,
        dateFresh
          ? `✅ الإيصال حديث — منذ ${diffDays} يوم/أيام`
          : `❌ الإيصال منتهي الصلاحية — صدر منذ ${diffDays} يوم/أيام (الحد الأقصى: ${cfg.maxReceiptAgeDays} أيام)`,
      );
    }
  }

  // ── Layer 9: Currency Verification ────────────────────────────────────────
  const L9 = makeLayer("Currency Verification");
  const extractedCurrency = extractCurrency(text);
  L9.chk("Currency Extracted Successfully", !!extractedCurrency,
    extractedCurrency ? `✅ العملة: "${extractedCurrency}"` : "❌ تعذّر استخراج العملة",
  );
  if (extractedCurrency) {
    const amountLine = (text.match(/\n([^\n]*?)\[\s*[\d,]+\s*\]/)?.[1] || "").trim();
    const amountWordsLine = (text.match(/\]\s*المبلغ\s*\n([^\n]+)/)?.[1] || "").trim();
    const currencyConsistent =
      normalizeArabic(amountWordsLine).includes(normalizeArabic(extractedCurrency)) ||
      normalizeArabic(amountLine).includes(normalizeArabic(extractedCurrency));
    L9.chk("Currency Consistent Within Receipt", currencyConsistent,
      currencyConsistent ? `✅ العملة متسقة: "${extractedCurrency}"` : "❌ العملة غير متسقة",
    );
    // Internal consistency: the receipt currency is YER (Al-Umqi is a Yemeni bank)
    const currencyMatchResult = matchCurrency("ريال يمني", extractedCurrency);
    L9.chk("Currency is Yemeni Rial (ريال يمني)", currencyMatchResult.match,
      currencyMatchResult.match
        ? `✅ العملة مطابقة (${currencyMatchResult.method}): "${extractedCurrency}"`
        : `❌ العملة في الإيصال "${extractedCurrency}" ليست ريالاً يمنياً`,
    );
  }

  // ── Scoring ───────────────────────────────────────────────────────────────
  let weightedScore = 0;
  const layerSummaries: OmqiLayerSummary[] = layers.map(layer => {
    const layerPct = layer.total > 0 ? (layer.passed / layer.total) * 100 : 100;
    weightedScore += layerPct;
    return {
      layer: layer.name,
      passed: layer.passed,
      total: layer.total,
      score: Math.round(layerPct),
      checks: layer.checks,
    };
  });

  const overallScore = Math.round(weightedScore / layers.length);

  const criticalLayerNames = [
    "Security & Integrity Flags",
    "Receipt Type Verification (Deposit Only)",
    "Beneficiary Identity Verification",
    "Text Content Fingerprint",
    "Currency Verification",
  ];

  const criticalFailed = layerSummaries.filter(
    l => criticalLayerNames.includes(l.layer) && l.score < 100,
  );

  const isValid = overallScore >= cfg.minScore && criticalFailed.length === 0;

  const rejectionReasons = criticalFailed
    .flatMap(cf => cf.checks.filter(c => !c.pass).map(c => c.detail))
    .filter(Boolean);

  return {
    valid: isValid,
    confidence: overallScore,
    criticalFailures: criticalFailed.map(l => ({
      layer: l.layer,
      failedChecks: l.checks.filter(c => !c.pass).map(c => ({ label: c.label, detail: c.detail })),
    })),
    layers: layerSummaries,
    extractedData: {
      receiptNumber: extracted.receiptNumber,
      amount: extracted.amount,
      currency: extractedCurrency,
      date: extracted.date,
      destName: extracted.destName,
      destAccount: extracted.destAccount,
      sourceName: extracted.sourceName,
      sourceAccount: extracted.sourceAccount,
      producer: raw.producer,
      pageCount: numpages,
      fileSizeKB: Math.round(fileSizeKB * 10) / 10,
    },
    rejectionReason: rejectionReasons.join(" | ") || undefined,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
//  Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Verify a PDF buffer as an Al-Umqi bank deposit receipt.
 *
 * @param pdfBuffer   Raw PDF bytes
 * @param expectedName     Name of the account owner (beneficiary)
 * @param expectedAccount  Account number of the beneficiary
 * @param cfg              Admin-configurable thresholds
 */
export async function verifyOmqiReceipt(
  pdfBuffer: Buffer,
  expectedName: string,
  expectedAccount: string,
  cfg: OmqiConfig = DEFAULT_OMQI_CONFIG,
): Promise<OmqiVerifyResult> {
  if (pdfBuffer.slice(0, 4).toString("ascii") !== "%PDF") {
    return {
      valid: false,
      confidence: 0,
      criticalFailures: [{ layer: "File Validation", failedChecks: [{ label: "PDF Magic Bytes", detail: "الملف ليس PDF صحيحاً" }] }],
      layers: [],
      extractedData: { receiptNumber: null, amount: null, currency: null, date: null, destName: null, destAccount: null, sourceName: null, sourceAccount: null, producer: null, pageCount: 0, fileSizeKB: 0 },
      rejectionReason: "الملف المُرسَل ليس ملف PDF صحيحاً",
    };
  }

  let parsedData: { text: string; info: Record<string, unknown>; numpages: number };
  try {
    parsedData = await pdfParse(pdfBuffer, { max: 1 });
  } catch {
    return {
      valid: false,
      confidence: 0,
      criticalFailures: [{ layer: "File Validation", failedChecks: [{ label: "PDF Parse", detail: "تعذّر قراءة محتوى PDF — الملف تالف أو مشفَّر" }] }],
      layers: [],
      extractedData: { receiptNumber: null, amount: null, currency: null, date: null, destName: null, destAccount: null, sourceName: null, sourceAccount: null, producer: null, pageCount: 0, fileSizeKB: 0 },
      rejectionReason: "تعذّر قراءة محتوى PDF — الملف تالف أو مشفَّر",
    };
  }

  // Fast rejection for transfer receipts (normalize first so Presentation Forms match)
  const normalizedText = parsedData.text.normalize("NFKC");
  if (normalizedText.includes(BANK_FINGERPRINT.transferKeyword)) {
    const senderMatch = normalizedText.match(/السيد:\s*([\u0600-\u06FF\s]+?)(?:\n|\/)/);
    const senderName = senderMatch ? senderMatch[1]!.trim() : null;
    return {
      valid: false,
      confidence: 0,
      criticalFailures: [{ layer: "Receipt Type Verification (Deposit Only)", failedChecks: [{ label: "Not a Transfer Receipt", detail: "❌ هذا إيصال حوالة — يُقبل فقط إيصال الإيداع المباشر" }] }],
      layers: [],
      extractedData: { receiptNumber: null, amount: null, currency: null, date: null, destName: senderName, destAccount: null, sourceName: null, sourceAccount: null, producer: null, pageCount: 0, fileSizeKB: 0 },
      rejectionReason: "الإيصال المُقدَّم هو إيصال حوالة وليس إيداعاً مباشراً. يُقبل فقط إيصال الإيداع.",
    };
  }

  return verifyPdfBuffer(pdfBuffer, parsedData, expectedName, expectedAccount, cfg);
}

/**
 * Build OmqiConfig from flat system settings object.
 */
export function buildOmqiConfig(settings: Record<string, string>): OmqiConfig {
  function n(key: string, def: number): number {
    const v = Number(settings[key]);
    return Number.isFinite(v) && v > 0 ? v : def;
  }
  return {
    minScore:           n("omqi_min_score",             DEFAULT_OMQI_CONFIG.minScore),
    fileSizeMinKB:      n("omqi_file_size_min_kb",      DEFAULT_OMQI_CONFIG.fileSizeMinKB),
    fileSizeMaxKB:      n("omqi_file_size_max_kb",      DEFAULT_OMQI_CONFIG.fileSizeMaxKB),
    objectCountMin:     n("omqi_object_count_min",      DEFAULT_OMQI_CONFIG.objectCountMin),
    objectCountMax:     n("omqi_object_count_max",      DEFAULT_OMQI_CONFIG.objectCountMax),
    streamCountMin:     n("omqi_stream_count_min",      DEFAULT_OMQI_CONFIG.streamCountMin),
    streamCountMax:     n("omqi_stream_count_max",      DEFAULT_OMQI_CONFIG.streamCountMax),
    maxReceiptAgeDays:  n("omqi_max_receipt_age_days",  DEFAULT_OMQI_CONFIG.maxReceiptAgeDays),
  };
}

/**
 * Hard business-logic check: does the receipt currency match the order currency?
 * This is intentionally SEPARATE from the PDF structure verification so it cannot
 * be bypassed by a high overall score.
 *
 * @param orderCurrencyCode  The order's currency code, e.g. "SAR", "YER", "USD"
 * @param extractedCurrency  The Arabic currency string extracted from the receipt
 * @returns { match, orderCurrencyArabic } — match is false if currencies differ
 */
export function checkReceiptCurrencyMatchesOrder(
  orderCurrencyCode: string,
  extractedCurrency: string | null,
): { match: boolean; orderCurrencyArabic: string } {
  const orderCurrencyArabic = resolveExpectedCurrency(orderCurrencyCode);
  if (!extractedCurrency) {
    return { match: false, orderCurrencyArabic };
  }
  const result = matchCurrency(orderCurrencyArabic, extractedCurrency);
  return { match: result.match, orderCurrencyArabic };
}
