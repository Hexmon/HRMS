import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { ActionButton } from "./action-button";

afterEach(cleanup);

it("submits an enabled action once and blocks a disabled action", () => {
  const submit = vi.fn();
  const { rerender } = render(<ActionButton onClick={submit}>Save</ActionButton>);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(submit).toHaveBeenCalledTimes(1);

  rerender(
    <ActionButton onClick={submit} disabled>
      Save
    </ActionButton>,
  );
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(submit).toHaveBeenCalledTimes(1);
});

it("renders an icon on the requested side while preserving the button label", () => {
  const { rerender } = render(
    <ActionButton
      icon={
        <span aria-hidden="true" data-testid="icon">
          +
        </span>
      }
    >
      Add
    </ActionButton>,
  );
  const button = screen.getByRole("button", { name: "Add" });
  expect(button.firstElementChild).toContainElement(screen.getByTestId("icon"));

  rerender(
    <ActionButton
      icon={
        <span aria-hidden="true" data-testid="icon">
          +
        </span>
      }
      iconPosition="right"
    >
      Add
    </ActionButton>,
  );
  expect(screen.getByRole("button", { name: "Add" }).lastElementChild).toContainElement(
    screen.getByTestId("icon"),
  );
});
