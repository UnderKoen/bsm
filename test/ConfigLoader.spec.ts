import { suite as _suite } from "uvu";
import * as assert from "uvu/assert";
import sinon from "sinon";
import { ConfigLoader, DEFAULT_CONFIG } from "../src/ConfigLoader.js";
import { ExtendConfig, TConfig } from "../src/types.js";
import { Logger } from "../src/Logger.js";

sinon.restore();
Logger.silence();

function suite(name: string): ReturnType<typeof _suite> {
  const test = _suite(name);
  test.before.each(() => {
    sinon.restore();

    // Don't output anything
    Logger.silence();
    process.argv = [];
  });
  return test;
}

//region getSource
const getSource = suite("getSource");

getSource("should return arg if it is a string", () => {
  //Arrange
  const arg = "test/fixtures/config.json";

  //Act
  const source = ConfigLoader.getSource(arg);

  //Assert
  assert.is(source, arg);
});

getSource("should return first arg if it is an array", () => {
  //Arrange
  const arg = ["test/fixtures/config.json", ["arg2"]] satisfies ExtendConfig;

  //Act
  const source = ConfigLoader.getSource(arg);

  //Assert
  assert.is(source, arg[0]);
});

//endregion

//region loadFile
const loadFile = suite("loadFile");

loadFile("should return undefined if no file is provided", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile(undefined);

  //Assert
  assert.is(config, undefined);
  assert.is(exit.callCount, 0);
});

loadFile("should return undefined if file is not found", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile("test/fixtures/missing.json");

  //Assert
  assert.is(config, undefined);
  assert.is(exit.callCount, 0);
});

loadFile("should return exit if file contains an error", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  await ConfigLoader.loadFile("./test/fixtures/error");

  //Assert
  assert.is(exit.callCount, 1);
  assert.is(exit.getCall(0).args[0], 1);
});

loadFile("should return default config if file is empty", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile("./test/fixtures/empty.json");

  //Assert
  assert.equal(config, DEFAULT_CONFIG);
  assert.is(exit.callCount, 0);
});

loadFile("function config should be called with args", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile([
    "./test/fixtures/function.js",
    {
      scripts: {
        test: "test",
      },
    },
  ]);

  //Assert
  assert.equal(config, {
    ...DEFAULT_CONFIG,
    scripts: {
      test: "test",
    },
  });
  assert.is(exit.callCount, 0);
});

loadFile("function config should be called without args", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile("./test/fixtures/function.js");

  //Assert
  assert.equal(config, DEFAULT_CONFIG);
  assert.is(exit.callCount, 0);
});

loadFile("config with args should exit if not found", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile([
    "./test/fixtures/error",
    {
      scripts: {
        test: "test",
      },
    },
  ]);

  //Assert
  assert.equal(config, undefined);
  assert.is(exit.callCount, 1);
});

loadFile("should load explicit commonjs config file", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile("./test/fixtures/cjs");

  //Assert
  assert.equal(config, {
    ...DEFAULT_CONFIG,
    scripts: {
      test: "cjs",
    },
  });
  assert.is(exit.callCount, 0);
});

loadFile("should load explicit esm config file", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile("./test/fixtures/esm");

  //Assert
  assert.equal(config, {
    ...DEFAULT_CONFIG,
    scripts: {
      test: "esm",
    },
  });
  assert.is(exit.callCount, 0);
});

loadFile("should be able to export scripts only", async () => {
  //Arrange
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.loadFile("./test/fixtures/scripts-only");

  //Assert
  assert.equal(config, {
    ...DEFAULT_CONFIG,
    scripts: {
      test: "scripts-only",
    },
  });
  assert.is(exit.callCount, 0);
});

//endregion

//region loadExtensions
const loadExtensions = suite("loadExtensions");

loadExtensions(
  "should return empty array if config has no extensions",
  async () => {
    //Arrange
    const config = {
      scripts: {},
    };

    //Act
    const configs = await ConfigLoader.loadExtensions(config);

    //Assert
    assert.is(configs.length, 0);
  },
);

loadExtensions(
  "should return empty array if config has empty extensions",
  async () => {
    //Arrange
    const config = {
      scripts: {},
      extends: [],
    };

    //Act
    const configs = await ConfigLoader.loadExtensions(config);

    //Assert
    assert.is(configs.length, 0);
  },
);

loadExtensions("should exit if config has no valid extensions", async () => {
  //Arrange
  const config = {
    scripts: {},
    extends: ["./test/fixtures/missing.json"],
  };
  const exit = sinon.stub(process, "exit");

  //Act
  const configs = await ConfigLoader.loadExtensions(config);

  //Assert
  assert.is(configs.length, 0);
  assert.is(exit.callCount, 1);
});

loadExtensions("should return array of configs", async () => {
  //Arrange
  const config = {
    scripts: {},
    extends: [
      "./test/fixtures/empty.json",
      "./test/fixtures/empty.json",
      "./test/fixtures/empty.json",
    ],
  };

  //Act
  const configs = await ConfigLoader.loadExtensions(config);

  //Assert
  assert.is(configs.length, 3);
  assert.equal(configs[0], DEFAULT_CONFIG);
});

//endregion

//region load
const load = suite("load");

load("should exit if no config is found", async () => {
  //Arrange
  sinon.stub(ConfigLoader, "loadFile").resolves(undefined);
  const exit = sinon.stub(process, "exit");

  //Act
  await ConfigLoader.load({
    _: [],
    config: "test/fixtures/missing.json",
  });

  //Assert
  assert.is(exit.callCount, 1);
});

load("should return argv config if found", async () => {
  //Arrange
  sinon.stub(ConfigLoader, "loadFile").callsFake((file) =>
    Promise.resolve(
      (file === "TEST"
        ? {
            scripts: {
              test: "test",
            },
          }
        : {
            scripts: {},
          }) as TConfig,
    ),
  );
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.load({
    _: [],
    config: "TEST",
  });

  //Assert
  assert.equal(config, {
    scripts: {
      test: "test",
    },
  });
  assert.is(exit.callCount, 0);
});

load("should set BSM_CONFIG env var", async () => {
  //Arrange
  sinon.stub(ConfigLoader, "loadFile").resolves({} as TConfig);
  const exit = sinon.stub(process, "exit");

  //Act
  await ConfigLoader.load({
    _: [],
    config: "TEST",
  });

  //Assert
  assert.is(process.env.BSM_CONFIG, "TEST");
  assert.is(exit.callCount, 0);
});

load("should return other file if configs not found", async () => {
  //Arrange
  sinon.fake.returns(undefined);
  sinon.stub(ConfigLoader, "loadFile").resolves(DEFAULT_CONFIG);
  const exit = sinon.stub(process, "exit");

  //Act
  const config = await ConfigLoader.load({
    _: [],
    config: "TEST",
  });

  //Assert
  assert.equal(config, DEFAULT_CONFIG);
  assert.is(exit.callCount, 0);
});

load("should set ConfigLoader.config", async () => {
  //Arrange
  sinon.stub(ConfigLoader, "loadFile").resolves({} as TConfig);
  const exit = sinon.stub(process, "exit");

  //Act
  await ConfigLoader.load({
    _: [],
    config: "TEST",
  });

  //Assert
  assert.equal(ConfigLoader.config, {});
  assert.is(exit.callCount, 0);
});

load("should throw if ConfigLoader.config is not set", () => {
  //Arrange
  // @ts-expect-error - Reset private variable
  ConfigLoader._config = undefined;

  //Act
  const fn = () => ConfigLoader.config;

  //Assert
  assert.throws(fn, "Config not loaded");
});

//endregion

// getSource.run();
loadFile.run();
// loadExtensions.run();
// load.run();
