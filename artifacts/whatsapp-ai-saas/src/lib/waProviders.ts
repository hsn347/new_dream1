export const WA_PROVIDERS = [
  {
    id: "evolution",
    name: "Evolution API",
    logo: "⚡",
    desc: "ربط مباشر عبر واتساب (QR Code) — مجاني ومفتوح المصدر",
    docsUrl: "https://doc.evolution-api.com",
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
  {
    id: "twilio",
    name: "Twilio",
    logo: "🔴",
    desc: "خدمة SMS/WhatsApp موثوقة للأعمال — تحتاج حساب Twilio",
    docsUrl: "https://www.twilio.com/docs/whatsapp",
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
  },
  {
    id: "360dialog",
    name: "360dialog",
    logo: "🟢",
    desc: "شريك Meta الرسمي لـ WhatsApp Business API",
    docsUrl: "https://docs.360dialog.com",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    id: "meta",
    name: "Meta Business",
    logo: "🔵",
    desc: "WhatsApp Cloud API الرسمي من Meta",
    docsUrl: "https://developers.facebook.com/docs/whatsapp",
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
  },
  {
    id: "gupshup",
    name: "Gupshup",
    logo: "🟡",
    desc: "منصة رسائل متكاملة تدعم WhatsApp Business",
    docsUrl: "https://docs.gupshup.io",
    color: "text-amber-600 dark:text-amber-300",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
] as const;

export type WaProviderId = (typeof WA_PROVIDERS)[number]["id"];

export type ProviderField = {
  key: string; label: string; placeholder: string;
  type?: "text" | "password"; hint?: string; required?: boolean;
};

export const PROVIDER_FIELDS: Record<string, ProviderField[]> = {
  twilio: [
    { key: "accountSid",  label: "Account SID",  placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", required: true },
    { key: "authToken",   label: "Auth Token",   placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",   type: "password", required: true },
    { key: "fromNumber",  label: "WhatsApp From Number", placeholder: "+14155238886",
      hint: "رقم واتساب Twilio (sandbox أو production) بتنسيق +XXXXXXXXXXX", required: true },
  ],
  "360dialog": [
    { key: "apiKey",      label: "D360 API Key", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", required: true,
      hint: "المفتاح الذي حصلت عليه من لوحة 360dialog" },
    { key: "phoneNumber", label: "رقم الواتساب المسجّل", placeholder: "+966xxxxxxxxx",
      hint: "الرقم المرتبط بحسابك في 360dialog" },
  ],
  meta: [
    { key: "phoneNumberId", label: "Phone Number ID", placeholder: "1234567890", required: true,
      hint: "معرّف رقم الهاتف من Meta Business Manager" },
    { key: "accessToken",   label: "Permanent Access Token", placeholder: "EAAxxxx...", type: "password", required: true },
    { key: "wabaId",        label: "WABA ID", placeholder: "1234567890",
      hint: "WhatsApp Business Account ID من Meta Business Manager" },
    { key: "verifyToken",   label: "Webhook Verify Token", placeholder: "my_custom_verify_token",
      hint: "رمز التحقق الذي ستدخله في إعدادات الـ Webhook في Meta" },
  ],
  gupshup: [
    { key: "apiKey",   label: "Gupshup API Key", placeholder: "xxxxxxxxxxxxxxxx", required: true },
    { key: "appName",  label: "App Name", placeholder: "my-whatsapp-app",
      hint: "اسم التطبيق في لوحة Gupshup" },
    { key: "phone",    label: "Source Phone Number", placeholder: "+966xxxxxxxxx",
      hint: "رقم الواتساب المصدر" },
  ],
};

export function getWebhookUrl(provider: string, userId: number): string {
  const base = window.location.origin.replace(":5000", ":8080");
  const map: Record<string, string> = {
    twilio:      `/api/webhooks/twilio/${userId}`,
    "360dialog": `/api/webhooks/dialog360/${userId}`,
    meta:        `/api/webhooks/meta/${userId}`,
    gupshup:     `/api/webhooks/gupshup/${userId}`,
  };
  return base + (map[provider] ?? "");
}
