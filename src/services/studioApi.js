import { get, post, request } from "./httpClient";

export function getHealth() {
  return get("/api/health");
}

export function getWorkspaceBootstrap() {
  return get("/api/workspace/bootstrap");
}

export function getProjects(limit = 100) {
  const safe = Math.max(1, Math.min(200, Number(limit) || 100));
  return get(`/api/projects?limit=${safe}`);
}

export function createProject(payload) {
  return post("/api/projects", payload || {});
}

export function updateProject(projectId, payload) {
  return request(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload || {}),
  });
}

export function deleteProject(projectId) {
  return request(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
}

export function getChapters(projectId, limit = 200) {
  const safe = Math.max(1, Math.min(500, Number(limit) || 200));
  return get(`/api/projects/${encodeURIComponent(projectId)}/chapters?limit=${safe}`);
}

export function createChapter(projectId, payload) {
  return post(`/api/projects/${encodeURIComponent(projectId)}/chapters`, payload || {});
}

export function updateChapter(projectId, chapterId, payload) {
  return request(`/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload || {}),
  });
}

export function deleteChapter(projectId, chapterId) {
  return request(`/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}`, {
    method: "DELETE",
  });
}

export function getChapterShots(projectId, chapterId) {
  return get(`/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/shots`);
}

export function replaceChapterShots(projectId, chapterId, ideas) {
  return request(`/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/shots`, {
    method: "PUT",
    body: JSON.stringify({ ideas: Array.isArray(ideas) ? ideas : [] }),
  });
}

export function updateChapterShotImage(projectId, chapterId, shotIndex, generatedImage) {
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/shots/${encodeURIComponent(
      Number(shotIndex)
    )}/image`,
    {
      method: "PATCH",
      body: JSON.stringify({ generatedImage }),
    }
  );
}

export function updateChapterShotVideo(projectId, chapterId, shotIndex, generatedVideo) {
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/shots/${encodeURIComponent(
      Number(shotIndex)
    )}/video`,
    {
      method: "PATCH",
      body: JSON.stringify({ generatedVideo }),
    }
  );
}

export function getChapterSequenceVideos(projectId, chapterId, limit = 60) {
  const safe = Math.max(1, Math.min(200, Number(limit) || 60));
  return get(
    `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/sequence-videos?limit=${safe}`
  );
}

export function saveChapterSequenceVideo(projectId, chapterId, record) {
  return post(
    `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/sequence-videos`,
    record || {}
  );
}

export function deleteChapterSequenceVideo(projectId, chapterId, id) {
  return request(
    `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/sequence-videos/${encodeURIComponent(
      id
    )}`,
    {
      method: "DELETE",
    }
  );
}

export function getHistory(limit = 30) {
  const safe = Math.max(1, Math.min(200, Number(limit) || 30));
  return get(`/api/history?limit=${safe}`);
}

export function getHistoryEntry(id) {
  return get(`/api/history/${encodeURIComponent(id)}`);
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

export function updateHistoryEntryIdeaImage(id, index, generatedImage) {
  return request(`/api/history/${encodeURIComponent(id)}/idea-image`, {
    method: "PATCH",
    body: JSON.stringify({
      index: Number(index),
      generatedImage,
    }),
  });
}

export function updateHistoryEntryIdeaVideo(id, index, generatedVideo) {
  return request(`/api/history/${encodeURIComponent(id)}/idea-video`, {
    method: "PATCH",
    body: JSON.stringify({
      index: Number(index),
      generatedVideo,
    }),
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

export function createVideoTask(payload) {
  return post("/api/tasks/generate-video", payload);
}

export function generateStoryboardImage(payload) {
  return post("/api/generate-image", payload);
}

export function generateStoryboardVideo(payload) {
  return post("/api/generate-video", payload);
}

export function getTaskStatus(taskId) {
  return get(`/api/tasks/${encodeURIComponent(taskId)}`);
}

export function cancelTaskById(taskId) {
  return post(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {});
}
