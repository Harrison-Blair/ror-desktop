import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

export type ImageSource = {
  from: number;
  end: number;
  alt: string;
  path: string;
  error?: string;
};

function markdownText(raw: string) {
  return raw.replace(
    /\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])|&(?:#[xX][\da-fA-F]+|#\d+|[a-zA-Z][a-zA-Z\d]+);/g,
    (match, escaped: string | undefined) => {
      if (escaped) return escaped;
      const element = document.createElement("textarea");
      element.innerHTML = match;
      return element.value;
    },
  );
}

export function imageMime(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png" || extension === "gif" || extension === "webp")
    return `image/${extension}`;
  throw new Error("Only local PNG, JPEG, GIF and WebP images are supported.");
}

export function imageSources(state: EditorState): ImageSource[] {
  const sources: ImageSource[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== "Image") return;
      const url = node.node.getChild("URL");
      if (!url) return false; // Reference images deliberately remain source only.
      const marks = node.node.getChildren("LinkMark");
      const closingAlt = marks.find(
        (mark) => state.sliceDoc(mark.from, mark.to) === "]",
      );
      const source: ImageSource = {
        from: node.from,
        end: state.doc.lineAt(node.to).to,
        alt: markdownText(
          state.sliceDoc(node.from + 2, closingAlt?.from ?? node.from + 2),
        ),
        path: "",
      };
      try {
        const raw = state.sliceDoc(url.from, url.to);
        source.path = decodeURIComponent(
          markdownText(raw.startsWith("<") ? raw.slice(1, -1) : raw),
        );
        if (/^(?:[a-z][a-z\d+.-]*:|[/\\])/i.test(source.path)) {
          throw new Error(
            "Only images with local relative paths are supported.",
          );
        }
        imageMime(source.path);
      } catch (error) {
        source.error =
          error instanceof URIError
            ? "Couldn't decode this image path."
            : String(error).replace(/^Error: /, "");
      }
      sources.push(source);
      return false;
    },
  });
  return sources;
}
