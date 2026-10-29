import type { TreeEntry } from "@/components/FileTree/FileTree";

function countInside(entry: TreeEntry) {
  let files = 0;
  let folders = 0;
  for (const child of entry.children ?? []) {
    if (child.kind === "file") files++;
    else {
      folders++;
      const inner = countInside(child);
      files += inner.files;
      folders += inner.folders;
    }
  }
  return { files, folders };
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

export function deleteQuestion(entry: TreeEntry) {
  const { files, folders } = countInside(entry);
  const parts = [
    files > 0 && plural(files, "file"),
    folders > 0 && plural(folders, "folder"),
  ].filter(Boolean);
  if (parts.length === 0) return `Move “${entry.name}” to the trash?`;
  return `Move “${entry.name}” and the ${parts.join(" and ")} inside it to the trash?`;
}
