import { STORYBOARD_MODES } from "../modes.js";
import {
  createChapter,
  createProject,
  deleteChapter,
  deleteChapterSequenceVideo,
  deleteProject,
  getChapterShots,
  getWorkspaceBootstrap,
  listChapterSequenceVideos,
  listChapters,
  listProjects,
  replaceChapterShots,
  updateChapter,
  updateChapterShotImage,
  updateChapterShotVideo,
  updateProject,
  upsertChapterSequenceVideo,
} from "../projectStore.js";
import { failure, success } from "../response.js";

export function registerWorkspaceRoutes(app) {
  app.get("/api/modes", (_req, res) => {
    res.json(success({ modes: STORYBOARD_MODES }, "modes fetched"));
  });

  app.get("/api/workspace/bootstrap", (_req, res) => {
    const data = getWorkspaceBootstrap();
    res.json(success(data, "workspace bootstrap fetched"));
  });

  app.get("/api/projects", (req, res) => {
    const limit = Number(req.query?.limit) || 100;
    const items = listProjects(limit);
    res.json(success({ items }, "projects fetched"));
  });

  app.post("/api/projects", (req, res) => {
    const body = req.body || {};
    const item = createProject({
      name: body.name,
      description: body.description,
    });
    res.status(201).json(success({ item }, "project created"));
  });

  app.patch("/api/projects/:projectId", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    if (!projectId) {
      res.status(400).json(failure("projectId 不能为空。", 400));
      return;
    }

    const item = updateProject(projectId, {
      name: req.body?.name,
      description: req.body?.description,
    });
    if (!item) {
      res.status(404).json(failure("项目不存在。", 404));
      return;
    }

    res.json(success({ item }, "project updated"));
  });

  app.delete("/api/projects/:projectId", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    if (!projectId) {
      res.status(400).json(failure("projectId 不能为空。", 400));
      return;
    }

    const result = deleteProject(projectId);
    if (!result?.ok) {
      if (result?.reason === "not_found") {
        res.status(404).json(failure("项目不存在。", 404));
        return;
      }
      if (result?.reason === "last_project") {
        res.status(409).json(failure("至少保留一个项目，无法删除最后一个项目。", 409));
        return;
      }
      res.status(400).json(failure("项目删除失败。", 400));
      return;
    }

    res.json(success(result, "project deleted"));
  });

  app.get("/api/projects/:projectId/chapters", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    if (!projectId) {
      res.status(400).json(failure("projectId 不能为空。", 400));
      return;
    }
    const limit = Number(req.query?.limit) || 200;
    const items = listChapters(projectId, limit);
    res.json(success({ items }, "chapters fetched"));
  });

  app.post("/api/projects/:projectId/chapters", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    if (!projectId) {
      res.status(400).json(failure("projectId 不能为空。", 400));
      return;
    }

    const item = createChapter(projectId, {
      title: req.body?.title,
    });
    if (!item) {
      res.status(404).json(failure("项目不存在。", 404));
      return;
    }

    res.status(201).json(success({ item }, "chapter created"));
  });

  app.patch("/api/projects/:projectId/chapters/:chapterId", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    if (!projectId || !chapterId) {
      res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
      return;
    }

    const item = updateChapter(projectId, chapterId, {
      title: req.body?.title,
    });
    if (!item) {
      res.status(404).json(failure("章节不存在。", 404));
      return;
    }

    res.json(success({ item }, "chapter updated"));
  });

  app.delete("/api/projects/:projectId/chapters/:chapterId", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    if (!projectId || !chapterId) {
      res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
      return;
    }

    const result = deleteChapter(projectId, chapterId);
    if (!result?.ok) {
      if (result?.reason === "not_found") {
        res.status(404).json(failure("章节不存在。", 404));
        return;
      }
      if (result?.reason === "last_chapter") {
        res.status(409).json(failure("至少保留一个章节，无法删除最后一个章节。", 409));
        return;
      }
      res.status(400).json(failure("章节删除失败。", 400));
      return;
    }

    res.json(success(result, "chapter deleted"));
  });

  app.get("/api/projects/:projectId/chapters/:chapterId/shots", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    if (!projectId || !chapterId) {
      res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
      return;
    }

    const ideas = getChapterShots(projectId, chapterId);
    if (ideas === null) {
      res.status(404).json(failure("章节不存在。", 404));
      return;
    }

    res.json(success({ ideas, count: ideas.length }, "chapter shots fetched"));
  });

  app.put("/api/projects/:projectId/chapters/:chapterId/shots", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    const ideas = Array.isArray(req.body?.ideas) ? req.body.ideas : [];
    if (!projectId || !chapterId) {
      res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
      return;
    }

    const result = replaceChapterShots(projectId, chapterId, ideas);
    if (!result) {
      res.status(404).json(failure("章节不存在。", 404));
      return;
    }

    res.json(success({ ...result }, "chapter shots replaced"));
  });

  app.patch("/api/projects/:projectId/chapters/:chapterId/shots/:shotIndex/image", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    const shotIndex = Number(req.params.shotIndex);
    const generatedImage = req.body?.generatedImage;

    if (!projectId || !chapterId) {
      res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
      return;
    }
    if (!Number.isInteger(shotIndex) || shotIndex < 0) {
      res.status(400).json(failure("shotIndex 必须是 >= 0 的整数。", 400));
      return;
    }
    if (!generatedImage || typeof generatedImage !== "object") {
      res.status(400).json(failure("generatedImage 不能为空。", 400));
      return;
    }

    const ok = updateChapterShotImage(projectId, chapterId, shotIndex, generatedImage);
    if (!ok) {
      res.status(404).json(failure("章节或分镜不存在。", 404));
      return;
    }

    res.json(success({ projectId, chapterId, shotIndex }, "chapter shot image updated"));
  });

  app.patch("/api/projects/:projectId/chapters/:chapterId/shots/:shotIndex/video", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    const shotIndex = Number(req.params.shotIndex);
    const generatedVideo = req.body?.generatedVideo;

    if (!projectId || !chapterId) {
      res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
      return;
    }
    if (!Number.isInteger(shotIndex) || shotIndex < 0) {
      res.status(400).json(failure("shotIndex 必须是 >= 0 的整数。", 400));
      return;
    }
    if (!generatedVideo || typeof generatedVideo !== "object") {
      res.status(400).json(failure("generatedVideo 不能为空。", 400));
      return;
    }

    const ok = updateChapterShotVideo(projectId, chapterId, shotIndex, generatedVideo);
    if (!ok) {
      res.status(404).json(failure("章节或分镜不存在。", 404));
      return;
    }

    res.json(success({ projectId, chapterId, shotIndex }, "chapter shot video updated"));
  });

  app.get("/api/projects/:projectId/chapters/:chapterId/sequence-videos", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    if (!projectId || !chapterId) {
      res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
      return;
    }

    const limit = Number(req.query?.limit) || 60;
    const items = listChapterSequenceVideos(projectId, chapterId, limit);
    if (items === null) {
      res.status(404).json(failure("章节不存在。", 404));
      return;
    }

    res.json(success({ items }, "sequence videos fetched"));
  });

  app.post("/api/projects/:projectId/chapters/:chapterId/sequence-videos", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    if (!projectId || !chapterId) {
      res.status(400).json(failure("projectId 或 chapterId 不能为空。", 400));
      return;
    }

    const item = upsertChapterSequenceVideo(projectId, chapterId, req.body || {});
    if (!item) {
      res.status(404).json(failure("章节不存在。", 404));
      return;
    }

    res.status(201).json(success({ item }, "sequence video saved"));
  });

  app.delete("/api/projects/:projectId/chapters/:chapterId/sequence-videos/:id", (req, res) => {
    const projectId = String(req.params.projectId || "").trim();
    const chapterId = String(req.params.chapterId || "").trim();
    const id = String(req.params.id || "").trim();
    if (!projectId || !chapterId || !id) {
      res.status(400).json(failure("projectId、chapterId 或 id 不能为空。", 400));
      return;
    }

    const result = deleteChapterSequenceVideo(projectId, chapterId, id);
    if (!result?.ok) {
      if (result?.reason === "chapter_not_found") {
        res.status(404).json(failure("章节不存在。", 404));
        return;
      }
      if (result?.reason === "not_found") {
        res.status(404).json(failure("串联视频历史不存在。", 404));
        return;
      }
      res.status(400).json(failure("删除失败。", 400));
      return;
    }

    res.json(success({ id: result.id }, "sequence video removed"));
  });
}
