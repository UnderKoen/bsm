import { suite } from "uvu";
import * as assert from "uvu/assert";
import { BsmError } from "../src/BsmError.js";

const test = suite("BsmError.fromExit()");

test("keeps a normal exit code", () => {
  const error = BsmError.fromExit(4, null, "s");

  assert.is(error.code, 4);
  assert.is(error.signal, undefined);
  assert.is(error.script, "s");
});

test("uses 128 + the signal number when killed by a signal", () => {
  const error = BsmError.fromExit(null, "SIGTERM", "s");

  assert.is(error.code, 143);
  assert.is(error.signal, "SIGTERM");
});

test("falls back to 1 without code or known signal", () => {
  assert.is(BsmError.fromExit(null, null, "s").code, 1);
  assert.is(BsmError.fromExit(null, "SIGNOPE" as NodeJS.Signals, "s").code, 1);
});

test.run();
