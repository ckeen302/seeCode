// The landing page's live demo (Section 6.1): Valid Palindrome's two pointers, step by step,
// computed by running the reference solution's logic in TypeScript (no recorded video).

export const DEMO_CODE = `class Solution:
    def isPalindrome(self, s: str) -> bool:
        l, r = 0, len(s) - 1
        while l < r:
            while l < r and not s[l].isalnum():
                l += 1
            while l < r and not s[r].isalnum():
                r -= 1
            if s[l].lower() != s[r].lower():
                return False
            l += 1
            r -= 1
        return True`

export interface DemoStep {
  l: number
  r: number
  /** 1-based line of DEMO_CODE that runs now. */
  line: number
  say: string
  /** Indexes already matched with their mirror (the invariant). */
  matched: number[]
  /** Indexes skipped because they are not letters or digits. */
  skipped: number[]
  /** The pair being compared on this step. */
  comparing: boolean
  result: boolean | null
}

const isAlnum = (c: string) => /^[\p{L}\p{N}]$/u.test(c)
const show = (c: string) => (c === " " ? "space" : `'${c}'`)

export function palindromeSteps(s: string): DemoStep[] {
  const steps: DemoStep[] = []
  const matched: number[] = []
  const skipped: number[] = []
  let l = 0
  let r = s.length - 1
  const push = (step: Omit<DemoStep, "l" | "r" | "matched" | "skipped">) =>
    steps.push({ l, r, matched: [...matched], skipped: [...skipped], ...step })

  push({
    line: 3,
    say: "Start l at the left end and r at the right end.",
    comparing: false,
    result: null,
  })
  while (l < r) {
    while (l < r && !isAlnum(s[l])) {
      skipped.push(l)
      push({
        line: 6,
        say: `${show(s[l])} isn't a letter or digit, so l skips it.`,
        comparing: false,
        result: null,
      })
      l += 1
    }
    while (l < r && !isAlnum(s[r])) {
      skipped.push(r)
      push({
        line: 8,
        say: `${show(s[r])} isn't a letter or digit, so r skips it.`,
        comparing: false,
        result: null,
      })
      r -= 1
    }
    const a = s[l].toLowerCase()
    const b = s[r].toLowerCase()
    if (a !== b) {
      push({
        line: 10,
        say: `'${a}' ≠ '${b}': the ends differ, so it's not a palindrome.`,
        comparing: true,
        result: false,
      })
      return steps
    }
    push({
      line: 9,
      say:
        l === r
          ? `l and r meet at '${a}'. Nothing left to compare.`
          : `'${s[l]}' and '${s[r]}' match, ignoring case. Move both inward.`,
      comparing: true,
      result: null,
    })
    matched.push(l, r)
    l += 1
    r -= 1
  }
  push({
    line: 13,
    say: "The pointers crossed and every pair matched: return True.",
    comparing: false,
    result: true,
  })
  return steps
}
