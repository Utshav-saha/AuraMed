// backend app/api/utils.py er parse_dose er mirror

const FRACTIONS: Record<string, number> = { "½": 0.5, "¼": 0.25, "¾": 0.75 };
const TOKEN = "(\\d+(?:\\.\\d+)?/\\d+|\\d+(?:\\.\\d+)?|[½¼¾])";
const DOSE_RE = new RegExp(`${TOKEN}\\s*[+\\-–]\\s*${TOKEN}\\s*[+\\-–]\\s*${TOKEN}`);

function num(tok: string): number {
  if (tok in FRACTIONS) return FRACTIONS[tok];
  if (tok.includes("/")) {
    const [a, b] = tok.split("/");
    return Number(a) / Number(b);
  }
  return Number(tok);
}

export type Dose = [number, number, number];

export function parseDose(instruction?: string | null): Dose {
  if (!instruction) return [0, 0, 0];
  const m = DOSE_RE.exec(instruction);
  if (!m) return [0, 0, 0];
  return [num(m[1]), num(m[2]), num(m[3])];
}

export function isValidDose(instruction: string): boolean {
  return DOSE_RE.test(instruction);
}

export function mealTiming(instruction?: string | null): string | null {
  const s = (instruction ?? "").toLowerCase();
  if (s.includes("before")) return "Before food";
  if (s.includes("after")) return "After food";
  if (s.includes("with")) return "With food";
  return null;
}

export function fmtQty(n: number): string {
  if (n === 0.5) return "½";
  if (n === 0.25) return "¼";
  if (n === 0.75) return "¾";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function dosePattern(d: Dose): string {
  return d.map(fmtQty).join(" + ");
}

export function dailyTotal(instruction?: string | null): number {
  return parseDose(instruction).reduce((a, b) => a + b, 0);
}

export const DOSE_LABELS = ["Morning", "Noon", "Night"] as const;

// "1+0+1 • After food" -> {pattern:"1+0+1", meal:"After food"}
export function splitInstruction(instruction: string): { pattern: string; meal: string } {
  const [pattern, ...rest] = instruction.split("•");
  return { pattern: pattern.trim(), meal: rest.join("•").trim() };
}

export function joinInstruction(pattern: string, meal: string): string {
  return meal ? `${pattern.trim()} • ${meal}` : pattern.trim();
}
