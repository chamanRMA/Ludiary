import { expect, it } from "vitest";
import { coverCandidates, markCoverBroken } from "./bits";

it("a cover that failed once is not tried again in this session (404s are not cached by the browser)", () => {
  const game = { coverUrl: "https://cdn.example/1/library_600x900.jpg", coverFallbackUrl: "https://cdn.example/1/header.jpg" };
  expect(coverCandidates(game)).toEqual([game.coverUrl, game.coverFallbackUrl]);
  markCoverBroken(game.coverUrl);
  // A remount (window focus, background sync) goes straight to the fallback, without asking for the 404 again.
  expect(coverCandidates(game)).toEqual([game.coverFallbackUrl]);
  markCoverBroken(game.coverFallbackUrl);
  expect(coverCandidates(game)).toEqual([]);
});
