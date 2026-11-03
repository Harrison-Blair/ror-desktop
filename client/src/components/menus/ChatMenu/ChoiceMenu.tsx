import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import styles from "./ChatMenu.module.css";

export type Choice<T> = { value: T; name: string };

// A footer button that opens a menu of choices upward. The menu is placed
// against the nearest positioned parent, so the parent sets where it lines
// up.
export function ChoiceMenu<T>({
  label,
  heading,
  choices,
  value,
  onChoose,
  variant,
}: {
  // Names the button and the menu.
  label: string;
  // A heading row: its title and a label at the right.
  heading?: { title: string; label: ReactNode };
  choices: Choice<T>[];
  value: T;
  onChoose: (value: T) => void;
  // "effort": a wider menu with a heading, left-aligned. "permission":
  // right-aligned.
  variant: "effort" | "permission";
}) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const chosen = choices.find((c) => c.value === value) ?? choices[0];

  useEffect(() => {
    if (!open) return;
    // Focus starts on the chosen item.
    menu.current
      ?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
      ?.focus();
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menu.current?.contains(target) &&
        !button.current?.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <>
      <button
        ref={button}
        type="button"
        className={styles.dropdown}
        aria-label={`${label}: ${chosen.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {chosen.name}
        <Chevron size={12} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div
          ref={menu}
          className={
            variant === "effort" ? styles.effortMenu : styles.permissionMenu
          }
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              close();
            }
          }}
        >
          {heading && (
            <div className={styles.groupHeading}>
              <h3 className={styles.heading}>{heading.title}</h3>
              <span className={styles.headingLabel}>{heading.label}</span>
            </div>
          )}
          {choices.map((choice) => (
            <button
              key={choice.name}
              type="button"
              className={styles.choice}
              role="menuitemradio"
              aria-checked={choice.value === chosen.value}
              onClick={() => {
                onChoose(choice.value);
                close();
              }}
            >
              <span className={styles.choiceCheck}>
                {choice.value === chosen.value && (
                  <Check size={14} strokeWidth={1.75} aria-hidden />
                )}
              </span>
              {choice.name}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
