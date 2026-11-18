// View-model of the Send board (the board's renderVals, with the chosen-file card lifted out of the board's literals).
export type SendStage = "chosen" | "empty" | "toolarge" | "emptyfile";
/** Pre-formatted facts of a chosen file; the Send container builds them from the file, the gallery from a fixture. */
export interface FileFacts {
  name: string;
  mime: string;
  /** "184 KB" */
  size: string;
  /** "188,416 bytes" */
  bytes: string;
  /** First 12 hex digits in three groups of four. */
  hash: [string, string, string];
  /** "111 packets · 149 symbols" */
  encoded: string;
  /** "184 of 256 KB" */
  within: string;
  value: number;
  max: number;
  screenNote: string;
  paperNote: string;
}
/** The rejected-file card of the `toolarge` and `emptyfile` stages. */
export interface BadFacts {
  name: string;
  type: string;
  size: string;
  limit: string;
  value: number;
  max: number;
  title: string;
  msg: string;
}
export interface SendInput {
  stage: SendStage;
  file?: FileFacts;
  bad?: BadFacts;
  /** The selected output; the Screen radio is checked by default in `chosen` only. */
  output?: "screen" | "paper";
  /** The "Many pages" warning text (an addition, data-addition), shown with output `paper` above the paper threshold. */
  paperWarn?: { title: string; text: string } | null;
  /** The board's mobile class; only the gallery sets it. */
  rootCls?: string;
}
export interface SendVM {
  rootCls: string;
  isChosen: boolean;
  isNone: boolean;
  isBad: boolean;
  choicesOff: boolean;
  screenOn: boolean;
  paperOn: boolean;
  continueLabel: string;
  continueHref: string;
  paperWarn: { title: string; text: string } | null;
  dropCls: string;
  file: FileFacts;
  screenNote: string;
  paperNote: string;
  badName: string;
  badType: string;
  badSize: string;
  badLimit: string;
  badValue: number;
  badMax: number;
  badTitle: string;
  badMsg: string;
}
const BLANK_FILE: FileFacts = { name: "", mime: "", size: "", bytes: "", hash: ["", "", ""], encoded: "", within: "", value: 0, max: 0, screenNote: "", paperNote: "" };
const BLANK_BAD: BadFacts = { name: "", type: "", size: "", limit: "", value: 0, max: 0, title: "", msg: "" };
export function toSendVM(input: SendInput): SendVM {
  const s = input.stage;
  const bad = s === "toolarge" || s === "emptyfile";
  const b = input.bad ?? BLANK_BAD;
  const file = input.file ?? BLANK_FILE;
  const out = s === "chosen" ? (input.output ?? "screen") : "screen";
  return {
    rootCls: input.rootCls ?? "",
    isChosen: s === "chosen",
    isNone: s === "empty",
    isBad: bad,
    choicesOff: s !== "chosen",
    screenOn: s === "chosen" && out === "screen",
    paperOn: s === "chosen" && out === "paper",
    continueLabel: out === "paper" && s === "chosen" ? "Continue to Paper" : "Continue to Screen",
    continueHref: out === "paper" ? "/send/paper" : "/send/screen",
    paperWarn: s === "chosen" && out === "paper" ? (input.paperWarn ?? null) : null,
    dropCls: bad ? "drop--error" : "",
    file,
    screenNote: file.screenNote,
    paperNote: file.paperNote,
    badName: b.name,
    badType: b.type,
    badSize: b.size,
    badLimit: b.limit,
    badValue: b.value,
    badMax: b.max,
    badTitle: b.title,
    badMsg: b.msg,
  };
}
