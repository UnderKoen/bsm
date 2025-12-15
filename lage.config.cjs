module.exports = {
  pipeline: {
    build: {
      type: "bsm",
    },
    test: [],
    lint: {
      type: "bsm",
      dependsOn: ["build"],
    },
  },
  runners: {
    bsm: {
      script: require.resolve("@under_koen/bsm/dist/LageRunner.js"),
    },
  },
  cacheOptions: {
    cacheStorageConfig: {
      provide: "local-skip",
    },
  },
};
