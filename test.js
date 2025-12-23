export default {
  scripts: {
    testing: {
      default: {
        _default: "echo default",
      },
      os: {
        _win32: "echo Windows",
        _default: "echo Not Windows",
      },
      arch: {
        _x64: "echo 64-bit",
        _x32: "echo 32-bit",
        _arm: "echo ARM",
        _arm64: "echo ARM64",
        _default: "echo Unknown",
      },
      args: {
        _pre: "echo pre args",
        _default: "bsm testing.args.* --",
        echo: "echo",
        echo2: "echo",
      },
      array: ["echo 1", "echo 2", "echo 3"],
      hooks: {
        _pre: "echo pre hooks",
        _default: ["echo hooks1", "echo hooks2"],
        test: {
          _pre: "echo pre test",
          _default: "echo test",
        },
        _post: "echo post",
        error: {
          _default: "echo error",
          _post: "bsm ~.unknown",
          _catch: "",
        },
      },
      specificHooks: {
        _pre: "echo should be ignored",
        _pre__default: "echo pre default",
        _default: "bsm ~.test",
        _pre_test: "echo pre test",
        test: "echo test",
        _post: 'echo for all expect "test"',
        _post_test: "echo for test",
      },
      relative: {
        _default: "bsm ~.test",
        test: "echo test",
        echo: {
          _default: "bsm ~._",
          _: {
            _linux: "echo $BSM_PATH",
            _win32: "echo %BSM_PATH%",
            _default: `echo ${process.env.BSM_PATH}`,
          },
        },
        array: ["echo $BSM_PATH", "echo %BSM_PATH%"],
      },
      error: {
        onError: {
          _default: "exit 4",
          _onError: "echo onError",
        },
        catch: {
          _default: "exit 4",
          _catch: "echo catch",
        },
        finally: {
          _default: "exit 4",
          normal: "exit 0",
          _finally: "echo finally",
        },
        all: {
          _default: "exit 4",
          normal: "exit 0",
          _post: "echo post",
          _onError: "echo onError",
          _catch: "exit 3",
          _finally: "echo finally",
        },
        _catch: () => `echo ${process.env.BSM_ERROR}`,
      },
      functions: {
        _default: "bsm ~.*",
        return: (argv) => {
          console.log(`wow cool function bro ${argv}`);
          return "echo evil";
        },
        empty: (argv) => {
          console.log(`wow cool function bro ${argv}`);
        },
        error: {
          error() {
            throw new Error("wow cool error bro");
          },
          return() {
            return "exit 1";
          },
          _onError: () => `echo ${process.env.BSM_ERROR}`,
        },
        _pre: {
          _default: "echo pre test",
        },
      },
      env: {
        $env: {
          TEST: "true",
          GLOBAL: "123",
        },
        _default: () => {
          console.log(process.env.TEST);
          console.log(process.env.GLOBAL);
        },
        overrides: {
          $env: {
            test: "false",
          },
          _default: () => {
            console.log(process.env.test);
            console.log(process.env.global);
          },
        },
        file: {
          $env: "file:test.env",
          _default: () => {
            console.log(process.env.TEST);
            console.log(process.env.UNMATCH_QUOTE);
            console.log(process.env.NEW_LINE_NO_QUOTES);
            console.log(process.env.NEW_LINE_SINGLE_QUOTE);
            console.log(process.env.NEW_LINE_DOUBLE_QUOTE);
          },
        },
      },
      interactive: {
        notFound: "bsm ~._notFound",
      },
      debug: {
        _default: "bsm ~.*",
        scripts: "bsm --debug scripts",
        extends: "bsm --debug extends",
      },
      alias: {
        _default: "bsm ~.n ~.l ~.ls ~.d.n ~.list.test",
        normal: {
          $alias: "n",
          _default: "echo normal",
        },
        list: {
          $alias: ["l", "ls"],
          _default: "echo list",
          test: "bsm ~.list.t ~.list.n ~.list ~.list.0",
          list: [
            {
              $alias: "t",
              _default: "echo test",
            },
            {
              $alias: "n",
              _default: "echo new",
            },
          ],
        },
        deep: {
          $alias: "d",
          normal: {
            $alias: "n",
            _default: "echo deep normal",
          },
        },
      },
      idempotency: {
        $env: {
          BSM_IDEM_LOC:
            process.env.BSM_IDEM_LOC ??
            `./node_modules/.cache/bsm/testing/${Math.random().toString(36).substring(2)}`,
        },
        _default: "bsm ~.* && bsm ~.*",
        static: {
          $idempotency: "static:123",
          _default: "echo static",
        },
        staticRnd: {
          $idempotency: `static:${Math.random().toString(36).substring(2)}`,
          _default: "echo static random",
        },
        env: {
          $idempotency: "env:BSM_IDEM_LOC",
          _default: "echo env",
        },
        envRnd: {
          $env: {
            TEST: Math.random().toString(36).substring(2),
          },
          $idempotency: "env:TEST",
          _default: "echo env random",
        },
        notExistingFile: {
          $idempotency: "file:notExistingFile",
          _default: "echo notExistingFile",
        },
        file: {
          $idempotency: "file:./test.env",
          _default: "echo file",
        },
        dir: {
          $idempotency: "dir:./test",
          _default: "echo dir",
        },
        disabled: {
          $idempotency: "static:disabled",
          $idempotencyEnabled: false,
          _default: "echo disabled",
        },
      },
      caseInsensitive: {
        $env: {
          BSM_CASE_INSENSITIVE: "TRUE",
        },
        _default: "bsm ~.*",
        shouldPrioritiseExactMatch: {
          _default: "bsm ~.test",
          TEST: "echo incorrect",
          test: "echo correct",
        },
        shouldUseFirstIfNoExactMatch: {
          _default: "bsm ~.test",
          TEST: "echo correct",
          TEst: "echo incorrect",
        },
        shouldWorkWithAliases: {
          _default: "bsm ~.n",
          alias: {
            $alias: "N",
            _default: "echo correct",
          },
        },
      },
    },
  },
  config: {
    idempotency: {
      useFileContent: false,
      location: process.env.BSM_IDEM_LOC,
    },
    caseInsensitive: process.env.BSM_CASE_INSENSITIVE === "TRUE",
  },
};
