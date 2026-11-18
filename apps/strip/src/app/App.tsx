// App shell: route switch inside the error boundary. Screens are added by the conversion tasks.
import { Component, lazy, Suspense, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { HomeScreen } from "../screens/HomeScreen.js";
import { useRoute } from "./router-store.js";

class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    return this.state.failed ? <main className="wrap"><h1 className="t-h1">Something went wrong inside Strip</h1></main> : this.props.children;
  }
}

// Harness-only gallery, excluded from the production bundle: the define makes this branch dead code there.
const Gallery = __STRIP_GALLERY__ ? lazy(() => import("../gallery/Gallery.js")) : null;
function Routes(): ReactNode {
  const route = useRoute();
  if (route === "home") return <HomeScreen />;
  // The other screens are added by the conversion tasks.
  return (
    <div className="strip page">
      <Nav current={null} />
      <main className="wrap" />
    </div>
  );
}
export function App(): ReactNode {
  if (__STRIP_GALLERY__ && Gallery !== null && location.pathname.startsWith("/__gallery/")) {
    return (
      <Boundary>
        <Suspense fallback={null}>
          <Gallery />
        </Suspense>
      </Boundary>
    );
  }
  return (
    <Boundary>
      <Routes />
    </Boundary>
  );
}
