const assert = require('assert');
const {visitAngularModuleDeclaration} = require('./index');
const {findContext} = require('./index');
const {isAngularModuleExpression} = require('./index');
const {parse} = require('recast');

describe('visitAngularModuleDeclaration', function() {
  it('should return first member expression with identifiers', function() {
    let deps;
    visitAngularModuleDeclaration(parse('angular.module("foo", ["a", "b"]).bar().zoo().moo()'), function(node) {
      deps = node.arguments[1].elements.map((it) => it.value);
    });
    expect(deps).toEqual(['a', 'b']);
  });
});

describe('findContext', function() {
  it('should return first member expression with identifiers', function() {
    const node = findContext(parse('angular.module("foo").bar().zoo().moo()').program.body[0].expression);
    expect(node.callee.object.name).toEqual('angular');
    expect(node.callee.property.name).toEqual('module');
  });
});

describe('isAngularModuleExpression', function() {
  it('should return true if node angular module expression', function() {
    expect(
      isAngularModuleExpression(parse('angular.module').program.body[0].expression)
    ).toEqual(true);
  });
});

describe('visitImports', function() {
  const {visitImports} = require('./index');

  it('should visit require', function() {
    const fn = jasmine.createSpy();
    visitImports(parse('require("foo");'), fn);
    expect(fn).toHaveBeenCalled();
  });

  it('should visit require context', function() {
    const fn = jasmine.createSpy();
    visitImports(parse('require.context("foo");'), fn);
    expect(fn).toHaveBeenCalled();
  });
});

describe('updateImports', function() {
  const {updateImports} = require('./index');

  it('should update require on module in current folder if we pass absolute path as references', function() {
    assert.equal(updateImports('require("./foo");', '/a/b/c.js', '/a/b/foo.js', '/a/b/bar.js'), 'require("./bar");');
  });

  it('should update require on module in subfolder if destination path change only file name on index.js', function() {
    assert.equal(updateImports('require("./foo/foo/foo");', '/a/b/c.js', '/a/b/foo/foo/foo.js', '/a/b/foo/foo/index.js'), 'require("./foo/foo");');
  });

  it('should update require on module in sibling folder', function() {
    assert.equal(updateImports('require("../foo/foo.js");', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'require("../foo/bar");');
  });

  it('should update require on sibling module if we change file name on index.js', function() {
    assert.equal(updateImports('require("../foo/foo");', '/a/b/c.js', '../foo/foo.js', '../foo/index.js'), 'require("../foo");');
  });

  it('should update require on sibling module if we change index.js on another name', function() {
    assert.equal(updateImports('require("../foo");', '/a/b/c.js', '../foo/index.js', '../foo/foo.js'), 'require("../foo/foo");');
  });

  it('should update require on global module', function() {
    assert.equal(updateImports('require("foo");', '/a/b/c.js', 'foo', 'bar'), 'require("bar");');
  });

  it('should update require on nested file in global module', function() {
    assert.equal(updateImports('require("foo/foo");', '/a/b/c.js', 'foo/foo', 'foo/bar'), 'require("foo/bar");');
  });

  it('should update require if we use variable to reference on global require funciton', function() {
    assert.equal(updateImports('const r = require; r("../foo/foo.js");', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'const r = require; r("../foo/bar");');
  });

  it('should update import', function() {
    assert.equal(updateImports('import foo from "../foo/foo.js";', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'import foo from "../foo/bar";');
  });

  it('should update dynamic import', function() {
    assert.equal(updateImports('import("../foo/foo.js");', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'import("../foo/bar");');
  });

  it('should update dynamic require', function() {
    assert.equal(updateImports('require(["../foo/foo", "../foo/foo"], () => null);', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'require(["../foo/bar", "../foo/bar"], () => null);');
  });

  it('should update require inside dynamic require handler', function() {
    assert.equal(updateImports('require(["../foo/foo", "../foo/foo"], () => require("../foo/foo"));', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'require(["../foo/bar", "../foo/bar"], () => require("../foo/bar"));');
  });

  it('should update require which argument of require', function() {
    assert.equal(updateImports('require(require("../foo/foo"));', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'require(require("../foo/bar"));');
  });

  it('should do nothing if require empty', function() {
    assert.equal(updateImports('require();', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'require();');
  });

  it('should do nothing if we do not find passed require', function() {
    assert.equal(updateImports('require();', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'require();');
  });

  it('should do nothing if dynamic require is empty', function() {
    assert.equal(updateImports('require([]);', '/a/b/c.js', '../foo/foo.js', '../foo/bar.js'), 'require([]);');
  });

  it('should preserve quote mark', function() {
    assert.equal(updateImports('require(\'foo\');', '/a/b/c.js', 'foo', 'bar'), 'require(\'bar\');');
  });
});
