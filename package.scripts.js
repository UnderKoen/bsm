module.exports = {
    scripts: {
        prettier: {
            _default: "bsm prettier.*",
            packageJson: "prettier-package-json --write",
            eslint: "eslint --fix .",
            prettier: "prettier --write .",
        },
        lint: {
            _default: "bsm lint.*",
            eslint: "eslint .",
            prettier: "prettier --check .",
        },
        testing: {
            default: {
                _default: "echo default",
            },
            os: {
                _win32: "echo Windows",
                _default: "echo Not Windows",
            },
            args: {
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
            },
            error: "exit 2",
        },
    },
};
