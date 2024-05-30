# [1.4.0](https://github.com/UnderKoen/bsm/compare/v1.3.5...v1.4.0) (2024-05-30)


### Features

* add `_${process.arch}` scripts ([fccc9cf](https://github.com/UnderKoen/bsm/commit/fccc9cf98ae32953aa644fb6b9628482a61b24cc))

## [1.3.5](https://github.com/UnderKoen/bsm/compare/v1.3.4...v1.3.5) (2024-04-16)


### Bug Fixes

* allow use of relative paths for interactive mode ([36968d8](https://github.com/UnderKoen/bsm/commit/36968d84e7907dea4b2971c7a66891801655bbc4))

## [1.3.4](https://github.com/UnderKoen/bsm/compare/v1.3.3...v1.3.4) (2024-03-26)


### Bug Fixes

* empty string $env ([3339ce2](https://github.com/UnderKoen/bsm/commit/3339ce2bea5ce80efa23b5d06ab905f706668b20))
* improve environment warning ([9bea058](https://github.com/UnderKoen/bsm/commit/9bea05884495a8c350802ab9ee02da8a2156d877))

## [1.3.3](https://github.com/UnderKoen/bsm/compare/v1.3.2...v1.3.3) (2024-01-25)


### Bug Fixes

* add debug script ([5fe37c6](https://github.com/UnderKoen/bsm/commit/5fe37c68f408898ee3a75dbbee62b834ed54e31f))

## [1.3.2](https://github.com/UnderKoen/bsm/compare/v1.3.1...v1.3.2) (2024-01-18)


### Bug Fixes

* Config option for no args instead of all help ([3354c40](https://github.com/UnderKoen/bsm/commit/3354c4097dd4163a7796c934c96ff2d52be3d6c6))

## [1.3.1](https://github.com/UnderKoen/bsm/compare/v1.3.0...v1.3.1) (2024-01-18)


### Bug Fixes

* Script failed with code null ([671650d](https://github.com/UnderKoen/bsm/commit/671650db740da7690ce6d8e721a4cd3327d26e8e))

# [1.3.0](https://github.com/UnderKoen/bsm/compare/v1.2.5...v1.3.0) (2024-01-17)


### Features

* interactive script selection ([51e3742](https://github.com/UnderKoen/bsm/commit/51e37424f2e9fd3446e76e06a0723ded18de17a4))

## [1.2.5](https://github.com/UnderKoen/bsm/compare/v1.2.4...v1.2.5) (2023-11-09)


### Bug Fixes

* when script file has a module not found print error ([534b95f](https://github.com/UnderKoen/bsm/commit/534b95f5a0045717a167896362cd1178e5653a74))

## [1.2.4](https://github.com/UnderKoen/bsm/compare/v1.2.3...v1.2.4) (2023-11-06)


### Bug Fixes

* \n in quoted env values not escaped ([27d29ee](https://github.com/UnderKoen/bsm/commit/27d29eeb133cd2cec9afce05887d82a7ce89c113))

## [1.2.3](https://github.com/UnderKoen/bsm/compare/v1.2.2...v1.2.3) (2023-11-01)


### Bug Fixes

* windows \r breaking regex ([1bfa3e1](https://github.com/UnderKoen/bsm/commit/1bfa3e138ad71ae3ad7b8b015bfd4c88ad7a6537))

## [1.2.2](https://github.com/UnderKoen/bsm/compare/v1.2.1...v1.2.2) (2023-11-01)


### Bug Fixes

* env file not found ([1db5e68](https://github.com/UnderKoen/bsm/commit/1db5e68c20ec371fc78543f5ad12083127573829))

## [1.2.1](https://github.com/UnderKoen/bsm/compare/v1.2.0...v1.2.1) (2023-10-31)


### Bug Fixes

* add --version argument for improved debugging ([7027260](https://github.com/UnderKoen/bsm/commit/70272600616e8c27e6bd3e53bd94c0b0c281a724))

# [1.2.0](https://github.com/UnderKoen/bsm/compare/v1.1.1...v1.2.0) (2023-10-26)


### Features

* $env `file:./.env` support ([fecbf55](https://github.com/UnderKoen/bsm/commit/fecbf555bda95bc28ce02ed2492b7ad76a8a97bd))

## [1.1.1](https://github.com/UnderKoen/bsm/compare/v1.1.0...v1.1.1) (2023-10-17)


### Bug Fixes

* more verbose help when script/subscript not found. ([a0a953e](https://github.com/UnderKoen/bsm/commit/a0a953e6cb74bfe06ee8f6bd7d0f993bee6a5613))

# [1.1.0](https://github.com/UnderKoen/bsm/compare/v1.0.1...v1.1.0) (2023-09-30)


### Features

* package.json doesn't require arguments. ([573e815](https://github.com/UnderKoen/bsm/commit/573e815854462c3609a4cb8962770456eecfc816))
* simple `$env` functionality ([02bf875](https://github.com/UnderKoen/bsm/commit/02bf87510b3f71e6408d6025d1d483263107137a))

## [1.0.1](https://github.com/UnderKoen/bsm/compare/v1.0.0...v1.0.1) (2023-09-09)


### Bug Fixes

* unescaped ~ caused problems ([3564b3e](https://github.com/UnderKoen/bsm/commit/3564b3e6a40217d42930386305584361ebe10e20))

# 1.0.0 (2023-09-09)


### Features

* _catch errors ([2f3201b](https://github.com/UnderKoen/bsm/commit/2f3201bff01858be544b5323b69e92ee59ac058d))
* _onError and _finally added ([9d0dab9](https://github.com/UnderKoen/bsm/commit/9d0dab9676d8ef0d132beae7703c1ac7601e06a3))
* added `_ci` for check if in CI ([2d72e00](https://github.com/UnderKoen/bsm/commit/2d72e005df9df3a2f18af407988683ca791fca61))
* extending scripts ([1c5437b](https://github.com/UnderKoen/bsm/commit/1c5437ba1b844a81ebd535684970b26b1e544232))
* Extending with options (experimental) ([de645b4](https://github.com/UnderKoen/bsm/commit/de645b4a93aa5c2c603c4b71257c852046fe2a18))
* help command ([c7d988a](https://github.com/UnderKoen/bsm/commit/c7d988af238c843bdba9f61113e8261245c0caa4))
* **help:** use $description for better explanations for complex commands ([da89cce](https://github.com/UnderKoen/bsm/commit/da89cce91825685b0b1df8fe866881d552e722f1))
* include node_modules/.bin on path ([3267e63](https://github.com/UnderKoen/bsm/commit/3267e63373d6c76b91f3fa47be39880cb1c07571))
* log exit codes ([8a2c0a7](https://github.com/UnderKoen/bsm/commit/8a2c0a7fbe23dee84f0f990a119d814b0f392d11))
* passing arguments ([a373320](https://github.com/UnderKoen/bsm/commit/a3733207ea7a555241dce4642837c4426531d40b))
* passing stdin ([97861d5](https://github.com/UnderKoen/bsm/commit/97861d59a37c84121bce5de42190b54f7f71c50f))
* possible to use package.scripts.json instead of js ([b65043e](https://github.com/UnderKoen/bsm/commit/b65043eb9cfb8ec2e08a908ba19155d32c77edaa))
* pre and post hooks ([579f62c](https://github.com/UnderKoen/bsm/commit/579f62c5ac878efc274ee9b2c9439bf6d3d20da1))
* relative scripts ([64f9dd9](https://github.com/UnderKoen/bsm/commit/64f9dd9f836e1609346ac456d47d068b4716fed7))
* run functions ([cca816a](https://github.com/UnderKoen/bsm/commit/cca816a779cdf82d623ce3d2f5fbfeb1f0b5eba6))
* run with config ([83be3c9](https://github.com/UnderKoen/bsm/commit/83be3c9ae8c50ff1fc6c49f7256230d1033216d4))
* scripts depending on os ([5e79e09](https://github.com/UnderKoen/bsm/commit/5e79e094a9e8dce373208875617fcc4b6a939629))
* show function execution errors ([04d826a](https://github.com/UnderKoen/bsm/commit/04d826a4fcb1e49074c8a29fdcf9fe17e7906394))
* wildcards ignore non executable scripts ([f6438a5](https://github.com/UnderKoen/bsm/commit/f6438a592671693ce55290db8dcc6b4f8f0c69a0))
