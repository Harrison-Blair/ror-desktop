export type DiceTerm =
  | { kind: "dice"; sign: 1 | -1; quantity: number; sides: number }
  | { kind: "modifier"; sign: 1 | -1; value: number };
export type DiceSpec = { expression: string; terms: DiceTerm[] };
export type DiceResult = {
  spec: DiceSpec;
  terms: { term: DiceTerm; values: number[] }[];
  total: number;
  calculation: string;
};
export type RandomSource = (values: Uint32Array<ArrayBuffer>) => void;

export function parseDiceExpression(input: string): DiceSpec {
  if (typeof input !== "string" || input.length > 200)
    throw new Error("Use a dice expression of at most 200 characters.");
  const whitespace = /^[\t\n\v\f\r ]*/;
  let rest = input.replace(whitespace, "");
  const terms: DiceTerm[] = [];
  let count = 0;
  while (rest) {
    let sign: 1 | -1 = 1;
    if (/^[+-]/.test(rest)) {
      sign = rest[0] === "-" ? -1 : 1;
      rest = rest.slice(1).replace(whitespace, "");
    } else if (terms.length) {
      throw new Error("Separate terms with + or -.");
    }
    const token = /^(?:(\d*)[dD](\d+)|(\d+))/.exec(rest);
    if (!token) throw new Error("Use notation like 2d6 + 1d8 - 3.");
    if (token[3] !== undefined) {
      const value = Number(token[3]);
      if (value > 1_000_000)
        throw new Error("Each modifier must be at most 1,000,000.");
      terms.push({ kind: "modifier", sign, value });
    } else {
      const quantity = token[1] === "" ? 1 : Number(token[1]);
      const sides = Number(token[2]);
      if (quantity < 1 || quantity > 100)
        throw new Error("Use between 1 and 100 dice per term.");
      if (sides < 1 || sides > 1_000_000)
        throw new Error("Dice must have between 1 and 1,000,000 sides.");
      count += quantity;
      if (count > 100) throw new Error("Roll at most 100 dice at once.");
      terms.push({ kind: "dice", sign, quantity, sides });
    }
    rest = rest.slice(token[0].length).replace(whitespace, "");
    if (rest && !/^[+-]/.test(rest))
      throw new Error("Separate terms with + or -.");
    if (/^[+-][\t\n\v\f\r ]*$/.test(rest))
      throw new Error("Add a dice term or number after the sign.");
  }
  if (!count) throw new Error("Include at least one die, such as 1d20.");
  return { expression: input.trim(), terms };
}

const secureRandom: RandomSource = (values) => {
  if (!globalThis.crypto?.getRandomValues)
    throw new Error(
      "Secure randomness is unavailable. Try restarting the app.",
    );
  globalThis.crypto.getRandomValues(values);
};

export function rollDice(
  spec: DiceSpec,
  random: RandomSource | null = secureRandom,
): DiceResult {
  if (!random)
    throw new Error(
      "Secure randomness is unavailable. Try restarting the app.",
    );
  const word = new Uint32Array(1);
  const sample = (sides: number) => {
    const limit = Math.floor(0x1_0000_0000 / sides) * sides;
    for (let attempt = 0; attempt < 128; attempt++) {
      try {
        random(word);
      } catch {
        if (random === secureRandom && !globalThis.crypto?.getRandomValues)
          throw new Error(
            "Secure randomness is unavailable. Try restarting the app.",
          );
        throw new Error("Couldn't generate a secure roll. Please try again.");
      }
      if (word[0] < limit) return (word[0] % sides) + 1;
    }
    throw new Error("Couldn't generate a secure roll. Please try again.");
  };
  const terms = spec.terms.map((term) => ({
    term,
    values:
      term.kind === "dice"
        ? Array.from({ length: term.quantity }, () => sample(term.sides))
        : [],
  }));
  const total = terms.reduce(
    (sum, { term, values }) =>
      sum +
      term.sign *
        (term.kind === "dice" ? values.reduce((a, b) => a + b, 0) : term.value),
    0,
  );
  const calculation = `${terms
    .map(({ term, values }, index) => {
      const sign =
        index === 0
          ? term.sign < 0
            ? "-"
            : ""
          : term.sign < 0
            ? " - "
            : " + ";
      return (
        sign +
        (term.kind === "dice"
          ? `${term.quantity}d${term.sides} (${values.join(", ")})`
          : term.value)
      );
    })
    .join("")} = ${total}`;
  return { spec, terms, total, calculation };
}
