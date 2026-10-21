import { expect, it } from "vitest";
import { isOwnOpenUrl } from "../src/launcher";

const t = "A".repeat(43);

it("only opens our own one-use link on the expected port (ADR 23)", () => {
  expect(isOwnOpenUrl(`http://127.0.0.1:35000/open?t=${t}`, 35000)).toBe(true);
  for (const url of [
    `http://127.0.0.1:35001/open?t=${t}`, // another port
    `https://127.0.0.1:35000/open?t=${t}`,
    `http://localhost:35000/open?t=${t}`,
    `http://127.0.0.1:35000/open?t=${t}&next=https://evil.example`,
    `http://127.0.0.1:35000.evil.example/open?t=${t}`,
    "https://evil.example/",
    42,
    null,
  ]) {
    expect(isOwnOpenUrl(url, 35000)).toBe(false);
  }
});
