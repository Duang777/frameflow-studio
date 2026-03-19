import assert from "node:assert/strict";
import test from "node:test";
import { createTask, getTask } from "./taskManager.js";

async function waitUntilDone(taskId, timeoutMs = 1200) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const task = getTask(taskId);
    if (task && ["success", "error", "cancelled"].includes(task.status)) {
      return task;
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("timeout");
}

test("task manager exposes stageCode/summary/retryable for success", async () => {
  const created = createTask({
    type: "expand",
    payload: { modeId: "ad-film" },
    run: async (ctx) => {
      ctx.setStage("requesting_model", "请求模型");
      ctx.setProgress(48);
      return { ok: true };
    },
  });

  const finalTask = await waitUntilDone(created.id);
  assert.equal(finalTask.status, "success");
  assert.equal(finalTask.stageCode, "completed");
  assert.equal(finalTask.retryable, false);
  assert.equal(typeof finalTask.summary, "string");
  assert.deepEqual(finalTask.result, { ok: true });
});

test("task manager exposes retryable=true on error", async () => {
  const created = createTask({
    type: "video",
    payload: { sequenceCount: 3, referenceImagePolicy: "all" },
    run: async (ctx) => {
      ctx.setStage("requesting_model", "请求模型");
      throw new Error("boom");
    },
  });

  const finalTask = await waitUntilDone(created.id);
  assert.equal(finalTask.status, "error");
  assert.equal(finalTask.stageCode, "failed");
  assert.equal(finalTask.retryable, true);
  assert.match(finalTask.summary, /boom|失败/);
});
