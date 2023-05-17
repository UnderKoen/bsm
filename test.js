module.exports = {
  scripts: {
    testing: {
      default: {
        _default: "echo default",
      },
      os: {
        _win32: "echo Windows",
        _default: "echo Not Windows",
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
        _catch: "echo %BSM_ERROR%",
      },
      function: (argv) => {
        console.log(`wow cool function bro ${argv}`);
        return "echo function";
      },
    },
  },
  config: {
    allowFunction: true,
  },
};
