import { suite as _suite } from "uvu";
import * as assert from "uvu/assert";
import sinon from "sinon";
import { ConfigLoader } from "../src/ConfigLoader";
import { Idempotency } from "../src/Idempotency";
import fs from "fs";
import { Executor } from "../src/Executor";

sinon.restore();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let consoleLog = sinon.stub(console, "log");
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let consoleError = sinon.stub(console, "error");

function suite(name: string): ReturnType<typeof _suite> {
  const test = _suite(name);
  test.before.each(() => {
    sinon.restore();

    // Don't output anything
    consoleLog = sinon.stub(console, "debug");
    consoleError = sinon.stub(console, "warn");
    process.argv = [];

    // Set config to default
    // @ts-expect-error config is private
    ConfigLoader._config = {
      scripts: {},
      config: {
        idempotency: {
          useFileContent: true,
          location: `./node_modules/.cache/bsm/test/${Math.random().toString(36).substring(2)}`,
        },
      },
    };
  });
  return test;
}

//region calculateIdempotencyHash()
const calculateIdempotencyHashSuite = suite("calculateIdempotencyHash()");

calculateIdempotencyHashSuite("should return hash for static", () => {
  // Arrange
  assert.equal(Idempotency.useFileContent, true);

  // Act
  const result = Idempotency.calculateIdempotencyHash("static:123");

  // Assert
  assert.equal(
    result,
    "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3",
  );
});

calculateIdempotencyHashSuite("should return hash for env", () => {
  // Arrange
  process.env.TEST = "123";

  // Act
  const result = Idempotency.calculateIdempotencyHash("env:TEST");

  // Assert
  assert.equal(
    result,
    "56a7010456b474aeee111f3b7336581fb0a99129d426cf51903efbdfd629f008",
  );
});

calculateIdempotencyHashSuite("should use options.env first", () => {
  // Arrange
  process.env.TEST = "456";

  // Act
  const result = Idempotency.calculateIdempotencyHash("env:TEST", {
    env: {
      TEST: "123",
    },
  });

  // Assert
  assert.equal(
    result,
    "56a7010456b474aeee111f3b7336581fb0a99129d426cf51903efbdfd629f008",
  );
});

calculateIdempotencyHashSuite("should handle when no env set", () => {
  // Arrange
  delete process.env.TEST;

  // Act
  const result = Idempotency.calculateIdempotencyHash("env:TEST", {
    env: {},
  });

  // Assert
  assert.equal(
    result,
    "94ee059335e587e501cc4bf90613e0814f00a7b08bc7c648fd865a2af6a22cc2",
  );
});

calculateIdempotencyHashSuite(
  "hash of two separate envs with same value should not be the same",
  () => {
    // Arrange

    // Act
    const result = Idempotency.calculateIdempotencyHash("env:TEST", {
      env: {
        TEST: "123",
      },
    });

    const result2 = Idempotency.calculateIdempotencyHash("env:TEST2", {
      env: {
        TEST2: "123",
      },
    });

    // Assert
    assert.not.equal(result, result2);
  },
);

calculateIdempotencyHashSuite('should work with array of "static"', () => {
  // Arrange

  // Act
  const result = Idempotency.calculateIdempotencyHash([
    "static:123",
    "static:123",
  ]);

  // Assert
  assert.equal(
    result,
    "96cae35ce8a9b0244178bf28e4966c2ce1b8385723a96a6b838858cdd6ca0a1e",
  );
});

calculateIdempotencyHashSuite('should work with object of "static"', () => {
  // Arrange

  // Act
  const result = Idempotency.calculateIdempotencyHash({
    a: "static:123",
    b: ["static:123"],
  });

  // Assert
  assert.equal(
    result,
    "96cae35ce8a9b0244178bf28e4966c2ce1b8385723a96a6b838858cdd6ca0a1e",
  );
});

calculateIdempotencyHashSuite("should return hash for file", () => {
  // Arrange

  // Act
  const result = Idempotency.calculateIdempotencyHash(
    "file:./test/fixtures/dir/test.txt",
  );

  // Assert
  assert.equal(
    result,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

calculateIdempotencyHashSuite("should return hash for dir", () => {
  // Arrange

  // Act
  const result = Idempotency.calculateIdempotencyHash(
    "dir:./test/fixtures/dir",
  );

  // Assert
  assert.equal(
    result,
    "17fc10a9d8a53567484217c35fd1b12b593bb8e67e8e212833f5580a4c788be3",
  );
});

calculateIdempotencyHashSuite(
  "should return hash for non exisiting dir",
  () => {
    // Arrange

    // Act
    const result = Idempotency.calculateIdempotencyHash(
      "dir:./test/fixtures/non-existing-dir",
    );

    // Assert
    assert.equal(
      result,
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  },
);

calculateIdempotencyHashSuite("should work for unknown type", () => {
  // Arrange

  // Act
  // @ts-expect-error testing unknown type
  const result = Idempotency.calculateIdempotencyHash("unknown:123");

  // Assert
  assert.equal(
    result,
    "ea925de2c7a14b1fde39da49b944be372cef52c53e408e470e93c7be9e03f188",
  );
});

calculateIdempotencyHashSuite("should work for non-existing file", () => {
  // Arrange

  // Act
  const result = Idempotency.calculateIdempotencyHash(
    "file:./test/fixtures/dir/unknown.txt",
  );

  // Assert
  assert.equal(
    result,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

calculateIdempotencyHashSuite(
  "when file is changed but content not should return new hash (useFileContent: false)",
  () => {
    // Arrange
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ConfigLoader.config.config!.idempotency!.useFileContent = false;

    // Act
    const result1 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );
    fs.writeFileSync("./test/fixtures/dir/test.txt", "");
    const result2 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );

    // Assert
    assert.not.equal(result1, result2);
  },
);

calculateIdempotencyHashSuite(
  "when file is not changed is should return same hash (useFileContent: false)",
  () => {
    // Arrange
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ConfigLoader.config.config!.idempotency!.useFileContent = false;

    // Act
    const result1 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );
    const result2 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );

    // Assert
    assert.equal(result1, result2);
  },
);

calculateIdempotencyHashSuite(
  "when file is not changed is should return same hash (useFileContent: undefined)",
  () => {
    // Arrange
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ConfigLoader.config.config!.idempotency!.useFileContent = undefined;

    // Act
    const result1 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );
    const result2 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );

    // Assert
    assert.equal(result1, result2);
  },
);

calculateIdempotencyHashSuite(
  "when file is changed but content not should return same hash (useFileContent: true)",
  () => {
    // Arrange
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ConfigLoader.config.config!.idempotency!.useFileContent = true;

    // Act
    const result1 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );
    fs.writeFileSync("./test/fixtures/dir/test.txt", "");
    const result2 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );

    // Assert
    assert.equal(result1, result2);
  },
);

calculateIdempotencyHashSuite(
  "when file is changed and content is changed should return new hash (useFileContent: true)",
  () => {
    // Arrange
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    ConfigLoader.config.config!.idempotency!.useFileContent = true;
    fs.writeFileSync("./test/fixtures/dir/test.txt", "new content");

    // Act
    const result1 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );
    fs.writeFileSync("./test/fixtures/dir/test.txt", "");
    const result2 = Idempotency.calculateIdempotencyHash(
      "file:./test/fixtures/dir/test.txt",
    );

    // Assert
    assert.not.equal(result1, result2);
  },
);

calculateIdempotencyHashSuite.run();
//endregion

//region Executor.executeObject()
const executeObjectSuite = suite("Executor.executeObject()");

executeObjectSuite("should handle when no idempotency is set", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const checkIdempotency = sinon.stub(Idempotency, "calculateIdempotencyHash");

  // Act
  await Executor.executeObject(
    {
      test: "test",
    },
    ["test"],
    ["test"],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(checkIdempotency.callCount, 0);
});

executeObjectSuite("should handle when idempotency is set", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const checkIdempotency = sinon.stub(Idempotency, "checkIdempotency");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:123"],
    },
    ["test"],
    ["test"],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(checkIdempotency.callCount, 1);
});

executeObjectSuite("should handle $idempotencyEnabled = false", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const checkIdempotency = sinon.stub(Idempotency, "checkIdempotency");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:123"],
      // @ts-expect-error config field
      $idempotencyEnabled: false,
    },
    ["test"],
    ["test"],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(checkIdempotency.callCount, 0);
});

executeObjectSuite("should handle $idempotencyEnabled = true", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");
  const checkIdempotency = sinon.stub(Idempotency, "checkIdempotency");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:123"],
      // @ts-expect-error config field
      $idempotencyEnabled: true,
    },
    ["test"],
    ["test"],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
  assert.equal(checkIdempotency.callCount, 1);
});

executeObjectSuite("should not run twice when nothing changed", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:123"],
    },
    ["test"],
    ["test"],
    {},
  );

  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:123"],
    },
    ["test"],
    ["test"],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 1);
});

executeObjectSuite("should run twice when something changed", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript");

  // Act
  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:123"],
    },
    ["test"],
    ["test"],
    {},
  );

  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:124"],
    },
    ["test"],
    ["test"],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 2);
});

executeObjectSuite("should use default location", async () => {
  // Arrange
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  ConfigLoader.config.config!.idempotency!.location = undefined;
  const runScript = sinon.stub(Executor, "runScript");

  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:123"],
    },
    ["test"],
    ["test"],
    {},
  );

  runScript.resetHistory();

  // Act
  await Executor.executeObject(
    {
      test: "test",
      $idempotency: ["static:123"],
    },
    ["test"],
    ["test"],
    {},
  );

  // Assert
  assert.equal(runScript.callCount, 0);
});

executeObjectSuite("should work with an _catch", async () => {
  // Arrange
  const runScript = sinon.stub(Executor, "runScript").onCall(0).throws();

  // Act
  await Executor.executeObject(
    {
      test: "exit 1",
      $idempotency: ["static:123"],
      _catch: "echo 'error'",
    },
    ["test"],
    ["test"],
    {},
  );

  // We expect the catch to run
  assert.equal(runScript.callCount, 2);

  await Executor.executeObject(
    {
      test: "exit 1",
      $idempotency: ["static:123"],
      _catch: "echo 'error'",
    },
    ["test"],
    ["test"],
    {},
  );

  // Assert
  // We expect nothing to run additionally
  assert.equal(runScript.callCount, 2);
});

executeObjectSuite.run();
//endregion
