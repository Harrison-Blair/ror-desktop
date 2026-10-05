import { RefreshCw } from "lucide-react";
import type { PlayerProfile, TreeNode } from "../api/workspace";
import { NoteEditor } from "../editor/NoteEditor";
import type {
  WorkspaceController,
  WorkspaceState,
} from "../workspace/controller";
import { ImageViewer } from "./ImageViewer";
import { IconButton } from "./Sidebar";
export function Player({
  controller,
  state,
}: {
  controller: WorkspaceController;
  state: WorkspaceState;
}) {
  const { workspace, player } = state;
  if (!workspace) return null;
  const profile: PlayerProfile | undefined =
    player.metadata && JSON.parse(player.metadata.content);
  const disabled = state.busy || !!state.dialog;
  const edit = (patch: Partial<PlayerProfile>) =>
    profile && controller.editPlayer({ ...profile, ...patch });
  const notes: TreeNode[] = [];
  const collect = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.kind === "folder") collect(node.children);
      else if (
        node.fileKind === "note" &&
        node.path.startsWith("player-notes/")
      )
        notes.push(node);
    }
  };
  collect(workspace.nodes);
  return (
    <section className="player-page" aria-label="Player profile">
      <header className="player-heading">
        <h1>{profile?.name || workspace.name}</h1>
        <IconButton
          label="Refresh"
          disabled={disabled}
          onClick={() => void controller.requestRefresh()}
        >
          <RefreshCw />
        </IconButton>
      </header>
      {player.loading ? (
        <p>Loading player…</p>
      ) : player.error ? (
        <p role="alert">
          Couldn't load player: {player.error}. Open Notes to inspect the
          profile files.
        </p>
      ) : (
        profile && (
          <>
            <label className="player-field">
              Player name
              <input
                aria-label="Player name"
                value={profile.name}
                disabled={disabled}
                onChange={(event) => edit({ name: event.target.value })}
              />
            </label>
            <section aria-label="Player photo" className="player-photo">
              {profile.photoPath && (
                <ImageViewer
                  api={controller.api}
                  generation={workspace.generation}
                  path={profile.photoPath}
                  name="Player photo"
                  revision={state.imageRevision}
                />
              )}
              <button
                type="button"
                className="pill"
                disabled={disabled}
                onClick={() => void controller.importPhoto()}
              >
                Choose photo
              </button>
              {profile.photoPath && (
                <button
                  type="button"
                  className="pill"
                  disabled={disabled}
                  onClick={() => edit({ photoPath: null })}
                >
                  Remove photo
                </button>
              )}
            </section>
            <section aria-label="Stats">
              <h2>Stats</h2>
              {profile.stats.map((stat, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: stat rows are ordered editable values without persisted IDs.
                <div className="stat-row" key={index}>
                  <input
                    aria-label={`Stat ${index + 1} label`}
                    value={stat.label}
                    disabled={disabled}
                    onChange={(event) =>
                      edit({
                        stats: profile.stats.map((item, row) =>
                          row === index
                            ? { ...item, label: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <input
                    aria-label={`Stat ${index + 1} value`}
                    value={stat.value}
                    disabled={disabled}
                    onChange={(event) =>
                      edit({
                        stats: profile.stats.map((item, row) =>
                          row === index
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    className="pill"
                    aria-label={`Remove stat ${index + 1}`}
                    disabled={disabled}
                    onClick={() =>
                      edit({
                        stats: profile.stats.filter((_, row) => row !== index),
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="pill"
                disabled={disabled}
                onClick={() =>
                  edit({ stats: [...profile.stats, { label: "", value: "" }] })
                }
              >
                Add stat
              </button>
            </section>
            <section aria-label="Description">
              <h2>Description</h2>
              {player.description && (
                <div className="player-description">
                  <NoteEditor
                    key={player.description.id}
                    content={player.description.content}
                    path="player.md"
                    generation={workspace.generation}
                    revision={state.imageRevision}
                    api={controller.api}
                    lineNumbers={state.preferences.lineNumbers}
                    readOnly={disabled}
                    onChange={(content) => controller.editDescription(content)}
                  />
                </div>
              )}
            </section>
          </>
        )
      )}
      <section aria-label="Player related notes">
        <h2>Related notes</h2>
        {notes.length ? (
          notes.map((note) => (
            <button
              type="button"
              className="related-note"
              key={note.path}
              onClick={() => void controller.openRelatedNote(note)}
              disabled={disabled}
            >
              {note.path}
            </button>
          ))
        ) : (
          <p>Add notes inside player-notes using Notes.</p>
        )}
      </section>
    </section>
  );
}
