import Home from "./components/Home";
import Auth from "./components/Auth";
import Jump from "./components/Jump";
import Manage from "./components/Manage";

export default function App() {
  const pathname = window.location.pathname;
  const normalized = pathname.replace(/\/+$/g, "") || "/";

  if (normalized === "/auth" || normalized === "/admin/login") {
    return <Auth mode={normalized === "/admin/login" ? "admin" : "login"} />;
  }

  if (normalized === "/manage") {
    return <Manage />;
  }

  if (normalized === "/" || normalized === "") {
    return <Home />;
  }

  const jumpPath = decodeURIComponent(normalized.replace(/^\/+/, ""));
  return <Jump path={jumpPath} />;
}
