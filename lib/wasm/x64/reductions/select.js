'use strict';

var assert = require('assert');
var util = require('util');
var wasmCFG = require('wasm-cfg');
var Reducer = require('json-pipeline-reducer');

function SelectX64Opcode() {
  Reducer.Reduction.call(this);
}
util.inherits(SelectX64Opcode, Reducer.Reduction);
module.exports = SelectX64Opcode;

SelectX64Opcode.prototype.reduce = function reduce(node, reducer) {
  // Already replaced
  if (/^x64:/.test(node.opcode))
    return;

  if (/\.bool$/.test(node.opcode))
    return this.reduceBool(node, reducer);

  if (/\.ret$/.test(node.opcode))
    return this.reduceRet(node, reducer);

  if (/i(32|64)\.(add|sub|mul|xor|and|or|shl)$/.test(node.opcode))
    return this.reduceIntBinop(node, reducer);

  if (/\.load/.test(node.opcode) || /\.store/.test(node.opcode))
    return this.reduceMemoryAccess(node, reducer);

  if (/^addr\.from_/.test(node.opcode) ||
      /^i(32|64)\.from_addr/.test(node.opcode)) {
    return this.reduceMemoryCoercion(node, reducer);
  }

  if (/^i32\.(eq|ne|gt_[su]|lt_[su]|ge_[su]|le_[su])$/.test(node.opcode))
    return this.reduceI32Bool(node, reducer);

  if (node.opcode === 'i64.extend_s' || node.opcode === 'i64.extend_u')
    return this.reduceI64Extend(node, reducer);

  if (node.opcode === 'if')
    return this.reduceIf(node, reducer);

  if (node.opcode === 'f32.copysign' || node.opcode === 'f64.copysign')
    return this.reduceCopySign(node, reducer);
};

SelectX64Opcode.prototype.reduceBool = function reduceBool(node, reducer) {
  if (/^f/.test(node.opcode))
    return;

  // Just replace with the input, we are ready to handle 64bit integers!
  if (node.opcode === 'i64.bool')
    reducer.replace(node, node.inputs[0]);
};

SelectX64Opcode.prototype.reduceRet = function reduceRet(node, reducer) {
  if (node.opcode === 'f32.ret' || node.opcode === 'f64.ret')
    node.opcode = 'x64:float.ret';
  else
    node.opcode = 'x64:int.ret';
  reducer.change(node);
};

SelectX64Opcode.prototype._getAccessSize = function _getAccessSize(opcode) {
  var size;
  if (/(store|load)8/.test(opcode))
    size = 8;
  else if (/(store|load)16/.test(opcode))
    size = 16;
  else if (/(store|load)32|[if]32\.(store|load)/.test(opcode))
    size = 32;
  else
    size = 64;
  return size;
};

SelectX64Opcode.prototype.reduceMemoryAccess = function reduceMemoryAccess(
    node, reducer) {
  var opcode = node.opcode;

  var state = node.inputs[0];
  var cell = node.inputs[1];

  // Only for stores
  var value = node.inputs[2];

  // Generalize opcode
  var size = this._getAccessSize(opcode);
  var type = /load/.test(opcode) ? 'load' : 'store';
  var accessOpcode = 'x64:' + type;
  accessOpcode += size;
  if (/_u$/.test(opcode))
    accessOpcode += '_u';
  else if (/_s$/.test(opcode))
    accessOpcode += '_s';

  // Floating point loads/stores are left as they are
  if (/f(32|64)/.test(opcode))
    accessOpcode = 'x64:' + node.opcode;

  // Skip non resizing states
  var checkState = state;
  while (
      checkState.opcode === 'updateState' &&
      (checkState.literals[0] & wasmCFG.effects.EFFECT_MEMORY_RESIZE) === 0) {
    checkState = checkState.inputs[0];
  }

  var memorySpace = reducer.graph.create('x64:memory.space', checkState);
  reducer.add(memorySpace);

  var memorySize = reducer.graph.create('x64:memory.size', checkState);
  reducer.add(memorySize);

  // Create bounds check to wrap memory index
  var access = reducer.graph.create(accessOpcode);
  cell = reducer.graph.create('x64:memory.bounds-check', [
    checkState, cell, memorySize ]);
  cell.addLiteral(size / 8);
  reducer.add(cell);

  access.addInput(state);
  access.addInput(memorySpace);
  access.addInput(cell);

  if (type === 'store')
    access.addInput(value);

  reducer.replace(node, access);
};

SelectX64Opcode.prototype.reduceMemoryCoercion = function reduceMemoryCoercion(
    node, reducer) {
  // Int64 is an address
  if (node.opcode === 'addr.from_64' || node.opcode === 'i64.from_addr') {
    reducer.replace(node, node.inputs[0]);
    return;
  }

  // Change i32 to i64
  if (node.opcode === 'addr.from_32') {
    node.opcode = 'i64.extend_u';
    reducer.change(node);
    return;
  }

  assert.equal(node.opcode, 'i32.from_addr');
  reducer.replace(node, this.changeI64ToI32(node.inputs[0], reducer));
};

SelectX64Opcode.prototype.reduceIntBinop = function reduceIntBinop(node,
                                                                   reducer) {
  node.opcode = 'x64:int.' + node.opcode.replace(/^i(32|64)\./, '');
  return reducer.change(node);
};

SelectX64Opcode.prototype.reduceIf = function reduceIf(node, reducer) {
  var input = node.inputs[0];

  var opcode;
  if (input.opcode === 'i64.eq')
    opcode = 'i64.eq';

  if (!opcode)
    return;

  var select = reducer.graph.create('x64:if.' + opcode, [
    input.inputs[0],
    input.inputs[1]
  ]);
  reducer.replace(node, select);
};

SelectX64Opcode.prototype.changeI64ToI32 = function changeI64toI32(node,
                                                                   reducer) {
  // TODO(indutny): change(constant64) = constant32
  var change = reducer.graph.create('i32.wrap');
  change.addInput(node);
  reducer.add(change);

  return change;
};

SelectX64Opcode.prototype.changeI32ToI64 = function changeI32ToI64(node,
                                                                   signed,
                                                                   reducer) {
  // TODO(indutny): change(constant32) = constant64
  var change = reducer.graph.create(signed ? 'x64:change-s32-to-i64' :
                                             'x64:change-u32-to-i64');
  change.addInput(node);
  reducer.add(change);

  return change;
};

SelectX64Opcode.prototype.reduceI32Bool = function reduceI32Bool(node,
                                                                 reducer) {
  var signed = /_s$/.test(node.opcode);

  node.opcode = node.opcode.replace(/^i32/, 'i64');
  node.replaceInput(0, this.changeI32ToI64(node.inputs[0], signed, reducer));
  node.replaceInput(1, this.changeI32ToI64(node.inputs[1], signed, reducer));
  reducer.change(node);
};

SelectX64Opcode.prototype.reduceI64Extend = function reduce64Extend(node,
                                                                    reducer) {
  var signed = node.opcode === 'i64.extend_s';

  reducer.replace(node, this.changeI32ToI64(node.inputs[0], signed, reducer));
};

SelectX64Opcode.prototype.reduceCopySign = function reducCopySign(node,
                                                                  reducer) {
  var left = node.inputs[0];
  if (left.opcode === 'f32.abs' || left.opcode === 'f64.abs')
    return;

  // Clear the sign bit, before copying over new one
  var absOpcode = node.opcode === 'f32.copysign' ? 'f32.abs' : 'f64.abs';
  var abs = reducer.graph.create(absOpcode, left);
  reducer.add(abs);

  node.replaceInput(0, abs);
  reducer.change(node);
};
