import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "@/App";
import "@/styles/tokens.css";
import "@/styles/global.css";

// biome-ignore lint/style/noNonNullAssertion: index.html defines the root element.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
