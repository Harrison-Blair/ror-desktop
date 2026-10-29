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
    latestChat().then((chat) => {
      // A message sent or a New chat since then wins.
      if (!chat || generation.current !== start) return;
      setChatId(chat.id);
      setMessages(chat.messages);
      setUsage(chat.usage);
    }, fail);
  }, [fail]);

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
    if (running || model === null || text.trim() === "") return false;
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
    sendMessage({
      turnId,
      chatId,
      text,
      model,
      system: systemPrompt(openNoteRef.current),
      tools: registry.specs(),
      onEvent,
    })
      .then(({ chatId }) => {
        if (current()) setChatId(chatId);
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
    if (running) stop();
    generation.current++;
    setChatId(null);
    setMessages([]);
    setStreaming("");
    setUsage(NO_USAGE);
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
    answer,
    chooseModel,
    chooseMode,
  };
}

export type ChatController = ReturnType<typeof useChat>;
