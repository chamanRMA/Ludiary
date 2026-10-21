import { expect, it } from "vitest";
import { isOwnOpenUrl } from "../src/launcher";

const t = "A".repeat(43);

it("only opens our own one-use link, on ludiary.localhost and the expected port (ADR 63, 66)", () => {
  expect(isOwnOpenUrl(`http://ludiary.localhost:35000/open?t=${t}`, 35000)).toBe(true);
  for (const url of [
    `http://127.0.0.1:35000/open?t=${t}`, // the IP form is only for the tray's plan B
    `http://ludiary.localhost:35001/open?t=${t}`, // another port
    `https://ludiary.localhost:35000/open?t=${t}`,
    `http://foo.localhost:35000/open?t=${t}`,
    `http://ludiary.localhost.evil.example:35000/open?t=${t}`,
    `http://ludiaryXlocalhost:35000/open?t=${t}`, // the dot must be literal
    `http://ludiary.localhost:35000/open?t=${t}&next=https://evil.example`,
    "https://evil.example/",
    42,
    null,
  ]) {
    expect(isOwnOpenUrl(url, 35000), String(url)).toBe(false);
  }
});
