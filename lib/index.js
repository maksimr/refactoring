const {parse, visit, types, print} = require('recast');
const namedTypes = types.namedTypes;
const b = types.builders;

/**
 * @param {string} code
 * @param {string} filePath
 * @param {string} fromPath
 * @param {string} toPath
 * @return {string}
 */
module.exports.updateImports = updateImports;

function updateImports(code, filePath, fromPath, toPath) {
  const node = parse(code, {parser: require('recast/parsers/babel')});
  return print(fixImports(node, filePath, fromPath, toPath)).code;
}

/**
 * @param {import('recast').types.ASTNode} node
 * @param {string} filePath
 * @param {string} fromPath
 * @param {string} toPath
 * @return {import('recast').types.ASTNode}
 */
module.exports.fixImports = fixImports;

function fixImports(node, filePath, fromPath, toPath) {
  return visitImports(node, function(node) {
    return visit(node, {
      visitLiteral(path) {
        if (typeof path.node.value === 'string' && resolvePath(filePath, path.node.value) === resolvePath(filePath, fromPath)) {
          const modulePath = resolvePath(filePath, toPath, true);
          // Preserve quote mark from source
          // https://github.com/benjamn/recast/issues/171
          // @ts-ignore
          const quote = (path.node.raw && path.node.raw[0]) || (path.node.extra && path.node.extra.raw[0]) || '\'';
          // @ts-ignore
          // noinspection JSPrimitiveTypeWrapperUsage
          path.replace(types.builders.stringLiteral(new String(quote + modulePath + quote)));
        }
        return false;
      }
    });
  });
}

module.exports.visitImports = visitImports;

function visitImports(node, fn) {
  return visit(node, {
    visitImportDeclaration(path) {
      fn(path.node, path);
      return false;
    },

    visitCallExpression(path) {
      const node = resolveVariable(path.node.callee, path.scope);

      if (
        namedTypes.MemberExpression.check(node) &&
        isModuleRequire(node.object, path.scope) &&
        // @ts-ignore
        node.property.name === 'context'
      ) {
        if (path.node.arguments.length > 0) {
          fn(path.node, path);
        }
      }

      // @ts-ignore
      if (isModuleRequire(node, path.scope) || namedTypes.Import.check(node)) {
        if (path.node.arguments.length > 0) {
          fn(path.node, path);
        }
      }

      this.traverse(path);
    }
  });

  function isModuleRequire(node, scope) {
    return (
      namedTypes.Identifier.check(node) &&
      node.name === 'require' &&
      (!scope || !scope.lookup(node.name)));
  }
}

module.exports.isAngularModuleExpression = isAngularModuleExpression;

function isAngularModuleExpression(node) {
  return (
    namedTypes.MemberExpression.check(node) &&
    namedTypes.Identifier.check(node.object) &&
    namedTypes.Identifier.check(node.property) &&
    node.object.name === 'angular' &&
    node.property.name === 'module'
  );
}

module.exports.isAngularModuleEntity = isAngularModuleEntity;

function isAngularModuleEntity(node) {
  return (
    namedTypes.Identifier.check(node) &&
    /^(service|factory|directive|filter|controller|provider|component|run|config|constant|value)$/.test(node.name)
  );
}

module.exports.isAngularModuleDeclaration = isAngularModuleDeclaration;

function isAngularModuleDeclaration(node) {
  return isAngularModuleExpression(node.callee) && node.arguments.length > 1;
}


module.exports.findContext = findContext;

function findContext(node) {
  while (
    namedTypes.CallExpression.check(node) &&
    namedTypes.MemberExpression.check(node.callee) &&
    namedTypes.CallExpression.check(node.callee.object)
    ) {
    node = node.callee.object;
  }

  return node;
}


module.exports.resolveVariable = resolveVariable;

function resolveVariable(node, scope) {
  // @ts-ignore
  while (namedTypes.Identifier.check(node) && scope && (scope = scope.lookup(node.name))) {
    // @ts-ignore
    const path = scope.bindings[node.name][0];
    node = path.value;
    if (
      namedTypes.Identifier.check(node) &&
      namedTypes.VariableDeclarator.check(path.parentPath.value) &&
      namedTypes.Identifier.check(path.parentPath.value.init)
    ) {
      node = path.parentPath.value.init;
      continue;
    }
    break;
  }
  return node;
}


module.exports.visitAngularModuleDeclaration = visitAngularModuleDeclaration;

function visitAngularModuleDeclaration(node, fn) {
  return visit(node, {
    visitCallExpression(path) {
      if (isAngularModuleDeclaration(path.node)) {
        fn(path.node, path);
      }
      this.traverse(path);
    }
  });
}


module.exports.buildRequireExpression = buildRequireExpression;

function buildRequireExpression(path) {
  return b.callExpression(b.identifier('require'), [b.literal(path)]);
}


module.exports.resolvePath = resolvePath;

function resolvePath(referencePath, path, isRelative = false) {
  return isRelative ? relPath(resPath(path)) : resPath(path);

  function resPath(it) {
    return isModulePath(it) ? it :
      normalizePath(require('path').resolve(dir(referencePath), it));
  }

  function relPath(it) {
    if (isModulePath(it)) {
      return it;
    }
    const p = require('path').relative(dir(referencePath), it);
    return isModulePath(p) ? './' + p : p;
  }

  function isModulePath(it) {
    return !/^(\.)*\//.test(it);
  }

  function dir(it) {
    return require('path').dirname(it);
  }

  function normalizePath(path) {
    return path
      .replace(/\.js$/, '')
      .replace(/\/index$/, '');
  }
}

module.exports.addEntityToAngularModule = addEntityToAngularModule;

function addEntityToAngularModule(node, entityNode) {
  return visit(node, {
    visitCallExpression(path) {
      const root = findContext(path.node);
      if (
        isAngularModuleDeclaration(root) &&
        // @ts-ignore
        isAngularModuleEntity(path.node.callee.property)
      ) {
        path.replace(
          b.callExpression(
            b.memberExpression(
              path.node,
              b.identifier(entityNode.callee.property.name)
            ),
            entityNode.arguments
          )
        );
        return false;
      }

      this.traverse(path);
    }
  });
}

module.exports.addRequireStatement = addRequireStatement;

function addRequireStatement(node, modulePath) {
  return visit(node, {
    visitProgram(path) {
      path.node.body.push(b.expressionStatement(buildRequireExpression(modulePath)));
      return false;
    }
  });
}

module.exports.addAngularModuleDependencyNode = addAngularModuleDependencyNode;

function addAngularModuleDependencyNode(node, depNode) {
  return visit(node, {
    visitCallExpression(path) {
      if (isAngularModuleDeclaration(path.node)) {
        const dependencies = extractAngularModuleDependenciesAsStrings(path.node.arguments[1]);
        const depId = extractAngularModuleDependenciesAsStrings(depNode)[0];

        if (dependencies.indexOf(depId) < 0) {
          // @ts-ignore
          path.node.arguments[1].elements.push(depNode);
        }

        return false;
      }
      this.traverse(path);
    }
  });

  function extractAngularModuleDependenciesAsStrings(node) {
    const dependencies = [];
    visit(node, {
      visitLiteral(path) {
        dependencies.push(path.node.value);
        return false;
      }
    });
    return dependencies;
  }
}
