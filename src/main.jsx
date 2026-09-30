import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";
import AppErrorBoundary from "./AppErrorBoundary";
import "./style.css";
import "./luxurySystem.css";
import "./mobileApp.css";
import "./mobileInteractionFix.css";
import "./calendarStates.css";
import "./mobilePremium.css";
import "./technicianRefresh.css";
// Keep page-specific components last so broad legacy styles cannot override them.
import "./App.css";

createRoot(document.getElementById("root")).render(
  <StrictMode><AppErrorBoundary><BrowserRouter><App /><Toaster position="top-right" richColors closeButton /></BrowserRouter></AppErrorBoundary></StrictMode>,
);
