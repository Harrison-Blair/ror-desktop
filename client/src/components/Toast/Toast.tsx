import { CircleAlert, Info, X } from "lucide-react";
import {
  createContext,
  type FocusEventHandler,
  type MouseEventHandler,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import styles from "./Toast.module.css";

type ToastKind = "error" | "info";
type Notification = { kind: ToastKind; message: string };
type ToastItem = Notification & { id: number };
type Notify = (notification: Notification) => void;

const INFO_TIMEOUT = 5000;

const ToastContext = createContext<Notify | null>(null);

type ToastProps = Notification & {
  onDismiss?: () => void;
  onMouseEnter?: MouseEventHandler;
  onMouseLeave?: MouseEventHandler;
  onFocus?: FocusEventHandler;
  onBlur?: FocusEventHandler;
};

export function Toast({ kind, message, onDismiss, ...handlers }: ToastProps) {
  const error = kind === "error";
  const Icon = error ? CircleAlert : Info;

  return (
    <div
      className={error ? `${styles.toast} ${styles.error}` : styles.toast}
      role={error ? "alert" : "status"}
      {...handlers}
    >
      <Icon className={styles.icon} size={16} strokeWidth={1.75} aria-hidden />
      <p className={styles.text}>
        {error && <span className={styles.kind}>Error: </span>}
        {message}
      </p>
      {onDismiss && (
        <button
          type="button"
          className={styles.close}
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </div>
  );
}

// Info toasts count down only while neither hovered nor focused, then hide.
function TimedToast({
  toast,
  onExpire,
  onDismiss,
}: {
  toast: ToastItem;
  onExpire: (id: number) => void;
  onDismiss: (id: number) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(INFO_TIMEOUT);
  const paused = hovered || focused;

  useEffect(() => {
    if (toast.kind !== "info" || paused) return;
    const start = Date.now();
    const timer = setTimeout(() => onExpire(toast.id), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - start;
    };
  }, [toast, paused, onExpire]);

  return (
    <Toast
      kind={toast.kind}
      message={toast.message}
      onDismiss={() => onDismiss(toast.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    />
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const region = useRef<HTMLElement>(null);
  // The element that had focus before focus entered the region.
  const returnFocus = useRef<HTMLElement | null>(null);

  const dismiss = useCallback(
    (id: number) => setToasts((list) => list.filter((t) => t.id !== id)),
    [],
  );

  // When the dismissed toast's button has focus, moves focus so it does not
  // drop to the page body: to the next toast, else back to where it was.
  const dismissFromButton = (id: number) => {
    const index = toasts.findIndex((t) => t.id === id);
    const buttons = region.current?.querySelectorAll("button") ?? [];
    if (buttons[index] === document.activeElement) {
      const next = buttons[index + 1] ?? buttons[index - 1];
      (next ?? returnFocus.current)?.focus();
    }
    dismiss(id);
  };

  // A repeat of the same kind and message replaces the old toast with a new
  // element, so it is announced again.
  const notify = useCallback<Notify>(({ kind, message }) => {
    const id = nextId.current++;
    setToasts((list) => [
      ...list.filter((t) => !(t.kind === kind && t.message === message)),
      { id, kind, message },
    ]);
  }, []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <section
        ref={region}
        className={styles.toasts}
        aria-label="Notifications"
        onFocus={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            returnFocus.current = event.relatedTarget as HTMLElement | null;
        }}
      >
        {toasts.map((toast) => (
          <TimedToast
            key={toast.id}
            toast={toast}
            onExpire={dismiss}
            onDismiss={dismissFromButton}
          />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const notify = useContext(ToastContext);
  if (!notify) throw new Error("useToast needs a ToastProvider above it.");
  return notify;
}
