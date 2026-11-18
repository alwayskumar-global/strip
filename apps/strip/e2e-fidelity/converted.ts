// Targets whose React conversion exists. Each conversion task (1.8 to 1.13) deletes its skip reason here.
const PENDING: Array<[RegExp, string]> = [
  [/^home/, "task 1.8: Home is not converted yet"],
  [/^send(-empty|-toolarge|-emptyfile)?(-mobile)?$/, "task 1.9: Send is not converted yet"],
  [/^stream/, "task 1.10: StreamView is not converted yet"],
  [/^paper/, "task 1.11: PaperView is not converted yet"],
  [/^receive/, "task 1.12: ReceiveView is not converted yet"],
  [/^(about|errors|error-)/, "task 1.13: About and ErrorPanel are not converted yet"],
];
/** The skip reason for a target, or undefined when the conversion exists. */
export function skipReason(id: string): string | undefined {
  return PENDING.find(([re]) => re.test(id))?.[1];
}
