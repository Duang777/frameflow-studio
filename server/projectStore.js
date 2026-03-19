import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "storyboard.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shots (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    shot_index INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    scene TEXT NOT NULL DEFAULT '',
    camera TEXT NOT NULL DEFAULT '',
    mood TEXT NOT NULL DEFAULT '',
    twist TEXT NOT NULL DEFAULT '',
    seed_idea TEXT NOT NULL DEFAULT '',
    generated_image_json TEXT NOT NULL DEFAULT '{}',
    generated_video_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
    UNIQUE (chapter_id, shot_index)
  );

  CREATE TABLE IF NOT EXISTS shot_images (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    shot_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    image_url TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'success',
    error_text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
    FOREIGN KEY (shot_id) REFERENCES shots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS shot_videos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    shot_id TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    video_url TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'success',
    error_text TEXT NOT NULL DEFAULT '',
    prompt_text TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
    FOREIGN KEY (shot_id) REFERENCES shots(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sequence_videos (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    shot_indexes_json TEXT NOT NULL DEFAULT '[]',
    shots_json TEXT NOT NULL DEFAULT '[]',
    config_json TEXT NOT NULL DEFAULT '{}',
    generated_video_json TEXT NOT NULL DEFAULT '{}',
    reference_image_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chapters_project_sort
    ON chapters(project_id, sort_order ASC, created_at ASC);

  CREATE INDEX IF NOT EXISTS idx_shots_chapter_index
    ON shots(chapter_id, shot_index ASC);

  CREATE INDEX IF NOT EXISTS idx_shot_images_shot_version
    ON shot_images(shot_id, version DESC);

  CREATE INDEX IF NOT EXISTS idx_shot_videos_shot_version
    ON shot_videos(shot_id, version DESC);

  CREATE INDEX IF NOT EXISTS idx_sequence_videos_chapter_created
    ON sequence_videos(chapter_id, created_at DESC);
`);

ensureShotsGeneratedVideoColumn();

const listProjectsStmt = db.prepare(`
  SELECT
    p.id,
    p.name,
    p.description,
    p.created_at,
    p.updated_at,
    (
      SELECT COUNT(*)
      FROM chapters c
      WHERE c.project_id = p.id
    ) AS chapter_count,
    (
      SELECT COUNT(*)
      FROM shots s
      WHERE s.project_id = p.id
    ) AS shot_count
  FROM projects p
  ORDER BY p.updated_at DESC
  LIMIT ?
`);

const getProjectByIdStmt = db.prepare(`
  SELECT
    p.id,
    p.name,
    p.description,
    p.created_at,
    p.updated_at,
    (
      SELECT COUNT(*)
      FROM chapters c
      WHERE c.project_id = p.id
    ) AS chapter_count,
    (
      SELECT COUNT(*)
      FROM shots s
      WHERE s.project_id = p.id
    ) AS shot_count
  FROM projects p
  WHERE p.id = ?
  LIMIT 1
`);

const insertProjectStmt = db.prepare(`
  INSERT INTO projects (id, name, description, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);

const updateProjectStmt = db.prepare(`
  UPDATE projects
  SET name = ?, description = ?, updated_at = ?
  WHERE id = ?
`);

const deleteProjectStmt = db.prepare(`DELETE FROM projects WHERE id = ?`);

const touchProjectStmt = db.prepare(`
  UPDATE projects
  SET updated_at = ?
  WHERE id = ?
`);

const countProjectsStmt = db.prepare(`SELECT COUNT(*) AS count FROM projects`);

const findFallbackProjectStmt = db.prepare(`
  SELECT id
  FROM projects
  WHERE id <> ?
  ORDER BY updated_at DESC, created_at DESC
  LIMIT 1
`);

const listChaptersStmt = db.prepare(`
  SELECT
    c.id,
    c.project_id,
    c.title,
    c.sort_order,
    c.created_at,
    c.updated_at,
    (
      SELECT COUNT(*)
      FROM shots s
      WHERE s.chapter_id = c.id
    ) AS shot_count
  FROM chapters c
  WHERE c.project_id = ?
  ORDER BY c.sort_order ASC, c.created_at ASC
  LIMIT ?
`);

const getChapterByProjectStmt = db.prepare(`
  SELECT
    c.id,
    c.project_id,
    c.title,
    c.sort_order,
    c.created_at,
    c.updated_at,
    (
      SELECT COUNT(*)
      FROM shots s
      WHERE s.chapter_id = c.id
    ) AS shot_count
  FROM chapters c
  WHERE c.id = ? AND c.project_id = ?
  LIMIT 1
`);

const getChapterMaxSortStmt = db.prepare(`
  SELECT COALESCE(MAX(sort_order), 0) AS max_sort
  FROM chapters
  WHERE project_id = ?
`);

const insertChapterStmt = db.prepare(`
  INSERT INTO chapters (id, project_id, title, sort_order, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const updateChapterStmt = db.prepare(`
  UPDATE chapters
  SET title = ?, updated_at = ?
  WHERE id = ?
`);

const deleteChapterStmt = db.prepare(`DELETE FROM chapters WHERE id = ?`);

const countProjectChaptersStmt = db.prepare(`
  SELECT COUNT(*) AS count
  FROM chapters
  WHERE project_id = ?
`);

const findFallbackChapterStmt = db.prepare(`
  SELECT id
  FROM chapters
  WHERE project_id = ? AND id <> ?
  ORDER BY sort_order ASC, created_at ASC
  LIMIT 1
`);

const listChapterOrderStmt = db.prepare(`
  SELECT id
  FROM chapters
  WHERE project_id = ?
  ORDER BY sort_order ASC, created_at ASC
`);

const updateChapterSortStmt = db.prepare(`
  UPDATE chapters
  SET sort_order = ?, updated_at = ?
  WHERE id = ?
`);

const listShotsStmt = db.prepare(`
  SELECT
    id,
    project_id,
    chapter_id,
    shot_index,
    title,
    scene,
    camera,
    mood,
    twist,
    seed_idea,
    generated_image_json,
    generated_video_json,
    created_at,
    updated_at
  FROM shots
  WHERE project_id = ? AND chapter_id = ?
  ORDER BY shot_index ASC
`);

const deleteShotsByChapterStmt = db.prepare(`DELETE FROM shots WHERE chapter_id = ?`);
const deleteShotImagesByChapterStmt = db.prepare(`DELETE FROM shot_images WHERE chapter_id = ?`);

const insertShotStmt = db.prepare(`
  INSERT INTO shots (
    id, project_id, chapter_id, shot_index, title, scene, camera, mood, twist, seed_idea, generated_image_json, generated_video_json, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const getShotByIndexStmt = db.prepare(`
  SELECT id, project_id, chapter_id, shot_index, generated_image_json, generated_video_json
  FROM shots
  WHERE project_id = ? AND chapter_id = ? AND shot_index = ?
  LIMIT 1
`);

const updateShotImageStmt = db.prepare(`
  UPDATE shots
  SET generated_image_json = ?, updated_at = ?
  WHERE id = ?
`);

const updateShotVideoStmt = db.prepare(`
  UPDATE shots
  SET generated_video_json = ?, updated_at = ?
  WHERE id = ?
`);

const getShotImageMaxVersionStmt = db.prepare(`
  SELECT COALESCE(MAX(version), 0) AS max_version
  FROM shot_images
  WHERE shot_id = ?
`);

const insertShotImageStmt = db.prepare(`
  INSERT INTO shot_images (
    id, project_id, chapter_id, shot_id, version, image_url, model, status, error_text, created_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const deleteShotVideosByChapterStmt = db.prepare(`DELETE FROM shot_videos WHERE chapter_id = ?`);

const getShotVideoMaxVersionStmt = db.prepare(`
  SELECT COALESCE(MAX(version), 0) AS max_version
  FROM shot_videos
  WHERE shot_id = ?
`);

const insertShotVideoStmt = db.prepare(`
  INSERT INTO shot_videos (
    id, project_id, chapter_id, shot_id, version, video_url, mime_type, duration_seconds, model, status, error_text, prompt_text, created_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
`);

const listSequenceVideosStmt = db.prepare(`
  SELECT
    id,
    project_id,
    chapter_id,
    title,
    shot_indexes_json,
    shots_json,
    config_json,
    generated_video_json,
    reference_image_count,
    created_at,
    updated_at
  FROM sequence_videos
  WHERE project_id = ? AND chapter_id = ?
  ORDER BY created_at DESC
  LIMIT ?
`);

const getSequenceVideoByIdStmt = db.prepare(`
  SELECT
    id,
    project_id,
    chapter_id,
    title,
    shot_indexes_json,
    shots_json,
    config_json,
    generated_video_json,
    reference_image_count,
    created_at,
    updated_at
  FROM sequence_videos
  WHERE id = ? AND project_id = ? AND chapter_id = ?
  LIMIT 1
`);

const upsertSequenceVideoStmt = db.prepare(`
  INSERT INTO sequence_videos (
    id,
    project_id,
    chapter_id,
    title,
    shot_indexes_json,
    shots_json,
    config_json,
    generated_video_json,
    reference_image_count,
    created_at,
    updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    project_id = excluded.project_id,
    chapter_id = excluded.chapter_id,
    title = excluded.title,
    shot_indexes_json = excluded.shot_indexes_json,
    shots_json = excluded.shots_json,
    config_json = excluded.config_json,
    generated_video_json = excluded.generated_video_json,
    reference_image_count = excluded.reference_image_count,
    updated_at = excluded.updated_at
`);

const deleteSequenceVideoStmt = db.prepare(`
  DELETE FROM sequence_videos
  WHERE id = ? AND project_id = ? AND chapter_id = ?
`);

export function listProjects(limit = 100) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  return listProjectsStmt.all(safeLimit).map(mapProjectRow);
}

export function createProject(input = {}) {
  const now = Date.now();
  const id = String(input.id || makeId("proj"));
  const name = String(input.name || "").trim() || "未命名项目";
  const description = String(input.description || "").trim();
  insertProjectStmt.run(id, name, description, now, now);
  return getProjectById(id);
}

export function updateProject(projectId, input = {}) {
  const current = getProjectById(projectId);
  if (!current) {
    return null;
  }

  const now = Date.now();
  const nextName = String(input.name || "").trim() || current.name || "未命名项目";
  const nextDescription =
    input.description === undefined ? current.description : String(input.description || "").trim();

  updateProjectStmt.run(nextName, nextDescription, now, current.id);
  return getProjectById(current.id);
}

export function deleteProject(projectId) {
  const current = getProjectById(projectId);
  if (!current) {
    return {
      ok: false,
      reason: "not_found",
    };
  }

  const totalProjects = Number(countProjectsStmt.get()?.count || 0);
  if (totalProjects <= 1) {
    return {
      ok: false,
      reason: "last_project",
    };
  }

  const fallbackProjectId = String(findFallbackProjectStmt.get(current.id)?.id || "").trim();

  db.exec("BEGIN IMMEDIATE");
  try {
    deleteProjectStmt.run(current.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const nextProject = fallbackProjectId ? getProjectById(fallbackProjectId) : listProjects(1)[0] || null;
  let nextChapter = null;

  if (nextProject?.id) {
    const chapters = listChapters(nextProject.id, 200);
    nextChapter = chapters[0] || null;
    if (!nextChapter) {
      nextChapter = createChapter(nextProject.id, { title: "第 1 章" });
    }
  }

  return {
    ok: true,
    deletedProjectId: current.id,
    nextProject,
    nextChapter,
  };
}

export function getProjectById(projectId) {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId) return null;
  const row = getProjectByIdStmt.get(safeProjectId);
  return row ? mapProjectRow(row) : null;
}

export function listChapters(projectId, limit = 200) {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId) return [];
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
  return listChaptersStmt.all(safeProjectId, safeLimit).map(mapChapterRow);
}

export function createChapter(projectId, input = {}) {
  const safeProjectId = String(projectId || "").trim();
  if (!safeProjectId) return null;
  const project = getProjectByIdStmt.get(safeProjectId);
  if (!project) return null;

  const maxSort = Number(getChapterMaxSortStmt.get(safeProjectId)?.max_sort || 0);
  const now = Date.now();
  const chapter = {
    id: String(input.id || makeId("chap")),
    projectId: safeProjectId,
    title: String(input.title || "").trim() || `第 ${maxSort + 1} 章`,
    sortOrder: maxSort + 1,
    createdAt: now,
    updatedAt: now,
  };

  insertChapterStmt.run(
    chapter.id,
    chapter.projectId,
    chapter.title,
    chapter.sortOrder,
    chapter.createdAt,
    chapter.updatedAt
  );
  touchProjectStmt.run(now, safeProjectId);
  return getChapterById(safeProjectId, chapter.id);
}

export function updateChapter(projectId, chapterId, input = {}) {
  const current = getChapterById(projectId, chapterId);
  if (!current) {
    return null;
  }

  const now = Date.now();
  const nextTitle = String(input.title || "").trim() || current.title || "未命名章节";
  updateChapterStmt.run(nextTitle, now, current.id);
  touchProjectStmt.run(now, current.projectId);
  return getChapterById(current.projectId, current.id);
}

export function deleteChapter(projectId, chapterId) {
  const current = getChapterById(projectId, chapterId);
  if (!current) {
    return {
      ok: false,
      reason: "not_found",
    };
  }

  const chapterCount = Number(countProjectChaptersStmt.get(current.projectId)?.count || 0);
  if (chapterCount <= 1) {
    return {
      ok: false,
      reason: "last_chapter",
    };
  }

  const fallbackChapterId = String(findFallbackChapterStmt.get(current.projectId, current.id)?.id || "").trim();
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    deleteChapterStmt.run(current.id);
    normalizeChapterSortOrders(current.projectId, now);
    touchProjectStmt.run(now, current.projectId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  let nextChapter = fallbackChapterId ? getChapterById(current.projectId, fallbackChapterId) : null;
  if (!nextChapter) {
    const chapters = listChapters(current.projectId, 200);
    nextChapter = chapters[0] || null;
  }

  return {
    ok: true,
    projectId: current.projectId,
    deletedChapterId: current.id,
    nextChapter,
  };
}

export function getChapterById(projectId, chapterId) {
  const safeProjectId = String(projectId || "").trim();
  const safeChapterId = String(chapterId || "").trim();
  if (!safeProjectId || !safeChapterId) return null;
  const row = getChapterByProjectStmt.get(safeChapterId, safeProjectId);
  return row ? mapChapterRow(row) : null;
}

export function getChapterShots(projectId, chapterId) {
  const chapter = getChapterById(projectId, chapterId);
  if (!chapter) return null;
  const rows = listShotsStmt.all(chapter.projectId, chapter.id);
  return rows.map(mapShotRowToIdea);
}

export function replaceChapterShots(projectId, chapterId, ideas) {
  const chapter = getChapterById(projectId, chapterId);
  if (!chapter) return null;

  const safeIdeas = Array.isArray(ideas) ? ideas : [];
  const now = Date.now();

  db.exec("BEGIN IMMEDIATE");
  try {
    deleteShotImagesByChapterStmt.run(chapter.id);
    deleteShotVideosByChapterStmt.run(chapter.id);
    deleteShotsByChapterStmt.run(chapter.id);

    for (let index = 0; index < safeIdeas.length; index += 1) {
      const idea = safeIdeas[index] && typeof safeIdeas[index] === "object" ? safeIdeas[index] : {};
      const generatedImage = sanitizeGeneratedImage(idea.generatedImage);
      const generatedVideo = sanitizeGeneratedVideo(idea.generatedVideo);
      const shotId = makeId("shot");

      insertShotStmt.run(
        shotId,
        chapter.projectId,
        chapter.id,
        index,
        String(idea.title || ""),
        String(idea.scene || ""),
        String(idea.camera || ""),
        String(idea.mood || ""),
        String(idea.twist || ""),
        String(idea.seedIdea || ""),
        JSON.stringify(generatedImage),
        JSON.stringify(generatedVideo),
        now,
        now
      );

      if (generatedImage.url) {
        insertShotImageStmt.run(
          makeId("img"),
          chapter.projectId,
          chapter.id,
          shotId,
          1,
          generatedImage.url,
          generatedImage.model,
          generatedImage.status,
          generatedImage.error,
          now
        );
      }

      if (generatedVideo.url) {
        insertShotVideoStmt.run(
          makeId("vid"),
          chapter.projectId,
          chapter.id,
          shotId,
          1,
          generatedVideo.url,
          generatedVideo.mimeType,
          generatedVideo.durationSeconds,
          generatedVideo.model,
          generatedVideo.status,
          generatedVideo.error,
          generatedVideo.prompt,
          now
        );
      }
    }

    touchProjectStmt.run(now, chapter.projectId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return {
    projectId: chapter.projectId,
    chapterId: chapter.id,
    count: safeIdeas.length,
    updatedAt: now,
  };
}

export function updateChapterShotImage(projectId, chapterId, shotIndex, generatedImage) {
  const chapter = getChapterById(projectId, chapterId);
  const safeShotIndex = Number(shotIndex);
  if (!chapter || !Number.isInteger(safeShotIndex) || safeShotIndex < 0) {
    return false;
  }

  const shot = getShotByIndexStmt.get(chapter.projectId, chapter.id, safeShotIndex);
  if (!shot) {
    return false;
  }

  const safeGeneratedImage = sanitizeGeneratedImage(generatedImage);
  const now = Date.now();
  updateShotImageStmt.run(JSON.stringify(safeGeneratedImage), now, shot.id);

  if (safeGeneratedImage.url) {
    const currentMaxVersion = Number(getShotImageMaxVersionStmt.get(shot.id)?.max_version || 0);
    insertShotImageStmt.run(
      makeId("img"),
      chapter.projectId,
      chapter.id,
      shot.id,
      currentMaxVersion + 1,
      safeGeneratedImage.url,
      safeGeneratedImage.model,
      safeGeneratedImage.status,
      safeGeneratedImage.error,
      now
    );
  }

  touchProjectStmt.run(now, chapter.projectId);
  return true;
}

export function updateChapterShotVideo(projectId, chapterId, shotIndex, generatedVideo) {
  const chapter = getChapterById(projectId, chapterId);
  const safeShotIndex = Number(shotIndex);
  if (!chapter || !Number.isInteger(safeShotIndex) || safeShotIndex < 0) {
    return false;
  }

  const shot = getShotByIndexStmt.get(chapter.projectId, chapter.id, safeShotIndex);
  if (!shot) {
    return false;
  }

  const safeGeneratedVideo = sanitizeGeneratedVideo(generatedVideo);
  const now = Date.now();
  updateShotVideoStmt.run(JSON.stringify(safeGeneratedVideo), now, shot.id);

  if (safeGeneratedVideo.url) {
    const currentMaxVersion = Number(getShotVideoMaxVersionStmt.get(shot.id)?.max_version || 0);
    insertShotVideoStmt.run(
      makeId("vid"),
      chapter.projectId,
      chapter.id,
      shot.id,
      currentMaxVersion + 1,
      safeGeneratedVideo.url,
      safeGeneratedVideo.mimeType,
      safeGeneratedVideo.durationSeconds,
      safeGeneratedVideo.model,
      safeGeneratedVideo.status,
      safeGeneratedVideo.error,
      safeGeneratedVideo.prompt,
      now
    );
  }

  touchProjectStmt.run(now, chapter.projectId);
  return true;
}

export function listChapterSequenceVideos(projectId, chapterId, limit = 60) {
  const chapter = getChapterById(projectId, chapterId);
  if (!chapter) {
    return null;
  }

  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 60));
  const rows = listSequenceVideosStmt.all(chapter.projectId, chapter.id, safeLimit);
  return rows.map(mapSequenceVideoRow);
}

export function upsertChapterSequenceVideo(projectId, chapterId, input = {}) {
  const chapter = getChapterById(projectId, chapterId);
  if (!chapter) {
    return null;
  }

  const now = Date.now();
  const recordId = String(input?.id || makeId("seq")).trim();
  const safeId = recordId || makeId("seq");
  const current = getSequenceVideoByIdStmt.get(safeId, chapter.projectId, chapter.id);
  const createdAt = toSafeTime(input?.createdAt, toSafeTime(current?.created_at, now));

  const title = String(input?.title || "").trim();
  const shotIndexes = sanitizeSequenceShotIndexes(input?.shotIndexes);
  const shots = sanitizeSequenceShots(input?.shots);
  const config = sanitizeSequenceVideoConfig(input?.config);
  const generatedVideo = sanitizeGeneratedVideo(input?.generatedVideo);
  const referenceImageCount = sanitizePositiveInt(input?.referenceImageCount, 0, 5000);

  upsertSequenceVideoStmt.run(
    safeId,
    chapter.projectId,
    chapter.id,
    title,
    JSON.stringify(shotIndexes),
    JSON.stringify(shots),
    JSON.stringify(config),
    JSON.stringify(generatedVideo),
    referenceImageCount,
    createdAt,
    now
  );

  touchProjectStmt.run(now, chapter.projectId);
  const saved = getSequenceVideoByIdStmt.get(safeId, chapter.projectId, chapter.id);
  return saved ? mapSequenceVideoRow(saved) : null;
}

export function deleteChapterSequenceVideo(projectId, chapterId, sequenceVideoId) {
  const chapter = getChapterById(projectId, chapterId);
  if (!chapter) {
    return {
      ok: false,
      reason: "chapter_not_found",
    };
  }

  const safeId = String(sequenceVideoId || "").trim();
  if (!safeId) {
    return {
      ok: false,
      reason: "invalid_id",
    };
  }

  const existing = getSequenceVideoByIdStmt.get(safeId, chapter.projectId, chapter.id);
  if (!existing) {
    return {
      ok: false,
      reason: "not_found",
    };
  }

  deleteSequenceVideoStmt.run(safeId, chapter.projectId, chapter.id);
  touchProjectStmt.run(Date.now(), chapter.projectId);
  return {
    ok: true,
    id: safeId,
  };
}

export function getWorkspaceBootstrap() {
  let projects = listProjects(100);
  let project = projects[0] || null;
  if (!project) {
    project = createProject({
      name: "默认项目",
      description: "首次进入自动创建",
    });
    projects = listProjects(100);
  }

  let chapters = listChapters(project.id, 200);
  let chapter = chapters[0] || null;
  if (!chapter) {
    chapter = createChapter(project.id, { title: "第 1 章" });
    chapters = listChapters(project.id, 200);
  }

  return {
    project,
    chapter,
    projects,
    chapters,
  };
}

function normalizeChapterSortOrders(projectId, now) {
  const rows = listChapterOrderStmt.all(projectId);
  rows.forEach((row, index) => {
    updateChapterSortStmt.run(index + 1, now, row.id);
  });
}

function mapProjectRow(row) {
  return {
    id: String(row?.id || ""),
    name: String(row?.name || ""),
    description: String(row?.description || ""),
    chapterCount: Number(row?.chapter_count || 0),
    shotCount: Number(row?.shot_count || 0),
    createdAt: toSafeTime(row?.created_at),
    updatedAt: toSafeTime(row?.updated_at),
  };
}

function mapChapterRow(row) {
  return {
    id: String(row?.id || ""),
    projectId: String(row?.project_id || ""),
    title: String(row?.title || ""),
    sortOrder: Number(row?.sort_order || 0),
    shotCount: Number(row?.shot_count || 0),
    createdAt: toSafeTime(row?.created_at),
    updatedAt: toSafeTime(row?.updated_at),
  };
}

function mapShotRowToIdea(row) {
  return {
    title: String(row?.title || ""),
    scene: String(row?.scene || ""),
    camera: String(row?.camera || ""),
    mood: String(row?.mood || ""),
    twist: String(row?.twist || ""),
    seedIdea: String(row?.seed_idea || ""),
    generatedImage: parseGeneratedImage(row?.generated_image_json),
    generatedVideo: parseGeneratedVideo(row?.generated_video_json),
  };
}

function mapSequenceVideoRow(row) {
  return {
    id: String(row?.id || ""),
    projectId: String(row?.project_id || ""),
    chapterId: String(row?.chapter_id || ""),
    title: String(row?.title || ""),
    shotIndexes: parseSequenceShotIndexes(row?.shot_indexes_json),
    shots: parseSequenceShots(row?.shots_json),
    config: parseSequenceConfig(row?.config_json),
    generatedVideo: parseGeneratedVideo(row?.generated_video_json),
    referenceImageCount: sanitizePositiveInt(row?.reference_image_count, 0, 5000),
    createdAt: toSafeTime(row?.created_at),
    updatedAt: toSafeTime(row?.updated_at),
  };
}

function parseGeneratedImage(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return sanitizeGeneratedImage(parsed);
  } catch {
    return sanitizeGeneratedImage({});
  }
}

function sanitizeGeneratedImage(input) {
  const value = input && typeof input === "object" ? input : {};
  return {
    status: String(value.status || "").trim() || "idle",
    url: String(value.url || "").trim(),
    error: String(value.error || "").trim(),
    model: String(value.model || "").trim(),
  };
}

function parseSequenceShotIndexes(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return sanitizeSequenceShotIndexes(parsed);
  } catch {
    return [];
  }
}

function sanitizeSequenceShotIndexes(input) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(input) ? input : []) {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index > 100000 || seen.has(index)) {
      continue;
    }
    seen.add(index);
    out.push(index);
  }
  return out.slice(0, 2000);
}

function parseSequenceShots(raw) {
  try {
    const parsed = JSON.parse(String(raw || "[]"));
    return sanitizeSequenceShots(parsed);
  } catch {
    return [];
  }
}

function sanitizeSequenceShots(input) {
  const list = Array.isArray(input) ? input : [];
  return list.slice(0, 300).map((item, index) => {
    const value = item && typeof item === "object" ? item : {};
    const ideaIndex = Number(value.ideaIndex);
    return {
      ideaIndex: Number.isInteger(ideaIndex) && ideaIndex >= 0 ? ideaIndex : index,
      title: String(value.title || "").trim(),
      scene: String(value.scene || "").trim(),
      hasImageRef: Boolean(value.hasImageRef),
      referenceImageUrl: sanitizeReferenceMediaUrl(value.referenceImageUrl),
      referenceImageDataUrl: sanitizeReferenceImageDataUrl(value.referenceImageDataUrl),
    };
  });
}

function parseSequenceConfig(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return sanitizeSequenceVideoConfig(parsed);
  } catch {
    return sanitizeSequenceVideoConfig({});
  }
}

function sanitizeSequenceVideoConfig(input) {
  const value = input && typeof input === "object" ? input : {};
  const durationSeconds = sanitizePositiveInt(value.durationSeconds, 6, 12);
  return {
    title: String(value.title || "").trim(),
    aspectRatio: sanitizeAspectRatio(value.aspectRatio),
    durationSeconds,
    transitionStyle: String(value.transitionStyle || "").trim().slice(0, 60),
    referenceImagePolicy: sanitizeReferenceImagePolicy(value.referenceImagePolicy),
    continuityNote: String(value.continuityNote || "").trim().slice(0, 2000),
    negativePrompt: String(value.negativePrompt || "").trim().slice(0, 2000),
    promptTemplate: String(value.promptTemplate || "").trim().slice(0, 12000),
  };
}

function sanitizeAspectRatio(input) {
  const raw = String(input || "")
    .trim()
    .replace(/\s+/g, "");
  const allowed = new Set(["16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21", "2:3", "3:2"]);
  if (allowed.has(raw)) {
    return raw;
  }
  const match = raw.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    return "16:9";
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "16:9";
  }
  return `${width}:${height}`;
}

function sanitizeReferenceImagePolicy(input) {
  const safe = String(input || "")
    .trim()
    .toLowerCase();
  if (safe === "all" || safe === "keyframes" || safe === "first_last" || safe === "text_only") {
    return safe;
  }
  return "all";
}

function sanitizeReferenceMediaUrl(input) {
  const value = String(input || "").trim();
  if (!value) {
    return "";
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value.slice(0, 3000);
  }
  return "";
}

function sanitizeReferenceImageDataUrl(input) {
  const value = String(input || "").trim();
  if (!value.startsWith("data:image/")) {
    return "";
  }
  return value.slice(0, 15_000_000);
}

function sanitizePositiveInt(input, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  const value = Number(input);
  if (!Number.isFinite(value) || value < 0) {
    return Math.max(0, Math.floor(Number(fallback) || 0));
  }
  return Math.min(max, Math.max(0, Math.round(value)));
}

function parseGeneratedVideo(raw) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return sanitizeGeneratedVideo(parsed);
  } catch {
    return sanitizeGeneratedVideo({});
  }
}

function sanitizeGeneratedVideo(input) {
  const value = input && typeof input === "object" ? input : {};
  const durationSeconds = Number(value.durationSeconds);
  return {
    status: String(value.status || "").trim() || "idle",
    url: String(value.url || "").trim(),
    error: String(value.error || "").trim(),
    model: String(value.model || "").trim(),
    mimeType: String(value.mimeType || "").trim(),
    prompt: String(value.prompt || "").trim(),
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds) : 0,
  };
}

function makeId(prefix) {
  const head = String(prefix || "id")
    .replace(/[^a-z0-9_-]/gi, "")
    .slice(0, 10);
  return `${head}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function toSafeTime(input, fallback = Date.now()) {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : Math.round(fallback);
}

function ensureShotsGeneratedVideoColumn() {
  const rows = db.prepare("PRAGMA table_info(shots)").all();
  const hasGeneratedVideo = Array.isArray(rows)
    ? rows.some((row) => String(row?.name || "").toLowerCase() === "generated_video_json")
    : false;
  if (!hasGeneratedVideo) {
    db.exec(`ALTER TABLE shots ADD COLUMN generated_video_json TEXT NOT NULL DEFAULT '{}'`);
  }
}
