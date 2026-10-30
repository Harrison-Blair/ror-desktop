import {
  ArrowUp,
  Check,
  ChevronDown,
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
import { openWebLink } from "@/lib/linksApi";
import styles from "./ChatMenu.module.css";
import { ModelMenu } from "./ModelMenu";
import type { ChatController, PendingApproval } from "./useChat";

type ToolResult = Extract<Message, { role: "tool" }>;

const errorMessage = (e: unknown) =>
  typeof e === "object" && e !== null && "message" in e
    ? String(e.message)
    : String(e);

const formatTokens = (n: number) =>
  n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`;

// The header buttons of the chat panel.
export function ChatMenuActions({
  onHistory,
  onNewChat,
}: {
  onHistory: () => void;
  onNewChat: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className={styles.headerButton}
        aria-label="Chat history"
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
      <Icon size={14} strokeWidth={1.75} aria-label={state} />
      <span>{call.name}</span>
      <code className={styles.toolArgument}>{call.arguments}</code>
    </li>
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

  return (
    <div className={styles.thread}>
      {messages.length === 0 && !streaming && (
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
          case "notice":
            return (
              <p
                key={key}
                className={
                  message.level === "error" ? styles.error : styles.notice
                }
              >
                {message.text}
              </p>
            );
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
      <div ref={end} />
    </div>
  );
}

function Composer({ chat }: { chat: ChatController }) {
  const notify = useToast();
  const [text, setText] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const total = chat.usage.inputTokens + chat.usage.outputTokens;

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (chat.running || text.trim() === "") return;
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
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span className={styles.modelName}>
              {chat.model ?? "Choose model"}
            </span>
            <ChevronDown size={14} strokeWidth={1.75} aria-hidden />
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
              onProviderRemoved={chat.providerRemoved}
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
            title={`${chat.usage.inputTokens} input and ${chat.usage.outputTokens} output tokens`}
          >
            {formatTokens(total)} tokens
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
          <button type="submit" className={styles.sendButton} aria-label="Send">
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
      <Thread chat={chat} />
      <Composer chat={chat} />
    </div>
  );
}
