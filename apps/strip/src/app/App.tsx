// App shell: route switch inside the error boundary. Screens are added by the conversion tasks.
import { Component, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? <main className="wrap"><h1 className="t-h1">Something went wrong inside Strip</h1></main> : this.props.children;
  }
}

export function App(): ReactNode {
  return (
    <Boundary>
      <div className="strip page">
        <Nav current={null} />
        <main className="wrap" />
      </div>
    </Boundary>
  );
}
