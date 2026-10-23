import { describe, expect, it } from "vitest";
import { ProtobufError, readFields, readVarint } from "../src/protobuf";
import { lenField, varField, varint } from "./helpers";

const all = (b: number[]) => [...readFields(Uint8Array.from(b), 0, b.length)];

describe("readVarint", () => {
  it.each([[0, 1], [127, 1], [128, 2], [300, 2], [2 ** 32, 5], [Number.MAX_SAFE_INTEGER, 8]])("reads %d in %d bytes", (n, len) => {
    const b = Uint8Array.from(varint(n));
    expect(b.length).toBe(len);
    expect(readVarint(b, 0, b.length)).toEqual({ value: n, pos: len });
  });
  it("rejects 11 bytes, values past MAX_SAFE_INTEGER and truncation", () => {
    const eleven = Uint8Array.from([...Array(10).fill(0x80), 0x01]);
    expect(() => readVarint(eleven, 0, eleven.length)).toThrow(ProtobufError);
    const big = Uint8Array.from([...Array(9).fill(0xff), 0x01]); // 2^64 - 1 style
    expect(() => readVarint(big, 0, big.length)).toThrow(ProtobufError);
    expect(() => readVarint(Uint8Array.from([0x80]), 0, 1)).toThrow(ProtobufError);
    expect(() => readVarint(new Uint8Array(), 0, 0)).toThrow(ProtobufError);
  });
});

describe("readFields", () => {
  it("empty input has no fields", () => expect(all([])).toEqual([]));
  it("reads varint and length fields and skips fixed32/fixed64", () => {
    const f = all([...varField(1, 54), 0x15, 1, 2, 3, 4, 0x19, 1, 2, 3, 4, 5, 6, 7, 8, ...lenField(3, [9, 9])]);
    expect(f.map((x) => [x.num, x.wire])).toEqual([[1, 0], [2, 5], [3, 1], [3, 2]]);
    expect(f[0]!.value).toBe(54);
    expect([f[3]!.start, f[3]!.end]).toEqual([f[3]!.end - 2, f[3]!.end]);
  });
  it.each([3, 4, 6, 7])("wire type %i is a failure", (w) => {
    expect(() => all([8 + w])).toThrow(ProtobufError);
  });
  it("field number 0 and a length that goes past the end fail", () => {
    expect(() => all([0x00, 0x01])).toThrow(ProtobufError);
    expect(() => all([0x0a, 0x05, 1, 2])).toThrow(ProtobufError);
    expect(() => all([0x0a, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f])).toThrow(ProtobufError);
    expect(() => all([0x15, 1, 2])).toThrow(ProtobufError);
  });
  it("a cut in the middle of a message fails after yielding what came before", () => {
    const it = readFields(Uint8Array.from([...varField(1, 7), 0x10]), 0, 3);
    expect(it.next().value).toMatchObject({ num: 1, value: 7 });
    expect(() => it.next()).toThrow(ProtobufError);
  });
});
