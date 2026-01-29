import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { toKebabCase } from "./string.ts";

Deno.test("toKebabCase - converts plan title to kebab-case", () => {
  assertEquals(toKebabCase("Add user authentication"), "add-user-authentication");
});

Deno.test("toKebabCase - handles special characters", () => {
  assertEquals(toKebabCase("Fix bug #123: login issue"), "fix-bug-123-login-issue");
});

Deno.test("toKebabCase - handles leading/trailing special chars", () => {
  assertEquals(toKebabCase("# My Plan Title"), "my-plan-title");
  assertEquals(toKebabCase("  spaces  "), "spaces");
});

Deno.test("toKebabCase - truncates long names", () => {
  const longName = "this is a very long plan title that exceeds fifty characters in total length";
  const result = toKebabCase(longName);
  assertEquals(result.length <= 50, true);
});

Deno.test("toKebabCase - returns empty for all-special-char input", () => {
  assertEquals(toKebabCase("### "), "");
  assertEquals(toKebabCase("---"), "");
});

Deno.test("toKebabCase - handles numbers", () => {
  assertEquals(toKebabCase("V2 Migration Plan"), "v2-migration-plan");
});
