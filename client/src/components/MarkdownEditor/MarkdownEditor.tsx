import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Annotation, Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { GFM } from "@lezer/markdown";
import { useEffect, useRef } from "react";
import { livePreview } from "./livePreview";
import styles from "./MarkdownEditor.module.css";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  // Shows plain Markdown with no live preview.
  raw: boolean;
  label: string;
};

// Marks a change that came from `value`, so it isn't reported back.
const fromValue = Annotation.define<boolean>();

// Replaces only the part of `doc` that differs from `value`, so the cursor
// maps through the change and stays near where it was.
function changeTo(doc: string, value: string) {
  const most = Math.min(doc.length, value.length);
  let start = 0;
  while (start < most && doc[start] === value[start]) start++;
  let end = 0;
  while (
    end < most - start &&
    doc[doc.length - 1 - end] === value[value.length - 1 - end]
  ) {
    end++;
  }
  return {
    from: start,
    to: doc.length - end,
    insert: value.slice(start, value.length - end),
  };
}

export function MarkdownEditor({
  value,
  onChange,
  raw,
  label,
}: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const preview = useRef(new Compartment());
  // Read by the editor, which is made once.
  const latest = useRef({ value, raw, onChange });
  latest.current = { value, raw, onChange };

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current ?? undefined,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown({ extensions: GFM }),
          EditorView.lineWrapping,
          preview.current.of(latest.current.raw ? [] : livePreview()),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((tr) => tr.annotation(fromValue))
            ) {
              latest.current.onChange(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, []);

  useEffect(() => {
    view.current?.dispatch({
      effects: preview.current.reconfigure(raw ? [] : livePreview()),
    });
  }, [raw]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const doc = editor.state.doc.toString();
    if (doc === value) return;
    editor.dispatch({
      changes: changeTo(doc, value),
      annotations: fromValue.of(true),
    });
  }, [value]);

  useEffect(() => {
    view.current?.contentDOM.setAttribute("aria-label", label);
  }, [label]);

  return (
    <div
      ref={host}
      className={raw ? `${styles.editor} ${styles.raw}` : styles.editor}
    />
  );
}
