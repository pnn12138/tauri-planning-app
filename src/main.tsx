import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./shared/ui/ErrorBoundary";

const rootEl = document.getElementById("root") as HTMLElement;
rootEl.innerHTML = `<div class="boot-screen">Starting…</div>`;

function renderFatalError(title: string, details: string) {
  rootEl.innerHTML = `
    <div class="fatal-error">
      <div class="fatal-error-title">${title}</div>
      <div class="fatal-error-message">${details}</div>
      <div class="fatal-error-hint">Open DevTools to see full logs.</div>
    </div>
  `;
}

window.addEventListener("error", (event) => {
  const message = (event as ErrorEvent).message ?? "Unknown error";
  renderFatalError("Uncaught error", message);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = (event as PromiseRejectionEvent).reason;
  const message =
    reason && typeof reason === "object" && "message" in (reason as any)
      ? String((reason as any).message)
      : String(reason);
  renderFatalError("Unhandled rejection", message);
});

ReactDOM.createRoot(rootEl).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
