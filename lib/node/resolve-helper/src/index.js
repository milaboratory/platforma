function tryResolveOrError(root, request) {
  try {
    const result = require.resolve(request, {
      paths: [root]
    });
    return { result };
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND' && err.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') throw err;
    return { err: err.code };
  }
}

function tryResolve(root, request) {
  const result = tryResolveOrError(root, request);
  return result.result;
}

module.exports = {
  tryResolve,
  tryResolveOrError
};
