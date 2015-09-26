var assert = require('assert');
var fixtures = require('./fixtures');
var testAsm = fixtures.testAsm;

describe('wasm Compiler', function() {
  it('should compile empty function', function() {
    testAsm(function() {/*
      void main() {
      }
    */}, function() {/*
      push rbp
      mov rbp, rsp
      mov rsp, rbp
      pop rbp
      ret
    */});
  });

  describe('params', function() {
    it('should compile i64 params', function() {
      testAsm(function() {/*
        i64 main(i64 a, i64 b) {
          return i64.add(a, b);
        }
      */}, function() {/*
        push rbp
        mov rbp, rsp
        mov rax, rdi
        add rax, rsi
        mov rsp, rbp
        pop rbp
        ret
      */});
    });

    it('should compile i32 params', function() {
      testAsm(function() {/*
        i32 main(i32 a) {
          return a;
        }
      */}, function() {/*
        push rbp
        mov rbp, rsp
        mov rax, rdi
        mov rsp, rbp
        pop rbp
        ret
      */});
    });

    it('should compile i16 params', function() {
      testAsm(function() {/*
        i16 main(i16 a) {
          return a;
        }
      */}, function() {/*
        push rbp
        mov rbp, rsp
        mov rax, rdi
        mov rsp, rbp
        pop rbp
        ret
      */});
    });

    it('should compile i8 params', function() {
      testAsm(function() {/*
        i8 main(i8 a) {
          return a;
        }
      */}, function() {/*
        push rbp
        mov rbp, rsp
        mov rax, rdi
        mov rsp, rbp
        pop rbp
        ret
      */});
    });
  });

  it('should compile chain of expression', function() {
    testAsm(function() {/*
      i64 main(i64 a, i64 b) {
        return i64.add(a, i64.add(b, i64.const(1358)));
      }
    */}, function() {/*
      push rbp
      mov rbp, rsp
      mov rax, 0x54e
      add rax, rsi
      add rax, rdi
      mov rsp, rbp
      pop rbp
      ret
    */});
  });

  it('should work for floating point', function() {
    testAsm(function() {/*
      f64 main(f64 a) {
        return f64.add(a, f64.const(123.456));
      }
    */}, function() {/*
      push rbp
      mov rbp, rsp
      mov r15, 0x405edd2f1a9fbe77
      vmovq xmm1, r15
      vaddsd xmm0, xmm1
      mov rsp, rbp
      pop rbp
      ret
    */});
  });

  it('should work with local variables', function() {
    testAsm(function() {/*
      f64 main(f64 a) {
        f64 b = f64.const(123.456);
        return f64.add(a, b);
      }
    */}, function() {/*
      push rbp
      mov rbp, rsp
      mov r15, 0x405edd2f1a9fbe77
      vmovq xmm1, r15
      vaddsd xmm0, xmm1
      mov rsp, rbp
      pop rbp
      ret
    */});
  });

  it('should work with branches', function() {
    testAsm(function() {/*
      i64 main(i64 a) {
        if (a) {
          return a;
        }
        return i64.const(1);
      }
    */}, function() {/*
      push rbp
      mov rbp, rsp
      test edi, 0x0
      jcc z, 0x9

      mov rax, rdi
      mov rsp, rbp
      pop rbp
      ret

      mov rax, 0x1
      mov rsp, rbp
      pop rbp
      ret
    */});
  });
});
