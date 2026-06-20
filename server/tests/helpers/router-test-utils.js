const Module = require('module');
const path = require('path');

function resolveFrom(modulePath, request) {
  return Module._resolveFilename(request, {
    id: modulePath,
    filename: modulePath,
    paths: Module._nodeModulePaths(path.dirname(modulePath)),
  });
}

function loadWithMocks(modulePath, mocks) {
  const target = require.resolve(modulePath);
  const resolvedMocks = new Map(
    Object.entries(mocks).map(([request, value]) => [resolveFrom(target, request), value])
  );
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (resolvedMocks.has(resolved)) return resolvedMocks.get(resolved);
    return originalLoad(request, parent, isMain);
  };

  delete require.cache[target];
  try {
    return require(target);
  } finally {
    Module._load = originalLoad;
    delete require.cache[target];
  }
}

function createResponse() {
  let resolveResponse;
  const done = new Promise(resolve => {
    resolveResponse = resolve;
  });

  const res = {
    statusCode: 200,
    body: undefined,
    headers: {},
    locals: {},
    finished: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      this.finished = true;
      resolveResponse(this);
      return this;
    },
    send(body) {
      this.body = body;
      this.finished = true;
      resolveResponse(this);
      return this;
    },
    end(body) {
      this.body = body;
      this.finished = true;
      resolveResponse(this);
      return this;
    },
    set(field, value) {
      this.headers[field.toLowerCase()] = value;
      return this;
    },
  };

  return { res, done };
}

function getRoute(router, method, routePath) {
  const layer = router.stack.find(entry => entry.route && entry.route.path === routePath && entry.route.methods[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  return layer.route.stack.map(entry => entry.handle);
}

async function invokeRoute(router, method, routePath, req = {}) {
  const handlers = getRoute(router, method, routePath);
  const { res, done } = createResponse();
  const request = {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: { id: 1, role: 'admin', permissions: { pos: true, stock: true, purchases: true, expenses: true, dashboard: true, monthly_report: true, admin: true } },
    ...req,
  };

  let index = 0;
  const run = async () => {
    const handler = handlers[index++];
    if (!handler || res.finished) return;

    await new Promise((resolve, reject) => {
      let nextCalled = false;
      const next = (err) => {
        nextCalled = true;
        if (err) reject(err);
        else resolve();
      };

      try {
        const result = handler(request, res, next);
        if (result && typeof result.then === 'function') {
          result.then(() => {
            if (handler.length < 3 && !nextCalled && !res.finished) resolve();
          }).catch(reject);
          return;
        }
        if (handler.length < 3 && !nextCalled && !res.finished) resolve();
      } catch (error) {
        reject(error);
      }
    });

    await run();
  };

  await Promise.race([
    (async () => {
      await run();
      if (!res.finished) res.end();
      return res;
    })(),
    done,
  ]);

  return res;
}

function createAuthStub(defaultUser = { id: 1, role: 'admin', permissions: { pos: true, stock: true, purchases: true, expenses: true, dashboard: true, monthly_report: true, admin: true } }) {
  return {
    authenticate: (req, res, next) => {
      req.user = req.user || { ...defaultUser };
      next();
    },
    requireRole: (...roles) => (req, res, next) => {
      if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
      next();
    },
    requirePermission: (...permissions) => (req, res, next) => {
      if (!req.user) return res.status(403).json({ error: 'Insufficient permissions' });
      if (req.user.role === 'admin' || permissions.some(permission => req.user.permissions?.[permission])) return next();
      return res.status(403).json({ error: 'Insufficient permissions' });
    },
  };
}

module.exports = { loadWithMocks, invokeRoute, createAuthStub };
