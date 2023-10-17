import { suite as _suite } from "uvu";
import * as assert from "uvu/assert";
import sinon from "sinon";
import { Help } from "../src/help";

sinon.restore();
let consoleLog = sinon.stub(console, "log");
let consoleError = sinon.stub(console, "error");

function suite(name: string): ReturnType<typeof _suite> {
  const test = _suite(name);
  test.before.each(() => {
    sinon.restore();

    // Don't output anything
    consoleLog = sinon.stub(console, "log");
    consoleError = sinon.stub(console, "error");
    process.argv = [];
  });
  return test;
}

const config = {
  scripts: {
    test: "echo test",
    build: "echo build",
    lint: ["echo lint", "echo lint2"],
    format: "echo format",
    sub: {
      test: "echo sub.test",
      build: "echo sub.build",
      lint: "echo sub.lint",
    },
  },
};

//region printHelp
const printHelp = suite("printHelp");

printHelp("should not print anything if args is false", () => {
  // Arrange

  // Act
  Help.printHelp(config, { _: [] }, false);

  // Assert
  assert.is(consoleLog.callCount, 0);
});

printHelp("should exit if args is true", () => {
  // Arrange
  const exit = sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, true);

  // Assert
  assert.is(exit.callCount, 1);
  assert.is(exit.getCall(0).args[0], 0);
});

printHelp("should print all root commands if args is true", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, true);

  // Assert
  assert.is(consoleLog.callCount, 6);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "test");
  assert.match(consoleLog.getCall(2).args[0] as string, "build");
  assert.match(consoleLog.getCall(3).args[0] as string, "lint");
  assert.match(consoleLog.getCall(4).args[0] as string, "format");
  assert.match(consoleLog.getCall(5).args[0] as string, "sub");
});

printHelp("should print sub commands of args", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, "sub");

  // Assert
  assert.is(consoleLog.callCount, 5);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "sub");
  assert.match(consoleLog.getCall(2).args[0] as string, "sub.test");
  assert.match(consoleLog.getCall(3).args[0] as string, "sub.build");
  assert.match(consoleLog.getCall(4).args[0] as string, "sub.lint");
});

printHelp("should print sub commands of args with .*", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, "sub.*");

  // Assert
  assert.is(consoleLog.callCount, 4);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "sub.test");
  assert.match(consoleLog.getCall(2).args[0] as string, "sub.build");
  assert.match(consoleLog.getCall(3).args[0] as string, "sub.lint");
});

printHelp("should print sub commands of args with *", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, "*");

  // Assert
  assert.is(consoleLog.callCount, 10);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "test");
  assert.match(consoleLog.getCall(2).args[0] as string, "build");
  assert.match(consoleLog.getCall(3).args[0] as string, "lint.0");
  assert.match(consoleLog.getCall(4).args[0] as string, "lint.1");
  assert.match(consoleLog.getCall(5).args[0] as string, "format");
  assert.match(consoleLog.getCall(6).args[0] as string, "sub");
  assert.match(consoleLog.getCall(7).args[0] as string, "sub.test");
  assert.match(consoleLog.getCall(8).args[0] as string, "sub.build");
  assert.match(consoleLog.getCall(9).args[0] as string, "sub.lint");
});

printHelp("should print command if single response", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, "test");

  // Assert
  assert.is(consoleLog.callCount, 2);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "test");
});

printHelp("should print command with array", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, "lint");

  // Assert
  assert.is(consoleLog.callCount, 3);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "lint.0");
  assert.match(consoleLog.getCall(2).args[0] as string, "lint.1");
});

printHelp("should print command with array and index", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, "lint.0");

  // Assert
  assert.is(consoleLog.callCount, 2);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "lint.0");
});

printHelp("should print command with array and *", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, "lint.*");

  // Assert
  assert.is(consoleLog.callCount, 3);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "lint.0");
  assert.match(consoleLog.getCall(2).args[0] as string, "lint.1");
});

printHelp("should print commands with array args", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, ["lint", "format"]);

  // Assert
  assert.is(consoleLog.callCount, 5);
  assert.match(consoleLog.getCall(0).args[0] as string, "Available commands:");
  assert.match(consoleLog.getCall(1).args[0] as string, "lint.0");
  assert.match(consoleLog.getCall(2).args[0] as string, "lint.1");
  assert.match(consoleLog.getCall(3).args[0] as string, "format");
});

printHelp("should do nothing if undefined args", () => {
  // Arrange
  sinon.stub(process, "exit");

  // Act
  Help.printHelp(config, { _: [] }, undefined);

  // Assert
  assert.is(consoleLog.callCount, 0);
});

printHelp.run();
//endregion

//region printCommand
const printCommand = suite("printCommand");

printCommand("should print not found if undefined", () => {
  // Arrange

  // Act
  Help.printCommand(undefined, []);

  // Assert
  assert.is(consoleError.callCount, 1);
  assert.match(consoleError.getCall(0).args[0] as string, "not found");
});

printCommand("should not print $description standalone", () => {
  // Arrange

  // Act
  Help.printCommand({ $description: "test" }, ["$description"]);

  // Assert
  assert.is(consoleLog.callCount, 0);
});

printCommand("should print $description if available", () => {
  // Arrange

  // Act
  Help.printCommand({ $description: "desc" }, ["test"]);

  // Assert
  assert.is(consoleLog.callCount, 1);
  assert.match(consoleLog.getCall(0).args[0] as string, "test");
  assert.match(consoleLog.getCall(0).args[0] as string, "desc");
});

printCommand("should print command if string", () => {
  // Arrange

  // Act
  Help.printCommand("test", ["path"]);

  // Assert
  assert.is(consoleLog.callCount, 1);
  assert.match(consoleLog.getCall(0).args[0] as string, "test");
  assert.match(consoleLog.getCall(0).args[0] as string, "path");
});

printCommand("should print command if array", () => {
  // Arrange

  // Act
  Help.printCommand(["test", "arg2", "arg3"], ["test", "path"]);

  // Assert
  assert.is(consoleLog.callCount, 1);
  assert.match(consoleLog.getCall(0).args[0] as string, "[3]");
  assert.match(consoleLog.getCall(0).args[0] as string, "test.path");
});

printCommand("should print command if object", () => {
  // Arrange

  // Act
  Help.printCommand({ test: "test", sub: "dee" }, ["test", "path"]);

  // Assert
  assert.is(consoleLog.callCount, 1);
  assert.match(consoleLog.getCall(0).args[0] as string, "test.path");
  assert.match(consoleLog.getCall(0).args[0] as string, "{test, sub}");
});

printCommand("should print command if function", () => {
  // Arrange

  // Act
  Help.printCommand(() => {}, ["olo", "path"]);

  // Assert
  assert.is(consoleLog.callCount, 1);
  assert.match(consoleLog.getCall(0).args[0] as string, "olo.path");
  assert.match(consoleLog.getCall(0).args[0] as string, "<function>");
});

printCommand.run();
//endregion
