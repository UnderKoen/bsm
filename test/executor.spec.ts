import { suite as _suite } from "uvu";
import * as assert from "uvu/assert";
import { Executor } from "../src/executor";
import sinon from "sinon";
import child_process from "node:child_process";
import { TError } from "../src/types";

function suite(name: string): ReturnType<typeof _suite> {
  const test = _suite(name);
  test.before.each(() => {
    sinon.restore();

    // Don't output anything
    sinon.stub(console, "log");
    sinon.stub(console, "error");
    process.argv = [];
  });
  return test;
}

const spawnMock = (code: number) => {
  return {
    on: function (_name: string, test: (code: number) => void) {
      test(code);
    },
  } as unknown as child_process.ChildProcessWithoutNullStreams;
};

// region notFound()
const notFoundSuite = suite("notFound()");

notFoundSuite("with no options should exit with code 127", () => {
  // Arrange
  const exit = sinon.stub(process, "exit");

  // Act
  Executor.notFound([], {});

  // Assert
  assert.equal(exit.callCount, 1);
  assert.equal(exit.args[0][0], 127);
});

notFoundSuite("with ignoreNotFound option should not exit", () => {
  // Arrange
  const exit = sinon.stub(process, "exit");

  // Act
  Executor.notFound([], { ignoreNotFound: true });

  // Assert
  assert.equal(exit.callCount, 0);
});

notFoundSuite.run();
// endregion

// region executeFunction()
const executeFunctionSuite = suite("executeFunction()");

executeFunctionSuite("should call function", async () => {
  // Arrange
  const context = sinon.stub().returns(undefined);

  // Act
  await Executor.executeFunction(context, [], [], {});

  // Assert
  assert.equal(context.callCount, 1);
});

executeFunctionSuite("should call function with arguments", async () => {
  // Arrange
  const context = sinon.stub().returns(undefined);
  process.argv = ["arg1", "arg2"];

  // Act
  await Executor.executeFunction(context, [], [], {});

  // Assert
  assert.equal(context.callCount, 1);
  assert.equal(context.args[0][0], ["arg1", "arg2"]);
});

executeFunctionSuite("should call runScript() with result", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const context = sinon.stub().returns("test");

  // Act
  await Executor.executeFunction(context, [], [], {});

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][0], "test");
});

executeFunctionSuite(
  "should call notFound() if subscript is not found",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");
    const context = sinon.stub().returns(undefined);

    // Act
    await Executor.executeFunction(context, ["test"], [], {});

    // Assert
    assert.equal(runScript.callCount, 0);
    assert.equal(notFound.callCount, 1);
  },
);

executeFunctionSuite("should throw error on function error", async () => {
  // Arrange
  const throws = { throw: "throw" };
  const context = sinon.stub().throws(throws);

  // Act
  try {
    await Executor.executeFunction(context, [], [], {});
    assert.unreachable("should have thrown");
  } catch (e) {
    // Assert
    const error = e as TError;

    assert.equal(error.function, throws);
    assert.equal(error.script, "");
  }
});

executeFunctionSuite("error should not contain BSM stack trace", async () => {
  // Arrange
  const throws = new Error();
  const context = sinon.stub().throws(throws);

  // Act
  try {
    await Executor.executeFunction(context, [], [], {});
    assert.unreachable("should have thrown");
  } catch (e) {
    // Assert
    const error = e as TError;

    assert.equal(error.function?.stack?.includes("at executeFunction"), false);
  }
});

executeFunctionSuite(
  "should set environment variables only during function execution",
  async () => {
    // Arrange
    const context = sinon.stub().returns(undefined);

    // Act
    await Executor.executeFunction(context, [], [], {
      env: {
        TEST: "test",
      },
    });

    // Assert
    assert.equal(context.callCount, 1);
    assert.equal(process.env.TEST, undefined);
  },
);

executeFunctionSuite("should set environment variables", async () => {
  // Arrange
  const context = sinon
    .stub()
    .callsFake(() => {
      assert.equal(process.env.TEST, "test69");
    })
    .returns(undefined);

  // Act
  await Executor.executeFunction(context, [], [], {
    env: {
      TEST: "test69",
    },
  });

  // Assert
  assert.equal(context.callCount, 1);
});

executeFunctionSuite.run();
// endregion

// region executeString()
const executeStringSuite = suite("executeString()");

executeStringSuite("cannot run subscript on string", async () => {
  // Arrange
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeString("test", ["test"], [], {});

  // Assert
  assert.equal(notFound.callCount, 1);
});

executeStringSuite("with empty script should not call spawn", async () => {
  // Arrange
  const spawn = sinon.stub(child_process, "spawn");

  // Act
  await Executor.executeString("", [], [], {});

  // Assert
  assert.equal(spawn.callCount, 0);
});

executeStringSuite("should spawn script", async () => {
  // Arrange
  const spawn = sinon.stub(child_process, "spawn").returns(spawnMock(0));

  // Act
  await Executor.executeString("test", [], [], {});

  // Assert
  assert.equal(spawn.callCount, 1);
  assert.equal(spawn.args[0][0], "test");
});

executeStringSuite("should spawn script with arguments", async () => {
  // Arrange
  const spawn = sinon.stub(child_process, "spawn").returns(spawnMock(0));
  process.argv = ["arg1", "arg2"];

  // Act
  await Executor.executeString("test", [], [], {});

  // Assert
  assert.equal(spawn.callCount, 1);
  assert.equal(spawn.args[0][0], "test arg1 arg2");
});

executeStringSuite("should throw error on non-zero exit code", async () => {
  // Arrange
  sinon.stub(child_process, "spawn").returns(spawnMock(1));

  // Act
  try {
    await Executor.executeString("test", [], ["path", "test", "fail"], {});
    assert.unreachable("should have thrown");
  } catch (e) {
    // Assert
    const error = e as TError;

    assert.equal(error.code, 1);
    assert.equal(error.script, "path.test.fail");
  }
});

executeStringSuite("should run with environment variables", async () => {
  // Arrange
  const spawn = sinon.stub(child_process, "spawn").returns(spawnMock(0));

  // Act
  await Executor.executeString("test", [], [], {
    env: {
      TEST: "test",
    },
  });

  // Assert
  assert.equal(spawn.callCount, 1);
  assert.equal(spawn.args[0][2].env?.["TEST"], "test");
});

executeStringSuite.run();
// endregion

// region executeArray()
const executeArraySuite = suite("executeArray()");

executeArraySuite("should call run all subscripts", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeArray(["test", ["sub1", "sub2"], {}, ""], [], [], {});

  // Assert
  assert.equal(runScript.callCount, 4);
  assert.equal(notFound.callCount, 0);
});

executeArraySuite("should do nothing with empty array", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeArray([], [], [], {});

  // Assert
  assert.equal(runScript.callCount, 0);
  assert.equal(notFound.callCount, 0);
});

executeArraySuite("should call notFound() with invalid subscript", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeArray(["test"], ["test"], [], {});

  // Assert
  assert.equal(runScript.callCount, 0);
  assert.equal(notFound.callCount, 1);
});

executeArraySuite(
  "should call runScript() with valid subscript (0)",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");

    // Act
    await Executor.executeArray(["test", "test2", "test3"], ["0"], [], {});

    // Assert
    assert.equal(runScript.callCount, 1);
    assert.equal(runScript.args[0][0], "test");
    assert.equal(notFound.callCount, 0);
  },
);

executeArraySuite(
  "should call runScript() with valid subscript (1)",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");

    // Act
    await Executor.executeArray(["test", "test2", "test3"], ["1"], [], {});

    // Assert
    assert.equal(runScript.callCount, 1);
    assert.equal(runScript.args[0][0], "test2");
    assert.equal(notFound.callCount, 0);
  },
);

executeArraySuite(
  "should call notFound() with invalid subscript (2)",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");

    // Act
    await Executor.executeArray(["test", "test2", "test3"], ["5"], [], {});

    // Assert
    assert.equal(runScript.callCount, 0);
    assert.equal(notFound.callCount, 1);
  },
);

executeArraySuite(
  "should call runScript() with valid subscript (*)",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");

    // Act
    await Executor.executeArray(["test", "test2", "test3"], ["*"], [], {});

    // Assert
    assert.equal(runScript.callCount, 3);
    assert.equal(runScript.args[0][0], "test");
    assert.equal(runScript.args[1][0], "test2");
    assert.equal(runScript.args[2][0], "test3");
    assert.equal(notFound.callCount, 0);
  },
);

executeArraySuite.run();
// endregion

// region executeObject()
const executeObjectSuite = suite("executeObject()");

executeObjectSuite("should call runScript() with valid subscript", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeObject(
    { test: "test", test2: "test2", test3: "test3" },
    ["test"],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][0], "test");
  assert.equal(notFound.callCount, 0);
});

executeObjectSuite(
  "should call notFound() with invalid subscript",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");

    // Act
    await Executor.executeObject(
      { test: "test", test2: "test2", test3: "test3" },
      ["test4"],
      [],
      {},
    );

    // Assert
    assert.equal(runScript.callCount, 0);
    assert.equal(notFound.callCount, 1);
  },
);

executeObjectSuite(
  "should call runScript() with valid subscript (*)",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");

    // Act
    await Executor.executeObject(
      { test: "test", test2: "test2", test3: "test3" },
      ["*"],
      [],
      {},
    );

    // Assert
    assert.equal(runScript.callCount, 3);
    assert.equal(runScript.args[0][0], "test");
    assert.equal(runScript.args[1][0], "test2");
    assert.equal(runScript.args[2][0], "test3");
    assert.equal(notFound.callCount, 0);
  },
);

executeObjectSuite(
  "should not call hidden subscript, with valid subscript (*)",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");

    // Act
    await Executor.executeObject(
      {
        test: "test",
        test2: "test2",
        test3: "test3",
        _default: "_default",
        $description: "$description",
      },
      ["*"],
      [],
      {},
    );

    // Assert
    assert.equal(runScript.callCount, 3);
    assert.equal(runScript.args[0][0], "test");
    assert.equal(runScript.args[1][0], "test2");
    assert.equal(runScript.args[2][0], "test3");
    assert.equal(notFound.callCount, 0);
  },
);

executeObjectSuite.run();

// region executeObject() - hooks
const hooksSuite = suite("executeObject() - hooks");

hooksSuite("should call _pre hook", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeObject(
    {
      _pre: "_pre",
      test: "test",
    },
    ["test"],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 2);
  assert.equal(runScript.args[0][0], "_pre");
  assert.equal(runScript.args[1][0], "test");
  assert.equal(notFound.callCount, 0);
});

hooksSuite("should call _post hook", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      _post: "_post",
    },
    ["test"],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 2);
  assert.equal(runScript.args[0][0], "test");
  assert.equal(runScript.args[1][0], "_post");
  assert.equal(notFound.callCount, 0);
});

hooksSuite("should not call _post hook on error", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript").throws();
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  try {
    await Executor.executeObject(
      {
        test: "test",
        _post: "_post",
      },
      ["test"],
      [],
      {},
    );
    assert.unreachable("should have thrown");
  } catch (e) {
    // Assert
    assert.equal(runScript.callCount, 1);
    assert.equal(runScript.args[0][0], "test");
    assert.equal(notFound.callCount, 0);
  }
});

hooksSuite("should call _finally hook on success", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      _finally: "_finally",
    },
    ["test"],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 2);
  assert.equal(runScript.args[0][0], "test");
  assert.equal(runScript.args[1][0], "_finally");
  assert.equal(notFound.callCount, 0);
});

hooksSuite("should call _finally hook on error", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript").onCall(0).throws();
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  try {
    await Executor.executeObject(
      {
        test: "test",
        _finally: "_finally",
      },
      ["test"],
      [],
      {},
    );
    assert.unreachable("should have thrown");
  } catch (e) {
    // Assert
    assert.equal(runScript.callCount, 2);
    assert.equal(runScript.args[0][0], "test");
    assert.equal(runScript.args[1][0], "_finally");
    assert.equal(notFound.callCount, 0);
  }
});

hooksSuite("should call _onError hook on error", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript").throws();
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  try {
    await Executor.executeObject(
      {
        test: "test",
        _onError: "_onError",
      },
      ["test"],
      [],
      {},
    );
    assert.unreachable("should have thrown");
  } catch (e) {
    // Assert
    assert.equal(runScript.callCount, 2);
    assert.equal(runScript.args[0][0], "test");
    assert.equal(runScript.args[1][0], "_onError");
    assert.equal(notFound.callCount, 0);
  }
});

hooksSuite("should not call _onError hook on success", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      _onError: "_onError",
    },
    ["test"],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][0], "test");
  assert.equal(notFound.callCount, 0);
});

hooksSuite("should call _catch hook on error", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript").onCall(0).throws();
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      _catch: "_catch",
    },
    ["test"],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 2);
  assert.equal(runScript.args[0][0], "test");
  assert.equal(runScript.args[1][0], "_catch");
  assert.equal(notFound.callCount, 0);
});

hooksSuite("should not call _catch hook on success", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      _catch: "_catch",
    },
    ["test"],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][0], "test");
  assert.equal(notFound.callCount, 0);
});

hooksSuite("should call hooks in correct order", async () => {
  // Arrange
  // Fail on _post
  const runScript = sinon.stub(Executor, "runScript").onCall(2).throws();
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  try {
    await Executor.executeObject(
      {
        _pre: "_pre",
        test: "test",
        _post: "_post",
        _onError: "_onError",
        _catch: "_catch",
        _finally: "_finally",
      },
      ["test"],
      [],
      {},
    );
    assert.unreachable("should have thrown");
  } catch (e) {
    // Assert
    assert.equal(runScript.callCount, 6);
    assert.equal(runScript.args[0][0], "_pre");
    assert.equal(runScript.args[1][0], "test");
    assert.equal(runScript.args[2][0], "_post");
    assert.equal(runScript.args[3][0], "_onError");
    assert.equal(runScript.args[4][0], "_catch");
    assert.equal(runScript.args[5][0], "_finally");
    assert.equal(notFound.callCount, 0);
  }
});

hooksSuite("BSM_ERROR should be set on error", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript").onCall(0).throws({
    code: 1337,
  });
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  try {
    await Executor.executeObject(
      {
        test: "test",
      },
      ["test"],
      [],
      {},
    );
    assert.unreachable("should have thrown");
  } catch (e) {
    // Assert
    assert.equal(runScript.callCount, 1);
    assert.equal(runScript.args[0][0], "test");
    assert.equal(notFound.callCount, 0);
    assert.equal(process.env.BSM_ERROR, "1337");
  }
});

hooksSuite.run();
// endregion

// region executeObject() - runObject()
const runObjectSuite = suite("executeObject() - runObject()");

runObjectSuite("should call runScript() with _default", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");

  // Act
  await Executor.executeObject(
    {
      _default: "_default",
    },
    [],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][0], "_default");
});

runObjectSuite("should call runScript() with _{os}", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");

  // Act
  await Executor.executeObject(
    {
      [`_${process.platform}`]: "_os",
    },
    [],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][0], "_os");
});

runObjectSuite("should call runScript() with _ci", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  sinon.stub(Executor, "_isCI").get(() => true);

  // Act
  await Executor.executeObject(
    {
      _ci: "_ci",
    },
    [],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][0], "_ci");
});

runObjectSuite(
  "should call notFound() if is only _ci but not in ci",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    const notFound = sinon.stub(Executor, "notFound");
    sinon.stub(Executor, "_isCI").get(() => false);

    // Act
    await Executor.executeObject(
      {
        _ci: "_ci",
      },
      [],
      [],
      {},
    );

    // Assert
    assert.equal(runScript.callCount, 0);
    assert.equal(notFound.callCount, 1);
  },
);

runObjectSuite("should call notFound() if no _default", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  await Executor.executeObject({ test: "test" }, [], [], {});

  // Assert
  assert.equal(runScript.callCount, 0);
  assert.equal(notFound.callCount, 1);
});

runObjectSuite(
  "_ci should take precedence over _{os} and _default",
  async () => {
    // Arrange
    const runScript = sinon.stub(Executor, "runScript");
    sinon.stub(Executor, "_isCI").get(() => true);

    // Act
    await Executor.executeObject(
      {
        [`_${process.platform}`]: "_os",
        _default: "_default",
        _ci: "_ci",
      },
      [],
      [],
      {},
    );

    // Assert
    assert.equal(runScript.callCount, 1);
    assert.equal(runScript.args[0][0], "_ci");
  },
);

runObjectSuite("_{os} should take precedence over _default", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");

  // Act
  await Executor.executeObject(
    {
      [`_${process.platform}`]: "_os",
      _default: "_default",
    },
    [],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][0], "_os");
});

runObjectSuite.run();
// endregion

// region executeObject() - $env
const envSuite = suite("executeObject() - $env");

envSuite("should set environment variables", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");

  // Act
  await Executor.executeObject(
    {
      $env: {
        TEST: "test",
      },
      _default: "",
    },
    [],
    [],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][3].env?.["TEST"], "test");
});

envSuite("should override environment variables", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");

  // Act
  await Executor.executeObject(
    {
      $env: {
        TEST: "test",
      },
      _default: "",
    },
    [],
    [],
    {
      env: {
        TEST: "test2",
      },
    },
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][3].env?.["TEST"], "test");
});

envSuite("should not override environment variables", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");

  // Act
  await Executor.executeObject(
    {
      $env: {
        TEST: "test",
      },
      _default: "",
    },
    [],
    [],
    {
      env: {
        TEST: "test2",
        IGNORE: "ignore",
      },
    },
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(runScript.args[0][3].env?.["TEST"], "test");
  assert.equal(runScript.args[0][3].env?.["IGNORE"], "ignore");
});

envSuite.run();
// endregion

// endregion

// region runScript()
const runScriptSuite = suite("runScript()");

runScriptSuite("should call executeFunction() with function", async () => {
  // Arrange
  const executeFunction = sinon.stub(Executor, "executeFunction");
  const fn = () => undefined;

  // Act
  await Executor.runScript(fn, [], [], {});

  // Assert
  assert.equal(executeFunction.callCount, 1);
  assert.equal(executeFunction.args[0][0], fn);
});

runScriptSuite("should call executeString() with string", async () => {
  // Arrange
  const executeString = sinon.stub(Executor, "executeString");

  // Act
  await Executor.runScript("test", [], [], {});

  // Assert
  assert.equal(executeString.callCount, 1);
  assert.equal(executeString.args[0][0], "test");
});

runScriptSuite("should call executeArray() with array", async () => {
  // Arrange
  const executeArray = sinon.stub(Executor, "executeArray");

  // Act
  await Executor.runScript(["test"], [], [], {});

  // Assert
  assert.equal(executeArray.callCount, 1);
  assert.equal(executeArray.args[0][0], ["test"]);
});

runScriptSuite("should call executeObject() with object", async () => {
  // Arrange
  const executeObject = sinon.stub(Executor, "executeObject");

  // Act
  await Executor.runScript({ test: "test" }, [], [], {});

  // Assert
  assert.equal(executeObject.callCount, 1);
  assert.equal(executeObject.args[0][0], { test: "test" });
});

runScriptSuite("should call notFound() with invalid script", async () => {
  // Arrange
  const notFound = sinon.stub(Executor, "notFound");

  // Act
  // @ts-expect-error Invalid script
  await Executor.runScript(undefined, ["test"], [], {});

  // Assert
  assert.equal(notFound.callCount, 1);
});

runScriptSuite.run();
// endregion

// region All combined
const allSuite = suite("All combined");

allSuite("should call all scripts that would be activated with *", async () => {
  // Arrange
  const spawn = sinon.stub(child_process, "spawn").returns(spawnMock(0));

  // Act
  await Executor.runScript(
    {
      hooks: {
        _pre: "hooks/_pre",
        _default: "hooks/_default",
        _post: "hooks/_post",
      },
      array: ["array1", "array2"],
      // Because there is no _default, this should not be called
      object: {
        test: "object/test",
        test2: "object/test2",
      },
      string: "string",
      function: () => "function",
    },
    ["*"],
    [],
    {},
  );

  // Assert
  assert.equal(spawn.callCount, 7);
  assert.equal(spawn.args[0][0], "hooks/_pre");
  assert.equal(spawn.args[1][0], "hooks/_default");
  assert.equal(spawn.args[2][0], "hooks/_post");
  assert.equal(spawn.args[3][0], "array1");
  assert.equal(spawn.args[4][0], "array2");
  assert.equal(spawn.args[5][0], "string");
  assert.equal(spawn.args[6][0], "function");
});

allSuite.run();
// endregion
