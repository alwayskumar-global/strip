// Targets whose React conversion exists. Each conversion task (1.8 to 1.13) deletes its skip reason here.
const PENDING: Array<[RegExp, string]> = [
];
/** The skip reason for a target, or undefined when the conversion exists. */
export function skipReason(id: string): string | undefined {
  return PENDING.find(([re]) => re.test(id))?.[1];
}
