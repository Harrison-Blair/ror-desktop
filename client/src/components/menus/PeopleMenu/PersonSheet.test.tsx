import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/Toast/Toast";
import type { Character, Job } from "@/lib/peopleApi";
import { character } from "@/test/fakePeople";
import { PersonSheet, type SheetSection } from "./PersonSheet";

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
