export * from "./model";
export * from "./ports";
export * from "./env";
export { CoreError, toErrorInfo } from "./errors";
export { createCore, ConnectorRegistrationError } from "./core";
export { stripEditionMarks, hasEditionMark, compareTitles, matchProperties, EDITION_MARKS } from "./normalize";
export type { MatchCandidate, MatchVerdict, TitleVerdict } from "./normalize";
