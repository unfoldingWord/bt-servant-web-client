/** Map short format names to MIME types for audio playback. */
export function audioMimeType(format: string): string {
  switch (format) {
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "webm":
      return "audio/webm";
    default:
      return "audio/mpeg";
  }
}
