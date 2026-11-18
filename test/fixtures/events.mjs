// Scripts for the BSM_EVENTS tests in test/bin.ts. Kept apart from test.js so
// they don't show up in the `testing.debug` snapshot.
const envError = {
  $env: () => {
    throw new Error("env boom");
  },
  _default: "echo never runs",
};

export default {
  scripts: {
    // The shell kills itself, so bsm sees the command end by a signal (POSIX only)
    signal: "kill -TERM $$",
    nestedSignal: "bsm signal",
    // An error that is not a failing command
    envError,
    nestedError: {
      _default: "bsm ~.inner",
      inner: envError,
    },
    // Scripts after a failure that never get their turn
    failArray: ["exit 3", "echo b", { _default: "echo c" }],
    failStar: {
      a: "exit 3",
      b: "echo b",
      _post: "echo post",
      _finally: "echo finally",
    },
  },
};
