import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { imageMime, imageSources } from "./images";

const parse = (doc: string) =>
  imageSources(EditorState.create({ doc, extensions: [markdown()] }));
describe("Markdown image sources", () => {
  it("extracts multiple inline images in order and ignores code and references", () => {
    const doc =
      '![one](one.png "title") ![two](two.JPG)\n`![code](no.png)`\n```md\n![fence](no.png)\n```\n![ref][asset]\n[asset]: ref.png';
    const sources = parse(doc);
    expect(sources.map((source) => source.path)).toEqual([
      "one.png",
      "two.JPG",
    ]);
    expect(sources.map((source) => source.alt)).toEqual(["one", "two"]);
    expect(sources[0].end).toBe(doc.indexOf("\n"));
    expect(sources[1].end).toBe(sources[0].end);
  });
  it("decodes angle wrappers, Markdown escapes, entities and percent encoding once", () => {
    expect(parse("![alt](<photos/a%20b%2520&amp;c\\(1\\).PNG>)")[0].path).toBe(
      "photos/a b%20&c(1).PNG",
    );
    expect(parse("![hash](photos/a#b?c.png)")[0].path).toBe("photos/a#b?c.png");
    expect(imageMime("x.JPEG")).toBe("image/jpeg");
  });
  it("places multiline previews after the final source line", () => {
    const doc = 'before ![alt](\n  <photo.png>\n  "title") after\nend';
    expect(parse(doc)[0].end).toBe(doc.lastIndexOf("\n"));
  });
  it("reports malformed encoding, external and unsupported destinations inline", () => {
    for (const path of [
      "https://host/a.png",
      "//host/a.png",
      "/a.png",
      "file:a.png",
      "data:image/png,x",
      "%ZZ.png",
      "photo.svg",
      "%2Fa.png",
      "C:/a.png",
    ]) {
      expect(parse(`![alt](${path})`)[0]?.error, path).toBeTruthy();
    }
  });
});
