import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Copy,
  History,
  LoaderCircle,
  Square,
  SquarePen,
  Wrench,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Markdown } from "@/components/Markdown/Markdown";
import { useToast } from "@/components/Toast/Toast";
import type { Message } from "@/lib/chat/chatApi";
import type { ToolCall } from "@/lib/chat/gate";
import { errorMessage } from "@/lib/errorMessage";
import { openWebLink } from "@/lib/linksApi";
import { ChatHistory } from "./ChatHistory";
import styles from "./ChatMenu.module.css";
import { ModelMenu } from "./ModelMenu";
import type { ChatController, PendingApproval } from "./useChat";

type ToolResult = Extract<Message, { role: "tool" }>;

// The notice `send_error` makes when a provider can't be reached: a fixed
// first line, then the technical detail. Other notices are shown as they are.
const UNREACHABLE = /^(Could not reach [^\n]+\.)\n([\s\S]+)$/;

const formatTokens = (n: number) =>
  n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;

// The header buttons of the chat panel.
export function ChatMenuActions({
  historyOpen,
  onHistory,
  onNewChat,
}: {
  historyOpen: boolean;
  onHistory: () => void;
  onNewChat: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className={styles.headerButton}
        aria-label="Chat history"
        aria-pressed={historyOpen}
        onClick={onHistory}
      >
        <History size={16} strokeWidth={1.75} aria-hidden />
      </button>
      <button
        type="button"
        className={styles.headerButton}
        aria-label="New chat"
        onClick={onNewChat}
      >
        <SquarePen size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </>
  );
}

function ToolStep({ call, result }: { call: ToolCall; result?: ToolResult }) {
  const Icon = !result ? LoaderCircle : result.isError ? CircleAlert : Wrench;
  const state = !result ? "running" : result.isError ? "failed" : "done";
  return (
    <li className={styles.toolStep} data-state={state}>
      <Icon
        className={!result ? styles.spinner : undefined}
        size={14}
        strokeWidth={1.75}
        aria-label={state}
      />
      <span>{call.name}</span>
      <code className={styles.toolArgument}>{call.arguments}</code>
    </li>
  );
}

// Shown while the model works and nothing else in the thread moves. Each
// wait mounts it anew, so its seconds start from 0.
function Thinking() {
  const [start] = useState(Date.now);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [start]);
  return (
    <div className={styles.thinking}>
      <LoaderCircle
        className={styles.spinner}
        size={14}
        strokeWidth={1.75}
        aria-hidden
      />
      <span>Thinking…</span> <span aria-hidden>{seconds}s</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const notify = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      className={styles.copy}
      aria-label={copied ? "Copied" : "Copy message"}
      onClick={() =>
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          (e) => notify({ kind: "error", message: errorMessage(e) }),
        )
      }
    >
      <Icon size={14} strokeWidth={1.75} aria-hidden />
    </button>
  );
}

function ApprovalCard({
  approval,
  onAnswer,
}: {
  approval: PendingApproval;
  onAnswer: (approved: boolean) => void;
}) {
  const id = useId();
  const { tool, preview } = approval;
  return (
    <section className={styles.approval} aria-labelledby={id}>
      <h3 id={id} className={styles.approvalTitle}>
        Allow {tool.name}?
      </h3>
      <p className={styles.approvalTarget}>{preview.target}</p>
      {preview.diff && (
        <pre className={styles.diff}>
          {preview.diff.split("\n").map((line, i) => (
            <span
              // Lines can repeat, and the diff never changes.
              // biome-ignore lint/suspicious/noArrayIndexKey: see above
              key={i}
              className={
                line.startsWith("+") || line.startsWith("-")
                  ? styles.diffChange
                  : undefined
              }
            >
              {line}
              {"\n"}
            </span>
          ))}
        </pre>
      )}
      <div className={styles.approvalButtons}>
        <button
          type="button"
          className={styles.rejectButton}
          onClick={() => onAnswer(false)}
        >
          Reject
        </button>
        <button
          type="button"
          className={styles.approveButton}
          onClick={() => onAnswer(true)}
        >
          Approve
        </button>
      </div>
    </section>
  );
}

function Thread({ chat }: { chat: ChatController }) {
  const notify = useToast();
  const end = useRef<HTMLDivElement>(null);
  const { messages, streaming, approvals } = chat;

  // Follows new text to the end of the thread.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on new content
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [messages, streaming, approvals]);

  const openLink = (url: string) =>
    openWebLink(url).catch((e) =>
      notify({ kind: "error", message: errorMessage(e) }),
    );
  const results = new Map(
    messages
      .filter((m): m is ToolResult => m.role === "tool")
      .map((m) => [m.callId, m]),
  );
  // The messages since this Send. Earlier ones belong to ended turns.
  const turn = messages.slice(chat.turnStart);
  // A tool call of this turn that has no result yet.
  const toolRunning = turn.some(
    (m) =>
      m.role === "assistant" &&
      m.toolCalls?.some((call) => !results.has(call.id)),
  );
  // A final reply: the turn ends once Rust has saved it. A reply with tool
  // calls is never last once they run, since their results follow it.
  const replied = turn.at(-1)?.role === "assistant";
  const thinking =
    chat.running &&
    !replied &&
    !chat.stopped &&
    !streaming &&
    !toolRunning &&
    approvals.length === 0;

  return (
    <div className={styles.thread}>
      {messages.length === 0 && !streaming && !chat.running && (
        <p className={styles.empty}>Ask about your campaign.</p>
      )}
      {messages.map((message, i) => {
        // Messages are only ever added at the end.
        const key = i;
        switch (message.role) {
          case "user":
            return (
              <div key={key} className={styles.user}>
                {message.text}
              </div>
            );
          case "assistant":
            return (
              <div key={key} className={styles.assistant}>
                {message.text && (
                  <>
                    <Markdown text={message.text} onOpenLink={openLink} />
                    <CopyButton text={message.text} />
                  </>
                )}
                {message.toolCalls && message.toolCalls.length > 0 && (
                  <ul className={styles.toolSteps}>
                    {message.toolCalls.map((call) => (
                      <ToolStep
                        key={call.id}
                        call={call}
                        result={results.get(call.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          case "notice": {
            const unreachable = UNREACHABLE.exec(message.text);
            return (
              <p
                key={key}
                className={
                  message.level === "error" ? styles.error : styles.notice
                }
              >
                {unreachable ? (
                  <>
                    {unreachable[1]}
                    <span className={styles.noticeDetail}>
                      {unreachable[2]}
                    </span>
                  </>
                ) : (
                  message.text
                )}
              </p>
            );
          }
          default:
            return null;
        }
      })}
      {streaming && (
        <div className={styles.assistant}>
          <Markdown text={streaming} onOpenLink={openLink} />
        </div>
      )}
      {approvals.map((approval) => (
        <ApprovalCard
          key={approval.token}
          approval={approval}
          onAnswer={(approved) => chat.answer(approval.token, approved)}
        />
      ))}
      {/* A polite live region that is always there, so the row is
          announced when it appears. */}
      <div role="status">{thinking && <Thinking />}</div>
      <div ref={end} />
    </div>
  );
}

function Composer({ chat }: { chat: ChatController }) {
  const notify = useToast();
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const total = chat.usage.inputTokens + chat.usage.outputTokens;
  const usageLabel = `${total} tokens: ${chat.usage.inputTokens} input and ${chat.usage.outputTokens} output`;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (chat.running || chat.busy || text.trim() === "") return;
    if (chat.model === null) {
      notify({ kind: "error", message: "Choose a model first." });
      setMenuOpen(true);
      return;
    }
    if (chat.send(text)) setText("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form className={styles.composer} onSubmit={submit}>
      <textarea
        className={styles.field}
        aria-label="Message"
        placeholder="Message"
        rows={3}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className={styles.composerRow}>
        <div className={styles.modelSlot}>
          <button
            type="button"
            className={styles.toggle}
            aria-label={`Model: ${chat.model ?? "none"}`}
            title={chat.model ?? undefined}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={styles.modelName}>
              {chat.model ?? "Choose model"}
            </span>
            {menuOpen ? (
              <ChevronUp size={14} strokeWidth={1.75} aria-hidden />
            ) : (
              <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
            )}
          </button>
          {menuOpen && (
            <ModelMenu
              model={chat.model}
              backend={chat.backend}
              lockedTo={chat.chatBackend}
              onChoose={(backend, model) => {
                chat.chooseModel(backend, model);
                setMenuOpen(false);
              }}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
        <fieldset className={styles.modes} aria-label="Permission mode">
          {(["manual", "auto"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={styles.toggle}
              aria-pressed={chat.mode === mode}
              title={
                mode === "manual"
                  ? "Ask before tools change your data"
                  : "Run all tools without asking"
              }
              onClick={() => chat.chooseMode(mode)}
            >
              {mode === "manual" ? "Manual" : "Auto"}
            </button>
          ))}
        </fieldset>
        {total > 0 && (
          <span
            className={styles.usage}
            role="img"
            aria-label={usageLabel}
            title={usageLabel}
          >
            {formatTokens(total)}
          </span>
        )}
        {chat.running ? (
          <button
            type="button"
            className={styles.sendButton}
            aria-label="Stop"
            onClick={chat.stop}
          >
            <Square size={14} strokeWidth={1.75} aria-hidden />
          </button>
        ) : (
          <button
            type="submit"
            className={styles.sendButton}
            aria-label="Send"
            disabled={chat.busy}
          >
            <ArrowUp size={16} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
    </form>
  );
}

export function ChatMenu({ chat }: { chat: ChatController }) {
  return (
    <div className={styles.menu}>
      {chat.historyOpen ? (
        <ChatHistory chat={chat} />
      ) : (
        <>
          <Thread chat={chat} />
          <Composer chat={chat} />
        </>
      )}
    </div>
  );
}
