import type { ReactNode } from "react";
import styles from "./Placeholder.module.css";

type PlaceholderProps = {
  children?: ReactNode;
  minHeight?: number;
};

export function Placeholder({ children, minHeight }: PlaceholderProps) {
  return (
    <div className={styles.placeholder} style={{ minHeight }}>
      {children}
    </div>
  );
}
