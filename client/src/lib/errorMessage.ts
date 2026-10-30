// Tauri commands may reject with objects that carry a message.
export const errorMessage = (error: unknown): string =>
  typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error);
