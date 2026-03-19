import assert from "node:assert/strict";
import test from "node:test";
import {
  applyReferencePolicyToSequenceIdeas,
  countSequenceReferenceImages,
  formatReferenceImagePolicyLabel,
  formatTaskStageSummary,
  normalizeIdeaMediaFilter,
  normalizeQueueFilter,
  normalizeReferenceImagePolicyValue,
  normalizeWorkflowHubTab,
  splitImageReference,
} from "./studioState.js";

test("normalize filters fallback safely", () => {
  assert.equal(normalizeQueueFilter("running"), "running");
  assert.equal(normalizeQueueFilter("unknown"), "all");
  assert.equal(normalizeWorkflowHubTab("history"), "history");
  assert.equal(normalizeWorkflowHubTab("bad"), "batch");
  assert.equal(normalizeIdeaMediaFilter("with_video"), "with_video");
  assert.equal(normalizeIdeaMediaFilter("oops"), "all");
});

test("normalize reference policy and labels", () => {
  assert.equal(normalizeReferenceImagePolicyValue("first_last"), "first_last");
  assert.equal(normalizeReferenceImagePolicyValue("X"), "all");
  assert.equal(formatReferenceImagePolicyLabel("keyframes"), "关键帧");
  assert.equal(formatReferenceImagePolicyLabel("text_only"), "仅文本");
});

test("splitImageReference recognizes data url and remote url", () => {
  assert.deepEqual(splitImageReference(""), { dataUrl: "", url: "" });
  assert.deepEqual(splitImageReference("data:image/png;base64,abc"), {
    dataUrl: "data:image/png;base64,abc",
    url: "",
  });
  assert.deepEqual(splitImageReference("https://example.com/a.png"), {
    dataUrl: "",
    url: "https://example.com/a.png",
  });
});

test("applyReferencePolicyToSequenceIdeas filters references correctly", () => {
  const sequence = [
    { title: "1", referenceImageUrl: "https://a.com/1.png" },
    { title: "2", referenceImageUrl: "https://a.com/2.png" },
    { title: "3", referenceImageUrl: "https://a.com/3.png" },
    { title: "4", referenceImageUrl: "https://a.com/4.png" },
    { title: "5", referenceImageUrl: "https://a.com/5.png" },
  ];

  const keyframes = applyReferencePolicyToSequenceIdeas(sequence, "keyframes");
  assert.equal(countSequenceReferenceImages(keyframes), 3);
  assert.equal(keyframes[1].referenceImageUrl, "");
  assert.equal(keyframes[3].referenceImageUrl, "");

  const firstLast = applyReferencePolicyToSequenceIdeas(sequence, "first_last");
  assert.equal(countSequenceReferenceImages(firstLast), 2);

  const textOnly = applyReferencePolicyToSequenceIdeas(sequence, "text_only");
  assert.equal(countSequenceReferenceImages(textOnly), 0);
});

test("formatTaskStageSummary includes stage text and progress", () => {
  assert.equal(formatTaskStageSummary({ stageText: "请求模型", progress: 36.2 }), "请求模型 · 36%");
  assert.equal(formatTaskStageSummary({ progress: 88 }), "任务进度 88%");
});
