/**
 * Shared brace-depth JSON extractor for tagged action markers.
 * Used by both orderActions and returnActions to avoid duplicating
 * the same ~40-line parsing logic in each file.
 */

export interface ExtractResult {
  jsonStrings: string[];
  cleanText: string;
}

/**
 * Finds all `[MARKER: {...}]` blocks in `text`, extracts the JSON payload
 * from each using brace-depth counting (handles nested objects/arrays and
 * quoted strings), strips the tags from the text, and returns both the
 * extracted JSON strings and the cleaned text.
 */
export function extractTaggedJsons(
  text: string,
  marker: string,
  maxIterations = 20,
): ExtractResult {
  const jsonStrings: string[] = [];
  let result = text;

  let iterations = 0;
  while (iterations++ < maxIterations) {
    const start = result.indexOf(marker);
    if (start === -1) break;

    const jsonStart = start + marker.length;
    let actualStart = jsonStart;

    // Skip any whitespace (including newlines) after the marker
    while (actualStart < result.length && /[\s]/.test(result[actualStart]!)) {
      actualStart++;
    }

    if (result[actualStart] !== "{") {
      result = result.slice(0, start) + result.slice(start + marker.length);
      continue;
    }

    // Brace-depth counting, ignoring braces inside quoted strings
    let depth = 0;
    let jsonEnd = -1;
    let inString = false;
    let escaped = false;

    for (let i = actualStart; i < result.length; i++) {
      const ch = result[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) { jsonEnd = i; break; }
      }
    }

    if (jsonEnd === -1) {
      result = result.slice(0, start) + result.slice(start + marker.length);
      break;
    }

    const afterJson = jsonEnd + 1;
    const tagEnd = result[afterJson] === "]" ? afterJson + 1 : afterJson;
    const jsonStr = result.slice(actualStart, jsonEnd + 1);
    jsonStrings.push(jsonStr);
    result = result.slice(0, start) + result.slice(tagEnd);
  }

  return { jsonStrings, cleanText: result };
}
