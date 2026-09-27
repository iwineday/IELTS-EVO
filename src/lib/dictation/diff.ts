/**
 * Word-level alignment for dictation and recitation checks.
 * Accuracy = reference words that were heard or spoken, over reference length.
 * Contractions match the full form (it's / it is). A hyphen matches a space (open-source / open source).
 */
import { foldNumbers } from "./numbers"

export interface AlignedToken {
  text: string
  /** ok = matched, miss = in the script but not in the attempt, extra = in the attempt only. */
  status: "ok" | "miss" | "extra"
}

export interface DiffResult {
  /** 0..1 */
  accuracy: number
  hits: number
  total: number
  alignment: AlignedToken[]
}

export function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w.length > 0 && w !== "-")
}

export function countWords(raw: string): number {
  return tokenize(raw).length
}

/** Longest-common-subsequence alignment. Fine up to ~800 words. */
export function diffWords(reference: string, attempt: string): DiffResult {
  const ref = tokenize(reference)
  const hyp = tokenize(attempt)
  const n = ref.length
  const m = hyp.length

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = ref[i] === hyp[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const alignment: AlignedToken[] = []
  let i = 0
  let j = 0
  let hits = 0
  while (i < n && j < m) {
    if (ref[i] === hyp[j]) {
      alignment.push({ text: ref[i], status: "ok" })
      hits++
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      alignment.push({ text: ref[i], status: "miss" })
      i++
    } else {
      alignment.push({ text: hyp[j], status: "extra" })
      j++
    }
  }
  while (i < n) alignment.push({ text: ref[i++], status: "miss" })
  while (j < m) alignment.push({ text: hyp[j++], status: "extra" })

  return {
    accuracy: n === 0 ? 0 : hits / n,
    hits,
    total: n,
    alignment,
  }
}

/** First option is the default. Later options are used when the other side already has that phrase. */
const CONTRACTIONS: Array<[RegExp, string[]]> = [
  [/\bit's\b/g, ["it is", "it has"]],
  [/\bi'm\b/g, ["i am"]],
  [/\bi've\b/g, ["i have"]],
  [/\bi'll\b/g, ["i will"]],
  [/\bi'd\b/g, ["i would", "i had"]],
  [/\byou're\b/g, ["you are"]],
  [/\byou've\b/g, ["you have"]],
  [/\byou'll\b/g, ["you will"]],
  [/\byou'd\b/g, ["you would", "you had"]],
  [/\bwe're\b/g, ["we are"]],
  [/\bwe've\b/g, ["we have"]],
  [/\bwe'll\b/g, ["we will"]],
  [/\bwe'd\b/g, ["we would", "we had"]],
  [/\bthey're\b/g, ["they are"]],
  [/\bthey've\b/g, ["they have"]],
  [/\bthey'll\b/g, ["they will"]],
  [/\bthey'd\b/g, ["they would", "they had"]],
  [/\bhe's\b/g, ["he is", "he has"]],
  [/\bhe'll\b/g, ["he will"]],
  [/\bhe'd\b/g, ["he would", "he had"]],
  [/\bshe's\b/g, ["she is", "she has"]],
  [/\bshe'll\b/g, ["she will"]],
  [/\bshe'd\b/g, ["she would", "she had"]],
  [/\bthat's\b/g, ["that is"]],
  [/\bwhat's\b/g, ["what is"]],
  [/\bwho's\b/g, ["who is"]],
  [/\bthere's\b/g, ["there is"]],
  [/\bhere's\b/g, ["here is"]],
  [/\blet's\b/g, ["let us"]],
  [/\bdon't\b/g, ["do not"]],
  [/\bdoesn't\b/g, ["does not"]],
  [/\bdidn't\b/g, ["did not"]],
  [/\bcan't\b/g, ["cannot"]],
  [/\bwon't\b/g, ["will not"]],
  [/\bisn't\b/g, ["is not"]],
  [/\baren't\b/g, ["are not"]],
  [/\bwasn't\b/g, ["was not"]],
  [/\bweren't\b/g, ["were not"]],
  [/\bhaven't\b/g, ["have not"]],
  [/\bhasn't\b/g, ["has not"]],
  [/\bhadn't\b/g, ["had not"]],
  [/\bcouldn't\b/g, ["could not"]],
  [/\bshouldn't\b/g, ["should not"]],
  [/\bwouldn't\b/g, ["would not"]],
  [/\bmustn't\b/g, ["must not"]],
]

function expandContractions(raw: string, other: string): string {
  const otherFlat = other.toLowerCase().replace(/[‘’]/g, "'").replace(/-/g, " ")
  let s = raw.toLowerCase().replace(/[‘’]/g, "'")
  for (const [pattern, options] of CONTRACTIONS) {
    s = s.replace(pattern, () => options.find((option) => otherFlat.includes(option)) ?? options[0])
  }
  return s
}

function prepare(raw: string, other: string): string {
  return expandContractions(foldNumbers(raw), foldNumbers(other)).replace(/-/g, " ")
}

/** Compare a script line with what was written. Contractions and hyphens are not errors. */
export function compareDictation(reference: string, attempt: string): DiffResult {
  return diffWords(prepare(reference, attempt), prepare(attempt, reference))
}

/** Whether one displayed word from the script was covered by the attempt. */
export function wordAccepted(referenceWord: string, attempt: string): boolean {
  const word = referenceWord.toLowerCase().replace(/^[^a-z0-9'-]+|[^a-z0-9'-]+$/g, "")
  if (!word) return true
  const heard = new Set<string>()
  const add = (token: string) => {
    if (!token) return
    heard.add(token)
    for (const part of token.split("-")) if (part) heard.add(part)
    for (const part of tokenize(expandContractions(token, attempt).replace(/-/g, " "))) heard.add(part)
  }
  for (const token of tokenize(attempt)) add(token)
  for (const token of tokenize(prepare(attempt, referenceWord))) add(token)
  const pieces = tokenize(prepare(word, attempt))
  return pieces.length > 0 && pieces.every((part) => heard.has(part))
}
