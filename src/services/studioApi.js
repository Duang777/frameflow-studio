import { get, post, request } from "./httpClient";

export function getHealth() {
  return get("/api/health");
}

export function getHistory(limit = 30) {
  const safe = Math.max(1, Math.min(200, Number(limit) || 30));
  return get(`/api/history?limit=${safe}`);
}

export function saveHistoryEntry(entry) {
  return post("/api/history", entry);
}

export function updateHistoryEntryIdeas(id, ideas) {
  return request(`/api/history/${encodeURIComponent(id)}/ideas`, {
    method: "PATCH",
    body: JSON.stringify({ ideas }),
  });
}

export function removeHistoryEntry(id) {
  return request(`/api/history/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function clearHistoryEntries() {
  return request("/api/history", {
    method: "DELETE",
  });
}

export function getModes() {
  return get("/api/modes");
}

export function expandStoryboard(payload, signal) {
  return post("/api/expand", payload, { signal });
}

export function batchExpandStoryboard(payload) {
  return post("/api/batch-expand", payload);
}

export function createExpandTask(payload) {
  return post("/api/tasks/expand", payload);
}

export function createBatchExpandTask(payload) {
  return post("/api/tasks/batch-expand", payload);
}

export function createImageTask(payload) {
  return post("/api/tasks/generate-image", payload);
}

export function generateStoryboardImage(payload) {
  return post("/api/generate-image", payload);
}

export function getTaskStatus(taskId) {
  return get(`/api/tasks/${encodeURIComponent(taskId)}`);
}

export function cancelTaskById(taskId) {
  return post(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {});
}
