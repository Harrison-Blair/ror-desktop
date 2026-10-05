import { describe, expect, it, vi } from "vitest";
import { parseDiceExpression, rollDice } from "./dice";

describe("strict dice notation", () => {
  it.each([
    "d20",
    "2D6 + 1d8 - 3",
    "-d20-d4+2",
    "1+d1",
    "d100",
    "2d7+2",
    "100d1000000",
    "d6+1000000",
    "d6-1000000",
    "\t+d6\n- 2",
  ])("accepts %s", (input) => {
    expect(parseDiceExpression(input).terms.length).toBeGreaterThan(0);
  });
  it.each([
    "",
    "   ",
    "2 d 6",
    "d6+-2",
    "d6--d4",
    "1",
    "0d6",
    "101d6",
    "d0",
    "d1000001",
    "50d6+51d4",
    "d6+1000001",
    "d6-1000001",
    "d6.2",
    "d6*2",
    "(d6)",
    "d6/2",
    "d6;alert(1)",
    "'d6'",
    '"d6"',
    "`d6`",
    "d6#",
    "d6?",
    "d6%",
    "d6&",
    "d6+",
    "dé",
    "d6\u00a0+2",
    "__proto__",
    "constructor",
    "toString",
    "hasOwnProperty",
    "prototype",
    "..",
    "%2e%2e%2f",
    "/d6",
    "d6".padEnd(201, " "),
  ])("rejects all of %s", (input) => {
    expect(() => parseDiceExpression(input)).toThrow();
  });
  it("accepts exactly 200 characters and bounds huge quantities", () => {
    expect(parseDiceExpression("d6".padEnd(200, " ")).terms).toHaveLength(1);
    expect(() => parseDiceExpression(`${"9".repeat(180)}d6`)).toThrow();
  });
});
it.each([null, undefined, 3, [], { expression: "d6" }])(
  "rejects wrong-shaped input %s",
  (input) => {
    expect(() => parseDiceExpression(input as string)).toThrow(
      "Use a dice expression",
    );
  },
);
it("bounds a burst of malformed expressions without calling randomness", () => {
  for (let index = 0; index < 500; index++)
    expect(() => parseDiceExpression("d6;constructor")).toThrow();
});
describe("crypto roller", () => {
  it("rolls signed dice and modifiers with an exact typed breakdown", () => {
    const words = [3, 1, 6];
    const random = vi.fn((array: Uint32Array) => {
      array[0] = words.shift() ?? 0;
    });
    const result = rollDice(parseDiceExpression("2d6-d8+3"), random);
    expect(result.total).toBe(2);
    expect(result.terms.map((term) => term.values)).toEqual([[4, 2], [7], []]);
    expect(result.calculation).toBe("2d6 (4, 2) - 1d8 (7) + 3 = 2");
    expect(random).toHaveBeenCalledTimes(3);
  });
  it("rejects the uint32 tail and includes both d100 endpoints and d1", () => {
    const words = [4294967295, 0, 99, 4294967295];
    const random = vi.fn((array: Uint32Array) => {
      array[0] = words.shift() ?? 0;
    });
    expect(
      rollDice(parseDiceExpression("2d100+d1"), random).terms.map(
        (term) => term.values,
      ),
    ).toEqual([[1, 100], [1]]);
    expect(random).toHaveBeenCalledTimes(4);
  });
  it("reports unavailable, throwing and nonsettling random sources plainly", () => {
    const spec = parseDiceExpression("d6");
    expect(() => rollDice(spec, null)).toThrow(
      "Secure randomness is unavailable",
    );
    expect(() =>
      rollDice(spec, () => {
        throw new Error("secret stack");
      }),
    ).toThrow("Couldn't generate a secure roll");
    expect(() =>
      rollDice(spec, (array) => {
        array[0] = 4294967295;
      }),
    ).toThrow("Couldn't generate a secure roll");
  });
});

it("does not fall back when browser crypto is missing or throws", () => {
  const original = globalThis.crypto;
  try {
    vi.stubGlobal("crypto", undefined);
    expect(() => rollDice(parseDiceExpression("d6"))).toThrow(
      "Secure randomness is unavailable",
    );
    vi.stubGlobal("crypto", {
      getRandomValues() {
        throw new Error("private detail");
      },
    });
    expect(() => rollDice(parseDiceExpression("d6"))).toThrow(
      "Couldn't generate a secure roll",
    );
  } finally {
    vi.stubGlobal("crypto", original);
    vi.unstubAllGlobals();
  }
});
