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
    const menu = screen.getByRole("region", { name: "Notes menu" });

    expect(menu).toHaveTextContent("Custom body");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("SidePanel without onClose has no close button", () => {
    render(<SidePanel>Body</SidePanel>);

    expect(
      screen.getByRole("complementary", { name: "Side panel" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("Rail without onToggleMenu has no menu toggle", () => {
    render(<Rail items={[{ id: "a", label: "Item A" }]} />);

    expect(screen.getByRole("button", { name: "Item A" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /(Hide|Show) menu/ }),
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
      <SidePanel open={false} onClose={() => {}}>
        Body
      </SidePanel>,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
