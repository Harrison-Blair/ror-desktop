import type { Entry } from "@/lib/notesApi";

function countInside(entry: Entry) {
  let notes = 0;
  let folders = 0;
  for (const child of entry.children ?? []) {
    if (child.kind === "note") notes++;
    else {
      folders++;
      const inner = countInside(child);
      notes += inner.notes;
      folders += inner.folders;
    }
  }
  return { notes, folders };
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export function deleteQuestion(entry: Entry) {
  const { notes, folders } = countInside(entry);
  const parts = [
    notes > 0 && plural(notes, "note"),
    folders > 0 && plural(folders, "folder"),
  ].filter(Boolean);
  if (parts.length === 0) return `Move “${entry.name}” to the trash?`;
  return `Move “${entry.name}” and the ${parts.join(" and ")} inside it to the trash?`;
}
