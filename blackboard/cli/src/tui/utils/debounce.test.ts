/**
 * Unit tests for the debounce utility.
 */

import { debounce } from "./debounce.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("debounce - executes function after delay", async () => {
  let callCount = 0;
  const fn = () => callCount++;

  const debounced = debounce(fn, { delayMs: 100 });

  // Call multiple times rapidly
  debounced();
  debounced();
  debounced();

  // Should not have executed yet
  assertEquals(callCount, 0);

  // Wait for debounce delay
  await new Promise(resolve => setTimeout(resolve, 150));

  // Should have executed once
  assertEquals(callCount, 1);
});

Deno.test("debounce - cancels pending execution", async () => {
  let callCount = 0;
  const fn = () => callCount++;

  const debounced = debounce(fn, { delayMs: 100 });

  debounced();
  debounced();

  // Cancel before execution
  debounced.cancel();

  // Wait longer than debounce delay
  await new Promise(resolve => setTimeout(resolve, 150));

  // Should not have executed
  assertEquals(callCount, 0);
});

Deno.test("debounce - leading edge execution", async () => {
  let callCount = 0;
  const fn = () => callCount++;

  const debounced = debounce(fn, { delayMs: 100, leading: true });

  // First call executes immediately
  debounced();
  assertEquals(callCount, 1);

  // Rapid subsequent calls don't execute
  debounced();
  debounced();
  assertEquals(callCount, 1);

  // Wait for debounce delay
  await new Promise(resolve => setTimeout(resolve, 150));

  // Trailing execution should have happened
  assertEquals(callCount, 2);
});

Deno.test("debounce - restarts timer on new calls", async () => {
  let callCount = 0;
  const fn = () => callCount++;

  const debounced = debounce(fn, { delayMs: 100 });

  debounced();

  // Wait 50ms, then call again (restarts timer)
  await new Promise(resolve => setTimeout(resolve, 50));
  debounced();

  // Wait another 50ms (total 100ms from start, but only 50ms from last call)
  await new Promise(resolve => setTimeout(resolve, 50));
  assertEquals(callCount, 0); // Should not have executed yet

  // Wait another 60ms (110ms from last call)
  await new Promise(resolve => setTimeout(resolve, 60));
  assertEquals(callCount, 1); // Now it should have executed
});

Deno.test("debounce - passes arguments correctly", async () => {
  let lastArgs: unknown[] = [];
  const fn = (...args: unknown[]) => { lastArgs = args; };

  const debounced = debounce(fn, { delayMs: 50 });

  debounced("arg1", 42, { key: "value" });

  await new Promise(resolve => setTimeout(resolve, 100));

  assertEquals(lastArgs, ["arg1", 42, { key: "value" }]);
});
