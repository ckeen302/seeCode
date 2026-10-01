// Section 20 input limits that the Workspace applies in the browser. Custom case arguments
// (10 KB) are checked in customCases.ts.

/** Code is at most 50 KB, counted in UTF-8 bytes as the API counts it. */
export const MAX_CODE_BYTES = 50 * 1024

export function utf8Bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

export function codeTooLarge(code: string): boolean {
  // A UTF-16 code unit is at most 3 UTF-8 bytes: short code needs no encoding (every keystroke).
  if (code.length * 3 <= MAX_CODE_BYTES) return false
  return utf8Bytes(code) > MAX_CODE_BYTES
}
