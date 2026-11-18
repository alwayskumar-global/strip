// Container for the Home route: draws the six specimen codes from the built-in sample, then renders the board.
import { useEffect, useState, type ReactNode } from "react";
import { sampleSymbols, type SampleSymbol } from "../services/sample-file.js";
import { HomeView } from "../views/HomeView.js";
import { toHomeVM } from "../views/home-vm.js";
export function HomeScreen(): ReactNode {
  const [symbols, setSymbols] = useState<SampleSymbol[]>([]);
  useEffect(() => {
    let live = true;
    void sampleSymbols(6).then((s) => {
      if (live) setSymbols(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return <HomeView vm={toHomeVM(symbols)} />;
}
