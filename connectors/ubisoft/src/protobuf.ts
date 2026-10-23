// Minimal protobuf wire reader for an untrusted file (ADR 80, points 9.2 and 18 M4). Not recursive: callers read
// fixed levels, and nested messages are only handed back as byte ranges. No dependencies.

export class ProtobufError extends Error {}

export interface PbField {
  /** Field number. */
  readonly num: number;
  /** Wire type: 0 varint, 1 fixed64, 2 length-delimited, 5 fixed32. */
  readonly wire: 0 | 1 | 2 | 5;
  /** Wire type 0 only. */
  readonly value: number;
  /** Wire type 2 only: the payload is bytes[start, end). */
  readonly start: number;
  readonly end: number;
}

/** Varint of at most 10 bytes whose value does not pass Number.MAX_SAFE_INTEGER. */
export function readVarint(bytes: Uint8Array, pos: number, end: number): { value: number; pos: number } {
  let value = 0;
  for (let i = 0; i < 10; i++) {
    if (pos >= end) throw new ProtobufError("Truncated varint");
    const b = bytes[pos++]!;
    value += (b & 0x7f) * 2 ** (7 * i); // multiplication, not shifts: shifts are 32-bit in JS
    if (value > Number.MAX_SAFE_INTEGER) throw new ProtobufError("Varint too large");
    if ((b & 0x80) === 0) return { value, pos };
  }
  throw new ProtobufError("Varint longer than 10 bytes");
}

/** Fields of the message in bytes[start, end). Throws ProtobufError at the first malformed field (fields before it were already yielded). */
export function* readFields(bytes: Uint8Array, start: number, end: number): Generator<PbField> {
  let pos = start;
  while (pos < end) {
    const tag = readVarint(bytes, pos, end);
    pos = tag.pos;
    const num = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    if (num < 1) throw new ProtobufError("Field number 0");
    if (wire === 0) {
      const v = readVarint(bytes, pos, end);
      pos = v.pos;
      yield { num, wire, value: v.value, start: 0, end: 0 };
    } else if (wire === 2) {
      const len = readVarint(bytes, pos, end);
      pos = len.pos;
      if (len.value > end - pos) throw new ProtobufError("Length goes past the message");
      yield { num, wire, value: 0, start: pos, end: pos + len.value };
      pos += len.value;
    } else if (wire === 1 || wire === 5) {
      const n = wire === 1 ? 8 : 4;
      if (n > end - pos) throw new ProtobufError("Fixed field goes past the message");
      pos += n;
      yield { num, wire, value: 0, start: 0, end: 0 };
    } else {
      throw new ProtobufError("Unsupported wire type"); // 3, 4 (groups), 6 and 7
    }
  }
}
