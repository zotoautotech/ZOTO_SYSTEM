import { api } from "./api";

/**
 * Opens an uploaded attachment in a new tab through our own small viewer page — never
 * Google Drive's own UI (Share dialog, edit permissions, file-manager chrome), just the
 * content plus one clearly visible Download button.
 *
 * `value` is normally a bare Drive file ID (current uploads). Older records saved before
 * this change stored a full Drive URL directly — those still open (backward compatible),
 * just via Drive's own viewer rather than ours.
 */
export async function openAttachment(value: string) {
  if (!value) return;
  if (/^https?:\/\//i.test(value)) {
    window.open(value, "_blank", "noreferrer");
    return;
  }
  const res = await api.get(`/uploads/${value}/view-url`);
  const base = (api.defaults.baseURL || "").replace(/\/$/, "");
  const url = `${base}/uploads/${value}/viewer?token=${encodeURIComponent(res.data.token)}`;
  window.open(url, "_blank", "noreferrer");
}
