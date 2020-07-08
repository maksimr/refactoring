const {parse, visit, types, print} = require('recast');
const namedTypes = types.namedTypes;

module.exports.updateImports = updateImports;
module.exports.fixImports = fixImports;

/**
 * @param {string} code
 * @param {string} filePath
 * @param {string} fromPath
 * @param {string} toPath
 * @return {string}
 */
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
function fixImports(node, filePath, fromPath, toPath) {
  return visitImports(node, function(node) {
    return visit(node, {
      visitStringLiteral(path) {
        if (resPath(path.node.value) === resPath(fromPath)) {
          const modulePath = relPath(resPath(toPath));
          // Preserve quote mark from source
          // https://github.com/benjamn/recast/issues/171
          // @ts-ignore
          const quote = path.node.extra.raw[0];
          // @ts-ignore
          // noinspection JSPrimitiveTypeWrapperUsage
          path.replace(types.builders.stringLiteral(new String(quote + modulePath + quote)));
        }
        return false;

        function resPath(it) {
          return isModulePath(it) ? it :
            normalizePath(require('path').resolve(dir(filePath), it));
        }

        function relPath(it) {
          if (isModulePath(it)) {
            return it;
          }
          const p = require('path').relative(dir(filePath), it);
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
    });
  });
}

function visitImports(node, fn) {
  return visit(node, {
    visitImportDeclaration(path) {
      fn(path.node, path);
      return false;
    },

    visitCallExpression(path) {
      /** @type {import('recast').types.namedTypes.Identifier} */
        // @ts-ignore
      let node = path.node.callee;
      let scope = path.scope;
      while (scope = path.scope.lookup(node.name)) {
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

      if (node.name === 'require' || namedTypes.Import.check(node)) {
        if (path.node.arguments.length > 0) {
          fn(path.node, path);
        }
      }

      this.traverse(path);
    }
  });
}
