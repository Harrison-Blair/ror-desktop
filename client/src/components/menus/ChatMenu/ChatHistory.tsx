import { Archive, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/components/Toast/Toast";
import { type ChatSummary, listChats } from "@/lib/chat/historyApi";
import styles from "./ChatHistory.module.css";
import type { ChatController } from "./useChat";

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);

type Group = "Today" | "This week" | "Earlier";

// Today, the six days before it, or earlier, in local time.
function groupOf(time: number, now: number): Group {
  const days = Math.round((startOfDay(now) - startOfDay(time)) / DAY);
  if (days <= 0) return "Today";
  return days < 7 ? "This week" : "Earlier";
}

// "14:02" today, "Tue" this week, "12 Oct" earlier.
function shortTime(time: number, group: Group) {
  const date = new Date(time);
  if (group === "Today") {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (group === "This week") {
    return date.toLocaleDateString("en-GB", { weekday: "short" });
  }
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const GROUPS: Group[] = ["Today", "This week", "Earlier"];

const titleOf = (chat: ChatSummary) => chat.title || "Untitled chat";

function RenameField({
  title,
  onSave,
  onCancel,
}: {
  title: string;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(title);
  const empty = value.trim() === "";
  return (
    <input
      className={styles.input}
      aria-label="Chat name"
      aria-invalid={empty}
      // The field opens from the Rename button, so focus follows it there.
      // biome-ignore lint/a11y/noAutofocus: see above
      autoFocus
      value={value}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (!empty) onSave(value.trim());
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => (empty ? onCancel() : onSave(value.trim()))}
    />
  );
}

// The saved chats, in place of the thread while the history is open.
export function ChatHistory({ chat }: { chat: ChatController }) {
  const notify = useToast();
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  // Bumped after each change, to read the list again.
  const [version, setVersion] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ChatSummary | null>(null);
  // A running turn still saves its chat, and history operations run in
  // order, so rows don't change until both are done.
  const locked = chat.running || chat.busy;

  const fail = (e: unknown) =>
    notify({ kind: "error", message: errorMessage(e) });
  const refresh = () => setVersion((v) => v + 1);

  // A turn that ends may have titled its chat, so the list is read again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    let current = true;
    listChats(archived, query).then(
      (list) => {
        if (current) setChats(list);
      },
      (e) => notify({ kind: "error", message: errorMessage(e) }),
    );
    return () => {
      current = false;
    };
  }, [archived, query, version, chat.running, notify]);

  const open = (id: string) => {
    chat.open(id);
    chat.closeHistory();
  };

  const rename = (id: string, title: string) => {
    setRenaming(null);
    chat.rename(id, title).then(refresh, fail);
  };

  const toggleArchived = (item: ChatSummary) => {
    chat.setArchived(item.id, !item.archived).then(refresh, fail);
  };

  const remove = (item: ChatSummary) => {
    setDeleting(null);
    chat.remove(item.id).then(refresh, fail);
  };

  const now = Date.now();
  const empty = query.trim()
    ? "No chats match."
    : archived
      ? "No archived chats."
      : "No chats yet.";

  return (
    <div className={styles.history}>
      <div className={styles.filters}>
        <input
          type="search"
          className={styles.field}
          aria-label="Search chats"
          placeholder="Search titles and messages"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <fieldset className={styles.views} aria-label="Chat list">
          {[false, true].map((view) => (
            <button
              key={String(view)}
              type="button"
              className={styles.toggle}
              aria-pressed={archived === view}
              onClick={() => setArchived(view)}
            >
              {view ? "Archived" : "Chats"}
            </button>
          ))}
        </fieldset>
      </div>
      <div className={styles.list}>
        {chats?.length === 0 && <p className={styles.empty}>{empty}</p>}
        {GROUPS.map((group) => {
          const items = (chats ?? []).filter(
            (item) => groupOf(item.updatedAt, now) === group,
          );
          if (items.length === 0) return null;
          return (
            <section key={group} aria-label={group}>
              <h3 className={styles.heading}>{group}</h3>
              <ul className={styles.rows}>
                {items.map((item) => {
                  const current = item.id === chat.chatId;
                  const title = titleOf(item);
                  return (
                    <li
                      key={item.id}
                      className={styles.row}
                      data-current={current || undefined}
                    >
                      {renaming === item.id ? (
                        <RenameField
                          title={item.title}
                          onSave={(next) => rename(item.id, next)}
                          onCancel={() => setRenaming(null)}
                        />
                      ) : (
                        <>
                          <button
                            type="button"
                            className={styles.open}
                            aria-current={current || undefined}
                            onClick={() => open(item.id)}
                          >
                            <span className={styles.title}>{title}</span>
                            <span className={styles.time}>
                              {shortTime(item.updatedAt, group)}
                            </span>
                          </button>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.action}
                              aria-label={`Rename ${title}`}
                              title="Rename"
                              disabled={locked}
                              onClick={() => setRenaming(item.id)}
                            >
                              <Pencil
                                size={14}
                                strokeWidth={1.75}
                                aria-hidden
                              />
                            </button>
                            <button
                              type="button"
                              className={styles.action}
                              aria-label={`${item.archived ? "Unarchive" : "Archive"} ${title}`}
                              title={item.archived ? "Unarchive" : "Archive"}
                              disabled={locked}
                              onClick={() => toggleArchived(item)}
                            >
                              <Archive
                                size={14}
                                strokeWidth={1.75}
                                aria-hidden
                              />
                            </button>
                            <button
                              type="button"
                              className={styles.action}
                              aria-label={`Delete ${title}`}
                              title="Delete"
                              disabled={locked}
                              onClick={() => setDeleting(item)}
                            >
                              <Trash2
                                size={14}
                                strokeWidth={1.75}
                                aria-hidden
                              />
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      {deleting && (
        <ConfirmDialog
          title="Delete chat?"
          message={`“${titleOf(deleting)}” will be deleted. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
