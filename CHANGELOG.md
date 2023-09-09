# 1.0.0 (2023-09-09)


### Bug Fixes

* _post working again ([403e93e](https://github.com/UnderKoen/bsm/commit/403e93e65176990e9ef451fb78b18d039d15cdb0))
* empty catch not working ([6702692](https://github.com/UnderKoen/bsm/commit/6702692a74de4bb4c7aab835048992a393c6d647))
* error in package.scripts.js ([b856b6f](https://github.com/UnderKoen/bsm/commit/b856b6f7d954cf367e25410394017f4fc5e09792))
* error when trying to execute an object without `_default` ([81260ba](https://github.com/UnderKoen/bsm/commit/81260ba6b517830337b7df8d59d1e47ba07f624f))
* exit with the correct exit code ([d1fcc5f](https://github.com/UnderKoen/bsm/commit/d1fcc5f04d51de3e447bd9da9dad532aede60435))
* **functions:** when returning nullish don't throw not executable error ([fe63677](https://github.com/UnderKoen/bsm/commit/fe636774240331bea37b4500e703989b04216372))
* include args working ([5da7483](https://github.com/UnderKoen/bsm/commit/5da74834139c57c9f14a956e2bf7d39c9a512086))
* with relative don't execute _pre and _post of parent ([78aaf0c](https://github.com/UnderKoen/bsm/commit/78aaf0c4d32124bc2997912c7e4dad265b6b22f8))


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


### Performance Improvements

* use an single split ([f473d73](https://github.com/UnderKoen/bsm/commit/f473d7382dd0856421d6514f2cc1e0a35a095c5d))


### Reverts

* remove option to allow functions ([d20249e](https://github.com/UnderKoen/bsm/commit/d20249ed57d1329ff575c5fe79e67b942381d881))
