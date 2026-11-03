import styles from "@/components/menus/PeopleMenu/PeopleMenu.module.css";

// A World section that has only its heading so far.
export function WorldBlankPage({ title }: { title: string }) {
  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>{title}</h1>
    </div>
  );
}
