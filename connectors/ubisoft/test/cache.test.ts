import { describe, expect, it } from "vitest";
import { MAX_RECORDS, MAX_YAML_BYTES, getIn, parseConfigurations } from "../src/cache";
import { file, lenField, record, space, varField, yamlFor } from "./helpers";

const ok = (n: number, extra: Parameters<typeof yamlFor>[0] = {}) => record(900000 + n, yamlFor({ space: space(n), thumb: `t${n}.jpg`, ...extra }));

describe("parseConfigurations (ADR 80, point 9.2)", () => {
  it("maps lowercase space_id to the first varint and the thumb", () => {
    const r = parseConfigurations(file(ok(1), record(900002, yamlFor({ space: space(2).toUpperCase().replace("A2", "a2"), thumb: "k" , localized: { k: "real.png" } }), 7)));
    expect(r.complete).toBe(true);
    expect([...r.bySpace.entries()]).toEqual([
      [space(1), { id: "900001", thumb: "t1.jpg" }],
      [space(2), { id: "900002", thumb: "real.png" }],
    ]);
    expect(r.stats).toMatchObject({ records: 2, invalidYaml: 0, ambiguousSpace: 0 });
  });
  it("drops records without start_game, DLC, and bad space_id or ids", () => {
    const r = parseConfigurations(
      file(
        ok(1, { start: false }),
        ok(2, { ulc: true }),
        record(900003, yamlFor({})),
        record(900004, yamlFor({ space: "not-a-uuid" })),
        record(0, yamlFor({ space: space(5) })),
        record(12345678901, yamlFor({ space: space(6) })),
        ok(7),
      ),
    );
    expect([...r.bySpace.keys()]).toEqual([space(7)]);
    expect(r.complete).toBe(true);
  });
  it("two records with the same space_id keep the lower id and count it", () => {
    const r = parseConfigurations(file(record(900009, yamlFor({ space: space(1) })), record(900003, yamlFor({ space: space(1) })), record(900005, yamlFor({ space: space(1) }))));
    expect(r.bySpace.get(space(1))?.id).toBe("900003");
    expect(r.stats.ambiguousSpace).toBe(2);
  });
  it("a broken YAML is skipped and counted; the rest is kept but the result is not complete", () => {
    const r = parseConfigurations(file(record(900001, "root: [unclosed\n  start_game: {"), ok(2)));
    expect([...r.bySpace.keys()]).toEqual([space(2)]);
    expect(r.stats.invalidYaml).toBe(1);
    expect(r.complete).toBe(false);
  });
  it("100 000 nested [ is skipped without overflowing the stack", () => {
    const hostile = "start_game: " + "[".repeat(100_000);
    const r = parseConfigurations(file(record(900001, hostile), ok(2)));
    expect([...r.bySpace.keys()]).toEqual([space(2)]);
    expect(r.stats.invalidYaml).toBe(1);
  });
  it("a __proto__ key does not pollute prototypes and is not read as a field", () => {
    const y = "__proto__:\n  polluted: yes\nroot:\n  start_game: {a: 1}\n  space_id: " + space(1) + "\n  __proto__:\n    thumb_image: x.jpg\n";
    const r = parseConfigurations(file(record(900001, y)));
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
    expect(r.bySpace.get(space(1))).toEqual({ id: "900001", thumb: null });
    expect(getIn(JSON.parse('{"__proto__":{"x":1}}'), ["x"])).toBeUndefined();
    expect(getIn({ a: { b: 1 } }, ["a", "b"])).toBe(1);
    expect(getIn({ a: 1 }, ["toString"])).toBeUndefined();
  });
  it("the alias cap and custom tags are refused", () => {
    const aliases = "a: &a [1]\nroot:\n  start_game: " + Array.from({ length: 200 }, () => "*a").join(", ").replace(/^/, "[").concat("]");
    expect(parseConfigurations(file(record(900001, aliases))).stats.invalidYaml).toBe(1);
    const tagged = "root:\n  start_game: !!js/function 'x'\n  space_id: " + space(1);
    expect(parseConfigurations(file(record(900001, tagged))).bySpace.size).toBe(1); // unknown tag is just text in `core`
  });
  it("duplicate keys are an error", () => {
    const r = parseConfigurations(file(record(900001, "root:\n  start_game: 1\n  start_game: 2\n  space_id: " + space(1))));
    expect([r.bySpace.size, r.stats.invalidYaml]).toEqual([0, 1]);
  });
  it("a YAML over 256 KiB with start_game is skipped; without start_game it is dropped silently", () => {
    const big = "x: " + "a".repeat(MAX_YAML_BYTES);
    const r = parseConfigurations(file(record(900001, big + "\nstart_game: 1"), record(900002, big), ok(3)));
    expect([...r.bySpace.keys()]).toEqual([space(3)]);
    expect([r.stats.invalidYaml, r.complete]).toEqual([1, false]);
  });
  it("more than 5 000 records stops the reading and marks it incomplete", () => {
    const rec = record(900001, "a: 1");
    const bytes = new Uint8Array(rec.length * (MAX_RECORDS + 10));
    for (let i = 0; i < MAX_RECORDS + 10; i++) bytes.set(rec, i * rec.length);
    const r = parseConfigurations(bytes);
    expect([r.stats.records, r.complete]).toEqual([MAX_RECORDS, false]);
  });
  it("empty file: nothing, no failure", () => {
    expect(parseConfigurations(new Uint8Array())).toMatchObject({ complete: true, bySpace: new Map() });
  });
  it("hostile protobuf keeps what was read and is incomplete", () => {
    const good = ok(1);
    for (const tail of [[0x0b], [0x0a, 0xff, 0xff, 0xff, 0xff, 0x0f], [0x0a, 0x05, 1], [...lenField(1, [0x0b])], Array(11).fill(0x80)]) {
      const r = parseConfigurations(file(good, tail));
      expect([...r.bySpace.keys()]).toEqual([space(1)]);
      expect(r.complete).toBe(false);
    }
  });
  it("unknown fields and nested messages are skipped, not entered", () => {
    const withExtra = lenField(1, [...varField(1, 900001), ...varField(2, 900001), ...lenField(9, lenField(1, [0x0b])), ...lenField(3, [...new TextEncoder().encode(yamlFor({ space: space(1) }))])]);
    expect(parseConfigurations(file(withExtra)).bySpace.size).toBe(1);
  });
  it("tabs in the YAML are tolerated like the launcher's other readers do", () => {
    expect(parseConfigurations(file(record(900001, yamlFor({ space: space(1) }).replace(/^ {2}/gm, "\t")))).bySpace.size).toBe(1);
  });
});
