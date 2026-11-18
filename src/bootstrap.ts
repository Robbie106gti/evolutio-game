import { initializeStorage } from "./browser-storage.ts";
initializeStorage()
  .then(() => import("./main.ts"))
  .catch((error) => {
    document.body.textContent =
      "Could not open island storage. Existing saves have not been replaced. " +
      (error instanceof Error ? error.message : "Try reopening this tab.");
  });
