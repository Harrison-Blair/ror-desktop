import { ImageOff, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { WorkspaceApi } from "../api/workspace";
import { loadImage } from "../editor/image-resource";
export function ImageViewer({
  api,
  generation,
  path,
  name,
  revision,
}: {
  api: WorkspaceApi;
  generation: number;
  path: string;
  name: string;
  revision: number;
}) {
  const [resource, setResource] = useState<{
    key: string;
    url?: string;
    error?: string;
  }>({ key: "" });
  const key = `${generation}:${revision}:${path}`;
  useEffect(
    () =>
      loadImage(
        api,
        generation,
        path,
        undefined,
        (url) => setResource({ key, url }),
        (error) => setResource({ key, error }),
      ),
    [api, generation, path, key],
  );
  return (
    <div className="image-viewer">
      {resource.key === key && resource.error ? (
        <div className="empty-state error-state">
          <ImageOff size={32} />
          <h2>Couldn't load this image</h2>
          <p>The file may be damaged or no longer there. Try Refresh.</p>
          <small>{resource.error}</small>
        </div>
      ) : resource.key === key && resource.url ? (
        <img
          src={resource.url}
          alt={name}
          onError={() => setResource({ key, error: "Image decoding failed." })}
        />
      ) : (
        <LoaderCircle className="spinner" aria-label="Loading image" />
      )}
    </div>
  );
}
