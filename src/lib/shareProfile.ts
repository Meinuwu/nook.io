const DOWNLOAD_URL = "https://nook-io.vercel.app";

export function buildShareMessage(
  username: string,
  displayName?: string
): string {
  const handle = username.startsWith("@") ? username : `@${username}`;
  const greeting = displayName
    ? `Study with ${displayName} on Nook!`
    : "Study with me on Nook!";
  return `${greeting} 🐸\nAdd me: ${handle}\nDownload: ${DOWNLOAD_URL}`;
}

export type ShareProfileResult = { method: "native" } | { method: "clipboard" };

export async function shareProfile(
  username: string,
  displayName?: string
): Promise<ShareProfileResult> {
  const text = buildShareMessage(username, displayName);

  if (typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: "Join me on Nook!",
        text,
      });
      return { method: "native" };
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
    }
  }

  await navigator.clipboard.writeText(text);
  return { method: "clipboard" };
}
