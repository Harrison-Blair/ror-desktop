import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { Compartment, EditorState, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  lineNumbers,
  WidgetType,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";
import type { WorkspaceApi } from "../api/workspace";
import { loadImage } from "./image-resource";
import { type ImageSource, imageSources } from "./images";

class ImageWidget extends WidgetType {
  private dispose?: () => void;
  constructor(
    readonly source: ImageSource,
    readonly api: WorkspaceApi,
    readonly generation: number,
    readonly path: string,
    readonly revision: number,
  ) {
    super();
  }
  eq(other: ImageWidget) {
    return (
      this.source.path === other.source.path &&
      this.source.alt === other.source.alt &&
      this.source.error === other.source.error &&
      this.path === other.path &&
      this.generation === other.generation &&
      this.revision === other.revision
    );
  }
  toDOM(view: EditorView) {
    const container = document.createElement("div");
    container.className = "inline-preview";
    const status = document.createElement("span");
    status.className = "image-status";
    status.textContent = this.source.error || "Loading image…";
    container.append(status);
    if (this.source.error) {
      container.classList.add("image-error");
      return container;
    }
    const fail = (error: string) => {
      container.classList.add("image-error");
      status.textContent = `Couldn't load this image: ${error}`;
      container.replaceChildren(status);
      view.requestMeasure();
    };
    this.dispose = loadImage(
      this.api,
      this.generation,
      this.source.path,
      this.path,
      (url) => {
        const img = document.createElement("img");
        img.alt = this.source.alt;
        img.onload = () => view.requestMeasure();
        img.onerror = () =>
          fail("The file may be damaged or no longer there. Try Refresh.");
        img.src = url;
        container.replaceChildren(img);
        view.requestMeasure();
      },
      fail,
    );
    return container;
  }
  destroy() {
    this.dispose?.();
  }
  ignoreEvent() {
    return true;
  }
}

const highlighting = HighlightStyle.define([
  { tag: tags.heading, color: "var(--heading)", fontWeight: "700" },
  { tag: tags.processingInstruction, color: "var(--mark)" },
  { tag: tags.link, color: "var(--link)" },
  { tag: tags.url, color: "var(--link)" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.quote, color: "var(--quote)" },
  { tag: tags.monospace, color: "var(--mark)" },
]);

function previews(
  api: WorkspaceApi,
  generation: number,
  path: string,
  revision: number,
) {
  const build = (state: EditorState) =>
    Decoration.set(
      imageSources(state).map((source) =>
        Decoration.widget({
          widget: new ImageWidget(source, api, generation, path, revision),
          block: true,
          side: 1,
        }).range(source.end),
      ),
      true,
    );
  return StateField.define<DecorationSet>({
    create: build,
    update: (value, transaction) =>
      transaction.docChanged ||
      syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
        ? build(transaction.state)
        : value,
    provide: (field) => EditorView.decorations.from(field),
  });
}

type Props = {
  content: string;
  generation: number;
  path: string;
  revision: number;
  lineNumbers: boolean;
  readOnly: boolean;
  api: WorkspaceApi;
  onChange(content: string): void;
};
export function NoteEditor(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const callback = useRef(props.onChange);
  callback.current = props.onChange;
  const compartments = useRef({
    numbers: new Compartment(),
    editable: new Compartment(),
    images: new Compartment(),
  });
  const initial = useRef(props.content);
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          markdown(),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          syntaxHighlighting(highlighting),
          EditorView.lineWrapping,
          compartments.current.numbers.of(lineNumbers()),
          compartments.current.editable.of(EditorState.readOnly.of(false)),
          compartments.current.images.of([]),
          EditorView.contentAttributes.of({
            "aria-label": "Note source",
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callback.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      view.current = null;
      editor.destroy();
    };
  }, []);
  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.editable.reconfigure([
        EditorState.readOnly.of(props.readOnly),
        EditorView.editable.of(!props.readOnly),
      ]),
    });
  }, [props.readOnly]);
  useEffect(() => {
    view.current?.dispatch({
      effects: compartments.current.images.reconfigure(
        previews(props.api, props.generation, props.path, props.revision),
      ),
    });
  }, [props.api, props.generation, props.path, props.revision]);
  return (
    <div
      ref={host}
      className={`note-editor ${props.lineNumbers ? "show-line-numbers" : "hide-line-numbers"}`}
    />
  );
}
