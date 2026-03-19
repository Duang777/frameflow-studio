import assert from "node:assert/strict";
import test from "node:test";
import request from "supertest";

process.env.NODE_ENV = "test";
process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || "test-key";

const { createApp } = await import("./index.js");
const app = createApp();

test("GET /api/health returns service info", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body?.code, 0);
  assert.equal(res.body?.data?.ok, true);
});

test("workspace bootstrap returns project and chapter", async () => {
  const res = await request(app).get("/api/workspace/bootstrap");
  assert.equal(res.status, 200);
  assert.ok(res.body?.data?.project?.id);
  assert.ok(res.body?.data?.chapter?.id);
});

test("sequence videos CRUD works under project/chapter scope", async () => {
  const boot = await request(app).get("/api/workspace/bootstrap");
  const projectId = boot.body?.data?.project?.id;
  const chapterId = boot.body?.data?.chapter?.id;
  assert.ok(projectId);
  assert.ok(chapterId);

  const record = {
    title: `test-seq-${Date.now()}`,
    shotIndexes: [0, 1],
    shots: [
      { ideaIndex: 0, title: "A", scene: "scene a" },
      { ideaIndex: 1, title: "B", scene: "scene b" },
    ],
    config: {
      aspectRatio: "16:9",
      durationSeconds: 6,
      referenceImagePolicy: "all",
    },
    generatedVideo: {
      status: "success",
      url: "https://example.com/video.mp4",
      mimeType: "video/mp4",
      model: "test-model",
      prompt: "test",
      durationSeconds: 6,
    },
    referenceImageCount: 1,
  };

  const createRes = await request(app)
    .post(`/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/sequence-videos`)
    .send(record);
  assert.equal(createRes.status, 201);
  const id = createRes.body?.data?.item?.id;
  assert.ok(id);

  const listRes = await request(app).get(
    `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/sequence-videos?limit=20`
  );
  assert.equal(listRes.status, 200);
  assert.equal(Array.isArray(listRes.body?.data?.items), true);
  assert.equal(listRes.body.data.items.some((item) => item.id === id), true);

  const deleteRes = await request(app).delete(
    `/api/projects/${encodeURIComponent(projectId)}/chapters/${encodeURIComponent(chapterId)}/sequence-videos/${encodeURIComponent(id)}`
  );
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body?.code, 0);
});

test("task creation returns enhanced task fields", async () => {
  const createRes = await request(app).post("/api/tasks/expand").send({
    seedText: "雨夜街角，主角停在霓虹倒影上。",
    modeId: "ad-film",
    styleBias: "cinematic",
    ideaCount: 6,
  });
  assert.equal(createRes.status, 202);
  assert.equal(createRes.body?.code, 0);
  const task = createRes.body?.data?.task;
  assert.ok(task?.id);
  assert.equal(typeof task?.stageCode, "string");
  assert.equal(typeof task?.summary, "string");
  assert.equal(typeof task?.retryable, "boolean");
});
