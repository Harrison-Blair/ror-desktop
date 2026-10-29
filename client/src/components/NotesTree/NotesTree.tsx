import {
  Ban,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Trash2,
} from "lucide-react";
import {
  type Dispatch,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type SetStateAction,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useToast } from "@/components/Toast/Toast";
import {
  createEntry,
  deleteEntry,
  type Entry,
  type EntryKind,
  listNotes,
  moveEntry,
  onNotesChanged,
  renameEntry,
} from "@/lib/notesApi";
import { DeleteDialog } from "./DeleteDialog";
import { NotesMenu, type NotesMenuItem } from "./NotesMenu";
import styles from "./NotesTree.module.css";

export type NotesTreeHandle = { startCreate: (kind: EntryKind) => void };

type Editing = { kind: EntryKind; value: string; error: string | null } & (
  | { mode: "create"; parent: string }
  | { mode: "rename"; path: string; name: string }
);

type Row = { entry: Entry; level: number; parent: string };

type Drag = {
  entry: Entry;
  x: number;
  y: number;
  target: string | null;
  refused: boolean;
};

const ROW_HEIGHT = 28;
const DRAG_THRESHOLD = 4;
// Row padding, chevron slot, gap, icon and gap before the name.
const indent = (level: number) => 4 + 16 * (level - 1);
const NAME_OFFSET = 16 + 6 + 16 + 6;

const parentOf = (path: string) =>
  path.slice(0, Math.max(0, path.lastIndexOf("/")));

const remapPath = (path: string, from: string, to: string) => {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return to + path.slice(from.length);
  return path;
};

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

const isNameError = (e: unknown) =>
  typeof e === "object" &&
  e !== null &&
  "code" in e &&
  (e.code === "invalid_name" || e.code === "name_taken");

function visibleRows(
  entries: Entry[],
  expanded: Set<string>,
  level = 1,
  parent = "",
  rows: Row[] = [],
) {
  for (const entry of entries) {
    rows.push({ entry, level, parent });
    if (entry.kind === "folder" && expanded.has(entry.path))
      visibleRows(entry.children ?? [], expanded, level + 1, entry.path, rows);
  }
  return rows;
}

function entriesByPath(entries: Entry[], map = new Map<string, Entry>()) {
  for (const entry of entries) {
    map.set(entry.path, entry);
    entriesByPath(entry.children ?? [], map);
  }
  return map;
}

export function NotesTreeActions({
  onCreate,
}: {
  onCreate: (kind: EntryKind) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="New note"
        title="New note"
        onClick={() => onCreate("note")}
      >
        <FilePlus size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label="New folder"
        title="New folder"
        onClick={() => onCreate("folder")}
      >
        <FolderPlus size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </>
  );
}

// Open folders and the selection belong to the caller, so they outlast the
// tree when the rail panel closes.
export type NotesTreeProps = {
  ref?: Ref<NotesTreeHandle>;
  expanded: Set<string>;
  setExpanded: Dispatch<SetStateAction<Set<string>>>;
  selected: string | null;
  setSelected: Dispatch<SetStateAction<string | null>>;
};

export function NotesTree({
  ref,
  expanded,
  setExpanded,
  selected,
  setSelected,
}: NotesTreeProps) {
  const notify = useToast();
  const errorId = useId();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [focused, setFocused] = useState<string | null>(null);
  const [editing, setEditingState] = useState<Editing | null>(null);
  const [menu, setMenu] = useState<{ entry: Entry; x: number; y: number }>();
  const [deleting, setDeleting] = useState<Entry>();
  const [drag, setDrag] = useState<Drag>();
  // Read by name box handlers that can fire before a re-render, such as a
  // blur right after Esc.
  const editingRef = useRef<Editing | null>(null);
  const saving = useRef(false);
  // Counts edits so a save that resolves late can tell it is out of date.
  const editSession = useRef(0);
  const loadId = useRef(0);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  // A row to focus once it is rendered, if focus would otherwise be lost.
  const pendingFocus = useRef<string | null>(null);
  const suppressClick = useRef(false);

  const setEditing = (value: Editing | null) => {
    editingRef.current = value;
    setEditingState(value);
  };

  const beginEdit = (value: Editing) => {
    editSession.current++;
    setEditing(value);
  };

  const load = useCallback(async () => {
    const id = ++loadId.current;
    let list: Entry[];
    try {
      list = await listNotes();
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
      return;
    }
    if (id !== loadId.current) return;
    const paths = entriesByPath(list);
    const keep = (path: string | null) =>
      path !== null && paths.has(path) ? path : null;
    setEntries(list);
    // An edit whose row or target folder is gone can never be saved.
    const edit = editingRef.current;
    const lost =
      edit &&
      (edit.mode === "rename" ? edit.path : edit.parent) !== "" &&
      !paths.has(edit.mode === "rename" ? edit.path : edit.parent);
    if (edit && lost) {
      let survivor = parentOf(edit.mode === "rename" ? edit.path : edit.parent);
      while (survivor !== "" && !paths.has(survivor))
        survivor = parentOf(survivor);
      editSession.current++;
      editingRef.current = null;
      setEditingState(null);
      pendingFocus.current = survivor || (list[0]?.path ?? null);
    }
    setExpanded((prev) => new Set([...prev].filter((p) => paths.has(p))));
    setSelected(keep);
    setFocused(keep);
  }, [notify, setExpanded, setSelected]);

  useEffect(() => {
    load();
    const unlisten = onNotesChanged(load);
    return () => {
      unlisten.then((stop) => stop());
    };
  }, [load]);

  useEffect(() => {
    const path = pendingFocus.current;
    if (path === null) return;
    const row = rowRefs.current.get(path);
    if (!row) return;
    pendingFocus.current = null;
    if (document.activeElement === document.body) row.focus();
  });

  const byPath = entriesByPath(entries);
  const rows = visibleRows(entries, expanded);
  const isVisible = (path: string | null) =>
    rows.some((row) => row.entry.path === path);
  const tabStop = isVisible(focused)
    ? focused
    : isVisible(selected)
      ? selected
      : rows[0]?.entry.path;

  const returnFocusTo = (path: string | null) => {
    pendingFocus.current = path;
    if (path !== null) setFocused(path);
  };

  const focusNow = (path: string) => {
    setFocused(path);
    rowRefs.current.get(path)?.focus();
  };

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const expand = (path: string) =>
    setExpanded((prev) => new Set(prev).add(path));

  const remapAll = (from: string, to: string) => {
    setExpanded(
      (prev) => new Set([...prev].map((p) => remapPath(p, from, to))),
    );
    setSelected((p) => p && remapPath(p, from, to));
    setFocused((p) => p && remapPath(p, from, to));
  };

  const activate = (entry: Entry) => {
    setSelected(entry.path);
    if (entry.kind === "folder") toggle(entry.path);
  };

  const startCreate = (kind: EntryKind, parent?: string) => {
    const selectedEntry = selected === null ? undefined : byPath.get(selected);
    const target =
      parent ??
      (selectedEntry?.kind === "folder"
        ? selectedEntry.path
        : selectedEntry
          ? parentOf(selectedEntry.path)
          : "");
    if (target !== "") expand(target);
    beginEdit({
      mode: "create",
      parent: target,
      kind,
      value: "Untitled",
      error: null,
    });
  };

  useImperativeHandle(ref, () => ({ startCreate }));

  const startRename = (entry: Entry) =>
    beginEdit({
      mode: "rename",
      path: entry.path,
      name: entry.name,
      kind: entry.kind,
      value: entry.name,
      error: null,
    });

  const finishEdit = (focusPath: string | null) => {
    setEditing(null);
    returnFocusTo(focusPath);
  };

  const cancelEdit = () => {
    const edit = editingRef.current;
    if (!edit) return;
    finishEdit(
      edit.mode === "rename"
        ? edit.path
        : (focused ?? (edit.parent || tabStop) ?? null),
    );
  };

  const saveEdit = async () => {
    const edit = editingRef.current;
    if (!edit || edit.error !== null || saving.current) return;
    if (edit.mode === "rename" && edit.value === edit.name) {
      finishEdit(edit.path);
      return;
    }
    saving.current = true;
    const session = editSession.current;
    const stillEditing = () =>
      editingRef.current !== null && editSession.current === session;
    try {
      const path =
        edit.mode === "create"
          ? await createEntry(edit.parent, edit.kind, edit.value)
          : await renameEntry(edit.path, edit.value);
      if (edit.mode === "rename") remapAll(edit.path, path);
      if (stillEditing()) {
        if (edit.mode === "create") setSelected(path);
        finishEdit(path);
      }
      load();
    } catch (e) {
      const current = editingRef.current;
      if (isNameError(e)) {
        if (current && stillEditing())
          setEditing({ ...current, error: errorMessage(e) });
      } else {
        if (stillEditing())
          finishEdit(edit.mode === "rename" ? edit.path : focused);
        notify({ kind: "error", message: errorMessage(e) });
        load();
      }
    } finally {
      saving.current = false;
    }
  };

  const confirmDelete = async (entry: Entry) => {
    const index = rows.findIndex((row) => row.entry.path === entry.path);
    const level = rows[index]?.level ?? 0;
    const next =
      rows.slice(index + 1).find((row) => row.level <= level) ??
      rows[index - 1];
    setDeleting(undefined);
    returnFocusTo(next?.entry.path ?? null);
    try {
      await deleteEntry(entry.path);
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
    }
    load();
  };

  const moveInto = async (entry: Entry, parent: string) => {
    try {
      const path = await moveEntry(entry.path, parent);
      remapAll(entry.path, path);
      // Shows the moved row so keyboard focus can follow it.
      if (parent !== "") expand(parent);
      returnFocusTo(path);
    } catch (e) {
      notify({ kind: "error", message: errorMessage(e) });
    }
    load();
  };

  const openMenu = (entry: Entry, x: number, y: number) =>
    setMenu({ entry, x, y });

  const openMenuAtRow = (entry: Entry) => {
    const rect = rowRefs.current.get(entry.path)?.getBoundingClientRect();
    if (rect) openMenu(entry, rect.left + 16, rect.top + ROW_HEIGHT);
  };

  const menuItems = (entry: Entry): NotesMenuItem[] => {
    const common: NotesMenuItem[] = [
      { label: "Rename", shortcut: "F2", run: () => startRename(entry) },
      {
        label: "Delete",
        icon: Trash2,
        shortcut: "Del",
        run: () => setDeleting(entry),
      },
    ];
    if (entry.kind === "note") return common;
    return [
      {
        label: "New note",
        icon: FilePlus,
        run: () => startCreate("note", entry.path),
      },
      {
        label: "New folder",
        icon: FolderPlus,
        run: () => startCreate("folder", entry.path),
      },
      "separator",
      ...common,
    ];
  };

  const onTreeKeyDown = (event: KeyboardEvent) => {
    const index = rows.findIndex((row) => row.entry.path === tabStop);
    const row = rows[index];
    if (!row) return;
    const { entry } = row;
    const open = entry.kind === "folder" && expanded.has(entry.path);
    const moveTo = (target?: Row) => target && focusNow(target.entry.path);
    switch (event.key) {
      case "ArrowDown":
        moveTo(rows[index + 1]);
        break;
      case "ArrowUp":
        moveTo(rows[index - 1]);
        break;
      case "Home":
        moveTo(rows[0]);
        break;
      case "End":
        moveTo(rows.at(-1));
        break;
      case "ArrowRight":
        if (entry.kind === "folder" && !open) toggle(entry.path);
        else if (open && rows[index + 1]?.level > row.level)
          moveTo(rows[index + 1]);
        break;
      case "ArrowLeft":
        if (open) toggle(entry.path);
        else moveTo(rows.find((r) => r.entry.path === row.parent));
        break;
      case "Enter":
      case " ":
        activate(entry);
        break;
      case "F2":
        startRename(entry);
        break;
      case "Delete":
        setDeleting(entry);
        break;
      case "F10":
        if (!event.shiftKey) return;
        openMenuAtRow(entry);
        break;
      case "ContextMenu":
        openMenuAtRow(entry);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  const onTreeFocus = (event: FocusEvent) => {
    const path = (event.target as HTMLElement).dataset.path;
    if (path !== undefined) setFocused(path);
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>, entry: Entry) => {
    if (event.button !== 0 || editingRef.current) return;
    const row = event.currentTarget;
    const { pointerId } = event;
    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let drop: string | null = null;
    const move = (moveEvent: globalThis.PointerEvent) => {
      const { clientX: x, clientY: y } = moveEvent;
      if (!dragging) {
        if (Math.hypot(x - startX, y - startY) < DRAG_THRESHOLD) return;
        dragging = true;
        row.setPointerCapture(pointerId);
        document.body.style.userSelect = "none";
      }
      const over = document
        .elementFromPoint(x, y)
        ?.closest<HTMLElement>("[data-drop]");
      const target = over?.dataset.drop ?? null;
      const refused =
        target !== null &&
        entry.kind === "folder" &&
        (target === entry.path || target.startsWith(`${entry.path}/`));
      drop =
        target === null || refused || target === parentOf(entry.path)
          ? null
          : target;
      setDrag({ entry, x, y, target: drop, refused });
    };
    const end = (endEvent: globalThis.PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (!dragging) return;
      document.body.style.userSelect = "";
      // The click that follows the drop must not select or toggle the row.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      });
      setDrag(undefined);
      if (endEvent.type === "pointerup" && drop !== null) moveInto(entry, drop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const renderNameBox = (edit: Editing) => (
    <NameBox
      label={edit.kind === "folder" ? "Folder name" : "Note name"}
      value={edit.value}
      error={edit.error}
      errorId={errorId}
      onChange={(value) => setEditing({ ...edit, value, error: null })}
      onSave={saveEdit}
      onCancel={cancelEdit}
    />
  );

  const renderNewRow = (edit: Editing, level: number) => {
    const Icon = edit.kind === "folder" ? Folder : FileText;
    return (
      <div
        key="new"
        role="treeitem"
        aria-level={level}
        tabIndex={-1}
        className={styles.item}
      >
        <div className={styles.row} style={{ paddingLeft: indent(level) }}>
          <span className={styles.chevron} />
          <Icon
            className={styles.icon}
            size={16}
            strokeWidth={1.75}
            aria-hidden
          />
          {renderNameBox(edit)}
        </div>
        {edit.error && (
          <FieldError id={errorId} message={edit.error} level={level} />
        )}
      </div>
    );
  };

  const renderItems = (items: Entry[], level: number, parent: string) => {
    const rendered = items.map((entry) => renderItem(entry, level));
    if (editing?.mode === "create" && editing.parent === parent) {
      const at =
        editing.kind === "folder"
          ? 0
          : items.filter((item) => item.kind === "folder").length;
      rendered.splice(at, 0, renderNewRow(editing, level));
    }
    return rendered;
  };

  const renderItem = (entry: Entry, level: number) => {
    const folder = entry.kind === "folder";
    const open = folder && expanded.has(entry.path);
    const renaming =
      editing?.mode === "rename" && editing.path === entry.path
        ? editing
        : null;
    const Chevron = open ? ChevronDown : ChevronRight;
    const Icon = folder ? (open ? FolderOpen : Folder) : FileText;
    const rowClass = [
      styles.row,
      drag?.target === entry.path && styles.drop,
      drag?.entry.path === entry.path && styles.dragging,
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <div
        key={entry.path}
        ref={(element) => {
          if (element) rowRefs.current.set(entry.path, element);
          else rowRefs.current.delete(entry.path);
        }}
        role="treeitem"
        aria-level={level}
        aria-expanded={folder ? open : undefined}
        aria-selected={entry.path === selected}
        aria-label={entry.name}
        tabIndex={entry.path === tabStop ? 0 : -1}
        data-path={entry.path}
        className={styles.item}
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the tree handles keys for its rows. */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the tree handles keys for its rows. */}
        <div
          className={rowClass}
          style={{ paddingLeft: indent(level) }}
          data-drop={folder ? entry.path : undefined}
          onClick={() => {
            if (!suppressClick.current) activate(entry);
          }}
          onDoubleClick={() => startRename(entry)}
          onContextMenu={(event: MouseEvent) => {
            event.preventDefault();
            focusNow(entry.path);
            openMenu(entry, event.clientX, event.clientY);
          }}
          onPointerDown={(event) => startDrag(event, entry)}
        >
          <span className={styles.chevron}>
            {folder && <Chevron size={16} strokeWidth={1.75} aria-hidden />}
          </span>
          <Icon
            className={styles.icon}
            size={16}
            strokeWidth={1.75}
            aria-hidden
          />
          {renaming ? (
            renderNameBox(renaming)
          ) : (
            <span className={styles.name} title={entry.name}>
              {entry.name}
            </span>
          )}
        </div>
        {renaming?.error && (
          <FieldError id={errorId} message={renaming.error} level={level} />
        )}
        {open &&
          ((entry.children?.length ?? 0) > 0 ||
            (editing?.mode === "create" && editing.parent === entry.path)) && (
            // biome-ignore lint/a11y/useSemanticElements: a tree group is not a fieldset.
            <div role="group">
              {renderItems(entry.children ?? [], level + 1, entry.path)}
            </div>
          )}
      </div>
    );
  };

  const DragIcon = drag?.entry.kind === "folder" ? Folder : FileText;

  return (
    <div
      className={
        drag?.refused ? `${styles.notes} ${styles.refusing}` : styles.notes
      }
    >
      <div
        role="tree"
        aria-label="Notes"
        onKeyDown={onTreeKeyDown}
        onFocus={onTreeFocus}
      >
        {renderItems(entries, 1, "")}
      </div>
      <div
        className={
          drag?.target === ""
            ? `${styles.rootDrop} ${styles.drop}`
            : styles.rootDrop
        }
        data-drop=""
      />
      {drag && (
        <div
          className={styles.ghost}
          style={{ left: drag.x + 12, top: drag.y + 8 }}
          aria-hidden
        >
          <DragIcon size={16} strokeWidth={1.75} />
          {drag.entry.name}
          {drag.refused && (
            <span className={styles.badge}>
              <Ban size={12} strokeWidth={2} />
            </span>
          )}
        </div>
      )}
      {menu && (
        <NotesMenu
          label={menu.entry.name}
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.entry)}
          onClose={() => {
            returnFocusTo(menu.entry.path);
            setMenu(undefined);
          }}
          onRun={(item) => {
            setMenu(undefined);
            item.run();
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          entry={deleting}
          onCancel={() => {
            returnFocusTo(deleting.path);
            setDeleting(undefined);
          }}
          onConfirm={() => confirmDelete(deleting)}
        />
      )}
    </div>
  );
}

function NameBox({
  label,
  value,
  error,
  errorId,
  onChange,
  onSave,
  onCancel,
}: {
  label: string;
  value: string;
  error: string | null;
  errorId: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  // A blur-triggered save that fails leaves the box open; bring focus back
  // so the error can be read and fixed.
  useEffect(() => {
    if (error !== null) input.current?.focus();
  }, [error]);

  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();

  return (
    <input
      ref={input}
      className={
        error === null ? styles.input : `${styles.input} ${styles.invalid}`
      }
      aria-label={label}
      aria-invalid={error !== null}
      aria-describedby={error === null ? undefined : errorId}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          event.preventDefault();
          if (error === null) onSave();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => (error === null ? onSave() : onCancel())}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      onContextMenu={stop}
    />
  );
}

function FieldError({
  id,
  message,
  level,
}: {
  id: string;
  message: string;
  level: number;
}) {
  return (
    <p
      id={id}
      role="alert"
      className={styles.fieldError}
      style={{ paddingLeft: indent(level) + NAME_OFFSET }}
    >
      {message}
    </p>
  );
}
