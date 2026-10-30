import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast/Toast";
import {
  type ChatEvent,
  getChatSettings,
  latestChat,
  type Message,
  saveChatModel,
  savePermissionMode,
  sendMessage,
  sendToolResult,
  stopTurn,
  type Usage,
} from "@/lib/chat/chatApi";
import { systemPrompt, toolRegistry } from "@/lib/chat/features";
import {
  type ApprovalRequest,
  type PermissionMode,
  runToolCall,
} from "@/lib/chat/gate";
import {
  deleteChat,
  openChat,
  renameChat,
  setChatArchived,
} from "@/lib/chat/historyApi";
import type { ToolRegistry } from "@/lib/chat/registry";

export type PendingApproval = ApprovalRequest & {
  // The token Rust gave the call.
  token: string;
  answer: (approved: boolean) => void;
};

const NO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

// The chat panel's state. Kept above the panel, so a running turn and its
// approvals survive closing the panel.
export function useChat({
  openNote,
  registry = toolRegistry,
}: {
  // The path of the open note, if any.
  openNote: string | null;
  registry?: ToolRegistry;
}) {
  const notify = useToast();
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // The assistant text that is still streaming.
  const [streaming, setStreaming] = useState("");
  const [running, setRunning] = useState(false);
  const [usage, setUsage] = useState<Usage>(NO_USAGE);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [mode, setMode] = useState<PermissionMode>("manual");
  const [historyOpen, setHistoryOpen] = useState(false);
  // While a history operation runs, nothing is sent and no chat changes.
  const [busy, setBusy] = useState(false);
  const pendingOps = useRef(0);
  // History operations run one at a time, in order.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // Settles when the running turn has ended in Rust, after its last save.
  const turnEnded = useRef<Promise<unknown>>(Promise.resolve());
  // Counts moves to another chat, so a late operation can tell that the
  // user moved on.
  const moves = useRef(0);
  // The chat shown, for operations that end later.
  const shownId = useRef<string | null>(null);
  // Read when a tool call arrives, so a switch applies to the next call.
  const modeRef = useRef(mode);
  const openNoteRef = useRef(openNote);
  // Counts New chats, so a turn from an old chat leaves the new one alone.
  const generation = useRef(0);
  // The running turn. Its controller is aborted when it stops or ends, so
  // its calls never run.
  const activeTurn = useRef<{ id: string; abort: AbortController } | null>(
    null,
  );
  const loaded = useRef(false);
  // A mode the user picks wins over the saved one that loads later.
  const modeChosen = useRef(false);

  useEffect(() => {
    openNoteRef.current = openNote;
  }, [openNote]);

  const showChatId = useCallback((id: string | null) => {
    shownId.current = id;
    setChatId(id);
  }, []);

  const fail = useCallback(
    (e: unknown) => notify({ kind: "error", message: errorMessage(e) }),
    [notify],
  );

  // Loads the settings and reopens the last chat, the first time the panel
  // opens.
  const load = useCallback(() => {
    if (loaded.current) return;
    loaded.current = true;
    const start = generation.current;
    getChatSettings().then((settings) => {
      setModel((current) => current ?? settings.model);
      if (modeChosen.current) return;
      modeRef.current = settings.permissionMode;
      setMode(settings.permissionMode);
    }, fail);
    // The read joins the history queue, so a delete or archive of that chat
    // waits for it, then leaves the chat.
    const read = queue.current.then(latestChat);
    queue.current = read.catch(() => {});
    read.then((chat) => {
      // A message sent or a New chat since then wins.
      if (!chat || generation.current !== start) return;
      showChatId(chat.id);
      setMessages(chat.messages);
      setUsage(chat.usage);
    }, fail);
  }, [fail, showChatId]);

  // The source of truth for approvals: their resolvers must run once, outside
  // state updates.
  const pending = useRef<PendingApproval[]>([]);
  const showApprovals = useCallback((list: PendingApproval[]) => {
    pending.current = list;
    setApprovals(list);
  }, []);

  const answerAll = useCallback(
    (approved: boolean) => {
      for (const approval of pending.current) approval.answer(approved);
      showApprovals([]);
    },
    [showApprovals],
  );

  const answer = (token: string, approved: boolean) => {
    for (const approval of pending.current) {
      if (approval.token === token) approval.answer(approved);
    }
    showApprovals(pending.current.filter((a) => a.token !== token));
  };

  const send = (text: string) => {
    if (running || pendingOps.current > 0 || model === null) return false;
    if (text.trim() === "") return false;
    const turn = ++generation.current;
    const current = () => generation.current === turn;
    const controller = new AbortController();
    const { signal } = controller;
    const turnId = crypto.randomUUID();
    activeTurn.current = { id: turnId, abort: controller };
    setRunning(true);
    setStreaming("");
    const onEvent = (event: ChatEvent) => {
      if (!current()) return;
      switch (event.type) {
        case "textDelta":
          setStreaming((text) => text + event.text);
          break;
        case "message":
          if (event.message.role === "assistant") setStreaming("");
          setMessages((list) => [...list, event.message]);
          break;
        case "toolCall": {
          if (signal.aborted) break;
          const { token } = event;
          // A card for a stopped turn is never shown.
          const approve = (request: ApprovalRequest) =>
            signal.aborted
              ? Promise.resolve(false)
              : new Promise<boolean>((resolve) =>
                  showApprovals([
                    ...pending.current,
                    { ...request, token, answer: resolve },
                  ]),
                );
          runToolCall(registry, event.call, {
            mode: modeRef.current,
            approve,
            signal,
          })
            .then((output) => {
              if (!signal.aborted) return sendToolResult(token, output);
            })
            .catch(fail);
          break;
        }
        case "usage":
          setUsage(event.usage);
          break;
        case "toast":
          notify({ kind: "error", message: event.message });
          break;
      }
    };
    turnEnded.current = sendMessage({
      turnId,
      chatId,
      text,
      model,
      system: systemPrompt(openNoteRef.current),
      tools: registry.specs(),
      onEvent,
    })
      .then(({ chatId }) => {
        if (current()) showChatId(chatId);
      }, fail)
      .finally(() => {
        controller.abort();
        if (activeTurn.current?.id === turnId) activeTurn.current = null;
        setRunning(false);
        answerAll(false);
        if (current()) setStreaming("");
      });
    return true;
  };

  const stop = () => {
    const turn = activeTurn.current;
    answerAll(false);
    if (!turn) return;
    turn.abort.abort();
    stopTurn(turn.id).catch(fail);
  };

  const newChat = () => {
    if (activeTurn.current) stop();
    moves.current++;
    generation.current++;
    showChatId(null);
    setMessages([]);
    setStreaming("");
    setUsage(NO_USAGE);
  };

  // Runs `op` after the history operations before it.
  const enqueue = <T>(op: () => Promise<T>) => {
    pendingOps.current++;
    setBusy(true);
    const result = queue.current.then(op);
    queue.current = result.catch(() => {});
    return result.finally(() => {
      pendingOps.current--;
      setBusy(pendingOps.current > 0);
    });
  };

  // Shows a saved chat in place of the current one. A running turn stops,
  // and the chat is read once the turn has saved for the last time. When
  // the chat can't be read, the current one stays.
  const open = (id: string) => {
    if (activeTurn.current) stop();
    const move = ++moves.current;
    enqueue(() => turnEnded.current.then(() => openChat(id))).then((chat) => {
      if (moves.current !== move) return;
      generation.current++;
      showChatId(chat.id);
      setMessages(chat.messages);
      setStreaming("");
      setUsage(chat.usage);
    }, fail);
  };

  // Changes saved chat `id`. When `leaves` is set and that chat is still
  // the one shown, a new chat starts.
  const change = (id: string, op: () => Promise<void>, leaves: boolean) => {
    const move = moves.current;
    return enqueue(op).then(() => {
      if (leaves && moves.current === move && shownId.current === id) {
        newChat();
      }
    });
  };

  const chooseModel = (next: string) => {
    setModel(next);
    saveChatModel(next).catch(fail);
  };

  const chooseMode = (next: PermissionMode) => {
    modeChosen.current = true;
    modeRef.current = next;
    setMode(next);
    savePermissionMode(next).catch(fail);
  };

  return {
    chatId,
    messages,
    streaming,
    running,
    usage,
    approvals,
    model,
    mode,
    load,
    send,
    stop,
    newChat,
    open,
    rename: (id: string, title: string) =>
      change(id, () => renameChat(id, title), false),
    setArchived: (id: string, archived: boolean) =>
      change(id, () => setChatArchived(id, archived), archived),
    remove: (id: string) => change(id, () => deleteChat(id), true),
    busy,
    historyOpen,
    toggleHistory: () => setHistoryOpen((open) => !open),
    closeHistory: () => setHistoryOpen(false),
    answer,
    chooseModel,
    chooseMode,
  };
}

export type ChatController = ReturnType<typeof useChat>;
