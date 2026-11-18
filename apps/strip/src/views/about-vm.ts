// View-model of the About board: only the root class varies (the copy is static, R6).
export interface AboutVM {
  rootCls: string;
}
export const toAboutVM = (rootCls = ""): AboutVM => ({ rootCls });
