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

  CREATE TABLE IF NOT EXISTS history_entries (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    seed_text TEXT NOT NULL DEFAULT '',
    image_name TEXT NOT NULL DEFAULT '',
    mode_id TEXT NOT NULL DEFAULT '',
    mode_name TEXT NOT NULL DEFAULT '',
    style_bias TEXT NOT NULL DEFAULT '',
    style_name TEXT NOT NULL DEFAULT '',
    item_count INTEGER NOT NULL DEFAULT 0,
    ideas_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_history_entries_created_at
    ON history_entries(created_at DESC);
`);

const upsertStmt = db.prepare(`
  INSERT INTO history_entries (
    id, created_at, updated_at, seed_text, image_name, mode_id, mode_name, style_bias, style_name, item_count, ideas_json
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
  )
  ON CONFLICT(id) DO UPDATE SET
    updated_at = excluded.updated_at,
    seed_text = excluded.seed_text,
    image_name = excluded.image_name,
    mode_id = excluded.mode_id,
    mode_name = excluded.mode_name,
    style_bias = excluded.style_bias,
    style_name = excluded.style_name,
    item_count = excluded.item_count,
    ideas_json = excluded.ideas_json
`);

const listStmt = db.prepare(`
  SELECT
    id,
    created_at,
    updated_at,
    seed_text,
    image_name,
    mode_id,
    mode_name,
    style_bias,
    style_name,
    item_count,
    ideas_json
  FROM history_entries
  ORDER BY created_at DESC
  LIMIT ?
`);

const getByIdStmt = db.prepare(`
  SELECT
    id,
    created_at,
    updated_at,
    seed_text,
    image_name,
    mode_id,
    mode_name,
    style_bias,
    style_name,
    item_count,
    ideas_json
  FROM history_entries
  WHERE id = ?
  LIMIT 1
`);

const updateIdeasStmt = db.prepare(`
  UPDATE history_entries
  SET
    updated_at = ?,
    item_count = ?,
    ideas_json = ?
  WHERE id = ?
`);

const removeStmt = db.prepare(`DELETE FROM history_entries WHERE id = ?`);
const clearStmt = db.prepare(`DELETE FROM history_entries`);

export function listHistory(limit = 30) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 30));
  return listStmt.all(safeLimit).map(mapRow);
}

export function getHistoryById(id) {
  const safeId = String(id || "").trim();
  if (!safeId) {
    return null;
  }
  const row = getByIdStmt.get(safeId);
  return row ? mapRow(row) : null;
}

export function upsertHistory(entry) {
  const ideas = sanitizeIdeas(entry?.ideas);
  const now = Date.now();
  const createdAt = toSafeTime(entry?.createdAt, now);
  const updatedAt = toSafeTime(entry?.updatedAt, now);
  const id = String(entry?.id || `${createdAt}-${Math.random().toString(16).slice(2, 8)}`);

  upsertStmt.run(
    id,
    createdAt,
    updatedAt,
    String(entry?.seedText || ""),
    String(entry?.imageName || ""),
    String(entry?.modeId || ""),
    String(entry?.modeName || ""),
    String(entry?.styleBias || ""),
    String(entry?.styleName || ""),
    ideas.length,
    JSON.stringify(ideas)
  );

  return {
    id,
    createdAt,
    updatedAt,
    seedText: String(entry?.seedText || ""),
    imageName: String(entry?.imageName || ""),
    modeId: String(entry?.modeId || ""),
    modeName: String(entry?.modeName || ""),
    styleBias: String(entry?.styleBias || ""),
    styleName: String(entry?.styleName || ""),
    count: ideas.length,
    ideas,
  };
}

export function updateHistoryIdeas(id, ideas) {
  const safeId = String(id || "").trim();
  if (!safeId) {
    return false;
  }

  const safeIdeas = sanitizeIdeas(ideas);
  const now = Date.now();
  const result = updateIdeasStmt.run(now, safeIdeas.length, JSON.stringify(safeIdeas), safeId);
  return Number(result?.changes || 0) > 0;
}

export function updateHistoryIdeaImage(id, index, generatedImage) {
  const safeId = String(id || "").trim();
  const safeIndex = Number(index);
  if (!safeId || !Number.isInteger(safeIndex) || safeIndex < 0) {
    return false;
  }

  const row = getByIdStmt.get(safeId);
  if (!row) {
    return false;
  }

  const ideas = parseIdeas(row.ideas_json);
  if (safeIndex >= ideas.length) {
    return false;
  }

  const baseIdea = ideas[safeIndex] && typeof ideas[safeIndex] === "object" ? ideas[safeIndex] : {};
  ideas[safeIndex] = {
    ...baseIdea,
    generatedImage: sanitizeGeneratedImage(generatedImage),
  };

  const now = Date.now();
  const result = updateIdeasStmt.run(now, ideas.length, JSON.stringify(ideas), safeId);
  return Number(result?.changes || 0) > 0;
}

export function updateHistoryIdeaVideo(id, index, generatedVideo) {
  const safeId = String(id || "").trim();
  const safeIndex = Number(index);
  if (!safeId || !Number.isInteger(safeIndex) || safeIndex < 0) {
    return false;
  }

  const row = getByIdStmt.get(safeId);
  if (!row) {
    return false;
  }

  const ideas = parseIdeas(row.ideas_json);
  if (safeIndex >= ideas.length) {
    return false;
  }

  const baseIdea = ideas[safeIndex] && typeof ideas[safeIndex] === "object" ? ideas[safeIndex] : {};
  ideas[safeIndex] = {
    ...baseIdea,
    generatedVideo: sanitizeGeneratedVideo(generatedVideo),
  };

  const now = Date.now();
  const result = updateIdeasStmt.run(now, ideas.length, JSON.stringify(ideas), safeId);
  return Number(result?.changes || 0) > 0;
}

export function removeHistory(id) {
  const safeId = String(id || "").trim();
  if (!safeId) {
    return false;
  }
  const result = removeStmt.run(safeId);
  return Number(result?.changes || 0) > 0;
}

export function clearHistory() {
  clearStmt.run();
  return true;
}

export function getHistoryDbPath() {
  return dbPath;
}

function mapRow(row) {
  const ideas = parseIdeas(row?.ideas_json);
  return {
    id: String(row?.id || ""),
    createdAt: toSafeTime(row?.created_at),
    updatedAt: toSafeTime(row?.updated_at),
    seedText: String(row?.seed_text || ""),
    imageName: String(row?.image_name || ""),
    modeId: String(row?.mode_id || ""),
    modeName: String(row?.mode_name || ""),
    styleBias: String(row?.style_bias || ""),
    styleName: String(row?.style_name || ""),
    count: ideas.length,
    ideas,
  };
}

function parseIdeas(raw) {
  try {
    const data = JSON.parse(String(raw || "[]"));
    return sanitizeIdeas(data);
  } catch {
    return [];
  }
}

function sanitizeIdeas(input) {
  return Array.isArray(input) ? input : [];
}

function sanitizeGeneratedImage(input) {
  const value = input && typeof input === "object" ? input : {};
  return {
    status: String(value.status || "").trim() || "success",
    url: String(value.url || "").trim(),
    error: String(value.error || "").trim(),
    model: String(value.model || "").trim(),
  };
}

function sanitizeGeneratedVideo(input) {
  const value = input && typeof input === "object" ? input : {};
  const durationSeconds = Number(value.durationSeconds);
  return {
    status: String(value.status || "").trim() || "success",
    url: String(value.url || "").trim(),
    error: String(value.error || "").trim(),
    model: String(value.model || "").trim(),
    mimeType: String(value.mimeType || "").trim(),
    prompt: String(value.prompt || "").trim(),
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? Math.round(durationSeconds) : 0,
  };
}

function toSafeTime(input, fallback = Date.now()) {
  const value = Number(input);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : Math.round(fallback);
}
