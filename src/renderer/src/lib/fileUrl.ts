/** Local recordings are streamed through the `beam-media` protocol (see src/main/index.ts)
 *  instead of `file://`, since the renderer's origin isn't itself `file://`. */
export function toPlaybackUrl(path: string): string {
  return `beam-media://local/${encodeURIComponent(path)}`
}
