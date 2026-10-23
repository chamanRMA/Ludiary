/** Body of a content id; the pattern and the final URI assertion are both derived from it (ADR 81). */
export const ID_BODY = "[A-Za-z0-9][A-Za-z0-9._:-]{0,63}";
export const ID_RE = new RegExp(`^${ID_BODY}$`);
export const MAX_IDS = 16;
const MAX_TITLE = 300;
const TITLE_CAP = 256;

export interface InstallerData {
  /** All valid distinct ids in file order. The caller cuts to MAX_IDS. */
  readonly ids: readonly string[];
  /** Title chosen from the file (cleaned), or null when there is none. */
  readonly title: string | null;
}

/** One pass, only the five entities and numeric references to valid non-control code points (titles only). */
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/g, (m, e: string) => {
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "amp") return "&";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const cp = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    if (cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || /\p{Cc}/u.test(String.fromCodePoint(cp))) return m;
    return String.fromCodePoint(cp);
  });
}

/**
 * Removes comments and unwraps CDATA sections (content escaped) with indexOf (no unbounded regex: the input is untrusted, up to 1 MiB).
 * Null when one is not closed.
 */
function stripMarkup(text: string): string | null {
  const parts: string[] = [];
  let i = 0;
  let nextComment = text.indexOf("<!--");
  let nextCdata = text.indexOf("<![CDATA[");
  for (;;) {
    // A position is searched again only once passed, so the work stays linear.
    if (nextComment !== -1 && nextComment < i) nextComment = text.indexOf("<!--", i);
    if (nextCdata !== -1 && nextCdata < i) nextCdata = text.indexOf("<![CDATA[", i);
    const comment = nextComment !== -1 && (nextCdata === -1 || nextComment < nextCdata);
    const start = comment ? nextComment : nextCdata;
    if (start === -1) break;
    const end = text.indexOf(comment ? "-->" : "]]>", start + 4);
    if (end === -1) return null;
    parts.push(text.slice(i, start));
    // CDATA keeps its content, escaped, so a title in CDATA is taken as is (ADR 81, point 12).
    if (!comment) parts.push(text.slice(start + 9, end).replace(/&/g, "&amp;").replace(/</g, "&lt;"));
    i = end + 3;
  }
  parts.push(text.slice(i));
  return parts.join("");
}

function pickTitle(list: { locale: string; title: string }[]): string | null {
  const ok = list.filter((t) => t.title !== "");
  const t = ok.find((x) => x.locale === "en_US") ?? ok.find((x) => x.locale.startsWith("en_")) ?? ok[0];
  return t ? t.title : null;
}

const clean = (raw: string): string => [...decode(raw).replace(/\p{Cc}/gu, "").trim()].slice(0, MAX_TITLE).join("").trim();
const localeOf = (attrs: string): string => /(?:^|\s)locale="([^"<>]{0,32})"/.exec(attrs)?.[1] ?? "";

/** Reads the ids and the title of __Installer\installerdata.xml with no XML library and no entities (ADR 81, point 3). Null if invalid. */
export function parseInstallerData(text: string): InstallerData | null {
  if (text.includes("\u0000") || /<!(DOCTYPE|ENTITY)/i.test(text)) return null;
  const xml = stripMarkup(text);
  if (xml === null) return null;
  const current = /<DiPManifest(?=[\s/>])/.test(xml);
  if (!current && !/<game(?=[\s/>])/.test(xml)) return null; // legacy Origin format (assumption EAD4)

  let open = xml.indexOf("<contentIDs");
  while (open !== -1 && !/[\s>]/.test(xml[open + 11] ?? "")) open = xml.indexOf("<contentIDs", open + 1);
  if (open === -1) return null;
  const gt = xml.indexOf(">", open);
  const close = gt === -1 ? -1 : xml.indexOf("</contentIDs>", gt);
  if (close === -1) return null;
  const ids = new Set<string>();
  for (const m of xml.slice(gt + 1, close).matchAll(/<contentID(?=[\s/>])[^<>]{0,512}>([^<]{0,128})<\/contentID>/g)) {
    const id = (m[1] as string).trim(); // raw: an '&' makes it invalid, entities are never decoded in ids
    if (ID_RE.test(id)) ids.add(id);
  }
  if (ids.size === 0) return null;

  const titles: { locale: string; title: string }[] = [];
  if (current) {
    const tOpen = xml.indexOf("<gameTitles");
    const tClose = tOpen === -1 ? -1 : xml.indexOf("</gameTitles>", tOpen);
    const region = tClose === -1 ? "" : xml.slice(tOpen, tClose);
    for (const m of region.matchAll(/<gameTitle(?=[\s>])([^<>]{0,512})>([^<]{0,1024})<\/gameTitle>/g)) {
      if (titles.length >= TITLE_CAP) break;
      titles.push({ locale: localeOf(m[1] as string), title: clean(m[2] as string) });
    }
  } else {
    const heads = [...xml.matchAll(/<localeInfo(?=[\s>])([^<>]{0,512})>/g)].slice(0, TITLE_CAP);
    for (const [i, h] of heads.entries()) {
      const from = (h.index as number) + h[0].length;
      // The <title> must lie inside its own block: before the next <localeInfo> and before its </localeInfo>.
      let body = xml.slice(from, heads[i + 1]?.index ?? xml.length);
      const end = body.indexOf("</localeInfo>");
      if (end !== -1) body = body.slice(0, end);
      const t = /<title(?=[\s>])[^<>]{0,512}>([^<]{0,1024})<\/title>/.exec(body);
      if (t) titles.push({ locale: localeOf(h[1] as string), title: clean(t[1] as string) });
    }
  }
  return { ids: [...ids], title: pickTitle(titles) };
}
