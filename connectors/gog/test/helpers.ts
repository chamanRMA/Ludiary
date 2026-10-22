export const info = (o: Record<string, unknown>): string => JSON.stringify(o);
export const task = (path: string, extra: Record<string, unknown> = {}) => ({ isPrimary: true, type: "FileTask", path, ...extra });
export const GAME = "C:\\Games\\Fake Quest";
export const gameInfo = (id: string, extra: Record<string, unknown> = {}) =>
  info({ gameId: id, rootGameId: id, name: `Fake ${id}`, playTasks: [task("game.exe")], ...extra });
