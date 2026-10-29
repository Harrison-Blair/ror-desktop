import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Rail } from "@/components/Rail/Rail";
import { RailPanel } from "@/components/RailPanel/RailPanel";
import { SidePanel } from "@/components/SidePanel/SidePanel";

describe("frame components", () => {
  it("RailPanel shows children in place of item buttons", () => {
    render(
      <RailPanel title="Notes" items={[{ id: "a", label: "Item A" }]}>
        <p>Custom body</p>
      </RailPanel>,
    );
    const railPanel = screen.getByRole("region", { name: "Notes rail panel" });

    expect(railPanel).toHaveTextContent("Custom body");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("SidePanel without onClose has no close button", () => {
    render(<SidePanel title="Dice">Body</SidePanel>);

    expect(
      screen.getByRole("complementary", { name: "Dice" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("SidePanel names itself and its close button from the title", () => {
    render(<SidePanel title="Dice" onClose={() => {}} />);

    expect(screen.getByRole("complementary", { name: "Dice" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close Dice" })).toBeVisible();
  });

  it("Rail without onToggleRailPanel has no rail panel toggle", () => {
    render(<Rail items={[{ id: "a", label: "Item A" }]} />);

    expect(screen.getByRole("button", { name: "Item A" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /(Hide|Show) rail panel/ }),
    ).not.toBeInTheDocument();
  });

  it("RailPanel renders nothing when closed", () => {
    const { container } = render(
      <RailPanel
        title="Notes"
        open={false}
        items={[{ id: "a", label: "A" }]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("SidePanel renders nothing when closed", () => {
    const { container } = render(
      <SidePanel title="Dice" open={false} onClose={() => {}}>
        Body
      </SidePanel>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
