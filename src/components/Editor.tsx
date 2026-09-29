import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";
import styles from "./Editor.module.css";

type EditorProps = {
  /** Contents when the editor mounts. Give `Editor` a `key` to load another note. */
  initialDoc: string;
  onChange: (doc: string) => void;
};

/**
 * A CodeMirror 6 editor. CodeMirror owns the document while it is mounted;
 * React only hears about edits through `onChange`.
 */
export function Editor({ initialDoc, onChange }: EditorProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  // The listener below is created once, so read the latest `onChange` via a ref.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const view = new EditorView({
      parent,
      doc: initialDoc,
      extensions: [
        minimalSetup,
        markdown(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });
    view.focus();
    return () => view.destroy();
  }, [initialDoc]);

  return <div ref={parentRef} className={styles.editor} />;
}
