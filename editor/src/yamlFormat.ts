import { parse, type Document } from "yaml";

/**
 * Renders an edited YAML document so the file changes as little as possible (editor-design §1.4):
 * the document is rendered in the house style, then every line whose content is unchanged keeps
 * its original text (column alignment, comment spacing, line endings). If keeping lines would ever
 * change the data (e.g. an edit that only changed spaces inside a string), the plain rendering wins.
 */
export function formatYaml(doc: Document, original: string): string {
  const crlf = original.includes("\r\n");
  const orig = original.replace(/\r\n/g, "\n");
  const rendered = tightenFlowSequences(doc.toString({ lineWidth: 0, doubleQuotedMinMultiLineLength: Infinity }));
  let out = keepUnchangedLines(orig, rendered);
  if (!sameData(out, doc)) out = rendered;
  return crlf ? out.replace(/\n/g, "\r\n") : out;
}

function sameData(text: string, doc: Document): boolean {
  try {
    return JSON.stringify(parse(text)) === JSON.stringify(doc.toJS());
  } catch {
    return false;
  }
}

/** House style: `{ a: 1 }` maps, but `[a, b]` sequences. Only outside quoted strings. */
function tightenFlowSequences(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      let out = "";
      let quote: string | null = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (quote) {
          out += ch;
          if (ch === "\\" && quote === '"') out += line[++i] ?? "";
          else if (ch === quote) quote = null;
          continue;
        }
        if (ch === "#" && (i === 0 || line[i - 1] === " ")) return out + line.slice(i); // comment
        if (ch === '"' || ch === "'") quote = ch;
        if (ch === "[" && line[i + 1] === " ") {
          out += "[";
          i++;
          continue;
        }
        if (ch === " " && line[i + 1] === "]") continue;
        out += ch;
      }
      return out;
    })
    .join("\n");
}

const norm = (line: string) => line.replace(/\s+/g, "");

/** Longest common subsequence of lines (by content without whitespace): matched lines keep the original text. */
function keepUnchangedLines(original: string, rendered: string): string {
  const a = original.split("\n");
  const b = rendered.split("\n");
  const na = a.map(norm);
  const nb = b.map(norm);
  // trim common head and tail first – edits are usually small and local
  let head = 0;
  while (head < a.length && head < b.length && na[head] === nb[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && na[a.length - 1 - tail] === nb[b.length - 1 - tail]) tail++;
  const ma = na.slice(head, a.length - tail);
  const mb = nb.slice(head, b.length - tail);
  const n = ma.length;
  const m = mb.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ma[i] === mb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const middle: string[] = [];
  let i = 0;
  let j = 0;
  while (j < m) {
    if (i < n && ma[i] === mb[j]) {
      middle.push(a[head + i]);
      i++;
      j++;
    } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) i++;
    else {
      middle.push(b[head + j]);
      j++;
    }
  }
  return [...a.slice(0, head), ...middle, ...a.slice(a.length - tail)].join("\n");
}
