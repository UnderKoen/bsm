export default {
  scripts: {
    build: {
      _pre: "echo fail building",
      _default: "node ./broken.mjs",
    },
  },
};
