import type { Root } from "mdast";
import { visit } from "unist-util-visit";

const VIDEO_URL_RE = /\.(mp4|webm|ogv|mov|m4v)(\?|#|$)/i;

// Tag the first link to each video URL with data-video-first so the renderer
// can upgrade it to an inline <video>. Later links to the same URL stay as
// anchors — prevents stacked players when the worker emits a linked thumbnail
// and a redundant "Watch the Video" text link to the same .mp4.
export function remarkDedupeVideoLinks() {
  return (tree: Root) => {
    const seen = new Set<string>();
    visit(tree, "link", (node) => {
      if (!VIDEO_URL_RE.test(node.url)) return;
      if (seen.has(node.url)) return;
      seen.add(node.url);
      const data = (node.data ??= {});
      const hProps = ((
        data as { hProperties?: Record<string, unknown> }
      ).hProperties ??= {});
      hProps["data-video-first"] = "true";
    });
  };
}
