/**
 * Treat Arabic digits and English number words as the same value.
 * "7:30" and "seven thirty" both fold to "7:30".
 */

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
}
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
}

const HOUR = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve"
const MINUTE = "o'clock|fifteen|thirty|forty-five|forty five|forty|fifty"
const SMALL = Object.keys(ONES).join("|")
const TEN = Object.keys(TENS).join("|")

export function foldNumbers(raw: string): string {
  let s = raw.toLowerCase().replace(/[‘’]/g, "'")
  s = s.replace(new RegExp(`\\b(${HOUR})\\s+(${MINUTE}|o'clock)\\b`, "g"), (_, hour: string, minute: string) => {
    const h = ONES[hour]
    if (minute === "o'clock") return `${h}:00`
    if (minute === "fifteen") return `${h}:15`
    if (minute === "thirty") return `${h}:30`
    if (minute === "forty") return `${h}:40`
    if (minute === "fifty") return `${h}:50`
    return `${h}:45`
  })
  s = s.replace(/\b(\d{1,2})[:.](\d{2})\b/g, (_, h: string, m: string) => `${Number(h)}:${m}`)
  s = s.replace(new RegExp(`\\b(${TEN})[\\s-]+(${SMALL})\\b`, "g"), (_, ten: string, one: string) => {
    return String(TENS[ten] + ONES[one])
  })
  s = s.replace(new RegExp(`\\b(${TEN})\\b`, "g"), (word) => String(TENS[word]))
  s = s.replace(new RegExp(`\\b(${SMALL})\\b`, "g"), (word) => String(ONES[word]))
  return s
}
