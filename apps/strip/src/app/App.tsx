// App shell: route switch inside the error boundary. Screens are added by the conversion tasks.
import { Component, lazy, Suspense, useEffect, useLayoutEffect, type ReactNode } from "react";
import { Nav } from "../components/Chrome.js";
import { AboutScreen } from "../screens/AboutScreen.js";
import { HomeScreen } from "../screens/HomeScreen.js";
import { SendScreen } from "../screens/SendScreen.js";
import { sendStore } from "../services/send-session.js";
import { installLinkInterception } from "./interception.js";
import { navigate, useRoute } from "./router-store.js";
import { titleOf } from "./router.js";

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
  useEffect(() => installLinkInterception(), []);
  useEffect(() => sendStore.setNavigator((to) => navigate(to)), []);
  useLayoutEffect(() => {
    document.title = titleOf(route);
  }, [route]);
  // The Send on screen and Send on paper routes need a Sender_File; a reload or a direct visit finds none (R3.2, R4.2, R8.6).
  const needsFile = route === "stream" || route === "paper";
  const hasFile = sendStore.file() !== null;
  useEffect(() => {
    if (needsFile && !hasFile) navigate("/send", { replace: true });
  }, [needsFile, hasFile]);
  if (route === "home") return <HomeScreen />;
  if (route === "send") return <SendScreen />;
  if (route === "about") return <AboutScreen />;
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
