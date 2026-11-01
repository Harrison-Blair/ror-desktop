import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/Toast/Toast";
import type { Character, Job } from "@/lib/peopleApi";
import { character } from "@/test/fakePeople";
import styles from "./PeopleMenu.module.css";
import {
  PersonSheet,
  type PersonSheetProps,
  type SheetSection,
} from "./PersonSheet";

vi.mock("@/lib/peopleApi", async () =>
  (await import("@/test/fakePeople")).mockModule(),
);

// A section edits only its own fields. When the person reloads during the
// edit, as after a change by the chat agent, Save keeps the other changes.

const job = (id: string, name: string, startDate: string): Job => ({
  id,
  job: name,
  employer: "",
  startDate,
  endDate: null,
  description: "",
});

const before = character("Otto Brandt", {
  birthDate: "1904-01-21",
  description: "Owns three mills.",
  resume: [job("mill", "Mill owner", "1931")],
});
// The same person after a change made elsewhere to every section.
const after: Character = {
  ...before,
  name: "Otto Brandt Sr",
  birthCity: "Dortmund",
  description: "Owns four mills.",
  // Newest first, the order in which a section saves the resume.
  resume: [job("pub", "Publisher", "1955"), job("mill", "Mill owner", "1931")],
};

const fieldsOf = ({ id: _id, photo: _photo, ...fields }: Character) => fields;

function renderSheet(editing: SheetSection, pending?: { photo: string }) {
  const onSave = vi.fn(async () => ({ photoSaved: true }));
  const sheet = (person: Character) => (
    <ToastProvider>
      <PersonSheet
        person={person}
        meId={null}
        gameDate="1962-02-10"
        statNames={Array.from({ length: 8 }, (_, i) => ({
          left: `L${i}`,
          right: `R${i}`,
        }))}
        photoVersion={0}
        editing={editing}
        pending={pending}
        onEdit={() => {}}
        onCancelEdit={() => {}}
        onSave={onSave}
        onDelete={() => {}}
      />
    </ToastProvider>
  );
  const view = render(sheet(before));
  const reload = () => view.rerender(sheet(after));
  return { onSave, reload };
}

describe("Section Save after the person reloads", () => {
  it("Description keeps the new name, places and resume", async () => {
    const user = userEvent.setup();
    const { onSave, reload } = renderSheet("description");
    const box = screen.getByRole("textbox", { name: "Description" });
    await user.clear(box);
    await user.type(box, "Owns the Ruhr.");
    reload();
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The open section's draft wins over the reloaded description.
    expect(onSave).toHaveBeenCalledWith(
      { ...fieldsOf(after), description: "Owns the Ruhr." },
      null,
    );
  });

  it("Resume keeps the new name, places and description", async () => {
    const user = userEvent.setup();
    const { onSave, reload } = renderSheet("resume");
    await user.click(
      screen.getByRole("button", { name: "Remove job Mill owner" }),
    );
    reload();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      { ...fieldsOf(after), resume: [] },
      null,
    );
  });

  it("the top section keeps the new description and resume, and sends the photo", async () => {
    const user = userEvent.setup();
    const { onSave, reload } = renderSheet("top", { photo: "/pics/otto.png" });
    await user.type(screen.getByLabelText("Birthplace country"), "Germany");
    reload();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith(
      {
        ...fieldsOf(after),
        // The top section's draft wins: name and city as first loaded.
        name: "Otto Brandt",
        birthCity: "",
        birthCountry: "Germany",
      },
      "/pics/otto.png",
    );
  });

  it("an unchanged section stays clean after a reload", () => {
    const onDirty = vi.fn();
    const sheet = (person: Character) => (
      <PersonSheet
        person={person}
        meId={null}
        gameDate="1962-02-10"
        statNames={[]}
        photoVersion={0}
        editing="description"
        onEdit={() => {}}
        onCancelEdit={() => {}}
        onDirty={onDirty}
        onSave={vi.fn()}
        onDelete={() => {}}
      />
    );
    const view = render(sheet(before));
    view.rerender(sheet({ ...after, description: before.description }));
    expect(onDirty).not.toHaveBeenCalledWith(true);
  });
});

describe("Stat value boxes", () => {
  it("are named by their stat, or by place when the name is empty", () => {
    render(
      <ToastProvider>
        <PersonSheet
          person={before}
          meId={null}
          gameDate="1962-02-10"
          statNames={[
            { left: "Scientific", right: "  " },
            ...Array.from({ length: 7 }, () => ({ left: "L", right: "R" })),
          ]}
          photoVersion={0}
          editing="top"
          onEdit={() => {}}
          onCancelEdit={() => {}}
          onSave={vi.fn()}
          onDelete={() => {}}
        />
      </ToastProvider>,
    );
    expect(screen.getByLabelText("Scientific value")).toBeInTheDocument();
    expect(screen.getByLabelText("Stat 1 right value")).toBeInTheDocument();
  });
});

describe("The star by the name and the sheet bar", () => {
  const otto = character("Otto Brandt", { birthDate: "1904-01-21" });
  const dead = character("Jun Nakamura", {
    birthDate: "1925-11-09",
    deathDate: "1961-08-03",
  });
  const show = (props: Partial<PersonSheetProps>) =>
    render(
      <ToastProvider>
        <PersonSheet
          person={otto}
          meId={null}
          gameDate="1962-02-10"
          statNames={[]}
          photoVersion={0}
          onEdit={() => {}}
          onCancelEdit={() => {}}
          onSave={vi.fn()}
          onDelete={() => {}}
          {...props}
        />
      </ToastProvider>,
    ).container;
  const heading = () => screen.getByRole("heading", { level: 1 });
  const bar = (container: HTMLElement) =>
    container.querySelector(`.${styles.sheetBar}`);

  it("another living person: an outline This is me star right after the age", async () => {
    const onClaim = vi.fn();
    const container = show({ onBack: () => {}, onClaim, onUnclaim: vi.fn() });
    const star = screen.getByRole("button", { name: "This is me" });
    expect(star).toHaveAttribute("title", "This is me");
    expect(star.querySelector("svg")).toHaveAttribute("fill", "none");
    // In the name row, after the heading, and not in the top bar.
    expect(star.previousElementSibling).toBe(heading());
    expect(heading()).toHaveAccessibleName(/^Otto Brandt ?\(58\)$/);
    expect(bar(container)?.contains(star)).toBe(false);
    await userEvent.setup().click(star);
    expect(onClaim).toHaveBeenCalledTimes(1);
  });

  it("your character: one filled Not my character star; the heading is the name and age", async () => {
    const onUnclaim = vi.fn();
    show({ meId: otto.id, onBack: () => {}, onClaim: vi.fn(), onUnclaim });
    const star = screen.getByRole("button", { name: "Not my character" });
    expect(star).toHaveAttribute("title", "Not my character");
    expect(star.querySelector("svg")).toHaveAttribute("fill", "currentColor");
    expect(star.previousElementSibling).toBe(heading());
    expect(heading()).toHaveAccessibleName(/^Otto Brandt ?\(58\)$/);
    expect(screen.queryByRole("img", { name: "Your character" })).toBeNull();
    expect(screen.queryByRole("button", { name: "This is me" })).toBeNull();
    await userEvent.setup().click(star);
    expect(onUnclaim).toHaveBeenCalledTimes(1);
  });

  it("a dead person who isn't yours gets no star", () => {
    show({ person: dead, onClaim: vi.fn(), onUnclaim: vi.fn() });
    expect(screen.queryByRole("button", { name: "This is me" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Not my character" }),
    ).toBeNull();
  });

  it("embedded, your character keeps the plain star and nothing claims or unclaims", () => {
    show({ meId: otto.id });
    expect(
      within(heading()).getByRole("img", { name: "Your character" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "This is me" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Not my character" }),
    ).toBeNull();
  });

  it("an open section disables the star; the open top section hides it", () => {
    const props = { onClaim: vi.fn(), onUnclaim: vi.fn() };
    const view = show({ ...props, editing: "resume" });
    expect(screen.getByRole("button", { name: "This is me" })).toBeDisabled();
    view.remove();
    show({ ...props, editing: "top" });
    expect(screen.queryByRole("button", { name: "This is me" })).toBeNull();
  });

  it("the bar shows only with a control in it", () => {
    // Notes: your character, no Back and no Delete.
    let container = show({ meId: otto.id });
    expect(bar(container)).toBeNull();
    expect(container.firstElementChild?.firstElementChild).toBe(
      heading().closest(`.${styles.sheetHead}`),
    );
    container.remove();
    // World, your character: only Back.
    container = show({ meId: otto.id, onBack: () => {} });
    expect(bar(container)).not.toBeNull();
    expect(
      within(bar(container) as HTMLElement).getAllByRole("button"),
    ).toHaveLength(1);
    expect(
      within(bar(container) as HTMLElement).getByRole("button", {
        name: "People of interest",
      }),
    ).toBeInTheDocument();
    container.remove();
    // Someone else without Back: Delete alone.
    container = show({});
    expect(
      within(bar(container) as HTMLElement).getByRole("button", {
        name: "Delete Otto Brandt",
      }),
    ).toBeInTheDocument();
  });
});
