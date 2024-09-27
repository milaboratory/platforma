function tryResolve(root, request) {
  try {
    return require.resolve(request, {
      paths: [root]
    });
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
  }
  return undefined;
}

module.exports = {
  tryResolve
};
