// The chat agent's dice tool. Its rolls join the Dice history.

import type { Tool } from "@/lib/chat/registry";
import { parseDiceExpression, rollDice } from "@/lib/dice";

export const diceRoll: Tool = {
  name: "dice_roll",
  description:
    "Rolls dice from notation such as 1d20 + 5 or 2d6 - 1d4, adds the roll to the Dice history, and returns the total with each die.",
  inputSchema: {
    type: "object",
    properties: {
      notation: { type: "string", description: "The dice, such as 2d6 + 3." },
    },
    required: ["notation"],
    additionalProperties: false,
  },
  kind: "read",
  run: ({ notation }, { app }) => {
    if (typeof notation !== "string") {
      throw new Error("notation must be a string.");
    }
    const result = rollDice(parseDiceExpression(notation));
    app.addRoll(result);
    return `${result.spec.expression}: ${result.calculation}`;
  },
};
