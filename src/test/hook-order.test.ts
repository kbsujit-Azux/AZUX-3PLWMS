import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regression guard for React error #310 — "Rendered more hooks than during
 * the previous render".
 *
 * When a component returns early (`if (!pallet) return null`) BEFORE some
 * of its hooks, the hook count changes between renders and React tears the
 * component down. The scan-to-confirm putaway dialog hit this: the operator
 * saw "This screen could not be displayed" instead of the scan dialog.
 *
 * These checks assert the guard comes AFTER every hook in the component.
 */
const SRC = readFileSync("src/routes/pallets.tsx", "utf8");
const INBOUND_SRC = readFileSync("src/routes/inbound.tsx", "utf8");

function componentBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} not found`);

  // Find the end of the parameter list (the body starts after it).
  let depth = 0;
  let paramEnd = -1;
  for (let i = source.indexOf("(", start); i < source.length; i++) {
    const c = source[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) {
        paramEnd = i;
        break;
      }
    }
  }
  if (paramEnd === -1) throw new Error(`could not find the parameters of ${name}`);

  // The body starts at the first "{" after the parameters.
  const bodyStart = source.indexOf("{", paramEnd);
  if (bodyStart === -1) throw new Error(`could not find the body of ${name}`);

  let braceDepth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    const c = source[i];
    if (c === "{") braceDepth++;
    else if (c === "}") {
      braceDepth--;
      if (braceDepth === 0) return source.slice(bodyStart, i);
    }
  }
  throw new Error(`could not find the end of ${name}`);
}

describe("ScanConfirmDialog hook order", () => {
  const body = componentBody(SRC, "ScanConfirmDialog");

  it("declares the early return guard", () => {
    expect(body).toMatch(/if \(!pallet\) return null;/);
  });

  it("calls every hook BEFORE the early return guard", () => {
    const guardIndex = body.indexOf("if (!pallet) return null;");
    expect(guardIndex).toBeGreaterThan(-1);

    // No hook may be called after the guard.
    const afterGuard = body.slice(guardIndex);
    const hookCalls = afterGuard.match(
      /\b(useState|useEffect|useMemo|useCallback|useRef|useContext|useReducer)\s*\(/g,
    );
    expect(hookCalls ?? []).toEqual([]);
  });

  it("declares the hooks it needs before the guard", () => {
    const guardIndex = body.indexOf("if (!pallet) return null;");
    const beforeGuard = body.slice(0, guardIndex);
    expect(beforeGuard).toMatch(/useState\(/);
    expect(beforeGuard).toMatch(/useEffect\(/);
    expect(beforeGuard).toMatch(/useCallback\(/);
    expect(beforeGuard).toMatch(/useMemo\(/);
  });
});

describe("EditWorkOrderInboundDialog hook order", () => {
  const body = componentBody(INBOUND_SRC, "EditWorkOrderInboundDialog");
  it("calls every hook BEFORE the early return guard", () => {
    const guardIndex = body.indexOf("if (!workOrder) return null;");
    expect(guardIndex).toBeGreaterThan(-1);
    const afterGuard = body.slice(guardIndex);
    const hookCalls = afterGuard.match(
      /\b(useState|useEffect|useMemo|useCallback|useRef|useContext|useReducer)\s*\(/g,
    );
    expect(hookCalls ?? []).toEqual([]);
  });
});
