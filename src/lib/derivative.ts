import { safeCompile, math } from "./math";
import { sympyDerivative } from "./sympyDerivativeClient";

export type DerivativeResult =
  | { kind: "value"; value: number; derivativeExpr?: string | null; note?: string }
  | { kind: "undefined"; derivativeExpr?: string | null; note?: string }
  | { kind: "error"; derivativeExpr?: string | null; error: unknown; note?: string };

const H = [1e-1,5e-2,2e-2,1e-2,5e-3,2e-3,1e-3,5e-4,2e-4,1e-4];

export async function computeDerivative(
  expression: string,
  at: number,
  variable = "x"
): Promise<DerivativeResult> {
  const fallbackExpr = deriveLocal(expression, variable);

  try {
    const symbolic = await trySympy(expression, at, variable);
    if (symbolic) return { ...symbolic, derivativeExpr: symbolic.derivativeExpr ?? fallbackExpr };

    const numeric = numericDerivative(expression, at, variable);
    return { ...numeric, derivativeExpr: fallbackExpr };
  } catch (error) {
    return { kind: "error", error, derivativeExpr: fallbackExpr };
  }
}

async function trySympy(expr: string, at: number, variable: string) {
  try {
    const r = await sympyDerivative(expr, at, variable);
    if (r.kind === "value") return { kind: "value" as const, value: r.value, derivativeExpr: r.derivative, note: "SymPy" };
    if (r.kind === "undefined") return { kind: "undefined" as const, derivativeExpr: r.derivative, note: "SymPy" };
    return null;
  } catch {
    return null;
  }
}

function numericDerivative(expr: string, at: number, variable: string): Exclude<DerivativeResult, { kind: "error" }> {
  const f = safeCompile(expr);
  if (!f.node) return { kind: "undefined", note: "Numérico" };

  const vals: number[] = [];
  for (const h of H) {
    const forward = f.evaluate({ [variable]: at + h, x: at + h }) as number;
    const backward = f.evaluate({ [variable]: at - h, x: at - h }) as number;
    if (![forward, backward].every(v => typeof v === "number" && Number.isFinite(v))) continue;
    const approx = (forward - backward) / (2 * h);
    if (Number.isFinite(approx)) vals.push(approx);
  }

  if (vals.length < 4) return { kind: "undefined", note: "Numérico" };

  const recent = vals.slice(-4);
  const mean = avg(recent);
  const span = Math.max(...recent) - Math.min(...recent);
  const stable = span <= Math.max(1e-6, 1e-4 * Math.max(1, Math.abs(mean)));
  if (stable) return { kind: "value", value: mean, note: "Numérico" };
  return { kind: "undefined", note: "Numérico" };
}

function deriveLocal(expr: string, variable: string): string | null {
  try {
    const d = (math as any).derivative(expr, variable);
    if (!d) return null;
    return d.toString();
  } catch {
    return null;
  }
}

function avg(a: number[]) { return a.reduce((s,v)=>s+v,0)/a.length; }
