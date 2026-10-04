import type { WorkspaceApi } from "../api/workspace";
import { imageMime } from "./images";

export function loadImage(
  api: WorkspaceApi,
  generation: number,
  path: string,
  notePath: string | undefined,
  ready: (url: string) => void,
  failed: (error: string) => void,
) {
  let disposed = false;
  let url: string | undefined;
  void api
    .readImage(generation, path, notePath)
    .then((bytes) => {
      if (disposed) return;
      url = URL.createObjectURL(new Blob([bytes], { type: imageMime(path) }));
      ready(url);
    })
    .catch((error) => {
      if (!disposed) failed(String(error));
    });
  return () => {
    disposed = true;
    if (url) {
      URL.revokeObjectURL(url);
      url = undefined;
    }
  };
}
