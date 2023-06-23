# BSM (Basic Script Manager)

BSM is a tool that enhances the functionality of NPM by allowing users to define their scripts in a separate files. This
makes it easier to create and manage complex scripts using JavaScript, without cluttering your `package.json` file.

## Getting started

### Installation

Install BSM as a dev dependency or globally.

```bash
npm install --save-dev bsm
```

```bash
npm install -g bsm
```

### Usage

Create a `package.scripts.js` or `package.scripts.json` file in the root of your project. This file will contain all of
your scripts.

When using `package.scripts.js`, you can use the following syntax:

```javascript
module.exports = {
  scripts: {
    build: {
      _default: "bsm clean ~.* --",
      esbuild: "esbuild ...",
    },
    clean: "rimraf dist/",
    lint: {
      _default: "bsm ~.* --",
      eslint: "eslint --ext .ts,.js .",
      prettier: "prettier --check .",
    },
  },
};
```

When using `package.scripts.json`, you can use the following syntax:

```json
{
  "scripts": {
    "build": {
      "_default": "bsm clean ~.*",
      "esbuild": "esbuild ..."
    },
    "clean": "rimraf dist/",
    "lint": {
      "_default": "bsm ~.*",
      "eslint": "eslint --ext .ts,.js .",
      "prettier": "prettier --check ."
    }
  }
}
```

You can then run your scripts using the `bsm` command.

```bash
bsm build
```

```bash
bsm lint
```

You can also run sub-scripts.

```bash
bsm lint.eslint
```

## Features

### Script groups

You can group scripts by using an object or array.

```javascript
module.exports = {
  scripts: {
    example: {
      test: "echo test script",
      variant: "echo variant script",
      subgroups: {
        test: "echo test script",
        variant: "echo variant script",
      },
    },
  },
};
```

In this example the following scripts are available:
- `bsm example.test`
- `bsm example.variant`
- `bsm example.subgroups.test`
- `bsm example.subgroups.variant`

```javascript
module.exports = {
  scripts: {
    example: ["echo test script", "echo variant script"],
  },
};
```

In this example the following scripts are available:
- `bsm example` (will run all scripts in the array)
- `bsm example.0`
- `bsm example.1`

### Default scripts

You can define a default script for a group of scripts by using the `_default` key.

```javascript
module.exports = {
  scripts: {
    example: {
      _default: "echo default script",
      variant: "echo variant script",
    },
  },
};
```

`bsm example` will execute the default script, while `bsm example.variant` will execute the variant script.

### Specified scripts

Specified scripts replace the default script when an condition is met.

The order of precedence is as follows:
- _ci
- _[os]
- _default

#### CI Specified scripts

You can specify CI specific scripts with `_ci` key.

```javascript
module.exports = {
  scripts: {
    example: {
      _default: "echo default script",
      _ci: "echo ci script",
    },
  },
};
```

`bsm example` will execute the `example._ci` when running on a CI environment. When no CI specific script is found, the
default script will be executed.

#### OS Specified scripts

You can specify OS specific scripts with `_win32`, `_darwin`, and `_linux` keys.
All platforms can be seen [here](https://nodejs.org/api/os.html#os_os_platform).

```javascript
module.exports = {
  scripts: {
    example: {
      _default: "echo default script",
      _win32: "echo windows script",
      _darwin: "echo macos script",
      _linux: "echo linux script",
    },
  },
};
```

`bsm example` will execute the `example._win32` on Windows, `example._darwin` on MacOS, and `example._linux` on Linux.
When no OS specific script is found, the default script will be executed.

### Script arguments

All arguments passed to the `bsm` command after `--` will be passed to all specified scripts.

```javascript
module.exports = {
  scripts: {
    example: "echo",
  },
};
```

```bash
bsm example -- Hello World!
```

The above command will execute `echo Hello World!`.

### Relative scripts

You can run scripts relative to the current script by using the `~` prefix.

```javascript
module.exports = {
  scripts: {
    example: {
      _default: "bsm ~.variant",
      variant: "echo variant script",
    },
  },
};
```

```bash
bsm example
```

The above command will execute `example.variant`.

### All scripts

You can run all scripts in a group by using a `*`.
Ignores scripts that start with `_`.

```javascript
module.exports = {
  scripts: {
    example: {
      test: "echo test script",
      variant: "echo variant script",
      _ignore: "echo ignore script",
    },
  },
};
```

```bash
bsm example.*
```

The above command will execute `example.test` and `example.variant`.

### Hooks

#### Pre hooks

You can run scripts before a script by using `_pre`.

```javascript
module.exports = {
  scripts: {
    example: {
      _pre: "echo pre script",
      _default: "echo default script",
    },
  },
};
```

```bash
bsm example
```

The above command will execute `example._pre` and `example._default`.

#### Post hooks

You can run scripts after a script by using `_post`.
Does not run when a script fails.

```javascript
module.exports = {
  scripts: {
    example: {
      _default: "echo default script",
      _post: "echo post script",
    },
  },
};
```

```bash
bsm example
```

The above command will execute `example._default` and `example._post`.

#### On error hooks

You can run scripts when a script fails by using `_onError`.

```javascript
module.exports = {
  scripts: {
    example: {
      _default: "exit 1",
      _onError: "echo error script",
    },
  },
};
```

```bash
bsm example
```

The above command will execute `example._default` and `example._onError`. 
This will also exit with code `1`.

#### Catch hooks

You can run scripts when a script fails by using `_catch`.

```javascript
module.exports = {
  scripts: {
    example: {
      _default: "exit 1",
      _catch: "echo catch script",
    },
  },
};
```

```bash
bsm example
```

The above command will execute `example._default` and `example._catch`.

#### Finally hooks

You can run scripts when a script fails by using `_finally`.

```javascript
module.exports = {
  scripts: {
    example: {
      _default: "echo default script",
      error: "exit 1",
      _finally: "echo finally script",
    },
  },
};
```

```bash
bsm example
```

The above command will execute `example._default` and `example._finally`.

```bash
bsm example.error
```

The above command will execute `example.error` and `example._finally`.
And exit with code `1`.

### Functions

You can use functions in your scripts. This only work in javascript files.

```javascript
module.exports = {
  scripts: {
    example: () => {
      console.log("Hello World!");
    },
  },
};
```

```bash
bsm example
```

The above command will execute the function and log `Hello World!`.

#### Async functions

You can use async functions in your scripts. This only work in javascript files.

```javascript
import { setTimeout } from "timers/promises";

module.exports = {
  scripts: {
    example: async () => {
      await setTimeout(5000);
      console.log("Hello World!");
    },
  },
};
```

```bash
bsm example
```

The above command will execute the function and log `Hello World!` after 5 seconds.

#### Arguments

The function is passed an array of all arguments passed to the script after `--`.

```javascript
module.exports = {
  scripts: {
    example: (args) => {
      console.log(args);
    },
  },
};
```

```bash
bsm example -- Hello World!
```

The above command will execute the function and log `["Hello", "World!"]`.

#### Return value

The function can return scripts, these will handled as if function was not used.
Return value can be a string, an array, an object or another function.

```javascript
module.exports = {
  scripts: {
    example: () => {
      return "echo Hello World!";
    },
  },
};
```

```bash
bsm example
```

The above command will execute `echo Hello World!`.

### Extending

You can extend scripts by using the `extends` key. You can import scripts from other files or packages.

```javascript
module.exports = {
  extends: ['@under_koen/bsm/package.scripts.js'],
  scripts: {},
}
```

```bash
bsm lint
```

The above command will execute `lint` coming from the `package.scripts.js` of `@under_koen/bsm`.

#### Extending with options (experimental)

You can extend scripts with options by using the `extends` key. You can import scripts from other files or packages.

```javascript
// package.scripts.js
module.exports = {
  extends: [
    ['./test', "World"]
  ],
  scripts: {},
}
```

```javascript
// test.js

module.exports = (name) => ({
  scripts: {
    test: `echo Hello ${name}!`,
  },
});
```

```bash
bsm test
```

The above command will execute `echo Hello World!`.

## Future plans

- [ ] Have support for workspaces / lerna
- [ ] Have support for running scripts in parallel
- [ ] Have support for specifying environment variables
- [ ] Have support for an interactive mode
- [ ] Jetbrains and VSCode integration

## License

BSM is released under the [MIT License](https://opensource.org/licenses/MIT).
