import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard for a real gap found during live authenticated
// staging QA: the installed @radix-ui/react-dialog (1.1.15) does not set
// aria-modal on its Content element by default (confirmed by inspecting the
// live DOM and grepping the installed package -- the string doesn't appear
// in its runtime bundle at all). The shared wrapper now sets it explicitly
// so every dialog built on it -- ConfirmActionDialog, the customer review
// dialog, and any future one -- gets it for free. No DOM test environment
// in this repo, so this checks the source like the other structural tests.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("the shared Dialog wrapper always renders aria-modal", () => {
  const src = read("src/components/ui/dialog.tsx");

  test('DialogContent\'s rendered element sets aria-modal="true"', () => {
    expect(src).toMatch(/aria-modal=["']true["']/);
  });

  test('role="dialog" is preserved (unchanged by this fix)', () => {
    // role="dialog" comes from DialogPrimitive.Content itself, not
    // something this wrapper sets -- just confirming it's still rendered
    // via the primitive and nothing here strips or overrides it.
    expect(src).toContain("DialogPrimitive.Content");
  });

  test("aria-modal is set after the {...props} spread so it can't be silently dropped by a caller-supplied prop", () => {
    const contentBlock = src.slice(
      src.indexOf("const DialogContent"),
      src.indexOf("DialogContent.displayName"),
    );
    const propsSpreadIndex = contentBlock.indexOf("{...props}");
    const ariaModalIndex = contentBlock.search(/aria-modal=/);
    expect(propsSpreadIndex).toBeGreaterThan(-1);
    expect(ariaModalIndex).toBeGreaterThan(-1);
    expect(ariaModalIndex).toBeGreaterThan(propsSpreadIndex);
  });

  test("aria-labelledby/aria-describedby behaviour is untouched (still Radix defaults, not overridden here)", () => {
    const contentBlock = src.slice(
      src.indexOf("const DialogContent"),
      src.indexOf("DialogContent.displayName"),
    );
    expect(contentBlock).not.toContain("aria-labelledby=");
    expect(contentBlock).not.toContain("aria-describedby=");
  });
});
