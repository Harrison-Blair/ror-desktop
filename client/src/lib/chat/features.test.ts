import { describe, expect, it } from "vitest";
import { features, systemPrompt } from "@/lib/chat/features";

describe("the system prompt", () => {
  it("has one line per feature and names the open note", () => {
    const prompt = systemPrompt("Places/Keep.md");

    expect(prompt).toContain("Ror Desktop");
    for (const feature of features) {
      expect(prompt).toContain(`- ${feature.name}: ${feature.summary}`);
    }
    expect(prompt).toContain('The open note is "Places/Keep.md".');
  });

  it("says when no note is open", () => {
    expect(systemPrompt(null)).toContain("No note is open.");
  });
});
