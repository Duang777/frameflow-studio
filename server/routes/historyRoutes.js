import {
  clearHistory,
  getHistoryById,
  listHistory,
  removeHistory,
  updateHistoryIdeaImage,
  updateHistoryIdeaVideo,
  updateHistoryIdeas,
  upsertHistory,
} from "../historyStore.js";
import { failure, success } from "../response.js";

export function registerHistoryRoutes(app) {
  app.get("/api/history", (req, res) => {
    const limit = Number(req.query?.limit) || 30;
    const items = listHistory(limit);
    res.json(success({ items }, "history fetched"));
  });

  app.get("/api/history/:id", (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json(failure("history id 不能为空。", 400));
      return;
    }
    const item = getHistoryById(id);
    if (!item) {
      res.status(404).json(failure("历史记录不存在。", 404));
      return;
    }
    res.json(success({ item }, "history fetched"));
  });

  app.post("/api/history", (req, res) => {
    const body = req.body || {};
    const ideas = Array.isArray(body?.ideas) ? body.ideas : [];
    if (ideas.length === 0) {
      res.status(400).json(failure("history ideas 不能为空。", 400));
      return;
    }

    const saved = upsertHistory({
      id: body.id,
      createdAt: body.createdAt,
      updatedAt: Date.now(),
      seedText: body.seedText,
      imageName: body.imageName,
      modeId: body.modeId,
      modeName: body.modeName,
      styleBias: body.styleBias,
      styleName: body.styleName,
      ideas,
    });
    res.json(success({ item: saved }, "history saved"));
  });

  app.patch("/api/history/:id/ideas", (req, res) => {
    const id = String(req.params.id || "").trim();
    const ideas = Array.isArray(req.body?.ideas) ? req.body.ideas : [];
    if (!id) {
      res.status(400).json(failure("history id 不能为空。", 400));
      return;
    }
    if (ideas.length === 0) {
      res.status(400).json(failure("ideas 不能为空。", 400));
      return;
    }

    const ok = updateHistoryIdeas(id, ideas);
    if (!ok) {
      res.status(404).json(failure("历史记录不存在。", 404));
      return;
    }

    res.json(success({ id, count: ideas.length }, "history ideas updated"));
  });

  app.patch("/api/history/:id/idea-image", (req, res) => {
    const id = String(req.params.id || "").trim();
    const index = Number(req.body?.index);
    const generatedImage = req.body?.generatedImage;
    if (!id) {
      res.status(400).json(failure("history id 不能为空。", 400));
      return;
    }
    if (!Number.isInteger(index) || index < 0) {
      res.status(400).json(failure("index 必须是 >= 0 的整数。", 400));
      return;
    }
    if (!generatedImage || typeof generatedImage !== "object") {
      res.status(400).json(failure("generatedImage 不能为空。", 400));
      return;
    }

    const ok = updateHistoryIdeaImage(id, index, generatedImage);
    if (!ok) {
      res.status(404).json(failure("历史记录或分镜索引不存在。", 404));
      return;
    }

    res.json(success({ id, index }, "history idea image updated"));
  });

  app.patch("/api/history/:id/idea-video", (req, res) => {
    const id = String(req.params.id || "").trim();
    const index = Number(req.body?.index);
    const generatedVideo = req.body?.generatedVideo;
    if (!id) {
      res.status(400).json(failure("history id 不能为空。", 400));
      return;
    }
    if (!Number.isInteger(index) || index < 0) {
      res.status(400).json(failure("index 必须是 >= 0 的整数。", 400));
      return;
    }
    if (!generatedVideo || typeof generatedVideo !== "object") {
      res.status(400).json(failure("generatedVideo 不能为空。", 400));
      return;
    }

    const ok = updateHistoryIdeaVideo(id, index, generatedVideo);
    if (!ok) {
      res.status(404).json(failure("历史记录或分镜索引不存在。", 404));
      return;
    }

    res.json(success({ id, index }, "history idea video updated"));
  });

  app.delete("/api/history/:id", (req, res) => {
    const id = String(req.params.id || "").trim();
    if (!id) {
      res.status(400).json(failure("history id 不能为空。", 400));
      return;
    }
    const ok = removeHistory(id);
    if (!ok) {
      res.status(404).json(failure("历史记录不存在。", 404));
      return;
    }
    res.json(success({ id }, "history removed"));
  });

  app.delete("/api/history", (_req, res) => {
    clearHistory();
    res.json(success({ ok: true }, "history cleared"));
  });
}
