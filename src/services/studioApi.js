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
