/* Bases Power Pack */
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// (disabled):crypto
var require_crypto = __commonJS({
  "(disabled):crypto"() {
  }
});

// node_modules/tweetnacl/nacl-fast.js
var require_nacl_fast = __commonJS({
  "node_modules/tweetnacl/nacl-fast.js"(exports, module2) {
    (function(nacl2) {
      "use strict";
      var gf = function(init) {
        var i, r = new Float64Array(16);
        if (init) for (i = 0; i < init.length; i++) r[i] = init[i];
        return r;
      };
      var randombytes = function() {
        throw new Error("no PRNG");
      };
      var _0 = new Uint8Array(16);
      var _9 = new Uint8Array(32);
      _9[0] = 9;
      var gf0 = gf(), gf1 = gf([1]), _121665 = gf([56129, 1]), D = gf([30883, 4953, 19914, 30187, 55467, 16705, 2637, 112, 59544, 30585, 16505, 36039, 65139, 11119, 27886, 20995]), D2 = gf([61785, 9906, 39828, 60374, 45398, 33411, 5274, 224, 53552, 61171, 33010, 6542, 64743, 22239, 55772, 9222]), X = gf([54554, 36645, 11616, 51542, 42930, 38181, 51040, 26924, 56412, 64982, 57905, 49316, 21502, 52590, 14035, 8553]), Y = gf([26200, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214, 26214]), I = gf([41136, 18958, 6951, 50414, 58488, 44335, 6150, 12099, 55207, 15867, 153, 11085, 57099, 20417, 9344, 11139]);
      function ts64(x, i, h, l) {
        x[i] = h >> 24 & 255;
        x[i + 1] = h >> 16 & 255;
        x[i + 2] = h >> 8 & 255;
        x[i + 3] = h & 255;
        x[i + 4] = l >> 24 & 255;
        x[i + 5] = l >> 16 & 255;
        x[i + 6] = l >> 8 & 255;
        x[i + 7] = l & 255;
      }
      function vn(x, xi, y, yi, n) {
        var i, d = 0;
        for (i = 0; i < n; i++) d |= x[xi + i] ^ y[yi + i];
        return (1 & d - 1 >>> 8) - 1;
      }
      function crypto_verify_16(x, xi, y, yi) {
        return vn(x, xi, y, yi, 16);
      }
      function crypto_verify_32(x, xi, y, yi) {
        return vn(x, xi, y, yi, 32);
      }
      function core_salsa20(o, p, k, c) {
        var j0 = c[0] & 255 | (c[1] & 255) << 8 | (c[2] & 255) << 16 | (c[3] & 255) << 24, j1 = k[0] & 255 | (k[1] & 255) << 8 | (k[2] & 255) << 16 | (k[3] & 255) << 24, j2 = k[4] & 255 | (k[5] & 255) << 8 | (k[6] & 255) << 16 | (k[7] & 255) << 24, j3 = k[8] & 255 | (k[9] & 255) << 8 | (k[10] & 255) << 16 | (k[11] & 255) << 24, j4 = k[12] & 255 | (k[13] & 255) << 8 | (k[14] & 255) << 16 | (k[15] & 255) << 24, j5 = c[4] & 255 | (c[5] & 255) << 8 | (c[6] & 255) << 16 | (c[7] & 255) << 24, j6 = p[0] & 255 | (p[1] & 255) << 8 | (p[2] & 255) << 16 | (p[3] & 255) << 24, j7 = p[4] & 255 | (p[5] & 255) << 8 | (p[6] & 255) << 16 | (p[7] & 255) << 24, j8 = p[8] & 255 | (p[9] & 255) << 8 | (p[10] & 255) << 16 | (p[11] & 255) << 24, j9 = p[12] & 255 | (p[13] & 255) << 8 | (p[14] & 255) << 16 | (p[15] & 255) << 24, j10 = c[8] & 255 | (c[9] & 255) << 8 | (c[10] & 255) << 16 | (c[11] & 255) << 24, j11 = k[16] & 255 | (k[17] & 255) << 8 | (k[18] & 255) << 16 | (k[19] & 255) << 24, j12 = k[20] & 255 | (k[21] & 255) << 8 | (k[22] & 255) << 16 | (k[23] & 255) << 24, j13 = k[24] & 255 | (k[25] & 255) << 8 | (k[26] & 255) << 16 | (k[27] & 255) << 24, j14 = k[28] & 255 | (k[29] & 255) << 8 | (k[30] & 255) << 16 | (k[31] & 255) << 24, j15 = c[12] & 255 | (c[13] & 255) << 8 | (c[14] & 255) << 16 | (c[15] & 255) << 24;
        var x0 = j0, x1 = j1, x2 = j2, x3 = j3, x4 = j4, x5 = j5, x6 = j6, x7 = j7, x8 = j8, x9 = j9, x10 = j10, x11 = j11, x12 = j12, x13 = j13, x14 = j14, x15 = j15, u;
        for (var i = 0; i < 20; i += 2) {
          u = x0 + x12 | 0;
          x4 ^= u << 7 | u >>> 32 - 7;
          u = x4 + x0 | 0;
          x8 ^= u << 9 | u >>> 32 - 9;
          u = x8 + x4 | 0;
          x12 ^= u << 13 | u >>> 32 - 13;
          u = x12 + x8 | 0;
          x0 ^= u << 18 | u >>> 32 - 18;
          u = x5 + x1 | 0;
          x9 ^= u << 7 | u >>> 32 - 7;
          u = x9 + x5 | 0;
          x13 ^= u << 9 | u >>> 32 - 9;
          u = x13 + x9 | 0;
          x1 ^= u << 13 | u >>> 32 - 13;
          u = x1 + x13 | 0;
          x5 ^= u << 18 | u >>> 32 - 18;
          u = x10 + x6 | 0;
          x14 ^= u << 7 | u >>> 32 - 7;
          u = x14 + x10 | 0;
          x2 ^= u << 9 | u >>> 32 - 9;
          u = x2 + x14 | 0;
          x6 ^= u << 13 | u >>> 32 - 13;
          u = x6 + x2 | 0;
          x10 ^= u << 18 | u >>> 32 - 18;
          u = x15 + x11 | 0;
          x3 ^= u << 7 | u >>> 32 - 7;
          u = x3 + x15 | 0;
          x7 ^= u << 9 | u >>> 32 - 9;
          u = x7 + x3 | 0;
          x11 ^= u << 13 | u >>> 32 - 13;
          u = x11 + x7 | 0;
          x15 ^= u << 18 | u >>> 32 - 18;
          u = x0 + x3 | 0;
          x1 ^= u << 7 | u >>> 32 - 7;
          u = x1 + x0 | 0;
          x2 ^= u << 9 | u >>> 32 - 9;
          u = x2 + x1 | 0;
          x3 ^= u << 13 | u >>> 32 - 13;
          u = x3 + x2 | 0;
          x0 ^= u << 18 | u >>> 32 - 18;
          u = x5 + x4 | 0;
          x6 ^= u << 7 | u >>> 32 - 7;
          u = x6 + x5 | 0;
          x7 ^= u << 9 | u >>> 32 - 9;
          u = x7 + x6 | 0;
          x4 ^= u << 13 | u >>> 32 - 13;
          u = x4 + x7 | 0;
          x5 ^= u << 18 | u >>> 32 - 18;
          u = x10 + x9 | 0;
          x11 ^= u << 7 | u >>> 32 - 7;
          u = x11 + x10 | 0;
          x8 ^= u << 9 | u >>> 32 - 9;
          u = x8 + x11 | 0;
          x9 ^= u << 13 | u >>> 32 - 13;
          u = x9 + x8 | 0;
          x10 ^= u << 18 | u >>> 32 - 18;
          u = x15 + x14 | 0;
          x12 ^= u << 7 | u >>> 32 - 7;
          u = x12 + x15 | 0;
          x13 ^= u << 9 | u >>> 32 - 9;
          u = x13 + x12 | 0;
          x14 ^= u << 13 | u >>> 32 - 13;
          u = x14 + x13 | 0;
          x15 ^= u << 18 | u >>> 32 - 18;
        }
        x0 = x0 + j0 | 0;
        x1 = x1 + j1 | 0;
        x2 = x2 + j2 | 0;
        x3 = x3 + j3 | 0;
        x4 = x4 + j4 | 0;
        x5 = x5 + j5 | 0;
        x6 = x6 + j6 | 0;
        x7 = x7 + j7 | 0;
        x8 = x8 + j8 | 0;
        x9 = x9 + j9 | 0;
        x10 = x10 + j10 | 0;
        x11 = x11 + j11 | 0;
        x12 = x12 + j12 | 0;
        x13 = x13 + j13 | 0;
        x14 = x14 + j14 | 0;
        x15 = x15 + j15 | 0;
        o[0] = x0 >>> 0 & 255;
        o[1] = x0 >>> 8 & 255;
        o[2] = x0 >>> 16 & 255;
        o[3] = x0 >>> 24 & 255;
        o[4] = x1 >>> 0 & 255;
        o[5] = x1 >>> 8 & 255;
        o[6] = x1 >>> 16 & 255;
        o[7] = x1 >>> 24 & 255;
        o[8] = x2 >>> 0 & 255;
        o[9] = x2 >>> 8 & 255;
        o[10] = x2 >>> 16 & 255;
        o[11] = x2 >>> 24 & 255;
        o[12] = x3 >>> 0 & 255;
        o[13] = x3 >>> 8 & 255;
        o[14] = x3 >>> 16 & 255;
        o[15] = x3 >>> 24 & 255;
        o[16] = x4 >>> 0 & 255;
        o[17] = x4 >>> 8 & 255;
        o[18] = x4 >>> 16 & 255;
        o[19] = x4 >>> 24 & 255;
        o[20] = x5 >>> 0 & 255;
        o[21] = x5 >>> 8 & 255;
        o[22] = x5 >>> 16 & 255;
        o[23] = x5 >>> 24 & 255;
        o[24] = x6 >>> 0 & 255;
        o[25] = x6 >>> 8 & 255;
        o[26] = x6 >>> 16 & 255;
        o[27] = x6 >>> 24 & 255;
        o[28] = x7 >>> 0 & 255;
        o[29] = x7 >>> 8 & 255;
        o[30] = x7 >>> 16 & 255;
        o[31] = x7 >>> 24 & 255;
        o[32] = x8 >>> 0 & 255;
        o[33] = x8 >>> 8 & 255;
        o[34] = x8 >>> 16 & 255;
        o[35] = x8 >>> 24 & 255;
        o[36] = x9 >>> 0 & 255;
        o[37] = x9 >>> 8 & 255;
        o[38] = x9 >>> 16 & 255;
        o[39] = x9 >>> 24 & 255;
        o[40] = x10 >>> 0 & 255;
        o[41] = x10 >>> 8 & 255;
        o[42] = x10 >>> 16 & 255;
        o[43] = x10 >>> 24 & 255;
        o[44] = x11 >>> 0 & 255;
        o[45] = x11 >>> 8 & 255;
        o[46] = x11 >>> 16 & 255;
        o[47] = x11 >>> 24 & 255;
        o[48] = x12 >>> 0 & 255;
        o[49] = x12 >>> 8 & 255;
        o[50] = x12 >>> 16 & 255;
        o[51] = x12 >>> 24 & 255;
        o[52] = x13 >>> 0 & 255;
        o[53] = x13 >>> 8 & 255;
        o[54] = x13 >>> 16 & 255;
        o[55] = x13 >>> 24 & 255;
        o[56] = x14 >>> 0 & 255;
        o[57] = x14 >>> 8 & 255;
        o[58] = x14 >>> 16 & 255;
        o[59] = x14 >>> 24 & 255;
        o[60] = x15 >>> 0 & 255;
        o[61] = x15 >>> 8 & 255;
        o[62] = x15 >>> 16 & 255;
        o[63] = x15 >>> 24 & 255;
      }
      function core_hsalsa20(o, p, k, c) {
        var j0 = c[0] & 255 | (c[1] & 255) << 8 | (c[2] & 255) << 16 | (c[3] & 255) << 24, j1 = k[0] & 255 | (k[1] & 255) << 8 | (k[2] & 255) << 16 | (k[3] & 255) << 24, j2 = k[4] & 255 | (k[5] & 255) << 8 | (k[6] & 255) << 16 | (k[7] & 255) << 24, j3 = k[8] & 255 | (k[9] & 255) << 8 | (k[10] & 255) << 16 | (k[11] & 255) << 24, j4 = k[12] & 255 | (k[13] & 255) << 8 | (k[14] & 255) << 16 | (k[15] & 255) << 24, j5 = c[4] & 255 | (c[5] & 255) << 8 | (c[6] & 255) << 16 | (c[7] & 255) << 24, j6 = p[0] & 255 | (p[1] & 255) << 8 | (p[2] & 255) << 16 | (p[3] & 255) << 24, j7 = p[4] & 255 | (p[5] & 255) << 8 | (p[6] & 255) << 16 | (p[7] & 255) << 24, j8 = p[8] & 255 | (p[9] & 255) << 8 | (p[10] & 255) << 16 | (p[11] & 255) << 24, j9 = p[12] & 255 | (p[13] & 255) << 8 | (p[14] & 255) << 16 | (p[15] & 255) << 24, j10 = c[8] & 255 | (c[9] & 255) << 8 | (c[10] & 255) << 16 | (c[11] & 255) << 24, j11 = k[16] & 255 | (k[17] & 255) << 8 | (k[18] & 255) << 16 | (k[19] & 255) << 24, j12 = k[20] & 255 | (k[21] & 255) << 8 | (k[22] & 255) << 16 | (k[23] & 255) << 24, j13 = k[24] & 255 | (k[25] & 255) << 8 | (k[26] & 255) << 16 | (k[27] & 255) << 24, j14 = k[28] & 255 | (k[29] & 255) << 8 | (k[30] & 255) << 16 | (k[31] & 255) << 24, j15 = c[12] & 255 | (c[13] & 255) << 8 | (c[14] & 255) << 16 | (c[15] & 255) << 24;
        var x0 = j0, x1 = j1, x2 = j2, x3 = j3, x4 = j4, x5 = j5, x6 = j6, x7 = j7, x8 = j8, x9 = j9, x10 = j10, x11 = j11, x12 = j12, x13 = j13, x14 = j14, x15 = j15, u;
        for (var i = 0; i < 20; i += 2) {
          u = x0 + x12 | 0;
          x4 ^= u << 7 | u >>> 32 - 7;
          u = x4 + x0 | 0;
          x8 ^= u << 9 | u >>> 32 - 9;
          u = x8 + x4 | 0;
          x12 ^= u << 13 | u >>> 32 - 13;
          u = x12 + x8 | 0;
          x0 ^= u << 18 | u >>> 32 - 18;
          u = x5 + x1 | 0;
          x9 ^= u << 7 | u >>> 32 - 7;
          u = x9 + x5 | 0;
          x13 ^= u << 9 | u >>> 32 - 9;
          u = x13 + x9 | 0;
          x1 ^= u << 13 | u >>> 32 - 13;
          u = x1 + x13 | 0;
          x5 ^= u << 18 | u >>> 32 - 18;
          u = x10 + x6 | 0;
          x14 ^= u << 7 | u >>> 32 - 7;
          u = x14 + x10 | 0;
          x2 ^= u << 9 | u >>> 32 - 9;
          u = x2 + x14 | 0;
          x6 ^= u << 13 | u >>> 32 - 13;
          u = x6 + x2 | 0;
          x10 ^= u << 18 | u >>> 32 - 18;
          u = x15 + x11 | 0;
          x3 ^= u << 7 | u >>> 32 - 7;
          u = x3 + x15 | 0;
          x7 ^= u << 9 | u >>> 32 - 9;
          u = x7 + x3 | 0;
          x11 ^= u << 13 | u >>> 32 - 13;
          u = x11 + x7 | 0;
          x15 ^= u << 18 | u >>> 32 - 18;
          u = x0 + x3 | 0;
          x1 ^= u << 7 | u >>> 32 - 7;
          u = x1 + x0 | 0;
          x2 ^= u << 9 | u >>> 32 - 9;
          u = x2 + x1 | 0;
          x3 ^= u << 13 | u >>> 32 - 13;
          u = x3 + x2 | 0;
          x0 ^= u << 18 | u >>> 32 - 18;
          u = x5 + x4 | 0;
          x6 ^= u << 7 | u >>> 32 - 7;
          u = x6 + x5 | 0;
          x7 ^= u << 9 | u >>> 32 - 9;
          u = x7 + x6 | 0;
          x4 ^= u << 13 | u >>> 32 - 13;
          u = x4 + x7 | 0;
          x5 ^= u << 18 | u >>> 32 - 18;
          u = x10 + x9 | 0;
          x11 ^= u << 7 | u >>> 32 - 7;
          u = x11 + x10 | 0;
          x8 ^= u << 9 | u >>> 32 - 9;
          u = x8 + x11 | 0;
          x9 ^= u << 13 | u >>> 32 - 13;
          u = x9 + x8 | 0;
          x10 ^= u << 18 | u >>> 32 - 18;
          u = x15 + x14 | 0;
          x12 ^= u << 7 | u >>> 32 - 7;
          u = x12 + x15 | 0;
          x13 ^= u << 9 | u >>> 32 - 9;
          u = x13 + x12 | 0;
          x14 ^= u << 13 | u >>> 32 - 13;
          u = x14 + x13 | 0;
          x15 ^= u << 18 | u >>> 32 - 18;
        }
        o[0] = x0 >>> 0 & 255;
        o[1] = x0 >>> 8 & 255;
        o[2] = x0 >>> 16 & 255;
        o[3] = x0 >>> 24 & 255;
        o[4] = x5 >>> 0 & 255;
        o[5] = x5 >>> 8 & 255;
        o[6] = x5 >>> 16 & 255;
        o[7] = x5 >>> 24 & 255;
        o[8] = x10 >>> 0 & 255;
        o[9] = x10 >>> 8 & 255;
        o[10] = x10 >>> 16 & 255;
        o[11] = x10 >>> 24 & 255;
        o[12] = x15 >>> 0 & 255;
        o[13] = x15 >>> 8 & 255;
        o[14] = x15 >>> 16 & 255;
        o[15] = x15 >>> 24 & 255;
        o[16] = x6 >>> 0 & 255;
        o[17] = x6 >>> 8 & 255;
        o[18] = x6 >>> 16 & 255;
        o[19] = x6 >>> 24 & 255;
        o[20] = x7 >>> 0 & 255;
        o[21] = x7 >>> 8 & 255;
        o[22] = x7 >>> 16 & 255;
        o[23] = x7 >>> 24 & 255;
        o[24] = x8 >>> 0 & 255;
        o[25] = x8 >>> 8 & 255;
        o[26] = x8 >>> 16 & 255;
        o[27] = x8 >>> 24 & 255;
        o[28] = x9 >>> 0 & 255;
        o[29] = x9 >>> 8 & 255;
        o[30] = x9 >>> 16 & 255;
        o[31] = x9 >>> 24 & 255;
      }
      function crypto_core_salsa20(out, inp, k, c) {
        core_salsa20(out, inp, k, c);
      }
      function crypto_core_hsalsa20(out, inp, k, c) {
        core_hsalsa20(out, inp, k, c);
      }
      var sigma = new Uint8Array([101, 120, 112, 97, 110, 100, 32, 51, 50, 45, 98, 121, 116, 101, 32, 107]);
      function crypto_stream_salsa20_xor(c, cpos, m, mpos, b, n, k) {
        var z = new Uint8Array(16), x = new Uint8Array(64);
        var u, i;
        for (i = 0; i < 16; i++) z[i] = 0;
        for (i = 0; i < 8; i++) z[i] = n[i];
        while (b >= 64) {
          crypto_core_salsa20(x, z, k, sigma);
          for (i = 0; i < 64; i++) c[cpos + i] = m[mpos + i] ^ x[i];
          u = 1;
          for (i = 8; i < 16; i++) {
            u = u + (z[i] & 255) | 0;
            z[i] = u & 255;
            u >>>= 8;
          }
          b -= 64;
          cpos += 64;
          mpos += 64;
        }
        if (b > 0) {
          crypto_core_salsa20(x, z, k, sigma);
          for (i = 0; i < b; i++) c[cpos + i] = m[mpos + i] ^ x[i];
        }
        return 0;
      }
      function crypto_stream_salsa20(c, cpos, b, n, k) {
        var z = new Uint8Array(16), x = new Uint8Array(64);
        var u, i;
        for (i = 0; i < 16; i++) z[i] = 0;
        for (i = 0; i < 8; i++) z[i] = n[i];
        while (b >= 64) {
          crypto_core_salsa20(x, z, k, sigma);
          for (i = 0; i < 64; i++) c[cpos + i] = x[i];
          u = 1;
          for (i = 8; i < 16; i++) {
            u = u + (z[i] & 255) | 0;
            z[i] = u & 255;
            u >>>= 8;
          }
          b -= 64;
          cpos += 64;
        }
        if (b > 0) {
          crypto_core_salsa20(x, z, k, sigma);
          for (i = 0; i < b; i++) c[cpos + i] = x[i];
        }
        return 0;
      }
      function crypto_stream(c, cpos, d, n, k) {
        var s = new Uint8Array(32);
        crypto_core_hsalsa20(s, n, k, sigma);
        var sn = new Uint8Array(8);
        for (var i = 0; i < 8; i++) sn[i] = n[i + 16];
        return crypto_stream_salsa20(c, cpos, d, sn, s);
      }
      function crypto_stream_xor(c, cpos, m, mpos, d, n, k) {
        var s = new Uint8Array(32);
        crypto_core_hsalsa20(s, n, k, sigma);
        var sn = new Uint8Array(8);
        for (var i = 0; i < 8; i++) sn[i] = n[i + 16];
        return crypto_stream_salsa20_xor(c, cpos, m, mpos, d, sn, s);
      }
      var poly1305 = function(key) {
        this.buffer = new Uint8Array(16);
        this.r = new Uint16Array(10);
        this.h = new Uint16Array(10);
        this.pad = new Uint16Array(8);
        this.leftover = 0;
        this.fin = 0;
        var t0, t1, t2, t3, t4, t5, t6, t7;
        t0 = key[0] & 255 | (key[1] & 255) << 8;
        this.r[0] = t0 & 8191;
        t1 = key[2] & 255 | (key[3] & 255) << 8;
        this.r[1] = (t0 >>> 13 | t1 << 3) & 8191;
        t2 = key[4] & 255 | (key[5] & 255) << 8;
        this.r[2] = (t1 >>> 10 | t2 << 6) & 7939;
        t3 = key[6] & 255 | (key[7] & 255) << 8;
        this.r[3] = (t2 >>> 7 | t3 << 9) & 8191;
        t4 = key[8] & 255 | (key[9] & 255) << 8;
        this.r[4] = (t3 >>> 4 | t4 << 12) & 255;
        this.r[5] = t4 >>> 1 & 8190;
        t5 = key[10] & 255 | (key[11] & 255) << 8;
        this.r[6] = (t4 >>> 14 | t5 << 2) & 8191;
        t6 = key[12] & 255 | (key[13] & 255) << 8;
        this.r[7] = (t5 >>> 11 | t6 << 5) & 8065;
        t7 = key[14] & 255 | (key[15] & 255) << 8;
        this.r[8] = (t6 >>> 8 | t7 << 8) & 8191;
        this.r[9] = t7 >>> 5 & 127;
        this.pad[0] = key[16] & 255 | (key[17] & 255) << 8;
        this.pad[1] = key[18] & 255 | (key[19] & 255) << 8;
        this.pad[2] = key[20] & 255 | (key[21] & 255) << 8;
        this.pad[3] = key[22] & 255 | (key[23] & 255) << 8;
        this.pad[4] = key[24] & 255 | (key[25] & 255) << 8;
        this.pad[5] = key[26] & 255 | (key[27] & 255) << 8;
        this.pad[6] = key[28] & 255 | (key[29] & 255) << 8;
        this.pad[7] = key[30] & 255 | (key[31] & 255) << 8;
      };
      poly1305.prototype.blocks = function(m, mpos, bytes) {
        var hibit = this.fin ? 0 : 1 << 11;
        var t0, t1, t2, t3, t4, t5, t6, t7, c;
        var d0, d1, d2, d3, d4, d5, d6, d7, d8, d9;
        var h0 = this.h[0], h1 = this.h[1], h2 = this.h[2], h3 = this.h[3], h4 = this.h[4], h5 = this.h[5], h6 = this.h[6], h7 = this.h[7], h8 = this.h[8], h9 = this.h[9];
        var r0 = this.r[0], r1 = this.r[1], r2 = this.r[2], r3 = this.r[3], r4 = this.r[4], r5 = this.r[5], r6 = this.r[6], r7 = this.r[7], r8 = this.r[8], r9 = this.r[9];
        while (bytes >= 16) {
          t0 = m[mpos + 0] & 255 | (m[mpos + 1] & 255) << 8;
          h0 += t0 & 8191;
          t1 = m[mpos + 2] & 255 | (m[mpos + 3] & 255) << 8;
          h1 += (t0 >>> 13 | t1 << 3) & 8191;
          t2 = m[mpos + 4] & 255 | (m[mpos + 5] & 255) << 8;
          h2 += (t1 >>> 10 | t2 << 6) & 8191;
          t3 = m[mpos + 6] & 255 | (m[mpos + 7] & 255) << 8;
          h3 += (t2 >>> 7 | t3 << 9) & 8191;
          t4 = m[mpos + 8] & 255 | (m[mpos + 9] & 255) << 8;
          h4 += (t3 >>> 4 | t4 << 12) & 8191;
          h5 += t4 >>> 1 & 8191;
          t5 = m[mpos + 10] & 255 | (m[mpos + 11] & 255) << 8;
          h6 += (t4 >>> 14 | t5 << 2) & 8191;
          t6 = m[mpos + 12] & 255 | (m[mpos + 13] & 255) << 8;
          h7 += (t5 >>> 11 | t6 << 5) & 8191;
          t7 = m[mpos + 14] & 255 | (m[mpos + 15] & 255) << 8;
          h8 += (t6 >>> 8 | t7 << 8) & 8191;
          h9 += t7 >>> 5 | hibit;
          c = 0;
          d0 = c;
          d0 += h0 * r0;
          d0 += h1 * (5 * r9);
          d0 += h2 * (5 * r8);
          d0 += h3 * (5 * r7);
          d0 += h4 * (5 * r6);
          c = d0 >>> 13;
          d0 &= 8191;
          d0 += h5 * (5 * r5);
          d0 += h6 * (5 * r4);
          d0 += h7 * (5 * r3);
          d0 += h8 * (5 * r2);
          d0 += h9 * (5 * r1);
          c += d0 >>> 13;
          d0 &= 8191;
          d1 = c;
          d1 += h0 * r1;
          d1 += h1 * r0;
          d1 += h2 * (5 * r9);
          d1 += h3 * (5 * r8);
          d1 += h4 * (5 * r7);
          c = d1 >>> 13;
          d1 &= 8191;
          d1 += h5 * (5 * r6);
          d1 += h6 * (5 * r5);
          d1 += h7 * (5 * r4);
          d1 += h8 * (5 * r3);
          d1 += h9 * (5 * r2);
          c += d1 >>> 13;
          d1 &= 8191;
          d2 = c;
          d2 += h0 * r2;
          d2 += h1 * r1;
          d2 += h2 * r0;
          d2 += h3 * (5 * r9);
          d2 += h4 * (5 * r8);
          c = d2 >>> 13;
          d2 &= 8191;
          d2 += h5 * (5 * r7);
          d2 += h6 * (5 * r6);
          d2 += h7 * (5 * r5);
          d2 += h8 * (5 * r4);
          d2 += h9 * (5 * r3);
          c += d2 >>> 13;
          d2 &= 8191;
          d3 = c;
          d3 += h0 * r3;
          d3 += h1 * r2;
          d3 += h2 * r1;
          d3 += h3 * r0;
          d3 += h4 * (5 * r9);
          c = d3 >>> 13;
          d3 &= 8191;
          d3 += h5 * (5 * r8);
          d3 += h6 * (5 * r7);
          d3 += h7 * (5 * r6);
          d3 += h8 * (5 * r5);
          d3 += h9 * (5 * r4);
          c += d3 >>> 13;
          d3 &= 8191;
          d4 = c;
          d4 += h0 * r4;
          d4 += h1 * r3;
          d4 += h2 * r2;
          d4 += h3 * r1;
          d4 += h4 * r0;
          c = d4 >>> 13;
          d4 &= 8191;
          d4 += h5 * (5 * r9);
          d4 += h6 * (5 * r8);
          d4 += h7 * (5 * r7);
          d4 += h8 * (5 * r6);
          d4 += h9 * (5 * r5);
          c += d4 >>> 13;
          d4 &= 8191;
          d5 = c;
          d5 += h0 * r5;
          d5 += h1 * r4;
          d5 += h2 * r3;
          d5 += h3 * r2;
          d5 += h4 * r1;
          c = d5 >>> 13;
          d5 &= 8191;
          d5 += h5 * r0;
          d5 += h6 * (5 * r9);
          d5 += h7 * (5 * r8);
          d5 += h8 * (5 * r7);
          d5 += h9 * (5 * r6);
          c += d5 >>> 13;
          d5 &= 8191;
          d6 = c;
          d6 += h0 * r6;
          d6 += h1 * r5;
          d6 += h2 * r4;
          d6 += h3 * r3;
          d6 += h4 * r2;
          c = d6 >>> 13;
          d6 &= 8191;
          d6 += h5 * r1;
          d6 += h6 * r0;
          d6 += h7 * (5 * r9);
          d6 += h8 * (5 * r8);
          d6 += h9 * (5 * r7);
          c += d6 >>> 13;
          d6 &= 8191;
          d7 = c;
          d7 += h0 * r7;
          d7 += h1 * r6;
          d7 += h2 * r5;
          d7 += h3 * r4;
          d7 += h4 * r3;
          c = d7 >>> 13;
          d7 &= 8191;
          d7 += h5 * r2;
          d7 += h6 * r1;
          d7 += h7 * r0;
          d7 += h8 * (5 * r9);
          d7 += h9 * (5 * r8);
          c += d7 >>> 13;
          d7 &= 8191;
          d8 = c;
          d8 += h0 * r8;
          d8 += h1 * r7;
          d8 += h2 * r6;
          d8 += h3 * r5;
          d8 += h4 * r4;
          c = d8 >>> 13;
          d8 &= 8191;
          d8 += h5 * r3;
          d8 += h6 * r2;
          d8 += h7 * r1;
          d8 += h8 * r0;
          d8 += h9 * (5 * r9);
          c += d8 >>> 13;
          d8 &= 8191;
          d9 = c;
          d9 += h0 * r9;
          d9 += h1 * r8;
          d9 += h2 * r7;
          d9 += h3 * r6;
          d9 += h4 * r5;
          c = d9 >>> 13;
          d9 &= 8191;
          d9 += h5 * r4;
          d9 += h6 * r3;
          d9 += h7 * r2;
          d9 += h8 * r1;
          d9 += h9 * r0;
          c += d9 >>> 13;
          d9 &= 8191;
          c = (c << 2) + c | 0;
          c = c + d0 | 0;
          d0 = c & 8191;
          c = c >>> 13;
          d1 += c;
          h0 = d0;
          h1 = d1;
          h2 = d2;
          h3 = d3;
          h4 = d4;
          h5 = d5;
          h6 = d6;
          h7 = d7;
          h8 = d8;
          h9 = d9;
          mpos += 16;
          bytes -= 16;
        }
        this.h[0] = h0;
        this.h[1] = h1;
        this.h[2] = h2;
        this.h[3] = h3;
        this.h[4] = h4;
        this.h[5] = h5;
        this.h[6] = h6;
        this.h[7] = h7;
        this.h[8] = h8;
        this.h[9] = h9;
      };
      poly1305.prototype.finish = function(mac, macpos) {
        var g = new Uint16Array(10);
        var c, mask, f, i;
        if (this.leftover) {
          i = this.leftover;
          this.buffer[i++] = 1;
          for (; i < 16; i++) this.buffer[i] = 0;
          this.fin = 1;
          this.blocks(this.buffer, 0, 16);
        }
        c = this.h[1] >>> 13;
        this.h[1] &= 8191;
        for (i = 2; i < 10; i++) {
          this.h[i] += c;
          c = this.h[i] >>> 13;
          this.h[i] &= 8191;
        }
        this.h[0] += c * 5;
        c = this.h[0] >>> 13;
        this.h[0] &= 8191;
        this.h[1] += c;
        c = this.h[1] >>> 13;
        this.h[1] &= 8191;
        this.h[2] += c;
        g[0] = this.h[0] + 5;
        c = g[0] >>> 13;
        g[0] &= 8191;
        for (i = 1; i < 10; i++) {
          g[i] = this.h[i] + c;
          c = g[i] >>> 13;
          g[i] &= 8191;
        }
        g[9] -= 1 << 13;
        mask = (c ^ 1) - 1;
        for (i = 0; i < 10; i++) g[i] &= mask;
        mask = ~mask;
        for (i = 0; i < 10; i++) this.h[i] = this.h[i] & mask | g[i];
        this.h[0] = (this.h[0] | this.h[1] << 13) & 65535;
        this.h[1] = (this.h[1] >>> 3 | this.h[2] << 10) & 65535;
        this.h[2] = (this.h[2] >>> 6 | this.h[3] << 7) & 65535;
        this.h[3] = (this.h[3] >>> 9 | this.h[4] << 4) & 65535;
        this.h[4] = (this.h[4] >>> 12 | this.h[5] << 1 | this.h[6] << 14) & 65535;
        this.h[5] = (this.h[6] >>> 2 | this.h[7] << 11) & 65535;
        this.h[6] = (this.h[7] >>> 5 | this.h[8] << 8) & 65535;
        this.h[7] = (this.h[8] >>> 8 | this.h[9] << 5) & 65535;
        f = this.h[0] + this.pad[0];
        this.h[0] = f & 65535;
        for (i = 1; i < 8; i++) {
          f = (this.h[i] + this.pad[i] | 0) + (f >>> 16) | 0;
          this.h[i] = f & 65535;
        }
        mac[macpos + 0] = this.h[0] >>> 0 & 255;
        mac[macpos + 1] = this.h[0] >>> 8 & 255;
        mac[macpos + 2] = this.h[1] >>> 0 & 255;
        mac[macpos + 3] = this.h[1] >>> 8 & 255;
        mac[macpos + 4] = this.h[2] >>> 0 & 255;
        mac[macpos + 5] = this.h[2] >>> 8 & 255;
        mac[macpos + 6] = this.h[3] >>> 0 & 255;
        mac[macpos + 7] = this.h[3] >>> 8 & 255;
        mac[macpos + 8] = this.h[4] >>> 0 & 255;
        mac[macpos + 9] = this.h[4] >>> 8 & 255;
        mac[macpos + 10] = this.h[5] >>> 0 & 255;
        mac[macpos + 11] = this.h[5] >>> 8 & 255;
        mac[macpos + 12] = this.h[6] >>> 0 & 255;
        mac[macpos + 13] = this.h[6] >>> 8 & 255;
        mac[macpos + 14] = this.h[7] >>> 0 & 255;
        mac[macpos + 15] = this.h[7] >>> 8 & 255;
      };
      poly1305.prototype.update = function(m, mpos, bytes) {
        var i, want;
        if (this.leftover) {
          want = 16 - this.leftover;
          if (want > bytes)
            want = bytes;
          for (i = 0; i < want; i++)
            this.buffer[this.leftover + i] = m[mpos + i];
          bytes -= want;
          mpos += want;
          this.leftover += want;
          if (this.leftover < 16)
            return;
          this.blocks(this.buffer, 0, 16);
          this.leftover = 0;
        }
        if (bytes >= 16) {
          want = bytes - bytes % 16;
          this.blocks(m, mpos, want);
          mpos += want;
          bytes -= want;
        }
        if (bytes) {
          for (i = 0; i < bytes; i++)
            this.buffer[this.leftover + i] = m[mpos + i];
          this.leftover += bytes;
        }
      };
      function crypto_onetimeauth(out, outpos, m, mpos, n, k) {
        var s = new poly1305(k);
        s.update(m, mpos, n);
        s.finish(out, outpos);
        return 0;
      }
      function crypto_onetimeauth_verify(h, hpos, m, mpos, n, k) {
        var x = new Uint8Array(16);
        crypto_onetimeauth(x, 0, m, mpos, n, k);
        return crypto_verify_16(h, hpos, x, 0);
      }
      function crypto_secretbox(c, m, d, n, k) {
        var i;
        if (d < 32) return -1;
        crypto_stream_xor(c, 0, m, 0, d, n, k);
        crypto_onetimeauth(c, 16, c, 32, d - 32, c);
        for (i = 0; i < 16; i++) c[i] = 0;
        return 0;
      }
      function crypto_secretbox_open(m, c, d, n, k) {
        var i;
        var x = new Uint8Array(32);
        if (d < 32) return -1;
        crypto_stream(x, 0, 32, n, k);
        if (crypto_onetimeauth_verify(c, 16, c, 32, d - 32, x) !== 0) return -1;
        crypto_stream_xor(m, 0, c, 0, d, n, k);
        for (i = 0; i < 32; i++) m[i] = 0;
        return 0;
      }
      function set25519(r, a) {
        var i;
        for (i = 0; i < 16; i++) r[i] = a[i] | 0;
      }
      function car25519(o) {
        var i, v, c = 1;
        for (i = 0; i < 16; i++) {
          v = o[i] + c + 65535;
          c = Math.floor(v / 65536);
          o[i] = v - c * 65536;
        }
        o[0] += c - 1 + 37 * (c - 1);
      }
      function sel25519(p, q, b) {
        var t, c = ~(b - 1);
        for (var i = 0; i < 16; i++) {
          t = c & (p[i] ^ q[i]);
          p[i] ^= t;
          q[i] ^= t;
        }
      }
      function pack25519(o, n) {
        var i, j, b;
        var m = gf(), t = gf();
        for (i = 0; i < 16; i++) t[i] = n[i];
        car25519(t);
        car25519(t);
        car25519(t);
        for (j = 0; j < 2; j++) {
          m[0] = t[0] - 65517;
          for (i = 1; i < 15; i++) {
            m[i] = t[i] - 65535 - (m[i - 1] >> 16 & 1);
            m[i - 1] &= 65535;
          }
          m[15] = t[15] - 32767 - (m[14] >> 16 & 1);
          b = m[15] >> 16 & 1;
          m[14] &= 65535;
          sel25519(t, m, 1 - b);
        }
        for (i = 0; i < 16; i++) {
          o[2 * i] = t[i] & 255;
          o[2 * i + 1] = t[i] >> 8;
        }
      }
      function neq25519(a, b) {
        var c = new Uint8Array(32), d = new Uint8Array(32);
        pack25519(c, a);
        pack25519(d, b);
        return crypto_verify_32(c, 0, d, 0);
      }
      function par25519(a) {
        var d = new Uint8Array(32);
        pack25519(d, a);
        return d[0] & 1;
      }
      function unpack25519(o, n) {
        var i;
        for (i = 0; i < 16; i++) o[i] = n[2 * i] + (n[2 * i + 1] << 8);
        o[15] &= 32767;
      }
      function A(o, a, b) {
        for (var i = 0; i < 16; i++) o[i] = a[i] + b[i];
      }
      function Z(o, a, b) {
        for (var i = 0; i < 16; i++) o[i] = a[i] - b[i];
      }
      function M(o, a, b) {
        var v, c, t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, t7 = 0, t8 = 0, t9 = 0, t10 = 0, t11 = 0, t12 = 0, t13 = 0, t14 = 0, t15 = 0, t16 = 0, t17 = 0, t18 = 0, t19 = 0, t20 = 0, t21 = 0, t22 = 0, t23 = 0, t24 = 0, t25 = 0, t26 = 0, t27 = 0, t28 = 0, t29 = 0, t30 = 0, b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5], b6 = b[6], b7 = b[7], b8 = b[8], b9 = b[9], b10 = b[10], b11 = b[11], b12 = b[12], b13 = b[13], b14 = b[14], b15 = b[15];
        v = a[0];
        t0 += v * b0;
        t1 += v * b1;
        t2 += v * b2;
        t3 += v * b3;
        t4 += v * b4;
        t5 += v * b5;
        t6 += v * b6;
        t7 += v * b7;
        t8 += v * b8;
        t9 += v * b9;
        t10 += v * b10;
        t11 += v * b11;
        t12 += v * b12;
        t13 += v * b13;
        t14 += v * b14;
        t15 += v * b15;
        v = a[1];
        t1 += v * b0;
        t2 += v * b1;
        t3 += v * b2;
        t4 += v * b3;
        t5 += v * b4;
        t6 += v * b5;
        t7 += v * b6;
        t8 += v * b7;
        t9 += v * b8;
        t10 += v * b9;
        t11 += v * b10;
        t12 += v * b11;
        t13 += v * b12;
        t14 += v * b13;
        t15 += v * b14;
        t16 += v * b15;
        v = a[2];
        t2 += v * b0;
        t3 += v * b1;
        t4 += v * b2;
        t5 += v * b3;
        t6 += v * b4;
        t7 += v * b5;
        t8 += v * b6;
        t9 += v * b7;
        t10 += v * b8;
        t11 += v * b9;
        t12 += v * b10;
        t13 += v * b11;
        t14 += v * b12;
        t15 += v * b13;
        t16 += v * b14;
        t17 += v * b15;
        v = a[3];
        t3 += v * b0;
        t4 += v * b1;
        t5 += v * b2;
        t6 += v * b3;
        t7 += v * b4;
        t8 += v * b5;
        t9 += v * b6;
        t10 += v * b7;
        t11 += v * b8;
        t12 += v * b9;
        t13 += v * b10;
        t14 += v * b11;
        t15 += v * b12;
        t16 += v * b13;
        t17 += v * b14;
        t18 += v * b15;
        v = a[4];
        t4 += v * b0;
        t5 += v * b1;
        t6 += v * b2;
        t7 += v * b3;
        t8 += v * b4;
        t9 += v * b5;
        t10 += v * b6;
        t11 += v * b7;
        t12 += v * b8;
        t13 += v * b9;
        t14 += v * b10;
        t15 += v * b11;
        t16 += v * b12;
        t17 += v * b13;
        t18 += v * b14;
        t19 += v * b15;
        v = a[5];
        t5 += v * b0;
        t6 += v * b1;
        t7 += v * b2;
        t8 += v * b3;
        t9 += v * b4;
        t10 += v * b5;
        t11 += v * b6;
        t12 += v * b7;
        t13 += v * b8;
        t14 += v * b9;
        t15 += v * b10;
        t16 += v * b11;
        t17 += v * b12;
        t18 += v * b13;
        t19 += v * b14;
        t20 += v * b15;
        v = a[6];
        t6 += v * b0;
        t7 += v * b1;
        t8 += v * b2;
        t9 += v * b3;
        t10 += v * b4;
        t11 += v * b5;
        t12 += v * b6;
        t13 += v * b7;
        t14 += v * b8;
        t15 += v * b9;
        t16 += v * b10;
        t17 += v * b11;
        t18 += v * b12;
        t19 += v * b13;
        t20 += v * b14;
        t21 += v * b15;
        v = a[7];
        t7 += v * b0;
        t8 += v * b1;
        t9 += v * b2;
        t10 += v * b3;
        t11 += v * b4;
        t12 += v * b5;
        t13 += v * b6;
        t14 += v * b7;
        t15 += v * b8;
        t16 += v * b9;
        t17 += v * b10;
        t18 += v * b11;
        t19 += v * b12;
        t20 += v * b13;
        t21 += v * b14;
        t22 += v * b15;
        v = a[8];
        t8 += v * b0;
        t9 += v * b1;
        t10 += v * b2;
        t11 += v * b3;
        t12 += v * b4;
        t13 += v * b5;
        t14 += v * b6;
        t15 += v * b7;
        t16 += v * b8;
        t17 += v * b9;
        t18 += v * b10;
        t19 += v * b11;
        t20 += v * b12;
        t21 += v * b13;
        t22 += v * b14;
        t23 += v * b15;
        v = a[9];
        t9 += v * b0;
        t10 += v * b1;
        t11 += v * b2;
        t12 += v * b3;
        t13 += v * b4;
        t14 += v * b5;
        t15 += v * b6;
        t16 += v * b7;
        t17 += v * b8;
        t18 += v * b9;
        t19 += v * b10;
        t20 += v * b11;
        t21 += v * b12;
        t22 += v * b13;
        t23 += v * b14;
        t24 += v * b15;
        v = a[10];
        t10 += v * b0;
        t11 += v * b1;
        t12 += v * b2;
        t13 += v * b3;
        t14 += v * b4;
        t15 += v * b5;
        t16 += v * b6;
        t17 += v * b7;
        t18 += v * b8;
        t19 += v * b9;
        t20 += v * b10;
        t21 += v * b11;
        t22 += v * b12;
        t23 += v * b13;
        t24 += v * b14;
        t25 += v * b15;
        v = a[11];
        t11 += v * b0;
        t12 += v * b1;
        t13 += v * b2;
        t14 += v * b3;
        t15 += v * b4;
        t16 += v * b5;
        t17 += v * b6;
        t18 += v * b7;
        t19 += v * b8;
        t20 += v * b9;
        t21 += v * b10;
        t22 += v * b11;
        t23 += v * b12;
        t24 += v * b13;
        t25 += v * b14;
        t26 += v * b15;
        v = a[12];
        t12 += v * b0;
        t13 += v * b1;
        t14 += v * b2;
        t15 += v * b3;
        t16 += v * b4;
        t17 += v * b5;
        t18 += v * b6;
        t19 += v * b7;
        t20 += v * b8;
        t21 += v * b9;
        t22 += v * b10;
        t23 += v * b11;
        t24 += v * b12;
        t25 += v * b13;
        t26 += v * b14;
        t27 += v * b15;
        v = a[13];
        t13 += v * b0;
        t14 += v * b1;
        t15 += v * b2;
        t16 += v * b3;
        t17 += v * b4;
        t18 += v * b5;
        t19 += v * b6;
        t20 += v * b7;
        t21 += v * b8;
        t22 += v * b9;
        t23 += v * b10;
        t24 += v * b11;
        t25 += v * b12;
        t26 += v * b13;
        t27 += v * b14;
        t28 += v * b15;
        v = a[14];
        t14 += v * b0;
        t15 += v * b1;
        t16 += v * b2;
        t17 += v * b3;
        t18 += v * b4;
        t19 += v * b5;
        t20 += v * b6;
        t21 += v * b7;
        t22 += v * b8;
        t23 += v * b9;
        t24 += v * b10;
        t25 += v * b11;
        t26 += v * b12;
        t27 += v * b13;
        t28 += v * b14;
        t29 += v * b15;
        v = a[15];
        t15 += v * b0;
        t16 += v * b1;
        t17 += v * b2;
        t18 += v * b3;
        t19 += v * b4;
        t20 += v * b5;
        t21 += v * b6;
        t22 += v * b7;
        t23 += v * b8;
        t24 += v * b9;
        t25 += v * b10;
        t26 += v * b11;
        t27 += v * b12;
        t28 += v * b13;
        t29 += v * b14;
        t30 += v * b15;
        t0 += 38 * t16;
        t1 += 38 * t17;
        t2 += 38 * t18;
        t3 += 38 * t19;
        t4 += 38 * t20;
        t5 += 38 * t21;
        t6 += 38 * t22;
        t7 += 38 * t23;
        t8 += 38 * t24;
        t9 += 38 * t25;
        t10 += 38 * t26;
        t11 += 38 * t27;
        t12 += 38 * t28;
        t13 += 38 * t29;
        t14 += 38 * t30;
        c = 1;
        v = t0 + c + 65535;
        c = Math.floor(v / 65536);
        t0 = v - c * 65536;
        v = t1 + c + 65535;
        c = Math.floor(v / 65536);
        t1 = v - c * 65536;
        v = t2 + c + 65535;
        c = Math.floor(v / 65536);
        t2 = v - c * 65536;
        v = t3 + c + 65535;
        c = Math.floor(v / 65536);
        t3 = v - c * 65536;
        v = t4 + c + 65535;
        c = Math.floor(v / 65536);
        t4 = v - c * 65536;
        v = t5 + c + 65535;
        c = Math.floor(v / 65536);
        t5 = v - c * 65536;
        v = t6 + c + 65535;
        c = Math.floor(v / 65536);
        t6 = v - c * 65536;
        v = t7 + c + 65535;
        c = Math.floor(v / 65536);
        t7 = v - c * 65536;
        v = t8 + c + 65535;
        c = Math.floor(v / 65536);
        t8 = v - c * 65536;
        v = t9 + c + 65535;
        c = Math.floor(v / 65536);
        t9 = v - c * 65536;
        v = t10 + c + 65535;
        c = Math.floor(v / 65536);
        t10 = v - c * 65536;
        v = t11 + c + 65535;
        c = Math.floor(v / 65536);
        t11 = v - c * 65536;
        v = t12 + c + 65535;
        c = Math.floor(v / 65536);
        t12 = v - c * 65536;
        v = t13 + c + 65535;
        c = Math.floor(v / 65536);
        t13 = v - c * 65536;
        v = t14 + c + 65535;
        c = Math.floor(v / 65536);
        t14 = v - c * 65536;
        v = t15 + c + 65535;
        c = Math.floor(v / 65536);
        t15 = v - c * 65536;
        t0 += c - 1 + 37 * (c - 1);
        c = 1;
        v = t0 + c + 65535;
        c = Math.floor(v / 65536);
        t0 = v - c * 65536;
        v = t1 + c + 65535;
        c = Math.floor(v / 65536);
        t1 = v - c * 65536;
        v = t2 + c + 65535;
        c = Math.floor(v / 65536);
        t2 = v - c * 65536;
        v = t3 + c + 65535;
        c = Math.floor(v / 65536);
        t3 = v - c * 65536;
        v = t4 + c + 65535;
        c = Math.floor(v / 65536);
        t4 = v - c * 65536;
        v = t5 + c + 65535;
        c = Math.floor(v / 65536);
        t5 = v - c * 65536;
        v = t6 + c + 65535;
        c = Math.floor(v / 65536);
        t6 = v - c * 65536;
        v = t7 + c + 65535;
        c = Math.floor(v / 65536);
        t7 = v - c * 65536;
        v = t8 + c + 65535;
        c = Math.floor(v / 65536);
        t8 = v - c * 65536;
        v = t9 + c + 65535;
        c = Math.floor(v / 65536);
        t9 = v - c * 65536;
        v = t10 + c + 65535;
        c = Math.floor(v / 65536);
        t10 = v - c * 65536;
        v = t11 + c + 65535;
        c = Math.floor(v / 65536);
        t11 = v - c * 65536;
        v = t12 + c + 65535;
        c = Math.floor(v / 65536);
        t12 = v - c * 65536;
        v = t13 + c + 65535;
        c = Math.floor(v / 65536);
        t13 = v - c * 65536;
        v = t14 + c + 65535;
        c = Math.floor(v / 65536);
        t14 = v - c * 65536;
        v = t15 + c + 65535;
        c = Math.floor(v / 65536);
        t15 = v - c * 65536;
        t0 += c - 1 + 37 * (c - 1);
        o[0] = t0;
        o[1] = t1;
        o[2] = t2;
        o[3] = t3;
        o[4] = t4;
        o[5] = t5;
        o[6] = t6;
        o[7] = t7;
        o[8] = t8;
        o[9] = t9;
        o[10] = t10;
        o[11] = t11;
        o[12] = t12;
        o[13] = t13;
        o[14] = t14;
        o[15] = t15;
      }
      function S(o, a) {
        M(o, a, a);
      }
      function inv25519(o, i) {
        var c = gf();
        var a;
        for (a = 0; a < 16; a++) c[a] = i[a];
        for (a = 253; a >= 0; a--) {
          S(c, c);
          if (a !== 2 && a !== 4) M(c, c, i);
        }
        for (a = 0; a < 16; a++) o[a] = c[a];
      }
      function pow2523(o, i) {
        var c = gf();
        var a;
        for (a = 0; a < 16; a++) c[a] = i[a];
        for (a = 250; a >= 0; a--) {
          S(c, c);
          if (a !== 1) M(c, c, i);
        }
        for (a = 0; a < 16; a++) o[a] = c[a];
      }
      function crypto_scalarmult(q, n, p) {
        var z = new Uint8Array(32);
        var x = new Float64Array(80), r, i;
        var a = gf(), b = gf(), c = gf(), d = gf(), e = gf(), f = gf();
        for (i = 0; i < 31; i++) z[i] = n[i];
        z[31] = n[31] & 127 | 64;
        z[0] &= 248;
        unpack25519(x, p);
        for (i = 0; i < 16; i++) {
          b[i] = x[i];
          d[i] = a[i] = c[i] = 0;
        }
        a[0] = d[0] = 1;
        for (i = 254; i >= 0; --i) {
          r = z[i >>> 3] >>> (i & 7) & 1;
          sel25519(a, b, r);
          sel25519(c, d, r);
          A(e, a, c);
          Z(a, a, c);
          A(c, b, d);
          Z(b, b, d);
          S(d, e);
          S(f, a);
          M(a, c, a);
          M(c, b, e);
          A(e, a, c);
          Z(a, a, c);
          S(b, a);
          Z(c, d, f);
          M(a, c, _121665);
          A(a, a, d);
          M(c, c, a);
          M(a, d, f);
          M(d, b, x);
          S(b, e);
          sel25519(a, b, r);
          sel25519(c, d, r);
        }
        for (i = 0; i < 16; i++) {
          x[i + 16] = a[i];
          x[i + 32] = c[i];
          x[i + 48] = b[i];
          x[i + 64] = d[i];
        }
        var x32 = x.subarray(32);
        var x16 = x.subarray(16);
        inv25519(x32, x32);
        M(x16, x16, x32);
        pack25519(q, x16);
        return 0;
      }
      function crypto_scalarmult_base(q, n) {
        return crypto_scalarmult(q, n, _9);
      }
      function crypto_box_keypair(y, x) {
        randombytes(x, 32);
        return crypto_scalarmult_base(y, x);
      }
      function crypto_box_beforenm(k, y, x) {
        var s = new Uint8Array(32);
        crypto_scalarmult(s, x, y);
        return crypto_core_hsalsa20(k, _0, s, sigma);
      }
      var crypto_box_afternm = crypto_secretbox;
      var crypto_box_open_afternm = crypto_secretbox_open;
      function crypto_box(c, m, d, n, y, x) {
        var k = new Uint8Array(32);
        crypto_box_beforenm(k, y, x);
        return crypto_box_afternm(c, m, d, n, k);
      }
      function crypto_box_open(m, c, d, n, y, x) {
        var k = new Uint8Array(32);
        crypto_box_beforenm(k, y, x);
        return crypto_box_open_afternm(m, c, d, n, k);
      }
      var K = [
        1116352408,
        3609767458,
        1899447441,
        602891725,
        3049323471,
        3964484399,
        3921009573,
        2173295548,
        961987163,
        4081628472,
        1508970993,
        3053834265,
        2453635748,
        2937671579,
        2870763221,
        3664609560,
        3624381080,
        2734883394,
        310598401,
        1164996542,
        607225278,
        1323610764,
        1426881987,
        3590304994,
        1925078388,
        4068182383,
        2162078206,
        991336113,
        2614888103,
        633803317,
        3248222580,
        3479774868,
        3835390401,
        2666613458,
        4022224774,
        944711139,
        264347078,
        2341262773,
        604807628,
        2007800933,
        770255983,
        1495990901,
        1249150122,
        1856431235,
        1555081692,
        3175218132,
        1996064986,
        2198950837,
        2554220882,
        3999719339,
        2821834349,
        766784016,
        2952996808,
        2566594879,
        3210313671,
        3203337956,
        3336571891,
        1034457026,
        3584528711,
        2466948901,
        113926993,
        3758326383,
        338241895,
        168717936,
        666307205,
        1188179964,
        773529912,
        1546045734,
        1294757372,
        1522805485,
        1396182291,
        2643833823,
        1695183700,
        2343527390,
        1986661051,
        1014477480,
        2177026350,
        1206759142,
        2456956037,
        344077627,
        2730485921,
        1290863460,
        2820302411,
        3158454273,
        3259730800,
        3505952657,
        3345764771,
        106217008,
        3516065817,
        3606008344,
        3600352804,
        1432725776,
        4094571909,
        1467031594,
        275423344,
        851169720,
        430227734,
        3100823752,
        506948616,
        1363258195,
        659060556,
        3750685593,
        883997877,
        3785050280,
        958139571,
        3318307427,
        1322822218,
        3812723403,
        1537002063,
        2003034995,
        1747873779,
        3602036899,
        1955562222,
        1575990012,
        2024104815,
        1125592928,
        2227730452,
        2716904306,
        2361852424,
        442776044,
        2428436474,
        593698344,
        2756734187,
        3733110249,
        3204031479,
        2999351573,
        3329325298,
        3815920427,
        3391569614,
        3928383900,
        3515267271,
        566280711,
        3940187606,
        3454069534,
        4118630271,
        4000239992,
        116418474,
        1914138554,
        174292421,
        2731055270,
        289380356,
        3203993006,
        460393269,
        320620315,
        685471733,
        587496836,
        852142971,
        1086792851,
        1017036298,
        365543100,
        1126000580,
        2618297676,
        1288033470,
        3409855158,
        1501505948,
        4234509866,
        1607167915,
        987167468,
        1816402316,
        1246189591
      ];
      function crypto_hashblocks_hl(hh, hl, m, n) {
        var wh = new Int32Array(16), wl = new Int32Array(16), bh0, bh1, bh2, bh3, bh4, bh5, bh6, bh7, bl0, bl1, bl2, bl3, bl4, bl5, bl6, bl7, th, tl, i, j, h, l, a, b, c, d;
        var ah0 = hh[0], ah1 = hh[1], ah2 = hh[2], ah3 = hh[3], ah4 = hh[4], ah5 = hh[5], ah6 = hh[6], ah7 = hh[7], al0 = hl[0], al1 = hl[1], al2 = hl[2], al3 = hl[3], al4 = hl[4], al5 = hl[5], al6 = hl[6], al7 = hl[7];
        var pos = 0;
        while (n >= 128) {
          for (i = 0; i < 16; i++) {
            j = 8 * i + pos;
            wh[i] = m[j + 0] << 24 | m[j + 1] << 16 | m[j + 2] << 8 | m[j + 3];
            wl[i] = m[j + 4] << 24 | m[j + 5] << 16 | m[j + 6] << 8 | m[j + 7];
          }
          for (i = 0; i < 80; i++) {
            bh0 = ah0;
            bh1 = ah1;
            bh2 = ah2;
            bh3 = ah3;
            bh4 = ah4;
            bh5 = ah5;
            bh6 = ah6;
            bh7 = ah7;
            bl0 = al0;
            bl1 = al1;
            bl2 = al2;
            bl3 = al3;
            bl4 = al4;
            bl5 = al5;
            bl6 = al6;
            bl7 = al7;
            h = ah7;
            l = al7;
            a = l & 65535;
            b = l >>> 16;
            c = h & 65535;
            d = h >>> 16;
            h = (ah4 >>> 14 | al4 << 32 - 14) ^ (ah4 >>> 18 | al4 << 32 - 18) ^ (al4 >>> 41 - 32 | ah4 << 32 - (41 - 32));
            l = (al4 >>> 14 | ah4 << 32 - 14) ^ (al4 >>> 18 | ah4 << 32 - 18) ^ (ah4 >>> 41 - 32 | al4 << 32 - (41 - 32));
            a += l & 65535;
            b += l >>> 16;
            c += h & 65535;
            d += h >>> 16;
            h = ah4 & ah5 ^ ~ah4 & ah6;
            l = al4 & al5 ^ ~al4 & al6;
            a += l & 65535;
            b += l >>> 16;
            c += h & 65535;
            d += h >>> 16;
            h = K[i * 2];
            l = K[i * 2 + 1];
            a += l & 65535;
            b += l >>> 16;
            c += h & 65535;
            d += h >>> 16;
            h = wh[i % 16];
            l = wl[i % 16];
            a += l & 65535;
            b += l >>> 16;
            c += h & 65535;
            d += h >>> 16;
            b += a >>> 16;
            c += b >>> 16;
            d += c >>> 16;
            th = c & 65535 | d << 16;
            tl = a & 65535 | b << 16;
            h = th;
            l = tl;
            a = l & 65535;
            b = l >>> 16;
            c = h & 65535;
            d = h >>> 16;
            h = (ah0 >>> 28 | al0 << 32 - 28) ^ (al0 >>> 34 - 32 | ah0 << 32 - (34 - 32)) ^ (al0 >>> 39 - 32 | ah0 << 32 - (39 - 32));
            l = (al0 >>> 28 | ah0 << 32 - 28) ^ (ah0 >>> 34 - 32 | al0 << 32 - (34 - 32)) ^ (ah0 >>> 39 - 32 | al0 << 32 - (39 - 32));
            a += l & 65535;
            b += l >>> 16;
            c += h & 65535;
            d += h >>> 16;
            h = ah0 & ah1 ^ ah0 & ah2 ^ ah1 & ah2;
            l = al0 & al1 ^ al0 & al2 ^ al1 & al2;
            a += l & 65535;
            b += l >>> 16;
            c += h & 65535;
            d += h >>> 16;
            b += a >>> 16;
            c += b >>> 16;
            d += c >>> 16;
            bh7 = c & 65535 | d << 16;
            bl7 = a & 65535 | b << 16;
            h = bh3;
            l = bl3;
            a = l & 65535;
            b = l >>> 16;
            c = h & 65535;
            d = h >>> 16;
            h = th;
            l = tl;
            a += l & 65535;
            b += l >>> 16;
            c += h & 65535;
            d += h >>> 16;
            b += a >>> 16;
            c += b >>> 16;
            d += c >>> 16;
            bh3 = c & 65535 | d << 16;
            bl3 = a & 65535 | b << 16;
            ah1 = bh0;
            ah2 = bh1;
            ah3 = bh2;
            ah4 = bh3;
            ah5 = bh4;
            ah6 = bh5;
            ah7 = bh6;
            ah0 = bh7;
            al1 = bl0;
            al2 = bl1;
            al3 = bl2;
            al4 = bl3;
            al5 = bl4;
            al6 = bl5;
            al7 = bl6;
            al0 = bl7;
            if (i % 16 === 15) {
              for (j = 0; j < 16; j++) {
                h = wh[j];
                l = wl[j];
                a = l & 65535;
                b = l >>> 16;
                c = h & 65535;
                d = h >>> 16;
                h = wh[(j + 9) % 16];
                l = wl[(j + 9) % 16];
                a += l & 65535;
                b += l >>> 16;
                c += h & 65535;
                d += h >>> 16;
                th = wh[(j + 1) % 16];
                tl = wl[(j + 1) % 16];
                h = (th >>> 1 | tl << 32 - 1) ^ (th >>> 8 | tl << 32 - 8) ^ th >>> 7;
                l = (tl >>> 1 | th << 32 - 1) ^ (tl >>> 8 | th << 32 - 8) ^ (tl >>> 7 | th << 32 - 7);
                a += l & 65535;
                b += l >>> 16;
                c += h & 65535;
                d += h >>> 16;
                th = wh[(j + 14) % 16];
                tl = wl[(j + 14) % 16];
                h = (th >>> 19 | tl << 32 - 19) ^ (tl >>> 61 - 32 | th << 32 - (61 - 32)) ^ th >>> 6;
                l = (tl >>> 19 | th << 32 - 19) ^ (th >>> 61 - 32 | tl << 32 - (61 - 32)) ^ (tl >>> 6 | th << 32 - 6);
                a += l & 65535;
                b += l >>> 16;
                c += h & 65535;
                d += h >>> 16;
                b += a >>> 16;
                c += b >>> 16;
                d += c >>> 16;
                wh[j] = c & 65535 | d << 16;
                wl[j] = a & 65535 | b << 16;
              }
            }
          }
          h = ah0;
          l = al0;
          a = l & 65535;
          b = l >>> 16;
          c = h & 65535;
          d = h >>> 16;
          h = hh[0];
          l = hl[0];
          a += l & 65535;
          b += l >>> 16;
          c += h & 65535;
          d += h >>> 16;
          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;
          hh[0] = ah0 = c & 65535 | d << 16;
          hl[0] = al0 = a & 65535 | b << 16;
          h = ah1;
          l = al1;
          a = l & 65535;
          b = l >>> 16;
          c = h & 65535;
          d = h >>> 16;
          h = hh[1];
          l = hl[1];
          a += l & 65535;
          b += l >>> 16;
          c += h & 65535;
          d += h >>> 16;
          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;
          hh[1] = ah1 = c & 65535 | d << 16;
          hl[1] = al1 = a & 65535 | b << 16;
          h = ah2;
          l = al2;
          a = l & 65535;
          b = l >>> 16;
          c = h & 65535;
          d = h >>> 16;
          h = hh[2];
          l = hl[2];
          a += l & 65535;
          b += l >>> 16;
          c += h & 65535;
          d += h >>> 16;
          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;
          hh[2] = ah2 = c & 65535 | d << 16;
          hl[2] = al2 = a & 65535 | b << 16;
          h = ah3;
          l = al3;
          a = l & 65535;
          b = l >>> 16;
          c = h & 65535;
          d = h >>> 16;
          h = hh[3];
          l = hl[3];
          a += l & 65535;
          b += l >>> 16;
          c += h & 65535;
          d += h >>> 16;
          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;
          hh[3] = ah3 = c & 65535 | d << 16;
          hl[3] = al3 = a & 65535 | b << 16;
          h = ah4;
          l = al4;
          a = l & 65535;
          b = l >>> 16;
          c = h & 65535;
          d = h >>> 16;
          h = hh[4];
          l = hl[4];
          a += l & 65535;
          b += l >>> 16;
          c += h & 65535;
          d += h >>> 16;
          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;
          hh[4] = ah4 = c & 65535 | d << 16;
          hl[4] = al4 = a & 65535 | b << 16;
          h = ah5;
          l = al5;
          a = l & 65535;
          b = l >>> 16;
          c = h & 65535;
          d = h >>> 16;
          h = hh[5];
          l = hl[5];
          a += l & 65535;
          b += l >>> 16;
          c += h & 65535;
          d += h >>> 16;
          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;
          hh[5] = ah5 = c & 65535 | d << 16;
          hl[5] = al5 = a & 65535 | b << 16;
          h = ah6;
          l = al6;
          a = l & 65535;
          b = l >>> 16;
          c = h & 65535;
          d = h >>> 16;
          h = hh[6];
          l = hl[6];
          a += l & 65535;
          b += l >>> 16;
          c += h & 65535;
          d += h >>> 16;
          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;
          hh[6] = ah6 = c & 65535 | d << 16;
          hl[6] = al6 = a & 65535 | b << 16;
          h = ah7;
          l = al7;
          a = l & 65535;
          b = l >>> 16;
          c = h & 65535;
          d = h >>> 16;
          h = hh[7];
          l = hl[7];
          a += l & 65535;
          b += l >>> 16;
          c += h & 65535;
          d += h >>> 16;
          b += a >>> 16;
          c += b >>> 16;
          d += c >>> 16;
          hh[7] = ah7 = c & 65535 | d << 16;
          hl[7] = al7 = a & 65535 | b << 16;
          pos += 128;
          n -= 128;
        }
        return n;
      }
      function crypto_hash(out, m, n) {
        var hh = new Int32Array(8), hl = new Int32Array(8), x = new Uint8Array(256), i, b = n;
        hh[0] = 1779033703;
        hh[1] = 3144134277;
        hh[2] = 1013904242;
        hh[3] = 2773480762;
        hh[4] = 1359893119;
        hh[5] = 2600822924;
        hh[6] = 528734635;
        hh[7] = 1541459225;
        hl[0] = 4089235720;
        hl[1] = 2227873595;
        hl[2] = 4271175723;
        hl[3] = 1595750129;
        hl[4] = 2917565137;
        hl[5] = 725511199;
        hl[6] = 4215389547;
        hl[7] = 327033209;
        crypto_hashblocks_hl(hh, hl, m, n);
        n %= 128;
        for (i = 0; i < n; i++) x[i] = m[b - n + i];
        x[n] = 128;
        n = 256 - 128 * (n < 112 ? 1 : 0);
        x[n - 9] = 0;
        ts64(x, n - 8, b / 536870912 | 0, b << 3);
        crypto_hashblocks_hl(hh, hl, x, n);
        for (i = 0; i < 8; i++) ts64(out, 8 * i, hh[i], hl[i]);
        return 0;
      }
      function add(p, q) {
        var a = gf(), b = gf(), c = gf(), d = gf(), e = gf(), f = gf(), g = gf(), h = gf(), t = gf();
        Z(a, p[1], p[0]);
        Z(t, q[1], q[0]);
        M(a, a, t);
        A(b, p[0], p[1]);
        A(t, q[0], q[1]);
        M(b, b, t);
        M(c, p[3], q[3]);
        M(c, c, D2);
        M(d, p[2], q[2]);
        A(d, d, d);
        Z(e, b, a);
        Z(f, d, c);
        A(g, d, c);
        A(h, b, a);
        M(p[0], e, f);
        M(p[1], h, g);
        M(p[2], g, f);
        M(p[3], e, h);
      }
      function cswap(p, q, b) {
        var i;
        for (i = 0; i < 4; i++) {
          sel25519(p[i], q[i], b);
        }
      }
      function pack(r, p) {
        var tx = gf(), ty = gf(), zi = gf();
        inv25519(zi, p[2]);
        M(tx, p[0], zi);
        M(ty, p[1], zi);
        pack25519(r, ty);
        r[31] ^= par25519(tx) << 7;
      }
      function scalarmult(p, q, s) {
        var b, i;
        set25519(p[0], gf0);
        set25519(p[1], gf1);
        set25519(p[2], gf1);
        set25519(p[3], gf0);
        for (i = 255; i >= 0; --i) {
          b = s[i / 8 | 0] >> (i & 7) & 1;
          cswap(p, q, b);
          add(q, p);
          add(p, p);
          cswap(p, q, b);
        }
      }
      function scalarbase(p, s) {
        var q = [gf(), gf(), gf(), gf()];
        set25519(q[0], X);
        set25519(q[1], Y);
        set25519(q[2], gf1);
        M(q[3], X, Y);
        scalarmult(p, q, s);
      }
      function crypto_sign_keypair(pk, sk, seeded) {
        var d = new Uint8Array(64);
        var p = [gf(), gf(), gf(), gf()];
        var i;
        if (!seeded) randombytes(sk, 32);
        crypto_hash(d, sk, 32);
        d[0] &= 248;
        d[31] &= 127;
        d[31] |= 64;
        scalarbase(p, d);
        pack(pk, p);
        for (i = 0; i < 32; i++) sk[i + 32] = pk[i];
        return 0;
      }
      var L = new Float64Array([237, 211, 245, 92, 26, 99, 18, 88, 214, 156, 247, 162, 222, 249, 222, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16]);
      function modL(r, x) {
        var carry, i, j, k;
        for (i = 63; i >= 32; --i) {
          carry = 0;
          for (j = i - 32, k = i - 12; j < k; ++j) {
            x[j] += carry - 16 * x[i] * L[j - (i - 32)];
            carry = Math.floor((x[j] + 128) / 256);
            x[j] -= carry * 256;
          }
          x[j] += carry;
          x[i] = 0;
        }
        carry = 0;
        for (j = 0; j < 32; j++) {
          x[j] += carry - (x[31] >> 4) * L[j];
          carry = x[j] >> 8;
          x[j] &= 255;
        }
        for (j = 0; j < 32; j++) x[j] -= carry * L[j];
        for (i = 0; i < 32; i++) {
          x[i + 1] += x[i] >> 8;
          r[i] = x[i] & 255;
        }
      }
      function reduce(r) {
        var x = new Float64Array(64), i;
        for (i = 0; i < 64; i++) x[i] = r[i];
        for (i = 0; i < 64; i++) r[i] = 0;
        modL(r, x);
      }
      function crypto_sign(sm, m, n, sk) {
        var d = new Uint8Array(64), h = new Uint8Array(64), r = new Uint8Array(64);
        var i, j, x = new Float64Array(64);
        var p = [gf(), gf(), gf(), gf()];
        crypto_hash(d, sk, 32);
        d[0] &= 248;
        d[31] &= 127;
        d[31] |= 64;
        var smlen = n + 64;
        for (i = 0; i < n; i++) sm[64 + i] = m[i];
        for (i = 0; i < 32; i++) sm[32 + i] = d[32 + i];
        crypto_hash(r, sm.subarray(32), n + 32);
        reduce(r);
        scalarbase(p, r);
        pack(sm, p);
        for (i = 32; i < 64; i++) sm[i] = sk[i];
        crypto_hash(h, sm, n + 64);
        reduce(h);
        for (i = 0; i < 64; i++) x[i] = 0;
        for (i = 0; i < 32; i++) x[i] = r[i];
        for (i = 0; i < 32; i++) {
          for (j = 0; j < 32; j++) {
            x[i + j] += h[i] * d[j];
          }
        }
        modL(sm.subarray(32), x);
        return smlen;
      }
      function unpackneg(r, p) {
        var t = gf(), chk = gf(), num = gf(), den = gf(), den2 = gf(), den4 = gf(), den6 = gf();
        set25519(r[2], gf1);
        unpack25519(r[1], p);
        S(num, r[1]);
        M(den, num, D);
        Z(num, num, r[2]);
        A(den, r[2], den);
        S(den2, den);
        S(den4, den2);
        M(den6, den4, den2);
        M(t, den6, num);
        M(t, t, den);
        pow2523(t, t);
        M(t, t, num);
        M(t, t, den);
        M(t, t, den);
        M(r[0], t, den);
        S(chk, r[0]);
        M(chk, chk, den);
        if (neq25519(chk, num)) M(r[0], r[0], I);
        S(chk, r[0]);
        M(chk, chk, den);
        if (neq25519(chk, num)) return -1;
        if (par25519(r[0]) === p[31] >> 7) Z(r[0], gf0, r[0]);
        M(r[3], r[0], r[1]);
        return 0;
      }
      function crypto_sign_open(m, sm, n, pk) {
        var i;
        var t = new Uint8Array(32), h = new Uint8Array(64);
        var p = [gf(), gf(), gf(), gf()], q = [gf(), gf(), gf(), gf()];
        if (n < 64) return -1;
        if (unpackneg(q, pk)) return -1;
        for (i = 0; i < n; i++) m[i] = sm[i];
        for (i = 0; i < 32; i++) m[i + 32] = pk[i];
        crypto_hash(h, m, n);
        reduce(h);
        scalarmult(p, q, h);
        scalarbase(q, sm.subarray(32));
        add(p, q);
        pack(t, p);
        n -= 64;
        if (crypto_verify_32(sm, 0, t, 0)) {
          for (i = 0; i < n; i++) m[i] = 0;
          return -1;
        }
        for (i = 0; i < n; i++) m[i] = sm[i + 64];
        return n;
      }
      var crypto_secretbox_KEYBYTES = 32, crypto_secretbox_NONCEBYTES = 24, crypto_secretbox_ZEROBYTES = 32, crypto_secretbox_BOXZEROBYTES = 16, crypto_scalarmult_BYTES = 32, crypto_scalarmult_SCALARBYTES = 32, crypto_box_PUBLICKEYBYTES = 32, crypto_box_SECRETKEYBYTES = 32, crypto_box_BEFORENMBYTES = 32, crypto_box_NONCEBYTES = crypto_secretbox_NONCEBYTES, crypto_box_ZEROBYTES = crypto_secretbox_ZEROBYTES, crypto_box_BOXZEROBYTES = crypto_secretbox_BOXZEROBYTES, crypto_sign_BYTES = 64, crypto_sign_PUBLICKEYBYTES = 32, crypto_sign_SECRETKEYBYTES = 64, crypto_sign_SEEDBYTES = 32, crypto_hash_BYTES = 64;
      nacl2.lowlevel = {
        crypto_core_hsalsa20,
        crypto_stream_xor,
        crypto_stream,
        crypto_stream_salsa20_xor,
        crypto_stream_salsa20,
        crypto_onetimeauth,
        crypto_onetimeauth_verify,
        crypto_verify_16,
        crypto_verify_32,
        crypto_secretbox,
        crypto_secretbox_open,
        crypto_scalarmult,
        crypto_scalarmult_base,
        crypto_box_beforenm,
        crypto_box_afternm,
        crypto_box,
        crypto_box_open,
        crypto_box_keypair,
        crypto_hash,
        crypto_sign,
        crypto_sign_keypair,
        crypto_sign_open,
        crypto_secretbox_KEYBYTES,
        crypto_secretbox_NONCEBYTES,
        crypto_secretbox_ZEROBYTES,
        crypto_secretbox_BOXZEROBYTES,
        crypto_scalarmult_BYTES,
        crypto_scalarmult_SCALARBYTES,
        crypto_box_PUBLICKEYBYTES,
        crypto_box_SECRETKEYBYTES,
        crypto_box_BEFORENMBYTES,
        crypto_box_NONCEBYTES,
        crypto_box_ZEROBYTES,
        crypto_box_BOXZEROBYTES,
        crypto_sign_BYTES,
        crypto_sign_PUBLICKEYBYTES,
        crypto_sign_SECRETKEYBYTES,
        crypto_sign_SEEDBYTES,
        crypto_hash_BYTES,
        gf,
        D,
        L,
        pack25519,
        unpack25519,
        M,
        A,
        S,
        Z,
        pow2523,
        add,
        set25519,
        modL,
        scalarmult,
        scalarbase
      };
      function checkLengths(k, n) {
        if (k.length !== crypto_secretbox_KEYBYTES) throw new Error("bad key size");
        if (n.length !== crypto_secretbox_NONCEBYTES) throw new Error("bad nonce size");
      }
      function checkBoxLengths(pk, sk) {
        if (pk.length !== crypto_box_PUBLICKEYBYTES) throw new Error("bad public key size");
        if (sk.length !== crypto_box_SECRETKEYBYTES) throw new Error("bad secret key size");
      }
      function checkArrayTypes() {
        for (var i = 0; i < arguments.length; i++) {
          if (!(arguments[i] instanceof Uint8Array))
            throw new TypeError("unexpected type, use Uint8Array");
        }
      }
      function cleanup(arr) {
        for (var i = 0; i < arr.length; i++) arr[i] = 0;
      }
      nacl2.randomBytes = function(n) {
        var b = new Uint8Array(n);
        randombytes(b, n);
        return b;
      };
      nacl2.secretbox = function(msg, nonce, key) {
        checkArrayTypes(msg, nonce, key);
        checkLengths(key, nonce);
        var m = new Uint8Array(crypto_secretbox_ZEROBYTES + msg.length);
        var c = new Uint8Array(m.length);
        for (var i = 0; i < msg.length; i++) m[i + crypto_secretbox_ZEROBYTES] = msg[i];
        crypto_secretbox(c, m, m.length, nonce, key);
        return c.subarray(crypto_secretbox_BOXZEROBYTES);
      };
      nacl2.secretbox.open = function(box, nonce, key) {
        checkArrayTypes(box, nonce, key);
        checkLengths(key, nonce);
        var c = new Uint8Array(crypto_secretbox_BOXZEROBYTES + box.length);
        var m = new Uint8Array(c.length);
        for (var i = 0; i < box.length; i++) c[i + crypto_secretbox_BOXZEROBYTES] = box[i];
        if (c.length < 32) return null;
        if (crypto_secretbox_open(m, c, c.length, nonce, key) !== 0) return null;
        return m.subarray(crypto_secretbox_ZEROBYTES);
      };
      nacl2.secretbox.keyLength = crypto_secretbox_KEYBYTES;
      nacl2.secretbox.nonceLength = crypto_secretbox_NONCEBYTES;
      nacl2.secretbox.overheadLength = crypto_secretbox_BOXZEROBYTES;
      nacl2.scalarMult = function(n, p) {
        checkArrayTypes(n, p);
        if (n.length !== crypto_scalarmult_SCALARBYTES) throw new Error("bad n size");
        if (p.length !== crypto_scalarmult_BYTES) throw new Error("bad p size");
        var q = new Uint8Array(crypto_scalarmult_BYTES);
        crypto_scalarmult(q, n, p);
        return q;
      };
      nacl2.scalarMult.base = function(n) {
        checkArrayTypes(n);
        if (n.length !== crypto_scalarmult_SCALARBYTES) throw new Error("bad n size");
        var q = new Uint8Array(crypto_scalarmult_BYTES);
        crypto_scalarmult_base(q, n);
        return q;
      };
      nacl2.scalarMult.scalarLength = crypto_scalarmult_SCALARBYTES;
      nacl2.scalarMult.groupElementLength = crypto_scalarmult_BYTES;
      nacl2.box = function(msg, nonce, publicKey, secretKey) {
        var k = nacl2.box.before(publicKey, secretKey);
        return nacl2.secretbox(msg, nonce, k);
      };
      nacl2.box.before = function(publicKey, secretKey) {
        checkArrayTypes(publicKey, secretKey);
        checkBoxLengths(publicKey, secretKey);
        var k = new Uint8Array(crypto_box_BEFORENMBYTES);
        crypto_box_beforenm(k, publicKey, secretKey);
        return k;
      };
      nacl2.box.after = nacl2.secretbox;
      nacl2.box.open = function(msg, nonce, publicKey, secretKey) {
        var k = nacl2.box.before(publicKey, secretKey);
        return nacl2.secretbox.open(msg, nonce, k);
      };
      nacl2.box.open.after = nacl2.secretbox.open;
      nacl2.box.keyPair = function() {
        var pk = new Uint8Array(crypto_box_PUBLICKEYBYTES);
        var sk = new Uint8Array(crypto_box_SECRETKEYBYTES);
        crypto_box_keypair(pk, sk);
        return { publicKey: pk, secretKey: sk };
      };
      nacl2.box.keyPair.fromSecretKey = function(secretKey) {
        checkArrayTypes(secretKey);
        if (secretKey.length !== crypto_box_SECRETKEYBYTES)
          throw new Error("bad secret key size");
        var pk = new Uint8Array(crypto_box_PUBLICKEYBYTES);
        crypto_scalarmult_base(pk, secretKey);
        return { publicKey: pk, secretKey: new Uint8Array(secretKey) };
      };
      nacl2.box.publicKeyLength = crypto_box_PUBLICKEYBYTES;
      nacl2.box.secretKeyLength = crypto_box_SECRETKEYBYTES;
      nacl2.box.sharedKeyLength = crypto_box_BEFORENMBYTES;
      nacl2.box.nonceLength = crypto_box_NONCEBYTES;
      nacl2.box.overheadLength = nacl2.secretbox.overheadLength;
      nacl2.sign = function(msg, secretKey) {
        checkArrayTypes(msg, secretKey);
        if (secretKey.length !== crypto_sign_SECRETKEYBYTES)
          throw new Error("bad secret key size");
        var signedMsg = new Uint8Array(crypto_sign_BYTES + msg.length);
        crypto_sign(signedMsg, msg, msg.length, secretKey);
        return signedMsg;
      };
      nacl2.sign.open = function(signedMsg, publicKey) {
        checkArrayTypes(signedMsg, publicKey);
        if (publicKey.length !== crypto_sign_PUBLICKEYBYTES)
          throw new Error("bad public key size");
        var tmp = new Uint8Array(signedMsg.length);
        var mlen = crypto_sign_open(tmp, signedMsg, signedMsg.length, publicKey);
        if (mlen < 0) return null;
        var m = new Uint8Array(mlen);
        for (var i = 0; i < m.length; i++) m[i] = tmp[i];
        return m;
      };
      nacl2.sign.detached = function(msg, secretKey) {
        var signedMsg = nacl2.sign(msg, secretKey);
        var sig = new Uint8Array(crypto_sign_BYTES);
        for (var i = 0; i < sig.length; i++) sig[i] = signedMsg[i];
        return sig;
      };
      nacl2.sign.detached.verify = function(msg, sig, publicKey) {
        checkArrayTypes(msg, sig, publicKey);
        if (sig.length !== crypto_sign_BYTES)
          throw new Error("bad signature size");
        if (publicKey.length !== crypto_sign_PUBLICKEYBYTES)
          throw new Error("bad public key size");
        var sm = new Uint8Array(crypto_sign_BYTES + msg.length);
        var m = new Uint8Array(crypto_sign_BYTES + msg.length);
        var i;
        for (i = 0; i < crypto_sign_BYTES; i++) sm[i] = sig[i];
        for (i = 0; i < msg.length; i++) sm[i + crypto_sign_BYTES] = msg[i];
        return crypto_sign_open(m, sm, sm.length, publicKey) >= 0;
      };
      nacl2.sign.keyPair = function() {
        var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
        var sk = new Uint8Array(crypto_sign_SECRETKEYBYTES);
        crypto_sign_keypair(pk, sk);
        return { publicKey: pk, secretKey: sk };
      };
      nacl2.sign.keyPair.fromSecretKey = function(secretKey) {
        checkArrayTypes(secretKey);
        if (secretKey.length !== crypto_sign_SECRETKEYBYTES)
          throw new Error("bad secret key size");
        var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
        for (var i = 0; i < pk.length; i++) pk[i] = secretKey[32 + i];
        return { publicKey: pk, secretKey: new Uint8Array(secretKey) };
      };
      nacl2.sign.keyPair.fromSeed = function(seed) {
        checkArrayTypes(seed);
        if (seed.length !== crypto_sign_SEEDBYTES)
          throw new Error("bad seed size");
        var pk = new Uint8Array(crypto_sign_PUBLICKEYBYTES);
        var sk = new Uint8Array(crypto_sign_SECRETKEYBYTES);
        for (var i = 0; i < 32; i++) sk[i] = seed[i];
        crypto_sign_keypair(pk, sk, true);
        return { publicKey: pk, secretKey: sk };
      };
      nacl2.sign.publicKeyLength = crypto_sign_PUBLICKEYBYTES;
      nacl2.sign.secretKeyLength = crypto_sign_SECRETKEYBYTES;
      nacl2.sign.seedLength = crypto_sign_SEEDBYTES;
      nacl2.sign.signatureLength = crypto_sign_BYTES;
      nacl2.hash = function(msg) {
        checkArrayTypes(msg);
        var h = new Uint8Array(crypto_hash_BYTES);
        crypto_hash(h, msg, msg.length);
        return h;
      };
      nacl2.hash.hashLength = crypto_hash_BYTES;
      nacl2.verify = function(x, y) {
        checkArrayTypes(x, y);
        if (x.length === 0 || y.length === 0) return false;
        if (x.length !== y.length) return false;
        return vn(x, 0, y, 0, x.length) === 0 ? true : false;
      };
      nacl2.setPRNG = function(fn) {
        randombytes = fn;
      };
      (function() {
        var crypto = typeof self !== "undefined" ? self.crypto || self.msCrypto : null;
        if (crypto && crypto.getRandomValues) {
          var QUOTA = 65536;
          nacl2.setPRNG(function(x, n) {
            var i, v = new Uint8Array(n);
            for (i = 0; i < n; i += QUOTA) {
              crypto.getRandomValues(v.subarray(i, i + Math.min(n - i, QUOTA)));
            }
            for (i = 0; i < n; i++) x[i] = v[i];
            cleanup(v);
          });
        } else if (typeof require !== "undefined") {
          crypto = require_crypto();
          if (crypto && crypto.randomBytes) {
            nacl2.setPRNG(function(x, n) {
              var i, v = crypto.randomBytes(n);
              for (i = 0; i < n; i++) x[i] = v[i];
              cleanup(v);
            });
          }
        }
      })();
    })(typeof module2 !== "undefined" && module2.exports ? module2.exports : self.nacl = self.nacl || {});
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BasesPowerPackPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian8 = require("obsidian");

// src/settings.ts
var import_obsidian2 = require("obsidian");

// src/engine/expression.ts
var OPERATORS = [
  "===",
  "!==",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "(",
  ")",
  ",",
  "?",
  ":"
];
function tokenize(src) {
  var _a;
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let str = "";
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\" && j + 1 < src.length) {
          const next = src[j + 1];
          str += next === "n" ? "\n" : next === "t" ? "	" : next;
          j += 2;
          continue;
        }
        str += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError(`Unterminated string at ${i}`);
      tokens.push({ type: "str", value: str, pos: i });
      i = j + 1;
      continue;
    }
    if (isDigit(ch) || ch === "." && isDigit((_a = src[i + 1]) != null ? _a : "")) {
      let j = i;
      while (j < src.length && (isDigit(src[j]) || src[j] === ".")) j++;
      tokens.push({ type: "num", value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    if (isIdentStart(ch)) {
      let j = i;
      while (j < src.length && isIdentPart(src[j])) j++;
      tokens.push({ type: "ident", value: src.slice(i, j), pos: i });
      i = j;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ type: "op", value: op, pos: i });
      i += op.length;
      continue;
    }
    throw new ExprError(`Unexpected character '${ch}' at ${i}`);
  }
  return tokens;
}
function isDigit(c) {
  return c >= "0" && c <= "9";
}
function isIdentStart(c) {
  return c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_" || c === "$";
}
function isIdentPart(c) {
  return isIdentStart(c) || isDigit(c) || c === ".";
}
var ExprError = class extends Error {
};
var Parser = class {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }
  parse() {
    if (this.tokens.length === 0) throw new ExprError("Empty expression");
    const node = this.ternary();
    if (this.pos < this.tokens.length) {
      throw new ExprError(`Unexpected token '${this.tokens[this.pos].value}'`);
    }
    return node;
  }
  peek() {
    return this.tokens[this.pos];
  }
  eat(value) {
    const tok = this.tokens[this.pos];
    if (!tok) throw new ExprError("Unexpected end of expression");
    if (value !== void 0 && tok.value !== value) {
      throw new ExprError(`Expected '${value}' but got '${tok.value}'`);
    }
    this.pos++;
    return tok;
  }
  isOp(value) {
    const tok = this.peek();
    return !!tok && tok.type === "op" && tok.value === value;
  }
  ternary() {
    const cond = this.or();
    if (this.isOp("?")) {
      this.eat("?");
      const a = this.ternary();
      this.eat(":");
      const b = this.ternary();
      return { t: "ternary", c: cond, a, b };
    }
    return cond;
  }
  binary(next, ops) {
    let left = next();
    while (this.peek() && this.peek().type === "op" && ops.includes(this.peek().value)) {
      const op = this.eat().value;
      const right = next();
      left = { t: "bin", op, a: left, b: right };
    }
    return left;
  }
  or() {
    return this.binary(() => this.and(), ["||"]);
  }
  and() {
    return this.binary(() => this.equality(), ["&&"]);
  }
  equality() {
    return this.binary(() => this.compare(), ["==", "!=", "===", "!=="]);
  }
  compare() {
    return this.binary(() => this.additive(), ["<", "<=", ">", ">="]);
  }
  additive() {
    return this.binary(() => this.multiplicative(), ["+", "-"]);
  }
  multiplicative() {
    return this.binary(() => this.unary(), ["*", "/", "%"]);
  }
  unary() {
    if (this.isOp("!") || this.isOp("-")) {
      const op = this.eat().value;
      return { t: "unary", op, x: this.unary() };
    }
    return this.primary();
  }
  primary() {
    const tok = this.peek();
    if (!tok) throw new ExprError("Unexpected end of expression");
    if (tok.type === "num") {
      this.eat();
      return { t: "num", v: Number(tok.value) };
    }
    if (tok.type === "str") {
      this.eat();
      return { t: "str", v: tok.value };
    }
    if (this.isOp("(")) {
      this.eat("(");
      const node = this.ternary();
      this.eat(")");
      return node;
    }
    if (tok.type === "ident") {
      this.eat();
      if (tok.value === "true") return { t: "bool", v: true };
      if (tok.value === "false") return { t: "bool", v: false };
      if (tok.value === "null") return { t: "null" };
      if (this.isOp("(")) {
        this.eat("(");
        const args = [];
        if (!this.isOp(")")) {
          args.push(this.ternary());
          while (this.isOp(",")) {
            this.eat(",");
            args.push(this.ternary());
          }
        }
        this.eat(")");
        return { t: "call", name: tok.value, args };
      }
      return { t: "ident", name: tok.value };
    }
    throw new ExprError(`Unexpected token '${tok.value}'`);
  }
};
function toNumber(v) {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? NaN : n;
  }
  return NaN;
}
function toBool(v) {
  if (v === null || v === void 0) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0 && v.toLowerCase() !== "false";
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
function toStr(v) {
  if (v === null || v === void 0) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(toStr).join(", ");
  return JSON.stringify(v);
}
function isEmpty(v) {
  if (v === null || v === void 0) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}
function flatten(args) {
  const out = [];
  for (const a of args) {
    if (Array.isArray(a)) out.push(...flatten(a));
    else out.push(a);
  }
  return out;
}
function numeric(args) {
  return flatten(args).map(toNumber).filter((n) => !Number.isNaN(n));
}
function compare(a, b) {
  const na = toNumber(a);
  const nb = toNumber(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb ? 0 : na < nb ? -1 : 1;
  const sa = toStr(a);
  const sb = toStr(b);
  return sa === sb ? 0 : sa < sb ? -1 : 1;
}
function looseEquals(a, b) {
  if (a === null || b === null) return a === b || isEmpty(a) && isEmpty(b);
  return compare(a, b) === 0;
}
var BUILTINS = {
  sum: (a) => numeric(a).reduce((s, n) => s + n, 0),
  avg: (a) => {
    const nums = numeric(a);
    return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
  },
  min: (a) => {
    const nums = numeric(a);
    return nums.length ? Math.min(...nums) : null;
  },
  max: (a) => {
    const nums = numeric(a);
    return nums.length ? Math.max(...nums) : null;
  },
  count: (a) => flatten(a).filter((v) => !isEmpty(v)).length,
  round: (a) => {
    const n = toNumber(a[0]);
    const digits = a[1] !== void 0 ? Math.max(0, Math.floor(toNumber(a[1]))) : 0;
    const f = Math.pow(10, digits);
    return Number.isNaN(n) ? null : Math.round(n * f) / f;
  },
  floor: (a) => Number.isNaN(toNumber(a[0])) ? null : Math.floor(toNumber(a[0])),
  ceil: (a) => Number.isNaN(toNumber(a[0])) ? null : Math.ceil(toNumber(a[0])),
  abs: (a) => Number.isNaN(toNumber(a[0])) ? null : Math.abs(toNumber(a[0])),
  sqrt: (a) => {
    const n = toNumber(a[0]);
    return Number.isNaN(n) || n < 0 ? null : Math.sqrt(n);
  },
  length: (a) => {
    const v = a[0];
    if (Array.isArray(v)) return v.length;
    return toStr(v).length;
  },
  lower: (a) => toStr(a[0]).toLowerCase(),
  upper: (a) => toStr(a[0]).toUpperCase(),
  trim: (a) => toStr(a[0]).trim(),
  contains: (a) => {
    const hay = a[0];
    if (Array.isArray(hay)) return hay.some((x) => looseEquals(x, a[1]));
    return toStr(hay).toLowerCase().includes(toStr(a[1]).toLowerCase());
  },
  startswith: (a) => toStr(a[0]).toLowerCase().startsWith(toStr(a[1]).toLowerCase()),
  endswith: (a) => toStr(a[0]).toLowerCase().endsWith(toStr(a[1]).toLowerCase()),
  empty: (a) => isEmpty(a[0]),
  notempty: (a) => !isEmpty(a[0]),
  number: (a) => {
    const n = toNumber(a[0]);
    return Number.isNaN(n) ? null : n;
  },
  string: (a) => toStr(a[0]),
  concat: (a) => a.map(toStr).join(""),
  join: (a) => flatten([a[0]]).map(toStr).join(a[1] !== void 0 ? toStr(a[1]) : ", "),
  default: (a) => {
    var _a;
    return isEmpty(a[0]) ? (_a = a[1]) != null ? _a : null : a[0];
  },
  list: (a) => a,
  date: (a) => {
    const d = new Date(toStr(a[0]));
    return Number.isNaN(d.getTime()) ? null : d;
  },
  datediff: (a) => {
    const d1 = new Date(toStr(a[0]));
    const d2 = new Date(toStr(a[1]));
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return null;
    return Math.round((d1.getTime() - d2.getTime()) / 864e5);
  }
};
function evalNode(node, scope) {
  switch (node.t) {
    case "num":
      return node.v;
    case "str":
      return node.v;
    case "bool":
      return node.v;
    case "null":
      return null;
    case "ident": {
      const v = scope.get(node.name);
      return normalizeValue(v);
    }
    case "unary": {
      if (node.op === "!") return !toBool(evalNode(node.x, scope));
      const n = toNumber(evalNode(node.x, scope));
      return Number.isNaN(n) ? null : -n;
    }
    case "ternary":
      return toBool(evalNode(node.c, scope)) ? evalNode(node.a, scope) : evalNode(node.b, scope);
    case "bin":
      return evalBinary(node, scope);
    case "call":
      return evalCall(node, scope);
  }
}
function evalBinary(node, scope) {
  if (node.op === "&&") {
    return toBool(evalNode(node.a, scope)) ? toBool(evalNode(node.b, scope)) : false;
  }
  if (node.op === "||") {
    const a2 = evalNode(node.a, scope);
    return toBool(a2) ? true : toBool(evalNode(node.b, scope));
  }
  const a = evalNode(node.a, scope);
  const b = evalNode(node.b, scope);
  switch (node.op) {
    case "==":
    case "===":
      return looseEquals(a, b);
    case "!=":
    case "!==":
      return !looseEquals(a, b);
    case "<":
      return compare(a, b) < 0;
    case "<=":
      return compare(a, b) <= 0;
    case ">":
      return compare(a, b) > 0;
    case ">=":
      return compare(a, b) >= 0;
    case "+": {
      const na = toNumber(a);
      const nb = toNumber(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na + nb;
      return toStr(a) + toStr(b);
    }
    case "-":
      return safeArith(toNumber(a) - toNumber(b));
    case "*":
      return safeArith(toNumber(a) * toNumber(b));
    case "/": {
      const d = toNumber(b);
      return d === 0 ? null : safeArith(toNumber(a) / d);
    }
    case "%": {
      const d = toNumber(b);
      return d === 0 ? null : safeArith(toNumber(a) % d);
    }
  }
  return null;
}
function evalCall(node, scope) {
  const name = node.name.toLowerCase();
  if (name === "if") {
    return toBool(evalNode(node.args[0], scope)) ? evalNode(node.args[1], scope) : node.args[2] !== void 0 ? evalNode(node.args[2], scope) : null;
  }
  if (name === "prop") {
    const key = toStr(evalNode(node.args[0], scope));
    return normalizeValue(scope.get(key));
  }
  const fn = BUILTINS[name];
  if (!fn) throw new ExprError(`Unknown function '${node.name}'`);
  const args = node.args.map((a) => evalNode(a, scope));
  return fn(args);
}
function safeArith(n) {
  return Number.isFinite(n) ? n : null;
}
function normalizeValue(v) {
  if (v === void 0) return null;
  if (v === null || typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
    return v;
  }
  if (v instanceof Date) return v;
  if (Array.isArray(v)) return v.map(normalizeValue);
  return toStr(v);
}
var CACHE = /* @__PURE__ */ new Map();
function compileExpression(source) {
  const cached = CACHE.get(source);
  if (cached) return cached;
  const ast = new Parser(tokenize(source)).parse();
  const compiled = {
    source,
    eval(scope) {
      return evalNode(ast, scope);
    }
  };
  if (CACHE.size > 500) CACHE.clear();
  CACHE.set(source, compiled);
  return compiled;
}
function evaluateSafe(source, scope) {
  try {
    return compileExpression(source).eval(scope);
  } catch (e) {
    return null;
  }
}

// src/query/rollup.ts
var AGGREGATIONS = [
  "count",
  "sum",
  "avg",
  "min",
  "max",
  "unique",
  "filled",
  "empty",
  "range"
];
function isEmpty2(v) {
  if (v === null || v === void 0) return true;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}
function computeRollup(rollup, rows) {
  const values = rows.map((r) => evaluateSafe(rollup.expression, r.scope));
  switch (rollup.aggregation) {
    case "count":
      return String(rows.length);
    case "filled":
      return String(values.filter((v) => !isEmpty2(v)).length);
    case "empty":
      return String(values.filter(isEmpty2).length);
    case "unique":
      return String(new Set(values.filter((v) => !isEmpty2(v)).map(toStr)).size);
    case "sum":
      return formatNumber(numeric2(values).reduce((s, n) => s + n, 0));
    case "avg": {
      const nums = numeric2(values);
      return nums.length ? formatNumber(nums.reduce((s, n) => s + n, 0) / nums.length) : "\u2014";
    }
    case "min": {
      const nums = numeric2(values);
      return nums.length ? formatNumber(Math.min(...nums)) : "\u2014";
    }
    case "max": {
      const nums = numeric2(values);
      return nums.length ? formatNumber(Math.max(...nums)) : "\u2014";
    }
    case "range": {
      const nums = numeric2(values);
      return nums.length ? `${formatNumber(Math.min(...nums))}\u2013${formatNumber(Math.max(...nums))}` : "\u2014";
    }
  }
}
function numeric2(values) {
  return values.map(toNumber).filter((n) => !Number.isNaN(n));
}
function formatNumber(n) {
  if (!Number.isFinite(n)) return "\u2014";
  return String(Math.round(n * 100) / 100);
}

// src/query/gantt.ts
function toDayNumber(value) {
  if (!value) return null;
  const iso = String(value).slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let ms;
  if (m) {
    ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  } else {
    const d = new Date(String(value));
    if (Number.isNaN(d.getTime())) return null;
    ms = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  return Math.floor(ms / 864e5);
}
function dayNumberToIso(day) {
  const d = new Date(day * 864e5);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function shiftIso(value, deltaDays) {
  const dn = toDayNumber(value);
  if (dn === null) return value != null ? value : "";
  return dayNumberToIso(dn + deltaDays);
}
function moveBarDates(start, end, deltaDays) {
  return {
    start: shiftIso(start, deltaDays),
    end: end && toDayNumber(end) !== null ? shiftIso(end, deltaDays) : null
  };
}
function resizeBarEnd(start, end, deltaDays) {
  const startDay = toDayNumber(start);
  const base = end && toDayNumber(end) !== null ? end : start;
  const baseDay = toDayNumber(base);
  if (startDay === null || baseDay === null) return end != null ? end : start;
  const next = Math.max(startDay, baseDay + deltaDays);
  return dayNumberToIso(next);
}
function pxToDays(px, dayWidthPx) {
  if (!Number.isFinite(dayWidthPx) || dayWidthPx <= 0) return 0;
  return Math.round(px / dayWidthPx);
}
function normalizeProgress(raw) {
  if (raw === void 0 || raw === null) return null;
  if (typeof raw === "string" && raw.trim() === "") return null;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, pct));
}
function buildGantt(input, defaultSpanDays = 1, maxDays = 120) {
  const bars = [];
  let skipped = 0;
  for (const row of input) {
    const startDay = toDayNumber(row.start);
    if (startDay === null) {
      skipped++;
      continue;
    }
    let endDay = toDayNumber(row.end);
    if (endDay === null || endDay < startDay) endDay = startDay + Math.max(0, defaultSpanDays - 1);
    bars.push({
      id: row.id,
      name: row.name,
      startIndex: 0,
      span: endDay - startDay + 1,
      startDate: dayNumberToIso(startDay),
      endDate: dayNumberToIso(endDay),
      startDay,
      endDay
    });
  }
  if (bars.length === 0) return { days: [], bars: [], skipped };
  const minDay = Math.min(...bars.map((b) => b.startDay));
  const maxDay = Math.min(Math.max(...bars.map((b) => b.endDay)), minDay + maxDays - 1);
  const days = [];
  for (let d = minDay; d <= maxDay; d++) days.push(dayNumberToIso(d));
  const finalBars = bars.map((b) => {
    const startIndex = b.startDay - minDay;
    const clampedSpan = Math.min(b.span, maxDay - b.startDay + 1);
    return {
      id: b.id,
      name: b.name,
      startIndex,
      span: Math.max(1, clampedSpan),
      startDate: b.startDate,
      endDate: b.endDate
    };
  });
  finalBars.sort((a, b) => a.startIndex - b.startIndex || a.name.localeCompare(b.name));
  return { days, bars: finalBars, skipped };
}

// src/query/dates.ts
function toIsoDateKey(value) {
  if (value === void 0 || value === null || value === "") return null;
  const raw = toStr(value);
  const head = raw.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const day = Number(m[3]);
    const dt = new Date(y, mo - 1, day);
    return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === day ? head : null;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function rescheduleDateValue(original, newIso) {
  const raw = original === void 0 || original === null ? "" : toStr(original);
  const m = raw.match(/^\d{4}-\d{2}-\d{2}(.*)$/);
  return newIso + (m ? m[1] : "");
}
function weekdayOf(dayNumber) {
  return (dayNumber % 7 + 7 + 4) % 7;
}
function startOfWeekIso(iso, weekStartsOn = 0) {
  const dn = toDayNumber(iso);
  if (dn === null) return iso;
  const offset = (weekdayOf(dn) - weekStartsOn + 7) % 7;
  return dayNumberToIso(dn - offset);
}
function weekKeys(iso, weekStartsOn = 0) {
  const start = startOfWeekIso(iso, weekStartsOn);
  const keys = [];
  for (let i = 0; i < 7; i++) keys.push(shiftIso(start, i));
  return keys;
}
function todayIso(now = /* @__PURE__ */ new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function dayLabel(iso) {
  const dn = toDayNumber(iso);
  if (dn === null) return iso;
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = Number(iso.slice(8, 10));
  return `${names[weekdayOf(dn)]} ${day}`;
}

// src/query/automation.ts
function eqi(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
function rulesForTransition(rules, triggerProp, newValue) {
  const prop = triggerProp || "status";
  return rules.filter(
    (r) => r.enabled && eqi(r.triggerProp || "status", prop) && eqi(r.enterValue, newValue)
  );
}
function coerceLiteral(raw) {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed;
}
function nowStamp(now) {
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${todayIso(now)}T${hh}:${mm}`;
}
function computeRuleWrites(rules, frontmatter, now) {
  var _a;
  const writes = [];
  for (const rule of rules) {
    for (const action of rule.actions) {
      const key = action.prop.trim();
      if (!key) continue;
      switch (action.type) {
        case "set":
          writes.push({ key, value: coerceLiteral(action.value) });
          break;
        case "today":
          writes.push({ key, value: todayIso(now) });
          break;
        case "now":
          writes.push({ key, value: nowStamp(now) });
          break;
        case "clear":
          writes.push({ key, remove: true });
          break;
        case "toggle":
          writes.push({ key, value: !toBool(frontmatter[key]) });
          break;
        case "copy": {
          const src = action.value.trim();
          writes.push({ key, value: src ? (_a = frontmatter[src]) != null ? _a : null : null });
          break;
        }
      }
    }
  }
  return writes;
}
var AUTOMATION_ACTION_TYPES = [
  "set",
  "today",
  "now",
  "clear",
  "toggle",
  "copy"
];

// src/views/viewData.ts
var import_obsidian = require("obsidian");

// src/model/row.ts
function fileProps(note) {
  return {
    "file.name": note.name,
    "file.path": note.path,
    "file.folder": note.folder,
    "file.ext": note.ext,
    "file.tags": note.tags,
    "file.ctime": note.ctime,
    "file.mtime": note.mtime,
    "file.size": note.size
  };
}
function makeScope(note, formulas = {}) {
  const base = { ...note.frontmatter, ...fileProps(note) };
  const memo = /* @__PURE__ */ new Map();
  const inProgress = /* @__PURE__ */ new Set();
  const scope = {
    get(name) {
      if (name in base) return base[name];
      if (name in formulas) {
        if (memo.has(name)) return memo.get(name);
        if (inProgress.has(name)) return null;
        inProgress.add(name);
        let result = null;
        try {
          result = compileExpression(formulas[name]).eval(scope);
        } catch (e) {
          result = null;
        }
        inProgress.delete(name);
        memo.set(name, result);
        return result;
      }
      return void 0;
    }
  };
  return scope;
}
function makeRow(note, formulas = {}) {
  return { id: note.path, name: note.name, note, scope: makeScope(note, formulas) };
}

// src/query/filter.ts
function evaluateFilter(node, scope) {
  if (node === null || node === void 0) return true;
  if (typeof node === "string") {
    if (node.trim().length === 0) return true;
    return toBool(evaluateSafe(node, scope));
  }
  if (Array.isArray(node)) {
    return node.every((child) => evaluateFilter(child, scope));
  }
  if ("and" in node && Array.isArray(node.and)) {
    return node.and.every((child) => evaluateFilter(child, scope));
  }
  if ("or" in node && Array.isArray(node.or)) {
    return node.or.some((child) => evaluateFilter(child, scope));
  }
  if ("not" in node) {
    return !evaluateFilter(node.not, scope);
  }
  return true;
}
function andFilters(a, b) {
  const parts = [];
  if (a !== null && a !== void 0 && a !== "") parts.push(a);
  if (b !== null && b !== void 0 && b !== "") parts.push(b);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return { and: parts };
}

// src/bases/resolveRows.ts
function resolveRows(notes, def, extraFilter) {
  const filter = andFilters(def.filters, extraFilter);
  const rows = [];
  for (const note of notes) {
    const row = makeRow(note, def.formulas);
    if (evaluateFilter(filter, row.scope)) rows.push(row);
  }
  return rows;
}

// src/bases/baseDefinition.ts
function emptyBaseDefinition() {
  return { filters: null, formulas: {}, properties: {}, views: [] };
}
function asRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
}
function normalizeBaseDefinition(raw) {
  const obj = asRecord(raw);
  const def = emptyBaseDefinition();
  if (obj.filters !== void 0) {
    def.filters = obj.filters;
  }
  const formulas = asRecord(obj.formulas);
  for (const [name, expr] of Object.entries(formulas)) {
    if (typeof expr === "string" && expr.trim().length > 0) {
      def.formulas[name] = expr;
    }
  }
  const props = asRecord(obj.properties);
  for (const [key, meta] of Object.entries(props)) {
    const m = asRecord(meta);
    def.properties[key] = {
      displayName: typeof m.displayName === "string" ? m.displayName : void 0
    };
  }
  if (Array.isArray(obj.views)) {
    for (const rawView of obj.views) {
      const v = asRecord(rawView);
      if (typeof v.type !== "string") continue;
      def.views.push({
        type: v.type,
        name: typeof v.name === "string" ? v.name : v.type,
        filters: v.filters,
        group: typeof v.group === "string" ? v.group : typeof v.groupBy === "string" ? v.groupBy : void 0,
        order: Array.isArray(v.order) ? v.order.filter((o) => typeof o === "string") : void 0
      });
    }
  }
  return def;
}

// src/query/undo.ts
function invertWrites(before, writes) {
  const seen = /* @__PURE__ */ new Set();
  const inverse = [];
  for (const write of writes) {
    if (seen.has(write.key)) continue;
    seen.add(write.key);
    if (Object.prototype.hasOwnProperty.call(before, write.key)) {
      inverse.push({ key: write.key, value: cloneValue(before[write.key]) });
    } else {
      inverse.push({ key: write.key, remove: true });
    }
  }
  return inverse;
}
function cloneValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = cloneValue(v);
  return out;
}
var UndoBatch = class {
  constructor(label) {
    this.label = label;
    this.notes = [];
  }
};
var UndoManager = class {
  constructor(limit = 25) {
    this.limit = limit;
    this.stack = [];
  }
  /** Open a batch; pass the returned handle to each write's options, then commit. */
  beginBatch(label) {
    return new UndoBatch(label);
  }
  /** Push the batch as a single entry, keeping it only if it captured a note. */
  commitBatch(batch) {
    if (batch.notes.length > 0) this.push({ label: batch.label, notes: [...batch.notes] });
  }
  /**
   * Record the inverse of a just-applied write. No-op for an empty inverse. With
   * a `batch` handle the record joins that batch; without one it becomes its own
   * single-note entry.
   */
  record(label, path, inverse, batch) {
    if (inverse.length === 0) return;
    if (batch) {
      batch.notes.push({ path, writes: inverse });
      return;
    }
    this.push({ label, notes: [{ path, writes: inverse }] });
  }
  push(entry) {
    this.stack.push(entry);
    if (this.stack.length > this.limit) this.stack.shift();
  }
  canUndo() {
    return this.stack.length > 0;
  }
  /** The label of the edit undo would reverse next, or null when the stack is empty. */
  peekLabel() {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1].label : null;
  }
  pop() {
    var _a;
    return (_a = this.stack.pop()) != null ? _a : null;
  }
  clear() {
    this.stack = [];
  }
};

// src/views/viewData.ts
function buildRawNotes(app) {
  var _a, _b, _c, _d;
  const notes = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    const fm = { ...(_a = cache == null ? void 0 : cache.frontmatter) != null ? _a : {} };
    delete fm.position;
    const tags = (cache ? (_b = (0, import_obsidian.getAllTags)(cache)) != null ? _b : [] : []).map((t) => t.replace(/^#/, ""));
    notes.push({
      path: file.path,
      name: file.basename,
      folder: (_d = (_c = file.parent) == null ? void 0 : _c.path) != null ? _d : "",
      ext: file.extension,
      tags,
      ctime: file.stat.ctime,
      mtime: file.stat.mtime,
      size: file.stat.size,
      frontmatter: fm
    });
  }
  return notes;
}
function listBaseFiles(app) {
  return app.vault.getFiles().filter((f) => f.extension === "base").sort((a, b) => a.path.localeCompare(b.path));
}
async function loadBaseDefinition(app, path) {
  if (!path) return null;
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof import_obsidian.TFile)) return null;
  try {
    const raw = await app.vault.read(file);
    return normalizeBaseDefinition((0, import_obsidian.parseYaml)(raw));
  } catch (e) {
    return null;
  }
}
async function writeRowProperty(plugin, path, key, value, remove = false, opts) {
  return writeRowProperties(plugin, path, [{ key, value, remove }], opts);
}
async function writeRowProperties(plugin, path, writes, opts) {
  var _a;
  const app = plugin.app;
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof import_obsidian.TFile) || writes.length === 0) return false;
  let inverse = [];
  try {
    await app.fileManager.processFrontMatter(file, (frontmatter) => {
      const target = frontmatter;
      inverse = invertWrites(target, writes);
      for (const write of writes) {
        if (write.remove) delete target[write.key];
        else target[write.key] = write.value;
      }
    });
    if ((opts == null ? void 0 : opts.record) !== false) plugin.undo.record((_a = opts == null ? void 0 : opts.label) != null ? _a : "Edit", path, inverse, opts == null ? void 0 : opts.batch);
    plugin.invalidateSnapshot();
    return true;
  } catch (error) {
    new import_obsidian.Notice(`Bases Power Pack: couldn't update "${file.basename}" (${String(error)}).`);
    return false;
  }
}
async function ensureParentFolders(app, path) {
  const parts = path.split("/");
  parts.pop();
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const normalized = (0, import_obsidian.normalizePath)(current);
    if (!normalized || app.vault.getAbstractFileByPath(normalized)) continue;
    await app.vault.createFolder(normalized);
  }
}
async function createSeededNote(plugin, folder, key, value, titleHint) {
  const app = plugin.app;
  const cleanFolder = folder.trim().replace(/^[/\\]+|[/\\]+$/g, "");
  const stem = `${cleanFolder ? `${cleanFolder}/` : ""}${titleHint}`;
  let path = (0, import_obsidian.normalizePath)(`${stem}.md`);
  for (let i = 2; app.vault.getAbstractFileByPath(path) && i < 1e3; i++) {
    path = (0, import_obsidian.normalizePath)(`${stem} ${i}.md`);
  }
  await ensureParentFolders(app, path);
  const content = `---
${key}: ${JSON.stringify(value)}
---

# ${titleHint}
`;
  const file = await app.vault.create(path, content);
  plugin.invalidateSnapshot();
  await app.workspace.getLeaf("tab").openFile(file);
  return file;
}
async function resolveViewRows(app, plugin) {
  var _a;
  const s = plugin.settings;
  const notes = plugin.getNotesSnapshot();
  if (!s.isPro) {
    return { rows: resolveRows(notes, emptyBaseDefinition()), def: emptyBaseDefinition(), baseLabel: null, filterLabel: null };
  }
  const def = (_a = await loadBaseDefinition(app, s.activeBasePath)) != null ? _a : emptyBaseDefinition();
  let extra = null;
  let filterLabel = null;
  if (s.activeFilterId) {
    const sf = s.savedFilters.find((f) => f.id === s.activeFilterId);
    if (sf) {
      extra = sf.expression;
      filterLabel = sf.name;
    }
  }
  const rows = resolveRows(notes, def, extra);
  const baseLabel = s.activeBasePath ? s.activeBasePath.split("/").pop().replace(/\.base$/, "") : null;
  return { rows, def, baseLabel, filterLabel };
}

// src/settings.ts
var ACTION_LABELS = {
  set: "Set to value",
  today: "Set to today",
  now: "Set to now (with time)",
  clear: "Clear property",
  toggle: "Toggle true/false",
  copy: "Copy from property"
};
var CALENDAR_VIEW_MODES = ["month", "week", "agenda"];
var DEFAULT_SETTINGS = {
  licenseKey: "",
  isPro: false,
  licenseEmail: "",
  purchaseUrl: "https://example.gumroad.com/l/bases-power-pack",
  kanbanGroupBy: "status",
  kanbanCardFields: ["due", "priority"],
  kanbanQuickAddFolder: "",
  kanbanExtraColumns: {},
  kanbanColumnOrder: {},
  kanbanColorColumns: true,
  kanbanWipLimits: {},
  kanbanBlockOverWip: false,
  calendarDateProp: "due",
  calendarViewMode: "month",
  calendarColorProp: "",
  calendarQuickAddFolder: "",
  ganttStartProp: "start",
  ganttEndProp: "end",
  ganttProgressProp: "progress",
  ganttMilestoneProp: "milestone",
  activeBasePath: "",
  savedFilters: [],
  activeFilterId: "",
  rollups: [],
  cardFormula: "",
  automations: [],
  kanbanColorOverrides: {}
};
function genId(prefix) {
  const c = window.crypto;
  if (c == null ? void 0 : c.randomUUID) return `${prefix}-${c.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}
var BasesPowerPackSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("License").setHeading();
    new import_obsidian2.Setting(containerEl).setName("License key").setDesc("Enter your premium license key. Verified offline \u2014 no account or server required.").addText(
      (text) => text.setPlaceholder("payload.signature").setValue(this.plugin.settings.licenseKey).onChange((value) => {
        this.plugin.settings.licenseKey = value;
        void this.plugin.refreshLicense(true).then((changed) => {
          if (changed) this.display();
        });
      })
    );
    const status = containerEl.createDiv({ cls: "bpp-license-status" });
    if (this.plugin.settings.isPro) {
      status.createEl("p", {
        text: `\u2705 Premium active${this.plugin.settings.licenseEmail ? ` (${this.plugin.settings.licenseEmail})` : ""}.`
      });
    } else {
      status.createEl("p", {
        text: "\u{1F513} Lite tier active. Upgrade to unlock the calendar, Gantt, roll-ups, formulas, and saved filters."
      });
      const link = status.createEl("a", {
        text: "Get Bases Power Pack premium",
        href: this.plugin.settings.purchaseUrl
      });
      link.setAttr("target", "_blank");
    }
    new import_obsidian2.Setting(containerEl).setName("Purchase page URL").setDesc("Link shown for premium upgrades.").addText(
      (text) => text.setPlaceholder("https://your-store.com/product").setValue(this.plugin.settings.purchaseUrl).onChange((value) => {
        this.plugin.settings.purchaseUrl = value.trim() || DEFAULT_SETTINGS.purchaseUrl;
        void this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Kanban view (Lite)").setHeading();
    new import_obsidian2.Setting(containerEl).setName("Group by property").setDesc("Frontmatter property (or, with premium, a formula) used to build kanban columns.").addText(
      (text) => text.setValue(this.plugin.settings.kanbanGroupBy).onChange((value) => {
        this.plugin.settings.kanbanGroupBy = value.trim() || "status";
        void this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Card detail fields").setDesc("Comma-separated raw properties to show on free kanban cards, e.g. due, priority, owner, tags.").addText(
      (text) => text.setValue(this.plugin.settings.kanbanCardFields.join(", ")).onChange((value) => {
        this.plugin.settings.kanbanCardFields = value.split(",").map((part) => part.trim()).filter(Boolean);
        void this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Quick add folder").setDesc("Optional folder for the kanban + button. Leave blank to create notes at the vault root.").addText(
      (text) => text.setValue(this.plugin.settings.kanbanQuickAddFolder).onChange((value) => {
        this.plugin.settings.kanbanQuickAddFolder = value.trim();
        void this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Color columns").setDesc("Tint each column and its cards with a stable color derived from the column value. Add new columns directly from the board with the \u201C+ Add column\u201D tile.").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.kanbanColorColumns).onChange((value) => {
        this.plugin.settings.kanbanColorColumns = value;
        void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Enforce WIP limits").setDesc(
      "Set a per-column work-in-progress limit by right-clicking a column header on the board. When on, a move that would push a column past its limit is blocked; when off, over-limit columns are only flagged in red."
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.kanbanBlockOverWip).onChange((value) => {
        this.plugin.settings.kanbanBlockOverWip = value;
        void this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Premium").setHeading();
    const premium = (name, desc, render) => {
      const setting = new import_obsidian2.Setting(containerEl).setName(name).setDesc(desc);
      if (!this.plugin.settings.isPro) {
        setting.settingEl.addClass("bpp-setting-locked");
        setting.descEl.appendText(" (Premium)");
        return false;
      }
      render(setting);
      return true;
    };
    premium(
      "Active base",
      "Read a .base file's filters and formulas as the data source for all views. Choose \u201CAll notes\u201D to run over the whole vault.",
      (setting) => {
        setting.addDropdown((dd) => {
          dd.addOption("", "All notes");
          for (const file of listBaseFiles(this.app)) {
            dd.addOption(file.path, file.path.replace(/\.base$/, ""));
          }
          dd.setValue(this.plugin.settings.activeBasePath);
          dd.onChange((value) => {
            this.plugin.settings.activeBasePath = value;
            void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
          });
        });
      }
    );
    premium(
      "Calendar date property",
      "Frontmatter date property used to place notes on the calendar.",
      (setting) => {
        setting.addText(
          (text) => text.setValue(this.plugin.settings.calendarDateProp).onChange((value) => {
            this.plugin.settings.calendarDateProp = value.trim() || "due";
            void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
          })
        );
      }
    );
    premium("Gantt start property", "Frontmatter date property for the start of each Gantt bar.", (setting) => {
      setting.addText(
        (text) => text.setValue(this.plugin.settings.ganttStartProp).onChange((value) => {
          this.plugin.settings.ganttStartProp = value.trim() || "start";
          void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
        })
      );
    });
    premium("Gantt end property", "Frontmatter date property for the end of each Gantt bar (optional).", (setting) => {
      setting.addText(
        (text) => text.setValue(this.plugin.settings.ganttEndProp).onChange((value) => {
          this.plugin.settings.ganttEndProp = value.trim() || "end";
          void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
        })
      );
    });
    premium(
      "Gantt progress property",
      "Frontmatter number (0\u2013100) that fills each Gantt bar to show completion.",
      (setting) => {
        setting.addText(
          (text) => text.setPlaceholder("progress").setValue(this.plugin.settings.ganttProgressProp).onChange((value) => {
            this.plugin.settings.ganttProgressProp = value.trim();
            void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
          })
        );
      }
    );
    premium(
      "Gantt milestone property",
      "Notes where this frontmatter value is truthy render as a diamond milestone instead of a bar.",
      (setting) => {
        setting.addText(
          (text) => text.setPlaceholder("milestone").setValue(this.plugin.settings.ganttMilestoneProp).onChange((value) => {
            this.plugin.settings.ganttMilestoneProp = value.trim();
            void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
          })
        );
      }
    );
    premium(
      "Calendar color property",
      "Frontmatter property whose value tints each calendar event with a stable color. Leave blank for no coloring.",
      (setting) => {
        setting.addText(
          (text) => text.setPlaceholder("status").setValue(this.plugin.settings.calendarColorProp).onChange((value) => {
            this.plugin.settings.calendarColorProp = value.trim();
            void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
          })
        );
      }
    );
    premium(
      "Calendar quick-add folder",
      "Optional folder for notes created by clicking a day (leave blank for the vault root).",
      (setting) => {
        setting.addText(
          (text) => text.setValue(this.plugin.settings.calendarQuickAddFolder).onChange((value) => {
            this.plugin.settings.calendarQuickAddFolder = value.trim();
            void this.plugin.saveSettings();
          })
        );
      }
    );
    premium(
      "Kanban card formula",
      'An expression shown under each kanban card, e.g. round(done / total * 100, 0) + "%".',
      (setting) => {
        setting.addText(
          (text) => text.setPlaceholder('round(done / total * 100, 0) + "%"').setValue(this.plugin.settings.cardFormula).onChange((value) => {
            this.plugin.settings.cardFormula = value;
            void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
          })
        );
      }
    );
    if (this.plugin.settings.isPro) {
      this.renderAutomations(containerEl);
      this.renderRollups(containerEl);
      this.renderSavedFilters(containerEl);
    }
  }
  renderAutomations(containerEl) {
    new import_obsidian2.Setting(containerEl).setName("Move Rules").setDesc(
      "When a card's trigger property enters a value (e.g. dragged into a Kanban column), run these frontmatter actions automatically."
    ).setHeading();
    for (const rule of this.plugin.settings.automations) {
      const box = containerEl.createDiv({ cls: "bpp-rule" });
      new import_obsidian2.Setting(box).setName("When").addToggle(
        (t) => t.setTooltip("Enable this rule").setValue(rule.enabled).onChange((v) => {
          rule.enabled = v;
          void this.plugin.saveSettings();
        })
      ).addText(
        (t) => t.setPlaceholder("Rule name").setValue(rule.name).onChange((v) => {
          rule.name = v;
          void this.plugin.saveSettings();
        })
      ).addText(
        (t) => t.setPlaceholder("trigger (status)").setValue(rule.triggerProp).onChange((v) => {
          rule.triggerProp = v.trim();
          void this.plugin.saveSettings();
        })
      ).addText(
        (t) => t.setPlaceholder("enters value (Done)").setValue(rule.enterValue).onChange((v) => {
          rule.enterValue = v;
          void this.plugin.saveSettings();
        })
      ).addExtraButton(
        (b) => b.setIcon("trash").setTooltip("Remove rule").onClick(() => {
          this.plugin.settings.automations = this.plugin.settings.automations.filter((r) => r.id !== rule.id);
          void this.plugin.saveSettings().then(() => this.display());
        })
      );
      for (const action of rule.actions) {
        const row = new import_obsidian2.Setting(box).setClass("bpp-rule-action");
        row.addText(
          (t) => t.setPlaceholder("property").setValue(action.prop).onChange((v) => {
            action.prop = v.trim();
            void this.plugin.saveSettings();
          })
        );
        row.addDropdown((dd) => {
          for (const type of AUTOMATION_ACTION_TYPES) dd.addOption(type, ACTION_LABELS[type]);
          dd.setValue(action.type).onChange((v) => {
            action.type = v;
            void this.plugin.saveSettings().then(() => this.display());
          });
        });
        if (action.type === "set" || action.type === "copy") {
          row.addText(
            (t) => t.setPlaceholder(action.type === "copy" ? "source property" : "value").setValue(action.value).onChange((v) => {
              action.value = v;
              void this.plugin.saveSettings();
            })
          );
        }
        row.addExtraButton(
          (b) => b.setIcon("x").setTooltip("Remove action").onClick(() => {
            rule.actions = rule.actions.filter((a) => a !== action);
            void this.plugin.saveSettings().then(() => this.display());
          })
        );
      }
      new import_obsidian2.Setting(box).addButton(
        (b) => b.setButtonText("Add action").onClick(() => {
          rule.actions.push({ prop: "", type: "set", value: "" });
          void this.plugin.saveSettings().then(() => this.display());
        })
      );
    }
    new import_obsidian2.Setting(containerEl).addButton(
      (b) => b.setButtonText("Add rule").setCta().onClick(() => {
        this.plugin.settings.automations.push({
          id: genId("rule"),
          name: "New rule",
          enabled: true,
          triggerProp: "status",
          enterValue: "Done",
          actions: []
        });
        void this.plugin.saveSettings().then(() => this.display());
      })
    );
  }
  renderRollups(containerEl) {
    new import_obsidian2.Setting(containerEl).setName("Roll-ups").setDesc("Aggregate an expression across the rows in each view (shown as a summary bar).").setHeading();
    for (const rollup of this.plugin.settings.rollups) {
      const row = new import_obsidian2.Setting(containerEl);
      row.addText(
        (t) => t.setPlaceholder("Label").setValue(rollup.label).onChange((v) => {
          rollup.label = v;
          void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
        })
      );
      row.addText(
        (t) => t.setPlaceholder("expression, e.g. hours").setValue(rollup.expression).onChange((v) => {
          rollup.expression = v;
          void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
        })
      );
      row.addDropdown((dd) => {
        for (const agg of AGGREGATIONS) dd.addOption(agg, agg);
        dd.setValue(rollup.aggregation);
        dd.onChange((v) => {
          rollup.aggregation = v;
          void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
        });
      });
      row.addExtraButton(
        (b) => b.setIcon("trash").setTooltip("Remove roll-up").onClick(() => {
          this.plugin.settings.rollups = this.plugin.settings.rollups.filter((r) => r.id !== rollup.id);
          void this.plugin.saveSettings().then(() => {
            this.plugin.refreshViews();
            this.display();
          });
        })
      );
    }
    new import_obsidian2.Setting(containerEl).addButton(
      (b) => b.setButtonText("Add roll-up").setCta().onClick(() => {
        this.plugin.settings.rollups.push({
          id: genId("rollup"),
          label: "Total",
          expression: "1",
          aggregation: "count"
        });
        void this.plugin.saveSettings().then(() => this.display());
      })
    );
  }
  renderSavedFilters(containerEl) {
    new import_obsidian2.Setting(containerEl).setName("Saved filters").setDesc(`Named filter expressions selectable from each view's toolbar, e.g. status != "done" && priority > 2.`).setHeading();
    for (const filter of this.plugin.settings.savedFilters) {
      const row = new import_obsidian2.Setting(containerEl);
      row.addText(
        (t) => t.setPlaceholder("Name").setValue(filter.name).onChange((v) => {
          filter.name = v;
          void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
        })
      );
      row.addText(
        (t) => t.setPlaceholder('expression, e.g. status != "done"').setValue(filter.expression).onChange((v) => {
          filter.expression = v;
          void this.plugin.saveSettings().then(() => this.plugin.refreshViews());
        })
      );
      row.addExtraButton(
        (b) => b.setIcon("trash").setTooltip("Remove saved filter").onClick(() => {
          this.plugin.settings.savedFilters = this.plugin.settings.savedFilters.filter(
            (f) => f.id !== filter.id
          );
          if (this.plugin.settings.activeFilterId === filter.id) this.plugin.settings.activeFilterId = "";
          void this.plugin.saveSettings().then(() => {
            this.plugin.refreshViews();
            this.display();
          });
        })
      );
    }
    new import_obsidian2.Setting(containerEl).addButton(
      (b) => b.setButtonText("Add saved filter").setCta().onClick(() => {
        this.plugin.settings.savedFilters.push({
          id: genId("filter"),
          name: "New filter",
          expression: ""
        });
        void this.plugin.saveSettings().then(() => this.display());
      })
    );
  }
};

// src/shared/verifyLicense.mjs
var import_tweetnacl = __toESM(require_nacl_fast(), 1);
function verifyLicense(licenseKey, product, publicKeyB64) {
  const trimmed = String(licenseKey != null ? licenseKey : "").trim();
  if (!trimmed) {
    return { valid: false, error: "No license key provided." };
  }
  const parts = trimmed.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid license format." };
  }
  try {
    const payloadBytes = base64ToBytes(parts[0]);
    const signature = base64ToBytes(parts[1]);
    const publicKey = base64ToBytes(publicKeyB64);
    if (!import_tweetnacl.default.sign.detached.verify(payloadBytes, signature, publicKey)) {
      return { valid: false, error: "Invalid license signature." };
    }
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (payload.product !== product) {
      return { valid: false, error: "License is for a different product." };
    }
    return { valid: true, email: payload.email };
  } catch (e) {
    return { valid: false, error: "Could not parse license key." };
  }
}
function base64ToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// src/license/publicKey.ts
var LICENSE_PUBLIC_KEY = "OATJwdDzi1ulsH9XHJd4z3P_yflngnhWaFszfEvMGsQ";

// src/license/LicenseManager.ts
var _LicenseManager = class _LicenseManager {
  static verify(licenseKey) {
    return verifyLicense(licenseKey, _LicenseManager.PRODUCT, LICENSE_PUBLIC_KEY);
  }
};
_LicenseManager.PRODUCT = "bases-power-pack";
var LicenseManager = _LicenseManager;

// src/views/kanbanView.ts
var import_obsidian5 = require("obsidian");

// src/views/abstractView.ts
var import_obsidian4 = require("obsidian");

// src/views/modals.ts
var import_obsidian3 = require("obsidian");
var PromptModal = class extends import_obsidian3.Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts;
    this.value = opts.value;
  }
  onOpen() {
    this.titleEl.setText(this.opts.title);
    const submit = () => {
      this.close();
      this.opts.onSubmit(this.value);
    };
    new import_obsidian3.Setting(this.contentEl).addText((text) => {
      text.setValue(this.value).onChange((v) => this.value = v);
      if (this.opts.placeholder) text.setPlaceholder(this.opts.placeholder);
      text.inputEl.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") {
          evt.preventDefault();
          submit();
        }
      });
      window.setTimeout(() => {
        text.inputEl.focus();
        text.inputEl.select();
      }, 0);
    });
    new import_obsidian3.Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton((b) => {
      var _a;
      return b.setButtonText((_a = this.opts.cta) != null ? _a : "Save").setCta().onClick(submit);
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var ConfirmModal = class extends import_obsidian3.Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts;
  }
  onOpen() {
    this.titleEl.setText(this.opts.title);
    this.contentEl.createEl("p", { text: this.opts.body });
    new import_obsidian3.Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton(
      (b) => b.setButtonText(this.opts.cta).setWarning().onClick(() => {
        this.close();
        this.opts.onConfirm();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var BulkEditModal = class extends import_obsidian3.Modal {
  constructor(app, count, onApply) {
    super(app);
    this.prop = "";
    this.op = "set";
    this.value = "";
    this.count = count;
    this.onApply = onApply;
  }
  onOpen() {
    this.titleEl.setText(`Bulk edit ${this.count} note${this.count === 1 ? "" : "s"}`);
    let valueSetting = null;
    new import_obsidian3.Setting(this.contentEl).setName("Property").setDesc("Frontmatter key to change on every note in the current view.").addText((t) => t.setPlaceholder("status").setValue(this.prop).onChange((v) => this.prop = v.trim()));
    new import_obsidian3.Setting(this.contentEl).setName("Operation").addDropdown((dd) => {
      dd.addOption("set", "Set to value");
      dd.addOption("clear", "Clear (remove)");
      dd.addOption("toggle", "Toggle true/false");
      dd.setValue(this.op).onChange((v) => {
        this.op = v;
        if (valueSetting) valueSetting.settingEl.toggleClass("bpp-hidden", this.op !== "set");
      });
    });
    valueSetting = new import_obsidian3.Setting(this.contentEl).setName("Value").addText((t) => t.setPlaceholder("done").setValue(this.value).onChange((v) => this.value = v));
    new import_obsidian3.Setting(this.contentEl).addButton((b) => b.setButtonText("Cancel").onClick(() => this.close())).addButton(
      (b) => b.setButtonText(`Apply to ${this.count}`).setCta().onClick(() => {
        if (!this.prop) return;
        this.close();
        this.onApply(this.prop, this.op, this.value);
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/query/inlineEdit.ts
var NUMERIC_FIELDS = /* @__PURE__ */ new Set(["priority", "order", "weight", "estimate", "progress"]);
var LIST_FIELDS = /* @__PURE__ */ new Set(["tags", "aliases", "owners"]);
function coerceFieldInput(field, raw, previous) {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { value: null, remove: true };
  const key = field.trim().toLowerCase();
  if (LIST_FIELDS.has(key) || Array.isArray(previous)) {
    const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
    const deduped = [...new Set(parts)];
    return { value: deduped, remove: deduped.length === 0 };
  }
  const numericField = NUMERIC_FIELDS.has(key) || typeof previous === "number";
  if (numericField && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { value: Number(trimmed), remove: false };
  }
  if (trimmed === "true" || trimmed === "false") {
    if (typeof previous === "boolean") return { value: trimmed === "true", remove: false };
  }
  return { value: trimmed, remove: false };
}
function formatFieldForEdit(value) {
  return toStr(value);
}

// src/views/abstractView.ts
var PowerPackView = class extends import_obsidian4.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.renderToken = 0;
    this.plugin = plugin;
    this.scheduleRender = (0, import_obsidian4.debounce)(() => void this.render(), 120, false);
  }
  async onOpen() {
    await this.render();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRender()));
  }
  async onClose() {
    this.scheduleRender.cancel();
    this.contentEl.empty();
  }
  /** True when a newer render has started since `token` was taken. */
  isStale(token) {
    return token !== this.renderToken;
  }
  openRow(row) {
    const file = this.fileFor(row);
    if (file) void this.app.workspace.getLeaf(false).openFile(file);
  }
  openRowToRight(row) {
    const file = this.fileFor(row);
    if (file) void this.app.workspace.getLeaf("split").openFile(file);
  }
  fileFor(row) {
    const file = this.app.vault.getAbstractFileByPath(row.id);
    return file instanceof import_obsidian4.TFile ? file : null;
  }
  /**
   * Add the per-note actions common to every view — open, open-to-the-right,
   * edit each configured card field, rename, delete — to a context menu. Callers
   * (Kanban card menu, Calendar event menu, Gantt bar menu) can add their own
   * view-specific items around these. `after` re-renders the calling view once a
   * mutation lands.
   */
  addCommonRowMenuItems(menu, row, fields, after) {
    menu.addItem((i) => i.setTitle("Open").setIcon("file").onClick(() => this.openRow(row)));
    menu.addItem(
      (i) => i.setTitle("Open to the right").setIcon("separator-vertical").onClick(() => this.openRowToRight(row))
    );
    if (fields.length > 0) {
      menu.addSeparator();
      for (const field of fields) {
        menu.addItem(
          (i) => i.setTitle(`Edit ${field}\u2026`).setIcon("pencil").onClick(() => this.editFieldViaModal(row, field, after))
        );
      }
    }
    menu.addSeparator();
    menu.addItem(
      (i) => i.setTitle("Rename note\u2026").setIcon("text-cursor-input").onClick(() => this.renameNote(row, after))
    );
    menu.addItem((i) => i.setTitle("Delete note").setIcon("trash").onClick(() => this.confirmDeleteNote(row, after)));
  }
  editFieldViaModal(row, field, after) {
    const previous = row.note.frontmatter[field];
    new PromptModal(this.app, {
      title: `Edit "${field}"`,
      value: formatFieldForEdit(previous),
      placeholder: field,
      onSubmit: (v) => {
        const { value, remove } = coerceFieldInput(field, v, previous);
        void writeRowProperty(this.plugin, row.id, field, value, remove, { label: `Edit "${field}"` }).then(after);
      }
    }).open();
  }
  renameNote(row, after) {
    const file = this.fileFor(row);
    if (!file) return;
    new PromptModal(this.app, {
      title: "Rename note",
      value: file.basename,
      cta: "Rename",
      onSubmit: (name) => {
        var _a;
        const clean = name.trim();
        if (!clean || clean === file.basename) return;
        const parent = ((_a = file.parent) == null ? void 0 : _a.path) ? `${file.parent.path}/` : "";
        const target = (0, import_obsidian4.normalizePath)(`${parent}${clean}.${file.extension}`);
        this.app.fileManager.renameFile(file, target).then(() => {
          this.plugin.invalidateSnapshot();
          after();
        }).catch((e) => new import_obsidian4.Notice(`Rename failed: ${String(e)}`));
      }
    }).open();
  }
  confirmDeleteNote(row, after) {
    const file = this.fileFor(row);
    if (!file) return;
    new ConfirmModal(this.app, {
      title: "Delete note?",
      body: `"${file.basename}" will be moved to trash.`,
      cta: "Delete",
      onConfirm: () => {
        this.app.fileManager.trashFile(file).then(() => {
          this.plugin.invalidateSnapshot();
          after();
        }).catch((e) => new import_obsidian4.Notice(`Delete failed: ${String(e)}`));
      }
    }).open();
  }
  openSettings() {
    var _a, _b;
    const setting = this.app.setting;
    (_a = setting == null ? void 0 : setting.open) == null ? void 0 : _a.call(setting);
    (_b = setting == null ? void 0 : setting.openTabById) == null ? void 0 : _b.call(setting, this.plugin.manifest.id);
  }
  renderUpgradeNotice(container, emoji, title, body) {
    const box = container.createDiv({ cls: "bpp-upgrade" });
    box.createEl("h3", { text: `${emoji} ${title}` });
    box.createEl("p", { text: body });
    const btn = box.createEl("button", { text: "Enter license key in settings", cls: "mod-cta" });
    btn.addEventListener("click", () => this.openSettings());
  }
};

// src/query/search.ts
function normalize(value) {
  return toStr(value).trim().toLocaleLowerCase();
}
function rowMatchesText(row, query, extra = []) {
  const q = normalize(query);
  if (!q) return true;
  const haystacks = [row.name, row.note.path, row.note.folder, ...row.note.tags, ...extra];
  return haystacks.some((value) => normalize(value).includes(q));
}
function filterRowsByText(rows, query) {
  if (!query.trim()) return rows;
  return rows.filter((row) => rowMatchesText(row, query));
}

// src/query/kanban.ts
function buildKanbanColumns(rows, options) {
  var _a, _b, _c;
  const groupBy = options.groupBy || "status";
  const search = normalize2(options.search);
  const hidden = normalize2(options.hideColumn);
  const columns = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const columnName = toStr(row.scope.get(groupBy));
    if (!columnName) continue;
    if (hidden && normalize2(columnName) === hidden) continue;
    if (search && !matchesSearch(row, search, columnName)) continue;
    if (!columns.has(columnName)) columns.set(columnName, []);
    (_a = columns.get(columnName)) == null ? void 0 : _a.push(row);
  }
  if (!search) {
    for (const name of (_b = options.extraColumns) != null ? _b : []) {
      const clean = name.trim();
      if (!clean || columns.has(clean)) continue;
      if (hidden && normalize2(clean) === hidden) continue;
      columns.set(clean, []);
    }
  }
  const entries = Array.from(columns.entries());
  const order = (_c = options.columnOrder) != null ? _c : [];
  if (order.length > 0) {
    const rank = new Map(order.map((name, index) => [name, index]));
    entries.sort((a, b) => {
      var _a2, _b2;
      return ((_a2 = rank.get(a[0])) != null ? _a2 : Infinity) - ((_b2 = rank.get(b[0])) != null ? _b2 : Infinity);
    });
  }
  return entries.map(([name, items]) => {
    var _a2;
    return {
      name,
      rows: sortRows(items, (_a2 = options.sortBy) != null ? _a2 : "manual")
    };
  });
}
function reorderColumns(order, moved, target) {
  if (moved === target) return [...order];
  const without = order.filter((name) => name !== moved);
  const targetIndex = without.indexOf(target);
  if (targetIndex === -1) return [...order];
  without.splice(targetIndex, 0, moved);
  return without;
}
function columnHue(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = hash * 31 + name.charCodeAt(i) >>> 0;
  }
  return hash % 360;
}
function matchesSearch(row, search, columnName) {
  return rowMatchesText(row, search, [columnName]);
}
function sortRows(rows, sortBy) {
  const copy = [...rows];
  if (sortBy === "manual") return copy;
  copy.sort((a, b) => compareRows(a, b, sortBy));
  return copy;
}
function compareRows(a, b, sortBy) {
  switch (sortBy) {
    case "name-asc":
      return compareText(a.name, b.name);
    case "name-desc":
      return compareText(b.name, a.name);
    case "due-asc":
      return compareDateValue(a.scope.get("due"), b.scope.get("due")) || compareText(a.name, b.name);
    case "priority-desc":
      return compareNumberValue(b.scope.get("priority"), a.scope.get("priority")) || compareText(a.name, b.name);
    case "mtime-desc":
      return compareNumberValue(b.scope.get("file.mtime"), a.scope.get("file.mtime")) || compareText(a.name, b.name);
    default:
      return 0;
  }
}
function compareText(a, b) {
  return a.localeCompare(b, void 0, { sensitivity: "base" });
}
function compareNumberValue(a, b) {
  const av = numberOrNull(a);
  const bv = numberOrNull(b);
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return av - bv;
}
function compareDateValue(a, b) {
  const av = timeOrNull(a);
  const bv = timeOrNull(b);
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return av - bv;
}
function timeOrNull(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
function numberOrNull(value) {
  if (value === void 0 || value === null || value === "") return null;
  const n = toNumber(value);
  return Number.isFinite(n) ? n : null;
}
function formatCardField(row, field) {
  const value = row.scope.get(field);
  if (value === void 0 || value === null || value === "") return null;
  if (Array.isArray(value)) {
    const parts = value.map((item) => toStr(item)).filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return toStr(value) || null;
}
function normalize2(value) {
  return toStr(value).trim().toLocaleLowerCase();
}

// src/query/kanbanActions.ts
function buildQuickAddPath(folder, title) {
  const cleanFolder = trimSlashes(folder.trim());
  const cleanTitle = title.trim() || "Untitled";
  return cleanFolder ? `${cleanFolder}/${cleanTitle}.md` : `${cleanTitle}.md`;
}
function buildQuickAddContent(groupBy, columnName, title) {
  const key = groupBy || "status";
  const heading = title.trim() || `New ${columnName}`;
  return `---
${key}: ${JSON.stringify(columnName)}
---

# ${heading}
`;
}
function buildQuickAddTitle(columnName, now = /* @__PURE__ */ new Date()) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `New ${columnName} ${yyyy}-${mm}-${dd} ${hh}-${mi}`;
}
function trimSlashes(value) {
  return value.replace(/^[/\\]+|[/\\]+$/g, "");
}

// src/query/wip.ts
function sanitizeWipLimit(raw) {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  const int = Math.floor(n);
  return int > 0 ? int : null;
}
function limitFor(limits, columnName) {
  return sanitizeWipLimit(limits[columnName]);
}
function isOverWip(count, limit) {
  return limit !== null && count > limit;
}
function dropWouldExceed(targetCount, limit) {
  return limit !== null && targetCount + 1 > limit;
}
function formatWipCount(count, limit) {
  return limit !== null ? `${count} / ${limit}` : String(count);
}

// src/views/viewChrome.ts
function renderSearchControl(container, current, onInput) {
  const wrap = container.createDiv({ cls: "bpp-lite-control" });
  wrap.createSpan({ cls: "bpp-muted", text: "Search" });
  const input = wrap.createEl("input", {
    type: "search",
    cls: "bpp-lite-input",
    placeholder: "Filter notes\u2026"
  });
  input.value = current;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}
function renderContextControls(container, plugin, resolved, onChange) {
  const bar = container.createDiv({ cls: "bpp-context" });
  bar.createSpan({
    cls: "bpp-muted",
    text: resolved.baseLabel ? `Base: ${resolved.baseLabel}` : "Base: all notes"
  });
  if (!plugin.settings.isPro) return;
  const filters = plugin.settings.savedFilters;
  if (filters.length === 0) return;
  bar.createSpan({ cls: "bpp-muted bpp-context-filter-label", text: "Filter:" });
  const select = bar.createEl("select", { cls: "bpp-filter-select" });
  select.createEl("option", { text: "None", value: "" });
  for (const f of filters) {
    const opt = select.createEl("option", { text: f.name, value: f.id });
    if (f.id === plugin.settings.activeFilterId) opt.selected = true;
  }
  select.addEventListener("change", () => {
    plugin.settings.activeFilterId = select.value;
    void plugin.saveSettings().then(onChange);
  });
}
function renderRollupBar(container, plugin, rows) {
  if (!plugin.settings.isPro || plugin.settings.rollups.length === 0) return;
  const bar = container.createDiv({ cls: "bpp-rollup-bar" });
  for (const rollup of plugin.settings.rollups) {
    const chip = bar.createDiv({ cls: "bpp-rollup" });
    chip.createSpan({ cls: "bpp-rollup-label", text: rollup.label || rollup.aggregation });
    chip.createSpan({ cls: "bpp-rollup-value", text: computeRollup(rollup, rows) });
  }
}

// src/views/kanbanView.ts
var VIEW_TYPE_KANBAN = "bpp-kanban-view";
var SORT_OPTIONS = [
  { value: "manual", label: "Default order" },
  { value: "name-asc", label: "Name \u2191" },
  { value: "name-desc", label: "Name \u2193" },
  { value: "due-asc", label: "Due date" },
  { value: "priority-desc", label: "Priority" },
  { value: "mtime-desc", label: "Recently changed" }
];
var KanbanView = class extends PowerPackView {
  constructor() {
    super(...arguments);
    this.search = "";
    this.hideDoneColumn = false;
    this.sortBy = "manual";
    /** The live search input, so a re-render can tell whether it had focus before
     * container.empty() destroys it, and hand focus back to its replacement. */
    this.searchInputEl = null;
    this.restoreSearchFocus = false;
    /** The currently visible (filtered) rows, captured for the bulk-edit action. */
    this.lastVisibleRows = [];
  }
  getViewType() {
    return VIEW_TYPE_KANBAN;
  }
  getDisplayText() {
    return "Power Pack: Kanban";
  }
  getIcon() {
    return "layout-dashboard";
  }
  async onClose() {
    this.searchInputEl = null;
    await super.onClose();
  }
  async render() {
    var _a, _b;
    const token = ++this.renderToken;
    const resolved = await resolveViewRows(this.app, this.plugin);
    if (this.isStale(token)) return;
    const groupBy = this.plugin.settings.kanbanGroupBy || "status";
    const container = this.contentEl;
    this.restoreSearchFocus = this.searchInputEl !== null && this.searchInputEl.ownerDocument.activeElement === this.searchInputEl;
    container.empty();
    container.addClass("bpp-view");
    const header = container.createDiv({ cls: "bpp-toolbar" });
    header.createEl("h3", { text: "Kanban" });
    header.createEl("span", { cls: "bpp-badge bpp-badge-lite", text: "Lite" });
    header.createEl("span", { cls: "bpp-muted", text: `grouped by "${groupBy}"` });
    renderContextControls(container, this.plugin, resolved, () => void this.render());
    this.renderLiteControls(container, resolved.rows);
    renderRollupBar(container, this.plugin, resolved.rows);
    const extraColumns = (_a = this.plugin.settings.kanbanExtraColumns[groupBy]) != null ? _a : [];
    const columns = buildKanbanColumns(resolved.rows, {
      groupBy,
      search: this.search,
      hideColumn: this.hideDoneColumn ? "done" : "",
      sortBy: this.sortBy,
      extraColumns,
      columnOrder: (_b = this.plugin.settings.kanbanColumnOrder[groupBy]) != null ? _b : []
    });
    this.lastVisibleRows = columns.flatMap((column) => column.rows);
    const orderedNames = columns.map((column) => column.name);
    const colored = this.plugin.settings.kanbanColorColumns;
    const board = container.createDiv({ cls: "bpp-kanban-board" });
    if (colored) board.addClass("is-colored");
    const rowById = new Map(resolved.rows.map((row) => [row.id, row]));
    if (columns.length === 0) {
      board.createDiv({
        cls: "bpp-empty",
        text: this.search || this.hideDoneColumn ? "No cards match the current lite filters." : `No notes with a "${groupBy}" property found. Add "${groupBy}: To Do" to a note's frontmatter, or add a column below.`
      });
      if (!this.search) this.renderAddColumnTile(board, groupBy);
      return;
    }
    const cardFormula = this.plugin.settings.isPro ? this.plugin.settings.cardFormula.trim() : "";
    const metaFields = this.plugin.settings.kanbanCardFields;
    for (const column of columns) {
      const col = board.createDiv({ cls: "bpp-kanban-column" });
      if (colored) col.setCssProps({ "--bpp-col-hue": this.columnHueFor(column.name) });
      this.wireColumnDrop(col, column.name, groupBy, rowById, orderedNames);
      const colHead = col.createDiv({ cls: "bpp-kanban-column-head" });
      this.makeColumnDraggable(col, colHead, column.name);
      const removable = column.rows.length === 0 && extraColumns.includes(column.name);
      colHead.addEventListener(
        "contextmenu",
        (evt) => this.openColumnMenu(evt, column.name, groupBy, removable)
      );
      const wipLimit = limitFor(this.plugin.settings.kanbanWipLimits, column.name);
      if (isOverWip(column.rows.length, wipLimit)) col.addClass("is-over-wip");
      const colLabel = colHead.createDiv({ cls: "bpp-kanban-column-label" });
      colLabel.createSpan({ text: column.name });
      const count = colLabel.createSpan({
        cls: "bpp-count",
        text: formatWipCount(column.rows.length, wipLimit)
      });
      if (wipLimit !== null) {
        count.addClass("has-wip");
        count.setAttr("title", `${column.rows.length} of ${wipLimit} (WIP limit)`);
      }
      const actions = colHead.createDiv({ cls: "bpp-column-actions" });
      const addButton = actions.createEl("button", {
        cls: "bpp-column-add",
        text: "+",
        attr: { "aria-label": `Add note to ${column.name}` }
      });
      addButton.addEventListener("click", () => void this.quickAddNote(column.name, groupBy));
      if (column.rows.length === 0 && extraColumns.includes(column.name)) {
        const removeButton = actions.createEl("button", {
          cls: "bpp-column-remove",
          text: "\xD7",
          attr: { "aria-label": `Remove column ${column.name}` }
        });
        removeButton.addEventListener("click", () => void this.removeExtraColumn(groupBy, column.name));
      }
      for (const row of column.rows) {
        const card = col.createDiv({ cls: "bpp-card" });
        card.draggable = true;
        card.createDiv({ cls: "bpp-card-title", text: row.name });
        for (const field of metaFields) {
          const display = formatCardField(row, field);
          if (display === null) continue;
          this.renderEditableField(card, row, field, display);
        }
        if (cardFormula) {
          const val = evaluateSafe(cardFormula, row.scope);
          if (val !== null && toStr(val) !== "") {
            card.createDiv({ cls: "bpp-card-meta bpp-card-meta-premium", text: toStr(val) });
          }
        }
        card.addEventListener("dragstart", (event) => {
          var _a2, _b2;
          card.addClass("is-dragging");
          (_a2 = event.dataTransfer) == null ? void 0 : _a2.setData("text/plain", row.id);
          (_b2 = event.dataTransfer) == null ? void 0 : _b2.setData("application/x-bpp-row", row.id);
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        });
        card.addEventListener("dragend", () => card.removeClass("is-dragging"));
        card.addEventListener("click", () => this.openRow(row));
        card.addEventListener("contextmenu", (evt) => this.openCardMenu(evt, row, groupBy, orderedNames));
      }
    }
    if (!this.search) this.renderAddColumnTile(board, groupBy);
  }
  renderAddColumnTile(board, groupBy) {
    const tile = board.createDiv({ cls: "bpp-kanban-column bpp-kanban-add-column" });
    const form = tile.createDiv({ cls: "bpp-add-column-form" });
    const input = form.createEl("input", {
      type: "text",
      cls: "bpp-lite-input",
      placeholder: "New column\u2026",
      attr: { "aria-label": `Add a new "${groupBy}" column` }
    });
    const button = form.createEl("button", { cls: "bpp-add-column-btn", text: "+ Add column" });
    const commit = () => {
      const name = input.value.trim();
      if (!name) return;
      void this.addExtraColumn(groupBy, name);
    };
    button.addEventListener("click", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    });
  }
  async addExtraColumn(groupBy, name) {
    var _a;
    const map = this.plugin.settings.kanbanExtraColumns;
    const existing = (_a = map[groupBy]) != null ? _a : [];
    if (!existing.some((n) => n.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      map[groupBy] = [...existing, name];
      await this.plugin.saveSettings();
    }
    await this.render();
  }
  async removeExtraColumn(groupBy, name) {
    var _a;
    const map = this.plugin.settings.kanbanExtraColumns;
    const next = ((_a = map[groupBy]) != null ? _a : []).filter((n) => n !== name);
    if (next.length > 0) map[groupBy] = next;
    else delete map[groupBy];
    await this.plugin.saveSettings();
    await this.render();
  }
  /** A card metadata line the user can click to edit the underlying frontmatter. */
  renderEditableField(card, row, field, display) {
    const line = card.createDiv({ cls: "bpp-card-meta bpp-card-meta-editable" });
    line.createSpan({ cls: "bpp-card-meta-key", text: `${field}:` });
    line.createSpan({ cls: "bpp-card-meta-val", text: display });
    line.setAttr("title", "Click to edit");
    line.addEventListener("click", (event) => {
      event.stopPropagation();
      this.beginInlineEdit(card, line, row, field);
    });
  }
  /** Swap a metadata line for an input, committing the parsed value on Enter/blur. */
  beginInlineEdit(card, line, row, field) {
    const previous = row.note.frontmatter[field];
    card.draggable = false;
    line.empty();
    line.removeClass("bpp-card-meta-editable");
    const input = line.createEl("input", { cls: "bpp-inline-edit", type: "text" });
    input.value = formatFieldForEdit(previous);
    input.focus();
    input.select();
    let settled = false;
    const commit = async () => {
      if (settled) return;
      settled = true;
      const { value, remove } = coerceFieldInput(field, input.value, previous);
      await writeRowProperty(this.plugin, row.id, field, value, remove, { label: `Edit "${field}"` });
      await this.render();
    };
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void commit();
      } else if (event.key === "Escape") {
        event.preventDefault();
        settled = true;
        void this.render();
      }
    });
    input.addEventListener("blur", () => void commit());
  }
  columnHueFor(name) {
    var _a;
    return (_a = this.plugin.settings.kanbanColorOverrides[name]) != null ? _a : String(columnHue(name));
  }
  // ---- context menus --------------------------------------------------------
  openCardMenu(evt, row, groupBy, columns) {
    evt.preventDefault();
    const menu = new import_obsidian5.Menu();
    const after = () => void this.render();
    const current = toStr(row.scope.get(groupBy));
    const others = columns.filter((c) => c !== current);
    if (others.length > 0) {
      for (const col of others) {
        menu.addItem(
          (i) => i.setTitle(`Move to "${col}"`).setIcon("arrow-right").onClick(() => void this.moveRowToColumn(row, groupBy, col))
        );
      }
      menu.addSeparator();
    }
    this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, after);
    menu.showAtMouseEvent(evt);
  }
  openColumnMenu(evt, columnName, groupBy, removable) {
    evt.preventDefault();
    const menu = new import_obsidian5.Menu();
    menu.addItem((i) => i.setTitle("Add note").setIcon("plus").onClick(() => void this.quickAddNote(columnName, groupBy)));
    menu.addItem((i) => i.setTitle("Rename column\u2026").setIcon("pencil").onClick(() => this.renameColumnValue(groupBy, columnName)));
    menu.addItem(
      (i) => i.setTitle("Set WIP limit\u2026").setIcon("gauge").onClick(() => this.setWipLimit(columnName))
    );
    menu.addSeparator();
    const swatches = [
      ["Red", 0],
      ["Orange", 30],
      ["Yellow", 50],
      ["Green", 130],
      ["Teal", 175],
      ["Blue", 215],
      ["Purple", 270],
      ["Pink", 320]
    ];
    for (const [label, hue] of swatches) {
      menu.addItem((i) => i.setTitle(label).setIcon("circle").onClick(() => void this.setColumnColor(columnName, hue)));
    }
    menu.addItem((i) => i.setTitle("Reset color").onClick(() => void this.setColumnColor(columnName, null)));
    if (removable) {
      menu.addSeparator();
      menu.addItem(
        (i) => i.setTitle("Remove empty column").setIcon("trash").onClick(() => void this.removeExtraColumn(groupBy, columnName))
      );
    }
    menu.showAtMouseEvent(evt);
  }
  // ---- menu actions ---------------------------------------------------------
  /** Prompt for a column's WIP limit; a blank or non-positive entry clears it. */
  setWipLimit(columnName) {
    const current = this.plugin.settings.kanbanWipLimits[columnName];
    new PromptModal(this.app, {
      title: `WIP limit for "${columnName}"`,
      value: current ? String(current) : "",
      placeholder: "e.g. 5 (blank = no limit)",
      cta: "Save",
      onSubmit: (v) => void this.applyWipLimit(columnName, sanitizeWipLimit(v))
    }).open();
  }
  async applyWipLimit(columnName, limit) {
    const map = this.plugin.settings.kanbanWipLimits;
    if (limit === null) delete map[columnName];
    else map[columnName] = limit;
    await this.plugin.saveSettings();
    await this.render();
  }
  async setColumnColor(columnName, hue) {
    const map = this.plugin.settings.kanbanColorOverrides;
    if (hue === null) delete map[columnName];
    else map[columnName] = String(hue);
    await this.plugin.saveSettings();
    await this.render();
  }
  renameColumnValue(groupBy, columnName) {
    new PromptModal(this.app, {
      title: `Rename column "${columnName}"`,
      value: columnName,
      placeholder: "New value",
      cta: "Rename",
      onSubmit: (next) => void this.applyColumnRename(groupBy, columnName, next.trim())
    }).open();
  }
  /** Rewrite the group property from `from` to `to` on every note in that column. */
  async applyColumnRename(groupBy, from, to) {
    if (!to || to === from) return;
    const key = groupBy || "status";
    const targets = this.plugin.getNotesSnapshot().filter((n) => toStr(n.frontmatter[key]) === from);
    let ok = 0;
    const batch = this.plugin.undo.beginBatch(`Rename column "${from}" \u2192 "${to}"`);
    for (const note of targets) {
      if (await writeRowProperties(this.plugin, note.path, [{ key, value: to }], { batch })) ok++;
    }
    this.plugin.undo.commitBatch(batch);
    const overrides = this.plugin.settings.kanbanColorOverrides;
    if (overrides[from] !== void 0) {
      overrides[to] = overrides[from];
      delete overrides[from];
    }
    const order = this.plugin.settings.kanbanColumnOrder[groupBy];
    if (order) this.plugin.settings.kanbanColumnOrder[groupBy] = order.map((n) => n === from ? to : n);
    const wip = this.plugin.settings.kanbanWipLimits;
    if (wip[from] !== void 0) {
      wip[to] = wip[from];
      delete wip[from];
    }
    await this.plugin.saveSettings();
    new import_obsidian5.Notice(`Renamed "${from}" \u2192 "${to}" on ${ok} note${ok === 1 ? "" : "s"}.`);
    await this.render();
  }
  // ---- bulk edit ------------------------------------------------------------
  openBulkEdit() {
    const rows = this.lastVisibleRows;
    if (rows.length === 0) {
      new import_obsidian5.Notice("No cards to edit.");
      return;
    }
    new BulkEditModal(this.app, rows.length, (prop, op, value) => void this.applyBulk(rows, prop, op, value)).open();
  }
  async applyBulk(rows, prop, op, value) {
    let ok = 0;
    const batch = this.plugin.undo.beginBatch(
      `Bulk ${op} "${prop}" on ${rows.length} note${rows.length === 1 ? "" : "s"}`
    );
    for (const row of rows) {
      const write = op === "clear" ? { key: prop, remove: true } : op === "toggle" ? { key: prop, value: !toBool(row.note.frontmatter[prop]) } : { key: prop, value: coerceLiteral(value) };
      if (await writeRowProperties(this.plugin, row.id, [write], { batch })) ok++;
    }
    this.plugin.undo.commitBatch(batch);
    new import_obsidian5.Notice(`Updated "${prop}" on ${ok} note${ok === 1 ? "" : "s"}.`);
    await this.render();
  }
  collectGroupByOptions(rows, current) {
    const set = /* @__PURE__ */ new Set();
    for (const row of rows) {
      for (const key of Object.keys(row.note.frontmatter)) set.add(key);
    }
    if (current) set.add(current);
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  renderLiteControls(container, rows) {
    const controls = container.createDiv({ cls: "bpp-lite-controls" });
    const groupBy = this.plugin.settings.kanbanGroupBy || "status";
    const groupWrap = controls.createDiv({ cls: "bpp-lite-control" });
    groupWrap.createSpan({ cls: "bpp-muted", text: "Group by" });
    const groupSelect = groupWrap.createEl("select", { cls: "bpp-lite-select" });
    for (const option of this.collectGroupByOptions(rows, groupBy)) {
      const el = groupSelect.createEl("option", { text: option, value: option });
      if (option === groupBy) el.selected = true;
    }
    groupSelect.addEventListener("change", () => {
      this.plugin.settings.kanbanGroupBy = groupSelect.value || "status";
      void this.plugin.saveSettings().then(() => this.render());
    });
    const searchWrap = controls.createDiv({ cls: "bpp-lite-control" });
    searchWrap.createSpan({ cls: "bpp-muted", text: "Search" });
    const searchInput = searchWrap.createEl("input", {
      type: "search",
      cls: "bpp-lite-input",
      placeholder: "Filter cards\u2026"
    });
    searchInput.value = this.search;
    this.searchInputEl = searchInput;
    searchInput.addEventListener("input", () => {
      this.search = searchInput.value;
      void this.render();
    });
    if (this.restoreSearchFocus) {
      this.restoreSearchFocus = false;
      searchInput.focus();
      const end = searchInput.value.length;
      searchInput.setSelectionRange(end, end);
    }
    const sortWrap = controls.createDiv({ cls: "bpp-lite-control" });
    sortWrap.createSpan({ cls: "bpp-muted", text: "Sort" });
    const sortSelect = sortWrap.createEl("select", { cls: "bpp-lite-select" });
    for (const option of SORT_OPTIONS) {
      const el = sortSelect.createEl("option", { text: option.label, value: option.value });
      if (option.value === this.sortBy) el.selected = true;
    }
    sortSelect.addEventListener("change", () => {
      this.sortBy = sortSelect.value;
      void this.render();
    });
    const toggleWrap = controls.createDiv({ cls: "bpp-lite-control bpp-lite-control-toggle" });
    const toggle = toggleWrap.createEl("input", { type: "checkbox" });
    toggle.checked = this.hideDoneColumn;
    toggle.addEventListener("change", () => {
      this.hideDoneColumn = toggle.checked;
      void this.render();
    });
    toggleWrap.createSpan({ cls: "bpp-muted", text: "Hide done" });
    const bulkWrap = controls.createDiv({ cls: "bpp-lite-control" });
    const bulkBtn = bulkWrap.createEl("button", { cls: "bpp-lite-btn", text: "Bulk edit" });
    bulkBtn.setAttr("aria-label", "Bulk edit the visible cards");
    bulkBtn.addEventListener("click", () => this.openBulkEdit());
  }
  /** The whole column is a drop target for two kinds of drag: a card (move the
   * note to this column) and a column header (reorder columns). They are told
   * apart by the dataTransfer type. */
  wireColumnDrop(columnEl, columnName, groupBy, rowById, orderedNames) {
    columnEl.addEventListener("dragover", (event) => {
      var _a, _b;
      const isColumn = ((_b = (_a = event.dataTransfer) == null ? void 0 : _a.types) != null ? _b : []).includes("application/x-bpp-column");
      event.preventDefault();
      columnEl.addClass(isColumn ? "is-col-drop-target" : "is-drop-target");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });
    columnEl.addEventListener("dragleave", () => {
      columnEl.removeClass("is-drop-target");
      columnEl.removeClass("is-col-drop-target");
    });
    columnEl.addEventListener("drop", (event) => {
      var _a, _b, _c;
      event.preventDefault();
      columnEl.removeClass("is-drop-target");
      columnEl.removeClass("is-col-drop-target");
      const draggedColumn = (_a = event.dataTransfer) == null ? void 0 : _a.getData("application/x-bpp-column");
      if (draggedColumn) {
        void this.reorderColumn(groupBy, orderedNames, draggedColumn, columnName);
        return;
      }
      const rowId = ((_b = event.dataTransfer) == null ? void 0 : _b.getData("application/x-bpp-row")) || ((_c = event.dataTransfer) == null ? void 0 : _c.getData("text/plain"));
      if (!rowId) return;
      const row = rowById.get(rowId);
      if (!row) return;
      void this.moveRowToColumn(row, groupBy, columnName);
    });
  }
  makeColumnDraggable(columnEl, colHead, columnName) {
    colHead.draggable = true;
    colHead.addEventListener("dragstart", (event) => {
      var _a;
      columnEl.addClass("is-col-dragging");
      (_a = event.dataTransfer) == null ? void 0 : _a.setData("application/x-bpp-column", columnName);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    colHead.addEventListener("dragend", () => columnEl.removeClass("is-col-dragging"));
  }
  async reorderColumn(groupBy, orderedNames, moved, target) {
    const next = reorderColumns(orderedNames, moved, target);
    this.plugin.settings.kanbanColumnOrder[groupBy] = next;
    await this.plugin.saveSettings();
    await this.render();
  }
  /**
   * Move a card to a column: write the group property, then apply any premium
   * Move Rules that fire on entering this value — all in one transaction. The
   * rules read the note's pre-move frontmatter, so an automation write never
   * re-triggers another rule.
   */
  async moveRowToColumn(row, groupBy, columnName) {
    const key = groupBy || "status";
    if (toStr(row.scope.get(key)) === columnName) return;
    if (this.plugin.settings.kanbanBlockOverWip) {
      const limit = limitFor(this.plugin.settings.kanbanWipLimits, columnName);
      const targetCount = this.lastVisibleRows.filter((r) => toStr(r.scope.get(key)) === columnName).length;
      if (dropWouldExceed(targetCount, limit)) {
        new import_obsidian5.Notice(`"${columnName}" is at its WIP limit (${limit}). Move blocked.`);
        await this.render();
        return;
      }
    }
    const writes = [{ key, value: columnName }];
    if (this.plugin.settings.isPro) {
      const matched = rulesForTransition(this.plugin.settings.automations, key, columnName);
      writes.push(...computeRuleWrites(matched, row.note.frontmatter, /* @__PURE__ */ new Date()));
    }
    const ok = await writeRowProperties(this.plugin, row.id, writes, { label: `Move to "${columnName}"` });
    if (ok && writes.length > 1) {
      const n = writes.length - 1;
      new import_obsidian5.Notice(`Moved to "${columnName}" \xB7 ${n} automation write${n === 1 ? "" : "s"}.`);
    }
    await this.render();
  }
  async quickAddNote(columnName, groupBy) {
    const title = buildQuickAddTitle(columnName);
    const basePath = (0, import_obsidian5.normalizePath)(buildQuickAddPath(this.plugin.settings.kanbanQuickAddFolder, title));
    const path = await this.makeUniquePath(basePath);
    await this.ensureFolder(path);
    const file = await this.app.vault.create(path, buildQuickAddContent(groupBy, columnName, title));
    new import_obsidian5.Notice(`Created ${file.basename}`);
    await this.app.workspace.getLeaf("tab").openFile(file);
    await this.render();
  }
  async ensureFolder(path) {
    const parts = path.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const normalized = (0, import_obsidian5.normalizePath)(current);
      if (!normalized) continue;
      if (this.app.vault.getAbstractFileByPath(normalized)) continue;
      await this.app.vault.createFolder(normalized);
    }
  }
  async makeUniquePath(basePath) {
    if (!this.app.vault.getAbstractFileByPath(basePath)) return basePath;
    const suffix = ".md";
    const stem = basePath.endsWith(suffix) ? basePath.slice(0, -suffix.length) : basePath;
    for (let i = 2; i < 1e3; i++) {
      const candidate = `${stem} ${i}${suffix}`;
      if (!this.app.vault.getAbstractFileByPath(candidate)) return candidate;
    }
    throw new Error(`Could not find free path for ${basePath}`);
  }
};

// src/views/calendarView.ts
var import_obsidian6 = require("obsidian");
var VIEW_TYPE_CALENDAR = "bpp-calendar-view";
var DND_ROW = "application/x-bpp-row";
var CalendarView = class extends PowerPackView {
  constructor() {
    super(...arguments);
    /** Anchor day the visible period is derived from (month/week/agenda all use it). */
    this.anchor = todayIso();
    this.search = "";
    this.searchInputEl = null;
    this.restoreSearchFocus = false;
  }
  getViewType() {
    return VIEW_TYPE_CALENDAR;
  }
  getDisplayText() {
    return "Power Pack: Calendar";
  }
  getIcon() {
    return "calendar";
  }
  async onClose() {
    this.searchInputEl = null;
    await super.onClose();
  }
  get mode() {
    return this.plugin.settings.calendarViewMode;
  }
  async render() {
    const token = ++this.renderToken;
    const container = this.contentEl;
    if (!this.plugin.settings.isPro) {
      container.empty();
      container.addClass("bpp-view");
      this.renderUpgradeNotice(
        container,
        "\u{1F4C5}",
        "Calendar is a Premium view",
        "Drag notes to reschedule, click a day to create one, and switch between month, week, and agenda \u2014 unlock it with a Bases Power Pack license."
      );
      return;
    }
    const resolved = await resolveViewRows(this.app, this.plugin);
    if (this.isStale(token)) return;
    this.restoreSearchFocus = this.searchInputEl !== null && this.searchInputEl.ownerDocument.activeElement === this.searchInputEl;
    container.empty();
    container.addClass("bpp-view");
    const dateProp = this.plugin.settings.calendarDateProp || "due";
    this.renderToolbar(container, dateProp);
    renderContextControls(container, this.plugin, resolved, () => void this.render());
    renderRollupBar(container, this.plugin, resolved.rows);
    const rows = filterRowsByText(resolved.rows, this.search);
    const byDay = this.collectByDay(rows, dateProp);
    if (this.mode === "agenda") this.renderAgenda(container, byDay, dateProp);
    else if (this.mode === "week") this.renderWeek(container, byDay, dateProp);
    else this.renderMonth(container, byDay, dateProp);
    if (rows.length === 0 && this.search && this.mode !== "agenda") {
      container.createDiv({ cls: "bpp-empty", text: "No notes match the current search." });
    }
  }
  // ---- toolbar --------------------------------------------------------------
  renderToolbar(container, dateProp) {
    const toolbar = container.createDiv({ cls: "bpp-toolbar" });
    toolbar.createEl("h3", { text: "Calendar" });
    toolbar.createEl("span", { cls: "bpp-badge bpp-badge-premium", text: "Premium" });
    const modes = toolbar.createDiv({ cls: "bpp-segmented" });
    const addMode = (mode, label) => {
      const btn = modes.createEl("button", { text: label, cls: "bpp-seg-btn" });
      if (this.mode === mode) btn.addClass("is-active");
      btn.addEventListener("click", () => void this.setMode(mode));
    };
    addMode("month", "Month");
    addMode("week", "Week");
    addMode("agenda", "Agenda");
    const nav = toolbar.createDiv({ cls: "bpp-cal-nav" });
    const prev = nav.createEl("button", { text: "\u2039", attr: { "aria-label": "Previous" } });
    const today = nav.createEl("button", { text: "Today", cls: "bpp-seg-btn" });
    const next = nav.createEl("button", { text: "\u203A", attr: { "aria-label": "Next" } });
    prev.addEventListener("click", () => this.shift(-1));
    next.addEventListener("click", () => this.shift(1));
    today.addEventListener("click", () => {
      this.anchor = todayIso();
      void this.render();
    });
    nav.createSpan({ cls: "bpp-cal-label", text: this.periodLabel() });
    toolbar.createSpan({ cls: "bpp-muted", text: `dates from "${dateProp}"` });
    this.searchInputEl = renderSearchControl(toolbar, this.search, (value) => {
      this.search = value;
      void this.render();
    });
    if (this.restoreSearchFocus) {
      this.restoreSearchFocus = false;
      this.searchInputEl.focus();
      const end = this.searchInputEl.value.length;
      this.searchInputEl.setSelectionRange(end, end);
    }
  }
  async setMode(mode) {
    if (this.plugin.settings.calendarViewMode === mode) return;
    this.plugin.settings.calendarViewMode = mode;
    await this.plugin.saveSettings();
    await this.render();
  }
  periodLabel() {
    if (this.mode === "week") {
      const keys = weekKeys(this.anchor);
      return `${keys[0]} \u2013 ${keys[6]}`;
    }
    if (this.mode === "agenda") return "Upcoming";
    const d = /* @__PURE__ */ new Date(`${this.anchor}T00:00:00`);
    return d.toLocaleString(void 0, { month: "long", year: "numeric" });
  }
  /** Move the visible period by one unit (month/week); agenda ignores it. */
  shift(delta) {
    if (this.mode === "week") {
      this.anchor = shiftIso(startOfWeekIso(this.anchor), delta * 7);
    } else if (this.mode === "month") {
      const d = /* @__PURE__ */ new Date(`${this.anchor}T00:00:00`);
      d.setMonth(d.getMonth() + delta, 1);
      this.anchor = todayIso(d);
    }
    void this.render();
  }
  // ---- data -----------------------------------------------------------------
  /** Map "YYYY-MM-DD" -> rows whose date property falls on that day. */
  collectByDay(rows, dateProp) {
    const map = /* @__PURE__ */ new Map();
    for (const row of rows) {
      const key = toIsoDateKey(row.scope.get(dateProp));
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  }
  // ---- month ----------------------------------------------------------------
  renderMonth(container, byDay, dateProp) {
    const grid = container.createDiv({ cls: "bpp-cal-grid" });
    for (const w of ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]) {
      grid.createDiv({ cls: "bpp-cal-weekday", text: w });
    }
    const anchor = /* @__PURE__ */ new Date(`${this.anchor}T00:00:00`);
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < startOffset; i++) grid.createDiv({ cls: "bpp-cal-cell bpp-cal-empty" });
    const today = todayIso();
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const cell = this.renderDayCell(grid, key, dateProp, byDay.get(key) || [], today);
      cell.createDiv({ cls: "bpp-cal-daynum", text: String(day) });
      this.renderCellEvents(cell, byDay.get(key) || [], dateProp);
    }
  }
  // ---- week -----------------------------------------------------------------
  renderWeek(container, byDay, dateProp) {
    const grid = container.createDiv({ cls: "bpp-cal-grid bpp-cal-week" });
    const today = todayIso();
    for (const key of weekKeys(this.anchor)) {
      grid.createDiv({ cls: "bpp-cal-weekday", text: dayLabel(key) });
    }
    for (const key of weekKeys(this.anchor)) {
      const cell = this.renderDayCell(grid, key, dateProp, byDay.get(key) || [], today);
      this.renderCellEvents(cell, byDay.get(key) || [], dateProp);
    }
  }
  /** A day cell that is a drop target for reschedule and offers a create button. */
  renderDayCell(grid, key, dateProp, _rows, today) {
    const cell = grid.createDiv({ cls: "bpp-cal-cell" });
    if (key === today) cell.addClass("is-today");
    const add = cell.createEl("button", {
      cls: "bpp-cal-add",
      text: "+",
      attr: { "aria-label": `Create a note on ${key}` }
    });
    add.addEventListener("click", (evt) => {
      evt.stopPropagation();
      void this.createOnDay(key, dateProp);
    });
    cell.addEventListener("dragover", (evt) => {
      var _a, _b;
      if (!((_b = (_a = evt.dataTransfer) == null ? void 0 : _a.types) != null ? _b : []).includes(DND_ROW)) return;
      evt.preventDefault();
      cell.addClass("is-drop-target");
      if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
    });
    cell.addEventListener("dragleave", () => cell.removeClass("is-drop-target"));
    cell.addEventListener("drop", (evt) => {
      var _a, _b;
      cell.removeClass("is-drop-target");
      const rowId = ((_a = evt.dataTransfer) == null ? void 0 : _a.getData(DND_ROW)) || ((_b = evt.dataTransfer) == null ? void 0 : _b.getData("text/plain"));
      if (!rowId) return;
      evt.preventDefault();
      void this.reschedule(rowId, dateProp, key);
    });
    return cell;
  }
  renderCellEvents(cell, rows, dateProp) {
    const colorProp = this.plugin.settings.calendarColorProp.trim();
    for (const row of rows) {
      const ev = cell.createDiv({ cls: "bpp-cal-event", text: row.name });
      if (colorProp) {
        const value = toStr(row.scope.get(colorProp));
        if (value) {
          ev.addClass("is-colored");
          ev.setCssProps({ "--bpp-col-hue": String(columnHue(value)) });
        }
      }
      ev.draggable = true;
      ev.addEventListener("dragstart", (evt) => {
        var _a, _b;
        ev.addClass("is-dragging");
        (_a = evt.dataTransfer) == null ? void 0 : _a.setData(DND_ROW, row.id);
        (_b = evt.dataTransfer) == null ? void 0 : _b.setData("text/plain", row.id);
        if (evt.dataTransfer) evt.dataTransfer.effectAllowed = "move";
      });
      ev.addEventListener("dragend", () => ev.removeClass("is-dragging"));
      ev.addEventListener("click", () => this.openRow(row));
      ev.addEventListener("contextmenu", (evt) => this.openEventMenu(evt, row, dateProp));
    }
  }
  /** Right-click menu on a calendar event — a keyboard/mouse action path that
   * doesn't require dragging (reschedule via prompt, plus the shared note actions). */
  openEventMenu(evt, row, dateProp) {
    evt.preventDefault();
    const after = () => void this.render();
    const menu = new import_obsidian6.Menu();
    menu.addItem(
      (i) => i.setTitle("Reschedule\u2026").setIcon("calendar-clock").onClick(() => {
        var _a;
        const current = (_a = toIsoDateKey(row.scope.get(dateProp))) != null ? _a : todayIso();
        new PromptModal(this.app, {
          title: `Reschedule "${row.name}"`,
          value: current,
          placeholder: "YYYY-MM-DD",
          cta: "Reschedule",
          onSubmit: (v) => {
            const key = toIsoDateKey(v);
            if (!key) {
              new import_obsidian6.Notice("Enter a date as YYYY-MM-DD.");
              return;
            }
            void this.reschedule(row.id, dateProp, key);
          }
        }).open();
      })
    );
    menu.addSeparator();
    this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, after);
    menu.showAtMouseEvent(evt);
  }
  // ---- agenda ---------------------------------------------------------------
  renderAgenda(container, byDay, dateProp) {
    const today = todayIso();
    const days = [...byDay.keys()].filter((key) => key >= today).sort();
    const list = container.createDiv({ cls: "bpp-agenda" });
    if (days.length === 0) {
      list.createDiv({
        cls: "bpp-empty",
        text: this.search ? "No upcoming notes match the current search." : "No upcoming dated notes."
      });
      return;
    }
    for (const key of days) {
      const group = list.createDiv({ cls: "bpp-agenda-day" });
      const head = group.createDiv({ cls: "bpp-agenda-date" });
      head.createSpan({ text: dayLabel(key) });
      head.createSpan({ cls: "bpp-muted", text: key });
      if (key === today) head.createSpan({ cls: "bpp-badge bpp-badge-lite", text: "Today" });
      for (const row of byDay.get(key) || []) {
        const item = group.createDiv({ cls: "bpp-agenda-item", text: row.name });
        item.addEventListener("click", () => this.openRow(row));
        item.addEventListener("contextmenu", (evt) => this.openEventMenu(evt, row, dateProp));
      }
    }
  }
  // ---- mutations ------------------------------------------------------------
  async reschedule(rowId, dateProp, targetKey) {
    var _a;
    const file = this.app.vault.getAbstractFileByPath(rowId);
    if (!(file instanceof import_obsidian6.TFile)) return;
    const cache = this.app.metadataCache.getFileCache(file);
    const original = (_a = cache == null ? void 0 : cache.frontmatter) == null ? void 0 : _a[dateProp];
    await writeRowProperty(this.plugin, rowId, dateProp, rescheduleDateValue(original, targetKey), false, {
      label: `Reschedule to ${targetKey}`
    });
    await this.render();
  }
  async createOnDay(key, dateProp) {
    try {
      const file = await createSeededNote(
        this.plugin,
        this.plugin.settings.calendarQuickAddFolder,
        dateProp,
        key,
        `Note ${key}`
      );
      new import_obsidian6.Notice(`Created ${file.basename}`);
    } catch (error) {
      new import_obsidian6.Notice(`Bases Power Pack: could not create note (${String(error)}).`);
    }
    await this.render();
  }
};

// src/views/ganttView.ts
var import_obsidian7 = require("obsidian");
var VIEW_TYPE_GANTT = "bpp-gantt-view";
var ZOOM_PRESETS = [
  { label: "Quarter", px: 4 },
  { label: "Month", px: 9 },
  { label: "Week", px: 22 },
  { label: "Day", px: 44 }
];
var DEFAULT_ZOOM = 9;
var MAX_AXIS_DAYS = 730;
var CLICK_SLOP = 4;
var GanttView = class extends PowerPackView {
  constructor() {
    super(...arguments);
    this.zoomPx = DEFAULT_ZOOM;
    this.scrollEl = null;
    this.search = "";
    this.searchInputEl = null;
    this.restoreSearchFocus = false;
  }
  getViewType() {
    return VIEW_TYPE_GANTT;
  }
  getDisplayText() {
    return "Power Pack: Gantt";
  }
  getIcon() {
    return "gantt-chart";
  }
  async onClose() {
    this.scrollEl = null;
    this.searchInputEl = null;
    await super.onClose();
  }
  async render() {
    const token = ++this.renderToken;
    const container = this.contentEl;
    if (!this.plugin.settings.isPro) {
      container.empty();
      container.addClass("bpp-view");
      this.renderUpgradeNotice(
        container,
        "\u{1F4CA}",
        "Gantt is a Premium view",
        "Drag bars to reschedule, resize to change duration, zoom the timeline, and track progress \u2014 unlock it with a Bases Power Pack license."
      );
      return;
    }
    const resolved = await resolveViewRows(this.app, this.plugin);
    if (this.isStale(token)) return;
    this.restoreSearchFocus = this.searchInputEl !== null && this.searchInputEl.ownerDocument.activeElement === this.searchInputEl;
    container.empty();
    container.addClass("bpp-view");
    const startProp = this.plugin.settings.ganttStartProp || "start";
    const endProp = this.plugin.settings.ganttEndProp || "end";
    const toolbar = container.createDiv({ cls: "bpp-toolbar" });
    toolbar.createEl("h3", { text: "Gantt" });
    toolbar.createEl("span", { cls: "bpp-badge bpp-badge-premium", text: "Premium" });
    toolbar.createSpan({ cls: "bpp-muted", text: `${startProp} \u2192 ${endProp}` });
    const zoom = toolbar.createDiv({ cls: "bpp-segmented" });
    for (const preset of ZOOM_PRESETS) {
      const btn = zoom.createEl("button", { text: preset.label, cls: "bpp-seg-btn" });
      if (preset.px === this.zoomPx) btn.addClass("is-active");
      btn.addEventListener("click", () => {
        this.zoomPx = preset.px;
        void this.render();
      });
    }
    const todayBtn = toolbar.createEl("button", { text: "Today", cls: "bpp-seg-btn" });
    todayBtn.addEventListener("click", () => this.scrollToToday());
    this.searchInputEl = renderSearchControl(toolbar, this.search, (value) => {
      this.search = value;
      void this.render();
    });
    if (this.restoreSearchFocus) {
      this.restoreSearchFocus = false;
      this.searchInputEl.focus();
      const end = this.searchInputEl.value.length;
      this.searchInputEl.setSelectionRange(end, end);
    }
    renderContextControls(container, this.plugin, resolved, () => void this.render());
    renderRollupBar(container, this.plugin, resolved.rows);
    const rows = filterRowsByText(resolved.rows, this.search);
    const rowByPath = /* @__PURE__ */ new Map();
    const input = rows.map((row) => {
      rowByPath.set(row.id, row);
      return {
        id: row.id,
        name: row.name,
        start: valueToDateString(row.scope.get(startProp)),
        end: valueToDateString(row.scope.get(endProp))
      };
    });
    const model = buildGantt(input, 1, MAX_AXIS_DAYS);
    if (model.bars.length === 0) {
      container.createDiv({
        cls: "bpp-empty",
        text: this.search ? "No notes match the current search." : `No notes with a "${startProp}" date found. Add "${startProp}: 2026-01-01" to a note's frontmatter to place it on the timeline.`
      });
      return;
    }
    this.renderChart(container, model, rowByPath, startProp, endProp);
    if (model.skipped > 0) {
      container.createDiv({
        cls: "bpp-muted bpp-gantt-skipped",
        text: `${model.skipped} note${model.skipped === 1 ? "" : "s"} without a valid "${startProp}" date not shown.`
      });
    }
  }
  renderChart(container, model, rowByPath, startProp, endProp) {
    const total = model.days.length;
    const px = this.zoomPx;
    const scroll = container.createDiv({ cls: "bpp-gantt-scroll" });
    this.scrollEl = scroll;
    const chart = scroll.createDiv({ cls: "bpp-gantt" });
    chart.setCssProps({ "--bpp-track-width": `${total * px}px` });
    const axis = chart.createDiv({ cls: "bpp-gantt-axis" });
    axis.createDiv({ cls: "bpp-gantt-name bpp-gantt-axis-label", text: "Task" });
    const axisTrack = axis.createDiv({ cls: "bpp-gantt-track bpp-gantt-axis-track" });
    this.renderMonthTicks(axisTrack, model.days, px);
    const todayOffset = this.todayOffset(model.days);
    if (todayOffset !== null) {
      const marker = axisTrack.createDiv({ cls: "bpp-gantt-today" });
      marker.setCssProps({ left: `${todayOffset * px}px` });
    }
    for (const bar of model.bars) {
      this.renderBar(chart, bar, px, todayOffset, rowByPath.get(bar.id), startProp, endProp);
    }
  }
  /** Faint month boundary ticks + labels along the axis. */
  renderMonthTicks(axisTrack, days, px) {
    for (let i = 0; i < days.length; i++) {
      if (i > 0 && !days[i].endsWith("-01")) continue;
      const tick = axisTrack.createDiv({ cls: "bpp-gantt-tick" });
      tick.setCssProps({ left: `${i * px}px` });
      tick.createSpan({ cls: "bpp-muted", text: days[i].slice(0, 7) });
    }
  }
  renderBar(chart, bar, px, todayOffset, row, startProp, endProp) {
    const rowEl = chart.createDiv({ cls: "bpp-gantt-row" });
    const name = rowEl.createDiv({ cls: "bpp-gantt-name", text: bar.name });
    if (row) {
      name.addEventListener("click", () => this.openRow(row));
      rowEl.addEventListener("contextmenu", (evt) => this.openBarMenu(evt, row, startProp, endProp));
    }
    const track = rowEl.createDiv({ cls: "bpp-gantt-track" });
    if (todayOffset !== null) {
      const line = track.createDiv({ cls: "bpp-gantt-todayline" });
      line.setCssProps({ left: `${todayOffset * px}px` });
    }
    const isMilestone = row ? this.isMilestone(row) : false;
    if (isMilestone) {
      const diamond = track.createDiv({ cls: "bpp-gantt-milestone" });
      diamond.setCssProps({ left: `${bar.startIndex * px}px` });
      diamond.setAttr("title", `${bar.name}: ${bar.startDate}`);
      if (row) diamond.addEventListener("click", () => this.openRow(row));
      return;
    }
    const barEl = track.createDiv({ cls: "bpp-gantt-bar" });
    barEl.setCssProps({ left: `${bar.startIndex * px}px`, width: `${Math.max(1, bar.span) * px}px` });
    barEl.setAttr("title", `${bar.name}: ${bar.startDate} \u2192 ${bar.endDate}`);
    if (row) {
      const progress = this.progressPct(row);
      if (progress !== null) {
        const fill = barEl.createDiv({ cls: "bpp-gantt-progress" });
        fill.setCssProps({ width: `${progress}%` });
      }
      const handle = barEl.createDiv({ cls: "bpp-gantt-handle" });
      this.enableDrag(barEl, handle, row, startProp, endProp);
    }
  }
  // ---- interaction ----------------------------------------------------------
  /**
   * Pointer-drag a bar (move both dates) or its right handle (resize the end).
   * Uses pointer capture so move/up stay on the element — no document listeners,
   * popout-safe. A tiny drag counts as a click that opens the note.
   */
  enableDrag(barEl, handle, row, startProp, endProp) {
    let startX = 0;
    let kind = null;
    let baseWidth = 0;
    const begin = (evt, k) => {
      if (evt.button !== 0) return;
      evt.preventDefault();
      evt.stopPropagation();
      kind = k;
      startX = evt.clientX;
      baseWidth = barEl.offsetWidth;
      barEl.addClass("is-dragging");
      barEl.setPointerCapture(evt.pointerId);
    };
    barEl.addEventListener("pointerdown", (evt) => begin(evt, "move"));
    handle.addEventListener("pointerdown", (evt) => begin(evt, "resize"));
    barEl.addEventListener("pointermove", (evt) => {
      if (!kind) return;
      const dx = evt.clientX - startX;
      if (kind === "move") barEl.setCssProps({ transform: `translateX(${dx}px)` });
      else barEl.setCssProps({ width: `${Math.max(this.zoomPx, baseWidth + dx)}px` });
    });
    const finish = (evt) => {
      if (!kind) return;
      const dx = evt.clientX - startX;
      const currentKind = kind;
      kind = null;
      barEl.removeClass("is-dragging");
      if (barEl.hasPointerCapture(evt.pointerId)) barEl.releasePointerCapture(evt.pointerId);
      if (Math.abs(dx) < CLICK_SLOP) {
        barEl.setCssProps({ transform: "" });
        if (currentKind === "move") this.openRow(row);
        else void this.render();
        return;
      }
      const deltaDays = pxToDays(dx, this.zoomPx);
      if (deltaDays === 0) {
        void this.render();
        return;
      }
      if (currentKind === "move") void this.applyMove(row, startProp, endProp, deltaDays);
      else void this.applyResize(row, startProp, endProp, deltaDays);
    };
    barEl.addEventListener("pointerup", finish);
    barEl.addEventListener("pointercancel", finish);
  }
  /** Right-click menu on a Gantt bar — a non-drag path to set the dates, plus the
   * shared note actions (open / edit field / rename / delete). */
  openBarMenu(evt, row, startProp, endProp) {
    evt.preventDefault();
    const after = () => void this.render();
    const menu = new import_obsidian7.Menu();
    menu.addItem(
      (i) => i.setTitle("Set start date\u2026").setIcon("calendar").onClick(() => this.setDateViaPrompt(row, startProp, "start"))
    );
    menu.addItem(
      (i) => i.setTitle("Set end date\u2026").setIcon("calendar").onClick(() => this.setDateViaPrompt(row, endProp, "end"))
    );
    menu.addSeparator();
    this.addCommonRowMenuItems(menu, row, this.plugin.settings.kanbanCardFields, after);
    menu.showAtMouseEvent(evt);
  }
  setDateViaPrompt(row, prop, which) {
    var _a;
    const raw = row.scope.get(prop);
    const current = (_a = toIsoDateKey(raw)) != null ? _a : todayIso();
    new PromptModal(this.app, {
      title: `Set ${which} date for "${row.name}"`,
      value: current,
      placeholder: "YYYY-MM-DD",
      cta: "Save",
      onSubmit: (v) => {
        const key = toIsoDateKey(v);
        if (!key) {
          new import_obsidian7.Notice("Enter a date as YYYY-MM-DD.");
          return;
        }
        void writeRowProperty(this.plugin, row.id, prop, rescheduleDateValue(raw, key), false, {
          label: `Set ${which} date`
        }).then(() => this.render());
      }
    }).open();
  }
  async applyMove(row, startProp, endProp, deltaDays) {
    const startRaw = row.scope.get(startProp);
    const endRaw = row.scope.get(endProp);
    const startIso = valueToDateString(startRaw);
    if (!startIso) return void this.render();
    const endIso = valueToDateString(endRaw);
    const moved = moveBarDates(startIso, endIso, deltaDays);
    const writes = [{ key: startProp, value: rescheduleDateValue(startRaw, moved.start) }];
    if (moved.end !== null) writes.push({ key: endProp, value: rescheduleDateValue(endRaw, moved.end) });
    await writeRowProperties(this.plugin, row.id, writes, { label: `Move "${row.name}"` });
    await this.render();
  }
  async applyResize(row, startProp, endProp, deltaDays) {
    const startRaw = row.scope.get(startProp);
    const endRaw = row.scope.get(endProp);
    const startIso = valueToDateString(startRaw);
    if (!startIso) return void this.render();
    const endIso = valueToDateString(endRaw);
    const nextEnd = resizeBarEnd(startIso, endIso, deltaDays);
    await writeRowProperty(this.plugin, row.id, endProp, rescheduleDateValue(endRaw, nextEnd), false, {
      label: `Resize "${row.name}"`
    });
    await this.render();
  }
  scrollToToday() {
    if (!this.scrollEl) return;
    const marker = this.scrollEl.querySelector(".bpp-gantt-axis-track .bpp-gantt-today");
    if (!marker) return;
    const left = marker.offsetLeft;
    this.scrollEl.scrollTo({ left: Math.max(0, left - this.scrollEl.clientWidth / 2), behavior: "smooth" });
  }
  // ---- helpers --------------------------------------------------------------
  todayOffset(days) {
    if (days.length === 0) return null;
    const todayDay = toDayNumber(todayIso());
    const firstDay = toDayNumber(days[0]);
    if (todayDay === null || firstDay === null) return null;
    const offset = todayDay - firstDay;
    return offset >= 0 && offset < days.length ? offset : null;
  }
  isMilestone(row) {
    const prop = this.plugin.settings.ganttMilestoneProp.trim();
    if (!prop) return false;
    return toBool(row.scope.get(prop));
  }
  progressPct(row) {
    const prop = this.plugin.settings.ganttProgressProp.trim();
    if (!prop) return null;
    return normalizeProgress(row.scope.get(prop));
  }
};
function valueToDateString(value) {
  if (value === void 0 || value === null || value === "") return null;
  return toStr(value);
}

// src/main.ts
var PREMIUM_VIEW_TYPES = [VIEW_TYPE_CALENDAR, VIEW_TYPE_GANTT];
var ALL_VIEW_TYPES = [VIEW_TYPE_KANBAN, VIEW_TYPE_CALENDAR, VIEW_TYPE_GANTT];
var VIEW_NAME_TO_TYPE = {
  kanban: VIEW_TYPE_KANBAN,
  calendar: VIEW_TYPE_CALENDAR,
  gantt: VIEW_TYPE_GANTT
};
var BasesPowerPackPlugin = class extends import_obsidian8.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    /** In-memory undo stack for the frontmatter writes every view makes. */
    this.undo = new UndoManager();
    this.api = null;
    /** Cached vault snapshot shared by every view, rebuilt only when notes change. */
    this.notesSnapshot = null;
    // Serialize writes: overlapping saveData calls (e.g. per-keystroke license
    // verification) could otherwise finish out of order, letting a stale
    // serialization win on disk.
    this.savePromise = Promise.resolve();
  }
  async onload() {
    await this.loadSettings();
    await this.refreshLicense();
    this.registerEvent(this.app.metadataCache.on("changed", () => this.invalidateSnapshot()));
    this.registerEvent(this.app.vault.on("create", () => this.invalidateSnapshot()));
    this.registerEvent(this.app.vault.on("delete", () => this.invalidateSnapshot()));
    this.registerEvent(this.app.vault.on("rename", () => this.invalidateSnapshot()));
    this.registerView(VIEW_TYPE_KANBAN, (leaf) => new KanbanView(leaf, this));
    this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));
    this.registerView(VIEW_TYPE_GANTT, (leaf) => new GanttView(leaf, this));
    this.addRibbonIcon("layout-dashboard", "Bases Power Pack: Kanban", () => {
      void this.activateView(VIEW_TYPE_KANBAN);
    });
    this.addCommand({
      id: "open-kanban-view",
      name: "Open Kanban view (Lite)",
      callback: () => void this.activateView(VIEW_TYPE_KANBAN)
    });
    this.addCommand({
      id: "open-calendar-view",
      name: "Open Calendar view (Premium)",
      checkCallback: (checking) => this.premiumCommand(checking, VIEW_TYPE_CALENDAR)
    });
    this.addCommand({
      id: "open-gantt-view",
      name: "Open Gantt view (Premium)",
      checkCallback: (checking) => this.premiumCommand(checking, VIEW_TYPE_GANTT)
    });
    this.addCommand({
      id: "undo-last-change",
      name: "Undo last change",
      checkCallback: (checking) => {
        if (!this.undo.canUndo()) return false;
        if (!checking) void this.performUndo();
        return true;
      }
    });
    this.addCommand({
      id: "verify-license",
      name: "Verify license key",
      callback: async () => {
        await this.refreshLicense();
        this.refreshViews();
        new import_obsidian8.Notice(this.settings.isPro ? "Premium active." : "Lite tier (no valid license).");
      }
    });
    this.addSettingTab(new BasesPowerPackSettingTab(this.app, this));
    this.api = this.createApi();
    window.basesPowerPack = this.api;
  }
  onunload() {
    const globals = window;
    if (this.api && globals.basesPowerPack === this.api) delete globals.basesPowerPack;
    this.api = null;
  }
  /** The shared vault snapshot, rebuilt lazily after any note change. */
  getNotesSnapshot() {
    if (!this.notesSnapshot) this.notesSnapshot = buildRawNotes(this.app);
    return this.notesSnapshot;
  }
  /** Drop the cached snapshot so the next read (and re-render) sees current notes. */
  invalidateSnapshot() {
    this.notesSnapshot = null;
  }
  /**
   * Reverse the most recent undoable edit by applying its captured inverse
   * writes. The inverses are applied with `record: false` so undoing an edit
   * doesn't push another entry onto the stack.
   */
  async performUndo() {
    const entry = this.undo.pop();
    if (!entry) return;
    let ok = 0;
    for (const note of entry.notes) {
      if (await writeRowProperties(this, note.path, note.writes, { record: false })) ok++;
    }
    new import_obsidian8.Notice(`Undid "${entry.label}" \u2014 restored ${ok} note${ok === 1 ? "" : "s"}.`);
    this.refreshViews();
  }
  createApi() {
    return {
      openView: async (view, basePath) => {
        const viewType = VIEW_NAME_TO_TYPE[view];
        if (!viewType) {
          new import_obsidian8.Notice(`Bases Power Pack: unknown view "${String(view)}".`);
          return false;
        }
        if (PREMIUM_VIEW_TYPES.includes(viewType) && !this.settings.isPro) {
          new import_obsidian8.Notice("Bases Power Pack: this view requires a premium license.");
          return false;
        }
        if (basePath) {
          if (!this.settings.isPro) {
            new import_obsidian8.Notice("Bases Power Pack: opening a base as the data source requires premium.");
            return false;
          }
          const file = this.app.vault.getAbstractFileByPath((0, import_obsidian8.normalizePath)(basePath));
          if (!(file instanceof import_obsidian8.TFile) || file.extension !== "base") {
            new import_obsidian8.Notice("Bases Power Pack: base file not found.");
            return false;
          }
          if (this.settings.activeBasePath !== file.path) {
            this.settings.activeBasePath = file.path;
            await this.saveSettings();
            this.refreshViews();
          }
        }
        await this.activateView(viewType);
        return true;
      },
      isPremiumActive: () => this.settings.isPro
    };
  }
  premiumCommand(checking, viewType) {
    if (!this.settings.isPro) return false;
    if (!checking) void this.activateView(viewType);
    return true;
  }
  /** Reveal (or create) a leaf hosting the given view type. */
  async activateView(viewType) {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(viewType);
    let leaf = existing.length > 0 ? existing[0] : null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: viewType, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
  /**
   * Re-render every open Power Pack view. Called after settings or license
   * changes. Uses each view's render() — NOT onOpen(), which would re-register
   * the metadataCache listener and stack duplicates on every keystroke.
   */
  refreshViews() {
    var _a;
    for (const viewType of ALL_VIEW_TYPES) {
      for (const leaf of this.app.workspace.getLeavesOfType(viewType)) {
        const view = leaf.view;
        void ((_a = view.render) == null ? void 0 : _a.call(view));
      }
    }
  }
  /**
   * Re-verify the license key (offline) and cache the result. Returns whether
   * the Pro status or email actually changed, so callers can avoid needless
   * UI rebuilds.
   *
   * `persistUnchanged` is for the settings tab, where the key TEXT was just
   * edited: it must be saved even when the premium status didn't flip, or an
   * invalid/typo'd key silently vanishes on the next restart. Startup calls
   * leave it false so an unchanged verification never writes data.json.
   */
  async refreshLicense(persistUnchanged = false) {
    var _a;
    const before = this.settings.isPro;
    const beforeEmail = this.settings.licenseEmail;
    if (!this.settings.licenseKey) {
      this.settings.isPro = false;
      this.settings.licenseEmail = "";
    } else {
      const result = LicenseManager.verify(this.settings.licenseKey);
      this.settings.isPro = result.valid;
      this.settings.licenseEmail = (_a = result.email) != null ? _a : "";
    }
    const changed = before !== this.settings.isPro || beforeEmail !== this.settings.licenseEmail;
    if (changed || persistUnchanged) await this.saveSettings();
    if (changed) this.refreshViews();
    return changed;
  }
  async loadSettings() {
    const data = await this.loadData();
    const loaded = data !== null && typeof data === "object" ? data : {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
    this.settings.savedFilters = sanitizeSavedFilters(this.settings.savedFilters);
    this.settings.rollups = sanitizeRollups(this.settings.rollups);
    this.settings.automations = sanitizeAutomations(this.settings.automations);
    this.settings.kanbanColorOverrides = sanitizeColorOverrides(this.settings.kanbanColorOverrides);
    this.settings.kanbanWipLimits = sanitizeWipLimits(this.settings.kanbanWipLimits);
    if (typeof this.settings.kanbanBlockOverWip !== "boolean") this.settings.kanbanBlockOverWip = DEFAULT_SETTINGS.kanbanBlockOverWip;
    this.settings.kanbanCardFields = sanitizeStringArray(this.settings.kanbanCardFields, DEFAULT_SETTINGS.kanbanCardFields);
    this.settings.kanbanExtraColumns = sanitizeStringMap(this.settings.kanbanExtraColumns);
    this.settings.kanbanColumnOrder = sanitizeStringMap(this.settings.kanbanColumnOrder);
    if (typeof this.settings.kanbanColorColumns !== "boolean") this.settings.kanbanColorColumns = DEFAULT_SETTINGS.kanbanColorColumns;
    if (typeof this.settings.kanbanQuickAddFolder !== "string") this.settings.kanbanQuickAddFolder = "";
    if (typeof this.settings.activeBasePath !== "string") this.settings.activeBasePath = "";
    if (typeof this.settings.activeFilterId !== "string") this.settings.activeFilterId = "";
    if (typeof this.settings.cardFormula !== "string") this.settings.cardFormula = "";
    if (!CALENDAR_VIEW_MODES.includes(this.settings.calendarViewMode)) this.settings.calendarViewMode = "month";
    if (typeof this.settings.calendarColorProp !== "string") this.settings.calendarColorProp = "";
    if (typeof this.settings.calendarQuickAddFolder !== "string") this.settings.calendarQuickAddFolder = "";
    if (typeof this.settings.ganttProgressProp !== "string") this.settings.ganttProgressProp = DEFAULT_SETTINGS.ganttProgressProp;
    if (typeof this.settings.ganttMilestoneProp !== "string") this.settings.ganttMilestoneProp = DEFAULT_SETTINGS.ganttMilestoneProp;
  }
  async saveSettings() {
    this.savePromise = this.savePromise.then(() => this.saveData(this.settings));
    return this.savePromise;
  }
};
function sanitizeSavedFilters(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (f) => !!f && typeof f === "object" && typeof f.id === "string" && typeof f.name === "string" && typeof f.expression === "string"
  );
}
function sanitizeRollups(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r) => !!r && typeof r === "object" && typeof r.id === "string" && typeof r.label === "string" && typeof r.expression === "string" && AGGREGATIONS.includes(r.aggregation)
  );
}
function sanitizeAutomations(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw;
    if (typeof r.id !== "string" || typeof r.triggerProp !== "string" || typeof r.enterValue !== "string") continue;
    const actions = [];
    if (Array.isArray(r.actions)) {
      for (const rawAction of r.actions) {
        if (!rawAction || typeof rawAction !== "object") continue;
        const a = rawAction;
        if (typeof a.prop !== "string" || !AUTOMATION_ACTION_TYPES.includes(a.type)) continue;
        actions.push({ prop: a.prop, type: a.type, value: typeof a.value === "string" ? a.value : "" });
      }
    }
    out.push({
      id: r.id,
      name: typeof r.name === "string" ? r.name : "Rule",
      enabled: r.enabled !== false,
      triggerProp: r.triggerProp,
      enterValue: r.enterValue,
      actions
    });
  }
  return out;
}
function sanitizeWipLimits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const limit = sanitizeWipLimit(raw);
    if (limit !== null) out[key] = limit;
  }
  return out;
}
function sanitizeColorOverrides(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, hue] of Object.entries(value)) {
    if (typeof hue === "string" && /^\d{1,3}$/.test(hue) && Number(hue) <= 359) out[key] = hue;
  }
  return out;
}
function sanitizeStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return [...fallback];
  const parts = value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  const deduped = [...new Set(parts)];
  return deduped.length > 0 ? deduped : [...fallback];
}
function sanitizeStringMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    const list = sanitizeStringArray(entry, []);
    if (list.length > 0) out[key] = list;
  }
  return out;
}
