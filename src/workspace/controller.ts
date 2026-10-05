import type {
  PlayerProfile,
  PlayerSnapshot,
  Preferences,
  PreferencesPatch,
  TreeNode,
  Workspace,
  WorkspaceApi,
} from "../api/workspace";
import {
  type DiceResult,
  parseDiceExpression,
  type RandomSource,
  rollDice,
} from "../dice/dice";
import { SaveSession } from "./save-session";

export type NamingTarget =
  | { kind: "note" | "folder"; parentPath: string }
  | { kind: "rename"; node: TreeNode };
export type Naming = { target: NamingTarget; value: string; error?: string };
export type Selection = {
  node: TreeNode;
  loading?: boolean;
  error?: string;
  session?: SaveSession;
};
export type Dialog =
  | { kind: "refresh" }
  | { kind: "trash"; node: TreeNode }
  | { kind: "trash-error"; node: TreeNode; error: string };
export type PlayerState = {
  loading?: boolean;
  error?: string;
  metadata?: SaveSession;
  description?: SaveSession;
};
export const reservedProfilePath = (path: string) =>
  /^(player\.json|player\.md)$/i.test(path);
export type DiceContext = {
  input: string;
  latest: DiceResult | null;
  history: DiceResult[];
  error: string | null;
  rolling: boolean;
  rollNumber: number;
};
const temporaryDiceContext = Symbol("temporary dice session");
const emptyDiceContext = (): DiceContext => ({
  input: "1d20",
  latest: null,
  history: [],
  error: null,
  rolling: false,
  rollNumber: 0,
});
export type WorkspaceState = {
  activeFunction: "player" | "notes" | "dice";
  dice: DiceContext;
  player: PlayerState;
  revealPath: string | null;
  workspace: Workspace | null;
  preferences: Preferences;
  selection: Selection | null;
  initializing: boolean;
  opening: boolean;
  busy: boolean;
  restoreError: string | null;
  message: string | null;
  banner: string | null;
  naming: Naming | null;
  dialog: Dialog | null;
  imageRevision: number;
};

export function findNode(
  nodes: TreeNode[],
  path: string,
): TreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.kind === "folder") {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
}
export const containsPath = (parent: string, path: string) =>
  path === parent || path.startsWith(`${parent}/`);
export const parentPath = (path: string) =>
  path.slice(0, Math.max(0, path.lastIndexOf("/")));
export const nameError = (name: string) =>
  !name.trim() || /[/\\:*?"<>|]|[. ]$/.test(name)
    ? "Names can't contain / \\ : * ? \" < > | or end with a dot or space."
    : undefined;

export class WorkspaceController {
  state: WorkspaceState = {
    activeFunction: "player",
    dice: emptyDiceContext(),
    player: {},
    revealPath: null,
    workspace: null,
    preferences: {
      lastFolder: null,
      sidebarWidth: 260,
      sidebarCollapsed: false,
      showHidden: false,
      lineNumbers: false,
    },
    selection: null,
    initializing: true,
    opening: false,
    busy: false,
    restoreError: null,
    message: null,
    banner: null,
    naming: null,
    dialog: null,
    imageRevision: 0,
  };
  private listeners = new Set<() => void>();
  private request = 0;
  private playerRequest = 0;
  private disposed = false;
  private namingCommit?: Promise<boolean>;
  private preferencesQueue: Promise<void> = Promise.resolve();
  private diceContexts = new Map<string | symbol, DiceContext>([
    [temporaryDiceContext, this.state.dice],
  ]);
  private diceTimers = new Map<
    string | symbol,
    ReturnType<typeof setTimeout>
  >();
  constructor(
    readonly api: WorkspaceApi,
    private diceOptions: {
      random?: RandomSource | null;
      reducedMotion?: () => boolean;
    } = {},
  ) {}
  private diceKey() {
    return this.state.workspace?.displayPath ?? temporaryDiceContext;
  }
  private diceContext(workspace: Workspace | null) {
    const key = workspace?.displayPath ?? temporaryDiceContext;
    let context = this.diceContexts.get(key);
    if (!context) {
      context = emptyDiceContext();
      this.diceContexts.set(key, context);
    }
    return context;
  }
  private updateDice(key: string | symbol, patch: Partial<DiceContext>) {
    const context = this.diceContexts.get(key);
    if (!context || this.disposed) return;
    const next = { ...context, ...patch };
    this.diceContexts.set(key, next);
    if (this.diceKey() === key) this.update({ dice: next });
  }
  editDice(input: string) {
    if (!this.disposed) this.updateDice(this.diceKey(), { input });
  }
  submitDice(expression = this.state.dice.input) {
    if (
      this.disposed ||
      this.state.initializing ||
      this.state.opening ||
      this.state.busy ||
      this.state.dialog ||
      this.state.activeFunction !== "dice" ||
      this.state.dice.rolling
    )
      return;
    const key = this.diceKey();
    try {
      const result = rollDice(
        parseDiceExpression(expression),
        this.diceOptions.random,
      );
      const rolling = !(
        this.diceOptions.reducedMotion?.() ??
        globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
        false
      );
      this.updateDice(key, {
        latest: result,
        rollNumber: this.state.dice.rollNumber + 1,
        history: [result, ...this.state.dice.history].slice(0, 50),
        error: null,
        rolling,
      });
      if (rolling)
        this.diceTimers.set(
          key,
          setTimeout(() => {
            this.diceTimers.delete(key);
            this.updateDice(key, { rolling: false });
          }, 600),
        );
    } catch (error) {
      this.updateDice(key, {
        error:
          error instanceof Error
            ? error.message
            : "Couldn't roll. Please try again.",
      });
    }
  }
  rerollDice() {
    if (this.state.dice.latest)
      this.submitDice(this.state.dice.latest.spec.expression);
  }
  clearDiceHistory() {
    if (
      !this.disposed &&
      !this.state.dice.rolling &&
      !this.state.busy &&
      !this.state.dialog
    )
      this.updateDice(this.diceKey(), { history: [] });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<WorkspaceState>) {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  reportError(message: string) {
    this.update({ message });
  }
  async initialize() {
    this.disposed = false;
    const request = ++this.request;
    try {
      const result = await this.api.initializeWorkspace();
      if (request === this.request) {
        this.update({
          ...result,
          dice: this.diceContext(result.workspace),
          initializing: false,
        });
        if (result.workspace) await this.loadPlayer(result.workspace);
      }
    } catch (error) {
      if (request === this.request)
        this.update({ initializing: false, restoreError: String(error) });
    }
  }
  dispose() {
    for (const timer of this.diceTimers.values()) clearTimeout(timer);
    this.diceTimers.clear();
    this.disposed = true;
    this.request++;
    this.playerRequest++;
    for (const session of this.sessions()) session.dispose();
  }
  private makeSession(content: string, workspace: Workspace, path: string) {
    return new SaveSession(
      content,
      (draft) => this.api.writeNote(workspace.generation, path, draft),
      () => this.update({}),
    );
  }
  edit(content: string) {
    if (!this.state.busy && !this.state.dialog)
      this.state.selection?.session?.edit(content);
  }
  private async save(reason: "navigate" | "close" = "navigate") {
    try {
      for (const session of this.sessions()) await session.flush();
      this.update({ banner: null });
      return true;
    } catch {
      this.update({
        banner: `Couldn't save your changes, so ${reason === "close" ? "the window stays open" : "you're staying here"}. Your changes are still here.`,
      });
      return false;
    }
  }
  private sessions() {
    return [
      ...new Set(
        [
          this.state.player.metadata,
          this.state.player.description,
          this.state.selection?.session,
        ].filter((session): session is SaveSession => !!session),
      ),
    ];
  }
  private installPlayer(
    snapshot: PlayerSnapshot,
    workspace: Workspace,
    description?: SaveSession,
  ): PlayerState {
    let metadataExists = snapshot.metadataExists;
    let descriptionExists = snapshot.descriptionExists;
    return {
      metadata: new SaveSession(
        JSON.stringify(snapshot.profile),
        async (content) => {
          await this.api.writePlayer(
            workspace.generation,
            JSON.parse(content),
            !metadataExists,
          );
          if (!metadataExists) {
            metadataExists = true;
            await this.refreshTree(workspace);
          }
        },
        () => this.update({}),
      ),
      description:
        description ??
        new SaveSession(
          snapshot.description,
          async (content) => {
            await this.api.writePlayerDescription(
              workspace.generation,
              content,
              !descriptionExists,
            );
            if (!descriptionExists) {
              descriptionExists = true;
              this.update({ imageRevision: this.state.imageRevision + 1 });
              await this.refreshTree(workspace);
            }
          },
          () => this.update({}),
        ),
    };
  }
  private async refreshTree(workspace: Workspace) {
    const refreshed = await this.api.refreshWorkspace(workspace.generation);
    if (this.state.workspace?.generation === workspace.generation)
      this.update({ workspace: refreshed });
  }
  private async loadPlayer(workspace: Workspace) {
    const request = ++this.playerRequest;
    this.update({ player: { loading: true } });
    try {
      const snapshot = await this.api.readPlayer(workspace.generation);
      if (
        request === this.playerRequest &&
        this.state.workspace?.generation === workspace.generation &&
        !this.disposed
      )
        this.update({
          player: this.installPlayer(
            snapshot,
            workspace,
            this.state.player.description,
          ),
        });
    } catch (error) {
      if (
        request === this.playerRequest &&
        !this.disposed &&
        this.state.workspace?.generation === workspace.generation
      )
        this.update({
          player: {
            error: String(error),
            description: this.state.player.description,
          },
        });
    }
  }
  editPlayer(profile: PlayerProfile) {
    if (!this.state.busy && !this.state.dialog)
      this.state.player.metadata?.edit(JSON.stringify(profile));
  }
  editDescription(content: string) {
    if (!this.state.busy && !this.state.dialog)
      this.state.player.description?.edit(content);
  }
  async switchFunction(activeFunction: WorkspaceState["activeFunction"]) {
    if (
      this.state.initializing ||
      !(await this.commitNaming()) ||
      this.state.busy ||
      this.state.dialog
    )
      return;
    this.update({ busy: true });
    if (await this.save()) this.update({ activeFunction });
    this.update({ busy: false });
  }
  async openRelatedNote(node: TreeNode) {
    await this.openFile(node);
    if (
      this.state.selection?.node.path === node.path &&
      this.state.activeFunction === "notes"
    )
      this.update({
        revealPath: node.path,
        preferences: { ...this.state.preferences, sidebarCollapsed: false },
      });
  }
  async importPhoto() {
    const workspace = this.state.workspace;
    const metadata = this.state.player.metadata;
    if (!workspace || !metadata || this.state.busy || this.state.dialog) return;
    this.update({ busy: true });
    try {
      const path = await this.api.importPlayerPhoto(workspace.generation);
      if (this.state.workspace?.generation !== workspace.generation) return;
      if (path) {
        metadata.edit(
          JSON.stringify({ ...JSON.parse(metadata.content), photoPath: path }),
        );
        await this.refreshTree(workspace);
      }
    } catch (error) {
      this.update({ message: String(error) });
    } finally {
      this.update({ busy: false });
    }
  }

  async retrySave() {
    if (this.state.busy) return;
    this.update({ busy: true });
    await this.save(
      this.state.banner?.includes("window stays open") ? "close" : "navigate",
    );
    this.update({ busy: false });
  }
  async prepareClose() {
    if (!(await this.commitNaming()) || this.state.busy) return false;
    this.update({ busy: true });
    const saved = await this.save("close");
    this.update({ busy: false });
    return saved;
  }
  async openFile(node: TreeNode) {
    if (node.kind !== "file") return;
    if (this.state.naming && !(await this.commitNaming())) return;
    if (this.state.busy || this.state.dialog || !this.state.workspace) return;
    if (this.sessions().some((session) => session.dirty)) {
      this.update({ busy: true });
      const saved = await this.save();
      this.update({ busy: false });
      if (!saved) return;
    }
    if (
      this.state.selection?.node.path === node.path &&
      !this.state.selection.error
    ) {
      this.update({ activeFunction: "notes" });
      return;
    }
    const workspace = this.state.workspace;
    const request = ++this.request;
    if (this.state.selection?.session !== this.state.player.description)
      this.state.selection?.session?.dispose();
    this.update({
      activeFunction: "notes",
      selection: { node, loading: node.fileKind === "note" },
      message: null,
      banner: null,
    });
    if (node.fileKind !== "note") return;
    try {
      let shared =
        node.path === "player.md" ? this.state.player.description : undefined;
      const content =
        shared?.content ??
        (await this.api.readNote(workspace.generation, node.path));
      if (request !== this.request || this.disposed) return;
      if (node.path === "player.md") shared = this.state.player.description;
      let session = shared ?? this.makeSession(content, workspace, node.path);
      if (node.path === "player.md" && !shared) {
        session.dispose();
        session = new SaveSession(
          content,
          (draft) =>
            this.api.writePlayerDescription(workspace.generation, draft, false),
          () => this.update({}),
        );
        if (request === this.request)
          this.update({
            player: { ...this.state.player, description: session },
          });
      }
      if (request === this.request)
        this.update({
          selection: {
            node,
            session,
          },
        });
    } catch (error) {
      if (request === this.request)
        this.update({ selection: { node, error: String(error) } });
    }
  }
  async pickFolder() {
    if (
      this.state.initializing ||
      !(await this.commitNaming()) ||
      this.state.busy ||
      this.state.dialog
    )
      return;
    this.update({ busy: true });
    if (!(await this.save())) {
      this.update({ busy: false });
      return;
    }
    // Keep the current selection through native picker cancellation.
    this.update({ opening: true });
    try {
      const workspace = await this.api.pickWorkspace();
      if (workspace) {
        ++this.request;
        for (const session of this.sessions()) session.dispose();
        this.update({
          activeFunction:
            this.state.activeFunction === "dice" ? "dice" : "player",
          dice: this.diceContext(workspace),
          player: {},
          revealPath: null,
          workspace,
          selection: null,
          restoreError: null,
          message: null,
          banner: null,
          imageRevision: this.state.imageRevision + 1,
        });
        await this.loadPlayer(workspace);
      }
    } catch (error) {
      this.update({ message: String(error) });
    } finally {
      this.update({ opening: false, busy: false });
    }
  }
  async patchPreferences(patch: PreferencesPatch) {
    if (this.state.naming && !(await this.commitNaming())) return;
    this.update({ preferences: { ...this.state.preferences, ...patch } });
    this.preferencesQueue = this.preferencesQueue.then(async () => {
      try {
        await this.api.updatePreferences(patch);
      } catch (error) {
        this.update({
          message: `Couldn't remember this preference: ${String(error)}`,
        });
      }
    });
    await this.preferencesQueue;
  }
  previewWidth(width: number) {
    this.update({
      preferences: { ...this.state.preferences, sidebarWidth: width },
    });
  }
  async beginNaming(target: NamingTarget) {
    if (!(await this.commitNaming()) || this.state.busy || this.state.dialog)
      return;
    if (target.kind === "rename" && reservedProfilePath(target.node.path)) {
      this.update({ message: "Player profile files cannot be renamed." });
      return;
    }
    this.update({
      naming: {
        target,
        value:
          target.kind === "rename"
            ? target.node.name
            : target.kind === "note"
              ? "untitled.md"
              : "untitled",
      },
    });
  }
  editName(value: string) {
    if (this.state.naming && !this.namingCommit)
      this.update({
        naming: { ...this.state.naming, value, error: undefined },
      });
  }
  cancelNaming() {
    if (!this.namingCommit) this.update({ naming: null });
  }
  commitNaming(): Promise<boolean> {
    if (this.namingCommit) return this.namingCommit;
    if (!this.state.naming) return Promise.resolve(true);
    const naming = this.state.naming;
    const error = nameError(naming.value);
    if (error) {
      this.update({ naming: { ...naming, error } });
      return Promise.resolve(false);
    }
    this.namingCommit = this.applyNaming(naming).finally(() => {
      this.namingCommit = undefined;
    });
    return this.namingCommit;
  }
  private async applyNaming(naming: Naming) {
    const workspace = this.state.workspace;
    if (!workspace || this.state.busy) return false;
    const { target, value } = naming;
    const parent =
      target.kind === "rename"
        ? parentPath(target.node.path)
        : target.parentPath;
    if (
      reservedProfilePath(parent ? `${parent}/${value}` : value) ||
      (target.kind === "rename" && reservedProfilePath(target.node.path))
    ) {
      this.update({
        naming: {
          ...naming,
          error: "This filename is reserved for the player profile.",
        },
      });
      return false;
    }
    const siblings = parent ? findNode(workspace.nodes, parent) : null;
    const nodes = parent
      ? siblings?.kind === "folder"
        ? siblings.children
        : []
      : workspace.nodes;
    if (
      nodes.some(
        (node) =>
          node.name === value &&
          !(target.kind === "rename" && node.path === target.node.path),
      )
    ) {
      this.update({
        naming: {
          ...naming,
          error: `${value} already exists here. Pick another name.`,
        },
      });
      return false;
    }
    this.update({ busy: true });
    try {
      if (target.kind === "rename") {
        const selection = this.state.selection;
        const affectsSelection =
          !!selection && containsPath(target.node.path, selection.node.path);
        if (affectsSelection && !(await this.save())) return false;
        const result = await this.api.renameEntry(
          workspace.generation,
          target.node.path,
          value,
        );
        this.update({
          workspace: result.workspace,
          naming: null,
          imageRevision: this.state.imageRevision + 1,
        });
        if (affectsSelection) {
          ++this.request;
          const path =
            result.path + selection.node.path.slice(target.node.path.length);
          const node = findNode(result.workspace.nodes, path);
          const content = selection.session?.content;
          selection.session?.dispose();
          this.update({
            selection: node
              ? {
                  node,
                  ...(node.kind === "file" &&
                  node.fileKind === "note" &&
                  content !== undefined
                    ? {
                        session: this.makeSession(
                          content,
                          result.workspace,
                          path,
                        ),
                      }
                    : {}),
                }
              : null,
          });
          if (
            node?.kind === "file" &&
            node.fileKind === "note" &&
            content === undefined
          ) {
            this.update({ selection: { node, loading: true } });
            try {
              const text = await this.api.readNote(workspace.generation, path);
              this.update({
                selection: {
                  node,
                  session: this.makeSession(text, result.workspace, path),
                },
              });
            } catch (error) {
              this.update({ selection: { node, error: String(error) } });
            }
          }
        }
      } else {
        const result = await this.api.createEntry(
          workspace.generation,
          target.parentPath,
          value,
          target.kind,
        );
        this.update({
          workspace: result,
          naming: null,
          imageRevision: this.state.imageRevision + 1,
        });
      }
      return true;
    } catch (error) {
      this.update({
        naming: {
          ...naming,
          error: `Couldn't ${target.kind === "rename" ? "rename" : "create"} ${value}: ${String(error)}`,
        },
      });
      return false;
    } finally {
      this.update({ busy: false });
    }
  }
  async requestTrash(node: TreeNode) {
    if (!(await this.commitNaming()) || this.state.busy || this.state.dialog)
      return;
    if (reservedProfilePath(node.path)) {
      this.update({
        message: "Player profile files cannot be moved to Trash.",
      });
      return;
    }
    this.update({ dialog: { kind: "trash", node } });
  }
  dismissDialog() {
    if (this.state.busy) return;
    if (this.state.dialog?.kind === "refresh")
      for (const session of this.sessions()) session.resume();
    this.update({ dialog: null });
  }
  async confirmTrash() {
    const dialog = this.state.dialog;
    const workspace = this.state.workspace;
    if (dialog?.kind !== "trash" || !workspace || this.state.busy) return;
    this.update({ busy: true });
    const selection = this.state.selection;
    const affectsSelection =
      !!selection && containsPath(dialog.node.path, selection.node.path);
    if (affectsSelection && !(await this.save())) {
      this.update({ busy: false, dialog: null });
      return;
    }
    try {
      const result = await this.api.trashEntry(
        workspace.generation,
        dialog.node.path,
      );
      if (affectsSelection) {
        ++this.request;
        selection.session?.dispose();
      }
      this.update({
        workspace: result,
        dialog: null,
        selection: affectsSelection ? null : this.state.selection,
        imageRevision: this.state.imageRevision + 1,
      });
    } catch (error) {
      this.update({
        dialog: {
          kind: "trash-error",
          node: dialog.node,
          error: String(error),
        },
      });
    } finally {
      this.update({ busy: false });
    }
  }
  async requestRefresh() {
    if (this.state.naming && !(await this.commitNaming())) return;
    if (this.state.busy || this.state.dialog || !this.state.workspace) return;
    if (this.sessions().some((session) => session.dirty)) {
      for (const session of this.sessions()) void session.freeze();
      this.update({ dialog: { kind: "refresh" } });
    } else await this.reload();
  }
  async resolveRefresh(choice: "save" | "discard") {
    if (this.state.dialog?.kind !== "refresh" || this.state.busy) return;
    this.update({ busy: true });
    for (const session of this.sessions()) await session.freeze();
    if (choice === "save" && !(await this.save())) {
      this.update({ busy: false });
      return;
    }
    await this.reload();
  }
  private async reload() {
    const workspace = this.state.workspace;
    if (!workspace) return;
    this.update({ busy: true });
    const selection = this.state.selection;
    ++this.request;
    ++this.playerRequest;
    try {
      const result = await this.api.refreshWorkspace(workspace.generation);
      const node = selection && findNode(result.nodes, selection.node.path);
      const content =
        node?.kind === "file" && node.fileKind === "note"
          ? await this.api.readNote(result.generation, node.path)
          : undefined;
      const snapshot = await this.api.readPlayer(result.generation);
      for (const session of this.sessions()) session.dispose();
      const player = this.installPlayer(snapshot, result);
      this.update({
        player,
        workspace: result,
        dialog: null,
        banner: null,
        imageRevision: this.state.imageRevision + 1,
        selection: node
          ? {
              node,
              ...(content !== undefined
                ? {
                    session:
                      node.path === "player.md"
                        ? player.description
                        : this.makeSession(content, result, node.path),
                  }
                : {}),
            }
          : null,
        message:
          selection && !node
            ? `${selection.node.name} is no longer in this folder.`
            : null,
      });
    } catch (error) {
      this.update({
        message: `Couldn't refresh: ${String(error)}. Your changes are still here.`,
        ...(selection?.loading
          ? { selection: { node: selection.node, error: String(error) } }
          : {}),
      });
    } finally {
      this.update({ busy: false });
    }
  }
}
