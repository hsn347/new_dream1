/**
 * Smart phone number normalizer for Arab & common countries.
 * Detects country code from local number patterns and prepends it if missing.
 */

interface CountryProfile {
  code: string;
  localPrefixes: string[];
  localLength: number;
}

// Each entry describes a country by: its code, possible LOCAL leading digits, and LOCAL digit count.
const COUNTRY_PROFILES: CountryProfile[] = [
  // 9-digit countries first (less ambiguous)
  { code: "967", localPrefixes: ["7"],                          localLength: 9  }, // Yemen
  { code: "966", localPrefixes: ["5"],                          localLength: 9  }, // Saudi Arabia
  { code: "971", localPrefixes: ["50","52","54","55","56","58"], localLength: 9 }, // UAE
  { code: "962", localPrefixes: ["77","78","79"],               localLength: 9  }, // Jordan
  { code: "963", localPrefixes: ["9"],                          localLength: 9  }, // Syria
  { code: "218", localPrefixes: ["91","92","94"],               localLength: 9  }, // Libya
  { code: "213", localPrefixes: ["5","6","7"],                  localLength: 9  }, // Algeria
  { code: "212", localPrefixes: ["6","7"],                      localLength: 9  }, // Morocco
  { code: "249", localPrefixes: ["9"],                          localLength: 9  }, // Sudan
  // 10-digit countries
  { code: "964", localPrefixes: ["7"],                          localLength: 10 }, // Iraq
  { code: "20",  localPrefixes: ["10","11","12","15"],          localLength: 10 }, // Egypt
  // 8-digit countries — ordered by specificity to reduce ambiguity
  { code: "968", localPrefixes: ["7","9"],                      localLength: 8  }, // Oman   (7/9 prefix)
  { code: "961", localPrefixes: ["3","7","8"],                  localLength: 8  }, // Lebanon (3/7/8 prefix)
  { code: "965", localPrefixes: ["5","6","9"],                  localLength: 8  }, // Kuwait (5/6/9)
  { code: "973", localPrefixes: ["3","6"],                      localLength: 8  }, // Bahrain (3/6)
  { code: "974", localPrefixes: ["3","5","6","7"],              localLength: 8  }, // Qatar  (catch-all last)
  { code: "216", localPrefixes: ["2","5","9"],                  localLength: 8  }, // Tunisia
];

/**
 * Returns true if `digits` already contains a known country code prefix
 * AND the remaining digits match the expected local length for that country.
 */
function startsWithKnownCode(digits: string): boolean {
  for (const profile of COUNTRY_PROFILES) {
    const { code, localLength } = profile;
    if (digits.startsWith(code) && digits.length === code.length + localLength) {
      return true;
    }
  }
  return false;
}

/**
 * Normalizes a phone number to full international format (digits only, no +).
 * Examples:
 *   "712345678"      → "967712345678"   (Yemeni local)
 *   "512345678"      → "966512345678"   (Saudi local)
 *   "+967712345678"  → "967712345678"
 *   "00966512345678" → "966512345678"
 *   "967712345678"   → "967712345678"   (already correct)
 *   "1012345678"     → "201012345678"   (Egyptian local)
 */
export function normalizePhone(raw: string): string {
  // Strip everything except digits
  let digits = raw.replace(/[^\d]/g, "");

  // Handle 00-prefix international format (e.g. 00967…)
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  // Already has a known country code with matching length → done
  if (startsWithKnownCode(digits)) {
    return digits;
  }

  // Try to detect from local number pattern (length + leading digits)
  for (const { code, localPrefixes, localLength } of COUNTRY_PROFILES) {
    if (digits.length === localLength) {
      for (const prefix of localPrefixes) {
        if (digits.startsWith(prefix)) {
          return code + digits;
        }
      }
    }
  }

  // Unknown format — return digits as-is
  return digits;
}
