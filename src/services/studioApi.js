import { get, post } from "./httpClient";

export function getHealth() {
  return get("/api/health");
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

export function getTaskStatus(taskId) {
  return get(`/api/tasks/${encodeURIComponent(taskId)}`);
}

export function cancelTaskById(taskId) {
  return post(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {});
}
