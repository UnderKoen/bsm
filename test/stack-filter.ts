const originalPrepareStackTrace = Error.prepareStackTrace;

Error.prepareStackTrace = (err, stackTraces) => {
  // Filter out anything that comes from uvu itself
  const filtered = stackTraces.filter((callSite) => {
    const fileName = callSite.getFileName() || "";
    return !fileName.match(/node_modules[/\\]uvu/g);
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return originalPrepareStackTrace
    ? originalPrepareStackTrace(err, filtered)
    : `${err}\n${filtered.join("\n")}`;
};
