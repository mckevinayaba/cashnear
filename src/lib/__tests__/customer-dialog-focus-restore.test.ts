import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Structural regression guard for a real gap found during live authenticated
// staging QA: after the customer review dialog closes, focus landed on
// document.body instead of the customer-row button that opened it. Root
// cause: the dialog is controlled externally (no Radix DialogTrigger),
// which is the only thing Radix's own focus-restore relies on. Fixed by
// capturing the triggering button in a ref and restoring focus to it
// explicitly via DialogContent's onCloseAutoFocus. No DOM test environment
// in this repo, so this checks the source like the other structural tests.

const repoRoot = join(import.meta.dir, "..", "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("the customer review dialog restores focus to its exact trigger row", () => {
  const src = read("src/routes/_authenticated/admin.customers.tsx");

  test("a ref (not state) tracks the triggering row button", () => {
    expect(src).toMatch(/const triggerRef = useRef<HTMLButtonElement \| null>\(null\)/);
  });

  test("the row's onClick captures its own element into the ref before opening", () => {
    const openBlock = src.slice(
      src.indexOf("onClick={(e) => {"),
      src.indexOf('className="text-left"'),
    );
    expect(openBlock).toContain("triggerRef.current = e.currentTarget");
    expect(openBlock).toContain("setSelected(c)");
  });

  test("onCloseAutoFocus is wired on DialogContent and calls preventDefault only when restoring", () => {
    const handlerBlock = src.slice(
      src.indexOf("onCloseAutoFocus={(event) => {"),
      src.indexOf("}}", src.indexOf("onCloseAutoFocus={(event) => {")),
    );
    expect(handlerBlock).toContain("event.preventDefault()");
    // preventDefault must be inside the "el is valid" branch, not
    // unconditional -- otherwise a missing trigger would silently eat
    // Radix's own fallback instead of deferring to it.
    const ifIndex = handlerBlock.indexOf("if (el &&");
    const preventDefaultIndex = handlerBlock.indexOf("event.preventDefault()");
    expect(ifIndex).toBeGreaterThan(-1);
    expect(preventDefaultIndex).toBeGreaterThan(ifIndex);
  });

  test("the stored element is verified connected/focusable before being focused", () => {
    expect(src).toMatch(/if \(el && isFocusable\(el\)\)/);
    const isFocusableFn = src.slice(
      src.indexOf("function isFocusable"),
      src.indexOf("}", src.indexOf("function isFocusable")) + 1,
    );
    expect(isFocusableFn).toContain("isConnected");
    expect(isFocusableFn).toContain("tabIndex");
  });

  test("the ref is cleared after each close, so a stale element can never be reused", () => {
    const handlerBlock = src.slice(
      src.indexOf("onCloseAutoFocus={(event) => {"),
      src.indexOf("}}", src.indexOf("onCloseAutoFocus={(event) => {")),
    );
    expect(handlerBlock).toContain("triggerRef.current = null");
  });

  test("document.body is never focused explicitly -- the no-valid-trigger case defers to Radix's own default", () => {
    const handlerBlock = src.slice(
      src.indexOf("onCloseAutoFocus={(event) => {"),
      src.indexOf("}}", src.indexOf("onCloseAutoFocus={(event) => {")),
    );
    expect(handlerBlock).not.toMatch(/document\.body\.focus\(/);
  });

  test("dialog open state remains controlled via open/onOpenChange (unchanged by this fix)", () => {
    expect(src).toMatch(/<Dialog\s+open=\{/);
    expect(src).toMatch(/onOpenChange=\{/);
  });
});
