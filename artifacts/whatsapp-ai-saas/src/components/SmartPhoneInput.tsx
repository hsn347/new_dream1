import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

interface Country {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: "967", name: "اليمن",       flag: "🇾🇪" },
  { code: "966", name: "السعودية",    flag: "🇸🇦" },
  { code: "971", name: "الإمارات",    flag: "🇦🇪" },
  { code: "965", name: "الكويت",      flag: "🇰🇼" },
  { code: "974", name: "قطر",         flag: "🇶🇦" },
  { code: "973", name: "البحرين",     flag: "🇧🇭" },
  { code: "968", name: "عُمان",       flag: "🇴🇲" },
  { code: "964", name: "العراق",      flag: "🇮🇶" },
  { code: "962", name: "الأردن",      flag: "🇯🇴" },
  { code: "963", name: "سوريا",       flag: "🇸🇾" },
  { code: "961", name: "لبنان",       flag: "🇱🇧" },
  { code: "20",  name: "مصر",         flag: "🇪🇬" },
  { code: "212", name: "المغرب",      flag: "🇲🇦" },
  { code: "213", name: "الجزائر",     flag: "🇩🇿" },
  { code: "216", name: "تونس",        flag: "🇹🇳" },
  { code: "218", name: "ليبيا",       flag: "🇱🇾" },
  { code: "249", name: "السودان",     flag: "🇸🇩" },
  { code: "252", name: "الصومال",     flag: "🇸🇴" },
  { code: "1",   name: "أمريكا/كندا", flag: "🇺🇸" },
  { code: "44",  name: "بريطانيا",    flag: "🇬🇧" },
];

const SORTED = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length);
const QUICK_PICKS = COUNTRIES.slice(0, 8);

function clean(raw: string): string {
  return raw.replace(/[\s\-().]/g, "").replace(/^\+/, "").replace(/^00/, "");
}

function detect(digits: string): Country | null {
  for (const c of SORTED) {
    if (digits.startsWith(c.code)) return c;
  }
  return null;
}

interface SmartPhoneInputProps {
  value: string | null;
  onChange: (normalized: string | null) => void;
  placeholder?: string;
  className?: string;
}

export default function SmartPhoneInput({ value, onChange, placeholder, className }: SmartPhoneInputProps) {
  const [raw, setRaw] = useState(value ?? "");
  const [fallback, setFallback] = useState<Country>(COUNTRIES[0]!);
  const [showAll, setShowAll] = useState(false);
  const prevNorm = useRef<string | null>(null);

  // sync incoming value → raw (only when external value changes)
  useEffect(() => {
    if (value !== null && value !== prevNorm.current) setRaw(value);
  }, [value]);

  const digits  = clean(raw);
  const country = detect(digits);
  const local   = country ? digits.slice(country.code.length) : digits;
  const noCode  = digits.length > 0 && !country;

  const normalized = digits.length === 0
    ? null
    : country
      ? digits
      : fallback.code + digits;

  useEffect(() => {
    if (normalized === prevNorm.current) return;
    prevNorm.current = normalized;
    onChange(normalized);
  }, [normalized]);

  const handleInput = (val: string) => {
    // only allow phone-safe characters: digits, +, spaces, dashes, parens, dots
    const filtered = val.replace(/[^\d+\s\-().]/g, "");
    setRaw(filtered);
  };

  const pickFallback = (c: Country) => {
    setFallback(c);
    setShowAll(false);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* حقل الإدخال الموحّد */}
      <div className="relative">
        {/* علم الدولة — على اليمين دائماً بصرف النظر عن اتجاه الصفحة */}
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none select-none">
          {country ? (
            <span className="text-base leading-none" title={`+${country.code} ${country.name}`}>
              {country.flag}
            </span>
          ) : noCode ? (
            <span className="text-base leading-none opacity-60">{fallback.flag}</span>
          ) : (
            <span className="text-sm text-muted-foreground">📱</span>
          )}
        </div>
        <input
          type="tel"
          inputMode="numeric"
          dir="ltr"
          value={raw}
          onChange={(e) => handleInput(e.target.value)}
          placeholder={placeholder ?? "9671234567  أو  712345678"}
          className="w-full h-11 pl-4 pr-10 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring text-left transition-all"
        />
      </div>

      {/* شريط الحالة */}
      {digits.length > 0 && (
        <div className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-all",
          country
            ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
            : "bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-300",
        )}>
          {country ? (
            <>
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1">
                {country.flag} <span className="font-semibold">{country.name}</span>
                {" — "}
                <span dir="ltr" className="font-mono">+{country.code} {local}</span>
              </span>
            </>
          ) : (
            <>
              <span className="shrink-0">{fallback.flag}</span>
              <span className="flex-1">
                سيُضاف مفتاح <span className="font-semibold">{fallback.name}</span>{" "}
                — النتيجة:{" "}
                <span dir="ltr" className="font-mono font-semibold">+{fallback.code}{digits}</span>
              </span>
            </>
          )}
        </div>
      )}

      {/* اختيار الدولة سريع (تظهر فقط إذا لم يُكتشف الكود) */}
      {noCode && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground pe-1">اختر مفتاح الدولة:</p>
          <div className="flex flex-wrap gap-1.5">
            {(showAll ? COUNTRIES : QUICK_PICKS).map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => pickFallback(c)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all",
                  fallback.code === c.code
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <span>{c.flag}</span>
                <span>{c.name}</span>
                <span className="text-[10px] opacity-60" dir="ltr">+{c.code}</span>
                {fallback.code === c.code && <Check className="w-3 h-3" />}
              </button>
            ))}
            {!showAll && COUNTRIES.length > QUICK_PICKS.length && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              >
                <ChevronDown className="w-3 h-3" />
                المزيد
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
