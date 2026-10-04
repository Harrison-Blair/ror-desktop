import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Eye,
  File,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Image,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
} from "lucide-react";
import {
  type ButtonHTMLAttributes,
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { TreeNode } from "../api/workspace";
import {
  type NamingTarget,
  parentPath,
  type WorkspaceController,
  type WorkspaceState,
} from "../workspace/controller";
import { Menu, type MenuItem } from "./Overlays";

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
export function EntryIcon({ node }: { node: TreeNode }) {
  return node.kind === "folder" ? (
    <Folder className="folder-icon" />
  ) : node.fileKind === "note" ? (
    <FileText />
  ) : node.fileKind === "image" ? (
    <Image />
  ) : (
    <File />
  );
}
function NamingInput({
  controller,
  state,
}: {
  controller: WorkspaceController;
  state: WorkspaceState;
}) {
  const naming = state.naming;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.setSelectionRange(
      0,
      naming?.target.kind === "note" ? 8 : (input.current?.value.length ?? 0),
    );
  }, [naming?.target]);
  useEffect(() => {
    if (naming?.error) input.current?.focus();
  }, [naming?.error]);
  if (!naming) return null;
  const target = naming.target;
  const extensionChanged =
    target.kind === "rename" &&
    target.node.kind === "file" &&
    target.node.name.split(".").pop() !== naming.value.split(".").pop();
  return (
    <div className="naming-row">
      <input
        ref={input}
        aria-label="Entry name"
        aria-invalid={!!naming.error}
        aria-describedby="naming-description"
        value={naming.value}
        disabled={state.busy}
        onChange={(event) => controller.editName(event.target.value)}
        onBlur={() => {
          void controller.commitNaming();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            controller.cancelNaming();
          }
          if (event.key === "Enter") {
            event.preventDefault();
            void controller.commitNaming();
          }
        }}
      />
      <div id="naming-description">
        {naming.error && (
          <p className="name-error" role="alert">
            {naming.error}
          </p>
        )}
        {target.kind === "rename" && (
          <p className="name-warning">
            Links to this{" "}
            {target.node.kind === "folder"
              ? "folder"
              : target.node.fileKind === "image"
                ? "image"
                : "note"}{" "}
            in other notes won't be updated.
          </p>
        )}
        {extensionChanged && (
          <p className="name-warning">
            Changing the extension may stop this file opening here.
          </p>
        )}
      </div>
    </div>
  );
}

export function Sidebar({
  controller,
  state,
}: {
  controller: WorkspaceController;
  state: WorkspaceState;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const tree = useRef<HTMLDivElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const resize = useRef<{ start: number; width: number } | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const workspace = state.workspace;
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (resize.current)
        controller.previewWidth(
          Math.max(
            180,
            Math.min(
              480,
              resize.current.width + event.clientX - resize.current.start,
            ),
          ),
        );
    };
    const up = () => {
      if (resize.current) {
        resize.current = null;
        document.body.classList.remove("resizing");
        void controller.patchPreferences({
          sidebarWidth: stateRef.current.preferences.sidebarWidth,
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("resizing");
    };
  }, [controller]);
  if (!workspace) return null;
  const toggleFolder = (node: TreeNode, open?: boolean) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (open ?? !next.has(node.path)) next.add(node.path);
      else next.delete(node.path);
      return next;
    });
  };
  const name = (target: NamingTarget) => {
    if (target.kind !== "rename" && target.parentPath)
      setExpanded((previous) => new Set([...previous, target.parentPath]));
    void controller.beginNaming(target);
  };
  const context = (node: TreeNode, x: number, y: number) => {
    if (state.busy || state.dialog || state.naming) return;
    setMenu({
      x,
      y,
      items: [
        ...(node.kind === "folder"
          ? [
              {
                label: "New note",
                action: () => name({ kind: "note", parentPath: node.path }),
              },
              {
                label: "New folder",
                action: () => name({ kind: "folder", parentPath: node.path }),
              },
            ]
          : []),
        {
          label: "Rename",
          divider: node.kind === "folder",
          action: () => name({ kind: "rename", node }),
        },
        {
          label: "Move to Trash",
          danger: true,
          action: () => {
            void controller.requestTrash(node);
          },
        },
      ],
    });
  };
  const visible: TreeNode[] = [];
  const collect = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (!state.preferences.showHidden && node.name.startsWith(".")) continue;
      visible.push(node);
      if (node.kind === "folder" && expanded.has(node.path))
        collect(node.children);
    }
  };
  collect(workspace.nodes);
  const focusRow = (path: string) => {
    setFocused(path);
    const row = [
      ...(tree.current?.querySelectorAll<HTMLElement>("[data-path]") ?? []),
    ].find((element) => element.dataset.path === path);
    row?.focus();
  };
  const activePath =
    focused && visible.some((node) => node.path === focused)
      ? focused
      : visible[0]?.path;
  const renderNodes = (
    nodes: TreeNode[],
    depth: number,
    parent: string,
  ): ReactNode => (
    <>
      {nodes
        .filter(
          (node) => state.preferences.showHidden || !node.name.startsWith("."),
        )
        .map((node) => (
          <Fragment key={node.path}>
            {state.naming?.target.kind === "rename" &&
            state.naming.target.node.path === node.path ? (
              <div style={{ marginLeft: depth * 16 }}>
                <NamingInput controller={controller} state={state} />
              </div>
            ) : (
              <button
                type="button"
                role="treeitem"
                aria-label={node.name}
                aria-level={depth + 1}
                aria-selected={state.selection?.node.path === node.path}
                aria-expanded={
                  node.kind === "folder" ? expanded.has(node.path) : undefined
                }
                data-path={node.path}
                tabIndex={activePath === node.path ? 0 : -1}
                className={`tree-row ${node.name.startsWith(".") ? "hidden-entry" : ""}`}
                style={{ paddingLeft: 8 + depth * 16 }}
                title={node.name}
                onFocus={() => setFocused(node.path)}
                onClick={() => {
                  if (node.kind === "folder") {
                    void controller.commitNaming().then((valid) => {
                      if (valid && !stateRef.current.busy) toggleFolder(node);
                    });
                  } else void controller.openFile(node);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  focusRow(node.path);
                  context(node, event.clientX, event.clientY);
                }}
                onKeyDown={(event) => {
                  if ((event.target as HTMLElement).tagName === "INPUT") return;
                  const index = visible.findIndex(
                    (entry) => entry.path === node.path,
                  );
                  if (
                    [
                      "ArrowUp",
                      "ArrowDown",
                      "ArrowRight",
                      "ArrowLeft",
                      "Home",
                      "End",
                      "Enter",
                      "F2",
                      "Delete",
                      "ContextMenu",
                    ].includes(event.key) ||
                    (event.key === "F10" && event.shiftKey)
                  )
                    event.preventDefault();
                  if (event.key === "ArrowDown")
                    focusRow(
                      visible[Math.min(visible.length - 1, index + 1)].path,
                    );
                  else if (event.key === "ArrowUp")
                    focusRow(visible[Math.max(0, index - 1)].path);
                  else if (event.key === "Home") focusRow(visible[0].path);
                  else if (event.key === "End")
                    focusRow(visible[visible.length - 1].path);
                  else if (
                    event.key === "ArrowRight" &&
                    node.kind === "folder"
                  ) {
                    if (!expanded.has(node.path)) toggleFolder(node, true);
                    else if (
                      visible[index + 1] &&
                      parentPath(visible[index + 1].path) === node.path
                    )
                      focusRow(visible[index + 1].path);
                  } else if (event.key === "ArrowLeft") {
                    if (node.kind === "folder" && expanded.has(node.path))
                      toggleFolder(node, false);
                    else focusRow(parentPath(node.path));
                  } else if (event.key === "Enter") {
                    if (node.kind === "folder") toggleFolder(node);
                    else void controller.openFile(node);
                  } else if (event.key === "F2") name({ kind: "rename", node });
                  else if (event.key === "Delete")
                    void controller.requestTrash(node);
                  else if (
                    event.key === "ContextMenu" ||
                    (event.key === "F10" && event.shiftKey)
                  ) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    context(node, rect.left + 24, rect.bottom);
                  }
                }}
              >
                {node.kind === "folder" ? (
                  expanded.has(node.path) ? (
                    <ChevronDown className="chevron" />
                  ) : (
                    <ChevronRight className="chevron" />
                  )
                ) : (
                  <span className="chevron" />
                )}
                <EntryIcon node={node} />
                <span className="entry-name">{node.name}</span>
              </button>
            )}
            {node.kind === "folder" &&
              expanded.has(node.path) &&
              renderNodes(node.children, depth + 1, node.path)}
          </Fragment>
        ))}
      {state.naming &&
        state.naming.target.kind !== "rename" &&
        state.naming.target.parentPath === parent && (
          <div style={{ marginLeft: depth * 16 }}>
            <NamingInput controller={controller} state={state} />
          </div>
        )}
    </>
  );
  if (state.preferences.sidebarCollapsed)
    return (
      <aside className="sidebar-rail">
        <IconButton
          label="Expand sidebar"
          onClick={() => {
            void controller.patchPreferences({ sidebarCollapsed: false });
          }}
        >
          <PanelLeftOpen />
        </IconButton>
      </aside>
    );
  return (
    <aside
      ref={sidebar}
      className="sidebar"
      style={{ width: state.preferences.sidebarWidth }}
      aria-label="Workspace"
    >
      <div className="sidebar-header">
        <button
          type="button"
          className="folder-picker"
          title={workspace.displayPath}
          disabled={state.busy}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({
              x: rect.left,
              y: rect.bottom + 4,
              items: [
                {
                  label: "Open folder…",
                  action: () => {
                    void controller.pickFolder();
                  },
                },
              ],
            });
          }}
        >
          <Folder />
          <span>{workspace.name}</span>
          <ChevronsUpDown />
        </button>
        <IconButton
          label="Collapse sidebar"
          onClick={() => {
            void controller.patchPreferences({ sidebarCollapsed: true });
          }}
        >
          <PanelLeftClose />
        </IconButton>
      </div>
      <div className="sidebar-toolbar">
        <IconButton
          label="New note"
          disabled={state.busy}
          onClick={() => name({ kind: "note", parentPath: "" })}
        >
          <FilePlus2 />
        </IconButton>
        <IconButton
          label="New folder"
          disabled={state.busy}
          onClick={() => name({ kind: "folder", parentPath: "" })}
        >
          <FolderPlus />
        </IconButton>
        <span className="toolbar-spacer" />
        <IconButton
          label="Refresh"
          disabled={state.busy}
          onClick={() => {
            void controller.requestRefresh();
          }}
        >
          <RefreshCw className={state.busy && !state.naming ? "spinner" : ""} />
        </IconButton>
        <IconButton
          label="Show hidden files"
          aria-pressed={state.preferences.showHidden}
          onClick={() => {
            void controller.patchPreferences({
              showHidden: !state.preferences.showHidden,
            });
          }}
        >
          <Eye />
        </IconButton>
      </div>
      <div ref={tree} role="tree" aria-label="Files" className="tree">
        {!state.opening && renderNodes(workspace.nodes, 0, "")}
        {!state.opening && !visible.length && !state.naming && (
          <div className="tree-empty">
            <strong>This folder is empty</strong>
            <p>Use the new note or new folder buttons above to start.</p>
          </div>
        )}
      </div>
      <hr
        aria-label="Sidebar width"
        aria-orientation="vertical"
        aria-valuemin={180}
        aria-valuemax={480}
        aria-valuenow={state.preferences.sidebarWidth}
        tabIndex={0}
        className="resize-handle"
        onPointerDown={(event) => {
          event.preventDefault();
          resize.current = {
            start: event.clientX,
            width: state.preferences.sidebarWidth,
          };
          document.body.classList.add("resizing");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            void controller.patchPreferences({
              sidebarWidth: Math.max(
                180,
                Math.min(
                  480,
                  state.preferences.sidebarWidth +
                    (event.key === "ArrowRight" ? 10 : -10),
                ),
              ),
            });
          }
        }}
      />
      {menu && <Menu {...menu} onClose={closeMenu} />}
    </aside>
  );
}
