// Container for the About route (static copy).
import type { ReactNode } from "react";
import { AboutView } from "../views/AboutView.js";
import { toAboutVM } from "../views/about-vm.js";
export const AboutScreen = (): ReactNode => <AboutView vm={toAboutVM()} />;
