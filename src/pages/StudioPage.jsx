import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BatchWorkflow } from "../components/BatchWorkflow";
import { EditorialSelect } from "../components/EditorialSelect";
import { HistoryPanel } from "../components/HistoryPanel";
import { IdeaCard } from "../components/IdeaCard";
import { ModeLibrary } from "../components/ModeLibrary";
import { PrimaryButton } from "../components/PrimaryButton";
import { RangeNumberField } from "../components/RangeNumberField";
import { StatusBadge } from "../components/StatusBadge";
import { TaskQueuePanel } from "../components/TaskQueuePanel";
import { buildIdeaCopyText, downloadText, formatTime, toIdeaMarkdown } from "../lib/formatters";
import { DEFAULT_PROMPT_TEMPLATE, getModeById, STORYBOARD_MODES, STYLE_BIASES } from "../lib/modes";
import { useLocalStorageState } from "../lib/storage";
import { cancelTaskById, createBatchExpandTask, createExpandTask, getTaskStatus } from "../services/studioApi";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='1125' viewBox='0 0 900 1125'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%23ebe5de'/%3E%3Cstop offset='1' stop-color='%23d7cfc3'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='900' height='1125'/%3E%3Cg fill='none' stroke='%231a1a1a' stroke-opacity='.25'%3E%3Cpath d='M100 250h700M100 500h700M100 750h700'/%3E%3Cpath d='M200 150v820M450 150v820M700 150v820'/%3E%3C/g%3E%3Ctext x='86' y='940' font-family='serif' font-size='62' fill='%231a1a1a' fill-opacity='.8'%3EStoryboard / Input Canvas%3C/text%3E%3C/svg%3E";

const defaultSettings = {
  seedText: "",
  model: "gemini-2.0-flash",
  styleBias: "cinematic",
  modeId: "ad-film",
  ideaCount: 8,
  temperature: 1,
  topP: 0.9,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
};

const FILTER_MODES = [
  { id: "all", label: "全部" },
  { id: "favorites", label: "仅收藏" },
  { id: "unstarred", label: "未收藏" },
];

const MAX_TASK_RUNS = 20;
const FINAL_TASK_STATUSES = ["success", "error", "cancelled"];

export default function StudioPage() {
  const [settings, setSettings] = useLocalStorageState("atelier_settings_react", defaultSettings);
  const [history, setHistory] = useLocalStorageState("atelier_history_react", []);
  const [favorites, setFavorites] = useLocalStorageState("atelier_favorites_react", {});
  const [taskRuns, setTaskRuns] = useLocalStorageState("atelier_task_runs_react", []);

  const [ideas, setIdeas] = useState([]);
  const [imageState, setImageState] = useState({ dataUrl: "", name: "" });
  const [status, setStatus] = useState({ kind: "idle", badge: "待命中", text: "输入分镜后点击“拓展分镜”。" });
  const [loading, setLoading] = useState(false);

  const [batchText, setBatchText] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState([]);
  const [filterMode, setFilterMode] = useState("all");
  const [selectedIdeaIndexes, setSelectedIdeaIndexes] = useState([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);

  const pendingRef = useRef(null);
  const formRef = useRef(null);

  const activeMode = useMemo(() => getModeById(settings.modeId), [settings.modeId]);
  const activeStyleLabel = useMemo(
    () => STYLE_BIASES.find((item) => item.id === settings.styleBias)?.label || settings.styleBias,
    [settings.styleBias]
  );

  const batchCount = useMemo(
    () =>
      batchText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean).length,
    [batchText]
  );

  const modeOptions = useMemo(
    () => STORYBOARD_MODES.map((mode) => ({ value: mode.id, label: mode.name })),
    []
  );

  const styleOptions = useMemo(
    () => STYLE_BIASES.map((item) => ({ value: item.id, label: item.label })),
    []
  );

  const countOptions = useMemo(
    () => [
      { value: "6", label: "6 条" },
      { value: "8", label: "8 条" },
      { value: "10", label: "10 条" },
    ],
    []
  );

  const ideaEntries = useMemo(
    () =>
      ideas.map((idea, index) => ({
        index,
        idea,
        favorite: Boolean(favorites[makeFavoriteKey(idea)]),
      })),
    [ideas, favorites]
  );

  const visibleEntries = useMemo(() => {
    return ideaEntries.filter((entry) => {
      if (filterMode === "favorites") return entry.favorite;
      if (filterMode === "unstarred") return !entry.favorite;
      return true;
    });
  }, [ideaEntries, filterMode]);

  const visibleIndexes = useMemo(() => visibleEntries.map((entry) => entry.index), [visibleEntries]);
  const selectedVisibleCount = useMemo(
    () => selectedIdeaIndexes.filter((index) => visibleIndexes.includes(index)).length,
    [selectedIdeaIndexes, visibleIndexes]
  );

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const max = ideas.length;
    setSelectedIdeaIndexes((prev) => prev.filter((index) => index >= 0 && index < max));
    setLastSelectedIndex((prev) => (typeof prev === "number" && prev < max ? prev : null));
  }, [ideas.length]);

  useEffect(() => {
    const handler = async (event) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const withMeta = event.ctrlKey || event.metaKey;

      if (withMeta && key === "a") {
        event.preventDefault();
        if (visibleIndexes.length === 0) return;
        setSelectedIdeaIndexes([...visibleIndexes]);
        setLastSelectedIndex(visibleIndexes[visibleIndexes.length - 1]);
        updateStatus("success", "已全选", `已选中当前筛选结果中的 ${visibleIndexes.length} 条。`);
        return;
      }

      if (withMeta && key === "c") {
        if (selectedIdeaIndexes.length === 0) return;
        event.preventDefault();
        const selected = [...selectedIdeaIndexes]
          .sort((a, b) => a - b)
          .map((index) => ideas[index])
          .filter(Boolean);
        const text = selected.map((idea, idx) => buildIdeaCopyText(idea, idx)).join("\n\n");
        try {
          await navigator.clipboard.writeText(text);
          updateStatus("success", "批量复制完成", `已复制 ${selected.length} 条分镜。`);
        } catch {
          updateStatus("error", "复制失败", "浏览器未授权剪贴板写入。");
        }
        return;
      }

      if (key === "escape") {
        if (selectedIdeaIndexes.length === 0) return;
        event.preventDefault();
        setSelectedIdeaIndexes([]);
        setLastSelectedIndex(null);
        updateStatus("idle", "已清除选择", "当前没有选中分镜。");
        return;
      }

      if (key === "backspace" || key === "delete") {
        if (selectedIdeaIndexes.length === 0) return;
        event.preventDefault();
        setIdeas((prev) => prev.filter((_, index) => !selectedIdeaIndexes.includes(index)));
        updateStatus("success", "批量删除完成", `已删除 ${selectedIdeaIndexes.length} 条分镜。`);
        setSelectedIdeaIndexes([]);
        setLastSelectedIndex(null);
        return;
      }

      if (key === "arrowleft" || key === "arrowright") {
        if (visibleIndexes.length === 0) return;
        event.preventDefault();
        const current = selectedIdeaIndexes.length > 0 ? selectedIdeaIndexes[selectedIdeaIndexes.length - 1] : visibleIndexes[0];
        const currentPos = Math.max(0, visibleIndexes.indexOf(current));
        const step = key === "arrowright" ? 1 : -1;
        const nextPos = Math.max(0, Math.min(visibleIndexes.length - 1, currentPos + step));
        const nextIndex = visibleIndexes[nextPos];
        setSelectedIdeaIndexes([nextIndex]);
        setLastSelectedIndex(nextIndex);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [ideas, selectedIdeaIndexes, visibleIndexes]);

  const updateSettings = (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const updateStatus = (kind, badge, text) => setStatus({ kind, badge, text });

  const startTaskRun = ({ type, title, summary }) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const startedAt = Date.now();
    const item = {
      id,
      type,
      title,
      status: "pending",
      summary: summary || "排队中...",
      progress: 0,
      stageText: "排队中",
      startedAt,
      finishedAt: null,
      durationMs: null,
    };
    setTaskRuns((prev) => [item, ...prev].slice(0, MAX_TASK_RUNS));
    return id;
  };

  const finishTaskRun = (id, patch) => {
    const endedAt = Date.now();
    setTaskRuns((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const merged = { ...item, ...patch };
        const derivedProgress =
          typeof merged.progress === "number"
            ? merged.progress
            : merged.status === "success"
            ? 100
            : item.progress;
        return {
          ...merged,
          progress: derivedProgress,
          finishedAt: endedAt,
          durationMs: Math.max(0, endedAt - Number(item.startedAt || endedAt)),
        };
      })
    );
  };

  const patchTaskRun = (id, patch) => {
    setTaskRuns((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const waitForTaskCompletion = async (taskId, onTick) => {
    for (let attempt = 0; attempt < 400; attempt += 1) {
      const data = await getTaskStatus(taskId);
      const task = data?.task;
      if (!task) {
        throw new Error("任务状态读取失败。");
      }

      if (typeof onTick === "function") {
        onTick(task);
      }

      if (FINAL_TASK_STATUSES.includes(task.status)) {
        return task;
      }

      await delay(900);
    }

    throw new Error("任务轮询超时，请重试。");
  };

  const removeTaskRun = (id) => setTaskRuns((prev) => prev.filter((item) => item.id !== id));
  const clearTaskRuns = () => setTaskRuns([]);

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setImageState({ dataUrl: "", name: "" });
      return;
    }

    if (!file.type.startsWith("image/")) {
      updateStatus("error", "格式错误", "仅支持图片文件（JPG / PNG / WEBP）。");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      updateStatus("error", "图片过大", "图片大小需小于 8MB。请压缩后重试。");
      event.target.value = "";
      return;
    }

    const dataUrl = await readAsDataUrl(file);
    setImageState({ dataUrl, name: file.name });
    updateStatus("idle", "图片就绪", "已附加图片输入。可以直接生成。");
  };

  const handleGenerate = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    if (!settings.seedText.trim() && !imageState.dataUrl) {
      updateStatus("error", "缺少输入", "请至少提供文本或图片中的一项。");
      return;
    }

    const taskId = startTaskRun({
      type: "expand",
      title: `拓展分镜 · ${activeMode.name}`,
      summary: `模型 ${settings.model} / 目标 ${settings.ideaCount} 条`,
    });

    setLoading(true);
    updateStatus("loading", "生成中", "正在调用后端代理生成分镜，请稍候...");
    let backendTaskId = "";

    try {
      const createResult = await createExpandTask({
        seedText: settings.seedText.trim(),
        imageDataUrl: imageState.dataUrl,
        styleBias: settings.styleBias,
        modeId: settings.modeId,
        ideaCount: Number(settings.ideaCount),
        temperature: Number(settings.temperature),
        topP: Number(settings.topP),
        promptTemplate: settings.promptTemplate,
        model: settings.model,
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "expand" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = formatTaskStageSummary(task);
          patchTaskRun(taskId, {
            status: task.status,
            progress: Number(task.progress) || 0,
            stageText: String(task.stageText || ""),
            summary: stageSummary,
          });
          updateStatus("loading", "生成中", stageSummary);
        }
      });

      if (finalTask.status === "cancelled") {
        finishTaskRun(taskId, {
          status: "cancelled",
          progress: Number(finalTask.progress) || 0,
          stageText: String(finalTask.stageText || "已取消"),
          summary: "请求已取消。",
        });
        updateStatus("idle", "已取消", "请求已取消。可以继续修改参数后重试。");
        return;
      }

      if (finalTask.status !== "success") {
        throw new Error(finalTask.error || "生成失败，请稍后重试。");
      }

      const nextIdeas = finalTask?.result?.expansions || [];
      setIdeas(nextIdeas);
      setSelectedIdeaIndexes([]);
      setLastSelectedIndex(null);
      pushHistoryRecord(nextIdeas);
      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `生成完成，共 ${nextIdeas.length} 条。`,
      });
      updateStatus("success", "生成完成", `已生成 ${nextIdeas.length} 条分镜（${activeMode.name} / ${activeStyleLabel}）。`);
    } catch (error) {
      finishTaskRun(taskId, {
        status: "error",
        stageText: "失败",
        summary: error.message || "生成失败，请稍后重试。",
      });
      updateStatus("error", "生成失败", error.message || "生成失败，请稍后重试。");
    } finally {
      if (pendingRef.current?.taskId === backendTaskId) {
        pendingRef.current = null;
      }
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    const current = pendingRef.current;
    if (!current?.taskId) {
      return;
    }

    try {
      await cancelTaskById(current.taskId);
    } catch {
      // Keep UI responsive even if cancel endpoint is temporarily unavailable.
    }

    updateStatus("idle", "已取消", "已发送取消请求，正在结束任务...");
    if (current.kind === "batch") {
      setBatchRunning(false);
    } else {
      setLoading(false);
    }
  };

  const pushHistoryRecord = (nextIdeas) => {
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: Date.now(),
      seedText: settings.seedText,
      imageName: imageState.name,
      modeId: settings.modeId,
      modeName: activeMode.name,
      styleBias: settings.styleBias,
      styleName: activeStyleLabel,
      count: nextIdeas.length,
      ideas: nextIdeas,
    };

    setHistory((prev) => [item, ...prev].slice(0, 30));
  };

  const copyAll = async () => {
    if (ideas.length === 0) {
      updateStatus("error", "无可复制内容", "请先生成分镜。");
      return;
    }

    const text = ideas.map((idea, index) => buildIdeaCopyText(idea, index)).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      updateStatus("success", "复制完成", "已复制全部分镜。");
    } catch {
      updateStatus("error", "复制失败", "浏览器未授权剪贴板写入。");
    }
  };

  const copySingle = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      updateStatus("success", "已复制", "单条分镜已复制。");
    } catch {
      updateStatus("error", "复制失败", "浏览器未授权剪贴板写入。");
    }
  };

  const remixOne = async (index) => {
    if (loading) {
      return;
    }

    const source = ideas[index];
    if (!source) {
      return;
    }

    const taskId = startTaskRun({
      type: "remix",
      title: `再生成 #${index + 1}`,
      summary: source.title || "分镜再生成任务",
    });

    setLoading(true);
    updateStatus("loading", "再生成中", `正在重写第 ${index + 1} 条分镜...`);

    const remixSeed = `${settings.seedText}\n\n请围绕下列分镜生成一个“同主题但不同表达”的替代版本：${JSON.stringify(source)}`;
    let backendTaskId = "";

    try {
      const createResult = await createExpandTask({
        seedText: remixSeed,
        imageDataUrl: imageState.dataUrl,
        styleBias: settings.styleBias,
        modeId: settings.modeId,
        ideaCount: 1,
        temperature: Number(settings.temperature),
        topP: Number(settings.topP),
        promptTemplate: settings.promptTemplate,
        model: settings.model,
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "remix" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = formatTaskStageSummary(task);
          patchTaskRun(taskId, {
            status: task.status,
            progress: Number(task.progress) || 0,
            stageText: String(task.stageText || ""),
            summary: stageSummary,
          });
          updateStatus("loading", "再生成中", stageSummary);
        }
      });

      if (finalTask.status === "cancelled") {
        finishTaskRun(taskId, {
          status: "cancelled",
          progress: Number(finalTask.progress) || 0,
          stageText: String(finalTask.stageText || "已取消"),
          summary: "请求已取消。",
        });
        updateStatus("idle", "已取消", "请求已取消。可以继续修改参数后重试。");
        return;
      }

      if (finalTask.status !== "success") {
        throw new Error(finalTask.error || "请求失败。");
      }

      const replacement = finalTask?.result?.expansions?.[0];
      if (!replacement) {
        throw new Error("再生成未返回有效结果，请重试。");
      }

      setIdeas((prev) => prev.map((item, idx) => (idx === index ? replacement : item)));
      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `第 ${index + 1} 条已更新。`,
      });
      updateStatus("success", "再生成完成", `第 ${index + 1} 条分镜已更新。`);
    } catch (error) {
      finishTaskRun(taskId, {
        status: "error",
        stageText: "失败",
        summary: error.message || "请求失败。",
      });
      updateStatus("error", "再生成失败", error.message || "请求失败。");
    } finally {
      if (pendingRef.current?.taskId === backendTaskId) {
        pendingRef.current = null;
      }
      setLoading(false);
    }
  };

  const toggleFavorite = (index) => {
    const idea = ideas[index];
    if (!idea) {
      return;
    }

    const key = makeFavoriteKey(idea);
    setFavorites((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = {
          savedAt: Date.now(),
          title: idea.title,
        };
      }
      return next;
    });
  };

  const exportJson = () => {
    if (ideas.length === 0) {
      updateStatus("error", "无可导出内容", "请先生成分镜。");
      return;
    }

    const stamp = new Date();
    const payload = {
      generatedAt: stamp.toISOString(),
      seedText: settings.seedText,
      imageName: imageState.name,
      modeName: activeMode.name,
      styleName: activeStyleLabel,
      ideas,
    };

    downloadText(`storyboard-${formatFileStamp(stamp)}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    updateStatus("success", "导出完成", "JSON 已下载。");
  };

  const exportMarkdown = () => {
    if (ideas.length === 0) {
      updateStatus("error", "无可导出内容", "请先生成分镜。");
      return;
    }

    const stamp = new Date();
    const content = toIdeaMarkdown({
      generatedAt: formatTime(stamp),
      modeName: activeMode.name,
      styleName: activeStyleLabel,
      seedText: settings.seedText,
      imageName: imageState.name,
      ideas,
    });

    downloadText(`storyboard-${formatFileStamp(stamp)}.md`, content, "text/markdown;charset=utf-8");
    updateStatus("success", "导出完成", "Markdown 已下载。");
  };

  const clearResults = () => {
    setIdeas([]);
    setSelectedIdeaIndexes([]);
    setLastSelectedIndex(null);
    updateStatus("idle", "已清空", "结果区已清空。");
  };

  const clearHistory = () => setHistory([]);

  const restoreHistory = (id) => {
    const item = history.find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    setIdeas(item.ideas || []);
    setSelectedIdeaIndexes([]);
    setLastSelectedIndex(null);
    updateSettings({
      seedText: item.seedText || "",
      modeId: item.modeId || settings.modeId,
      styleBias: item.styleBias || settings.styleBias,
    });

    updateStatus("success", "历史已恢复", `已恢复 ${formatTime(item.createdAt)} 的结果。`);
  };

  const removeHistory = (id) => setHistory((prev) => prev.filter((item) => item.id !== id));

  const toggleSelectIdea = (index, shouldRangeSelect = false) => {
    if (shouldRangeSelect && typeof lastSelectedIndex === "number") {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const range = Array.from({ length: end - start + 1 }, (_, offset) => start + offset);
      setSelectedIdeaIndexes((prev) => [...new Set([...prev, ...range])].sort((a, b) => a - b));
      setLastSelectedIndex(index);
      return;
    }

    setSelectedIdeaIndexes((prev) => {
      if (prev.includes(index)) {
        return prev.filter((item) => item !== index);
      }
      return [...prev, index].sort((a, b) => a - b);
    });
    setLastSelectedIndex(index);
  };

  const selectAllVisible = () => {
    if (visibleIndexes.length === 0) {
      updateStatus("error", "没有可选内容", "当前筛选结果为空。");
      return;
    }
    setSelectedIdeaIndexes([...visibleIndexes]);
    setLastSelectedIndex(visibleIndexes[visibleIndexes.length - 1]);
    updateStatus("success", "已全选", `已选中当前筛选结果中的 ${visibleIndexes.length} 条。`);
  };

  const clearSelection = () => {
    setSelectedIdeaIndexes([]);
    setLastSelectedIndex(null);
    updateStatus("idle", "已清除选择", "当前没有选中分镜。");
  };

  const batchCopySelected = async () => {
    if (selectedIdeaIndexes.length === 0) {
      updateStatus("error", "未选中分镜", "请先选择要复制的分镜卡片。");
      return;
    }

    const selected = [...selectedIdeaIndexes]
      .sort((a, b) => a - b)
      .map((index) => ideas[index])
      .filter(Boolean);

    const text = selected.map((idea, idx) => buildIdeaCopyText(idea, idx)).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      updateStatus("success", "批量复制完成", `已复制 ${selected.length} 条分镜。`);
    } catch {
      updateStatus("error", "复制失败", "浏览器未授权剪贴板写入。");
    }
  };

  const batchDeleteSelected = () => {
    if (selectedIdeaIndexes.length === 0) {
      updateStatus("error", "未选中分镜", "请先选择要删除的分镜卡片。");
      return;
    }

    const confirmed = window.confirm(`确定删除已选中的 ${selectedIdeaIndexes.length} 条分镜吗？`);
    if (!confirmed) {
      return;
    }

    setIdeas((prev) => prev.filter((_, index) => !selectedIdeaIndexes.includes(index)));
    updateStatus("success", "批量删除完成", `已删除 ${selectedIdeaIndexes.length} 条分镜。`);
    setSelectedIdeaIndexes([]);
    setLastSelectedIndex(null);
  };

  const batchFavoriteSelected = (shouldFavorite) => {
    if (selectedIdeaIndexes.length === 0) {
      updateStatus("error", "未选中分镜", "请先选择分镜卡片。");
      return;
    }

    setFavorites((prev) => {
      const next = { ...prev };
      selectedIdeaIndexes.forEach((index) => {
        const idea = ideas[index];
        if (!idea) return;
        const key = makeFavoriteKey(idea);
        if (shouldFavorite) {
          next[key] = { savedAt: Date.now(), title: idea.title };
        } else {
          delete next[key];
        }
      });
      return next;
    });

    updateStatus(
      "success",
      shouldFavorite ? "批量收藏完成" : "批量取消收藏",
      `已处理 ${selectedIdeaIndexes.length} 条分镜。`
    );
  };

  const copyBatchSeed = async (seed) => {
    try {
      await navigator.clipboard.writeText(String(seed || ""));
      updateStatus("success", "Seed 已复制", "已复制批量任务 seed。");
    } catch {
      updateStatus("error", "复制失败", "浏览器未授权剪贴板写入。");
    }
  };

  const useBatchResult = (result, index) => {
    const expansions = Array.isArray(result?.expansions) ? result.expansions : [];
    if (expansions.length === 0) {
      updateStatus("error", "无可载入结果", "该批量任务没有可用分镜。");
      return;
    }

    setIdeas(expansions);
    setSelectedIdeaIndexes([]);
    setLastSelectedIndex(null);
    setFilterMode("all");
    updateSettings({
      seedText: String(result.seed || ""),
    });
    updateStatus("success", "已载入画布", `已将批量任务 #${index + 1} 的 ${expansions.length} 条结果载入主画布。`);
  };

  const copyBatchResult = async (result, index) => {
    const expansions = Array.isArray(result?.expansions) ? result.expansions : [];
    if (expansions.length === 0) {
      updateStatus("error", "无可复制结果", "该批量任务没有可用分镜。");
      return;
    }

    const text = expansions.map((idea, idx) => buildIdeaCopyText(idea, idx)).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      updateStatus("success", "批量结果已复制", `已复制任务 #${index + 1} 的 ${expansions.length} 条结果。`);
    } catch {
      updateStatus("error", "复制失败", "浏览器未授权剪贴板写入。");
    }
  };

  const exportBatchResult = (result, index) => {
    const expansions = Array.isArray(result?.expansions) ? result.expansions : [];
    if (expansions.length === 0) {
      updateStatus("error", "无可导出结果", "该批量任务没有可用分镜。");
      return;
    }

    const stamp = new Date();
    const content = toIdeaMarkdown({
      generatedAt: formatTime(stamp),
      modeName: activeMode.name,
      styleName: activeStyleLabel,
      seedText: String(result.seed || ""),
      imageName: "",
      ideas: expansions,
    });

    downloadText(`batch-${index + 1}-${formatFileStamp(stamp)}.md`, content, "text/markdown;charset=utf-8");
    updateStatus("success", "批量结果已导出", `已导出任务 #${index + 1}。`);
  };

  const handleBatchRun = async () => {
    if (batchRunning) {
      return;
    }

    const seeds = batchText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 20);

    if (seeds.length === 0) {
      updateStatus("error", "批量为空", "请至少填写一条批量种子。");
      return;
    }

    const taskId = startTaskRun({
      type: "batch",
      title: `批量生成 · ${seeds.length} 条种子`,
      summary: `模式 ${activeMode.name} / 风格 ${activeStyleLabel}`,
    });

    setBatchRunning(true);
    updateStatus("loading", "批量处理中", `正在处理 ${seeds.length} 条任务，请稍候...`);
    let backendTaskId = "";

    try {
      const createResult = await createBatchExpandTask({
        seeds,
        modeId: settings.modeId,
        styleBias: settings.styleBias,
        ideaCount: Number(settings.ideaCount),
        temperature: Number(settings.temperature),
        topP: Number(settings.topP),
        promptTemplate: settings.promptTemplate,
        model: settings.model,
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "batch" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = formatTaskStageSummary(task);
          patchTaskRun(taskId, {
            status: task.status,
            progress: Number(task.progress) || 0,
            stageText: String(task.stageText || ""),
            summary: stageSummary,
          });
          updateStatus("loading", "批量处理中", stageSummary);
        }
      });

      if (finalTask.status === "cancelled") {
        finishTaskRun(taskId, {
          status: "cancelled",
          progress: Number(finalTask.progress) || 0,
          stageText: String(finalTask.stageText || "已取消"),
          summary: "请求已取消。",
        });
        updateStatus("idle", "已取消", "请求已取消。可以继续修改参数后重试。");
        return;
      }

      if (finalTask.status !== "success") {
        throw new Error(finalTask.error || "批量处理失败。");
      }

      const results = finalTask?.result?.results || [];
      setBatchResults(results);
      const successCount = results.filter((item) => !item.error).length;

      const successHistory = results
        .filter((item) => !item.error && Array.isArray(item.expansions))
        .map((item, index) => ({
          id: `${Date.now()}-batch-${index}-${Math.random().toString(16).slice(2, 8)}`,
          createdAt: Date.now(),
          seedText: item.seed,
          imageName: "",
          modeId: settings.modeId,
          modeName: activeMode.name,
          styleBias: settings.styleBias,
          styleName: activeStyleLabel,
          count: item.expansions.length,
          ideas: item.expansions,
        }));

      if (successHistory.length > 0) {
        setHistory((prev) => [...successHistory, ...prev].slice(0, 30));
      }

      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `批量完成，共 ${seeds.length} 条，成功 ${successCount} 条。`,
      });
      updateStatus("success", "批量完成", `共 ${seeds.length} 条，成功 ${successCount} 条。`);
    } catch (error) {
      finishTaskRun(taskId, {
        status: "error",
        stageText: "失败",
        summary: error.message || "批量处理失败。",
      });
      updateStatus("error", "批量失败", error.message || "批量处理失败。");
    } finally {
      if (pendingRef.current?.taskId === backendTaskId) {
        pendingRef.current = null;
      }
      setBatchRunning(false);
    }
  };

  return (
    <div className="relative min-h-screen font-body text-atelier-fg">
      <GridLines />
      <PaperGrain />

      <header className="motion-rise mx-auto w-[min(1600px,calc(100vw-2rem))] border-b border-atelier-fg/20 pb-8 pt-16 md:w-[min(1600px,calc(100vw-4rem))] md:pt-24">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-3 text-xs uppercase tracking-editorial text-atelier-subtle">
            <span className="h-px w-12 bg-atelier-fg" />
            Storyboard Atelier / Studio
          </p>
          <Link to="/" className="underline-reveal text-[10px] uppercase tracking-[0.22em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent">
            返回主页面
          </Link>
        </div>
        <h1 className="mt-5 font-display text-5xl leading-[0.9] md:text-8xl">
          Curated <em className="text-atelier-accent">Storyboard</em>
          <br />
          Expansion Studio
        </h1>
        <p className="dropcap mt-4 max-w-3xl text-base text-atelier-subtle md:text-lg">
          这是一个可长期复用的分镜创意工作台。你给一个镜头种子，它输出一组可拍摄、可拼接、可继续写成脚本的分镜方向。
        </p>
      </header>

      <main className="mx-auto grid w-[min(1600px,calc(100vw-2rem))] items-start gap-8 py-10 md:w-[min(1600px,calc(100vw-4rem))] lg:grid-cols-[5fr_7fr] lg:gap-10">
        <aside className="workbench-panel motion-rise motion-rise-delay-1 relative lg:sticky lg:top-6">
          <p className="vertical-tag right-[-22px] top-5 hidden lg:block">Control / Atelier</p>

          <form ref={formRef} className="grid gap-5 md:gap-6" onSubmit={handleGenerate}>
            <section className="module-block">
              <p className="eyebrow-label">Input</p>
              <h2 className="module-title mt-2">创作输入</h2>

              <label className="mt-4 grid gap-2">
                <span className="text-[10px] uppercase tracking-editorial text-atelier-subtle">分镜文本输入</span>
                <textarea
                  value={settings.seedText}
                  onChange={(event) => updateSettings({ seedText: event.target.value })}
                  maxLength={1200}
                  className="min-h-28 border-b border-atelier-fg/20 bg-transparent py-2 text-sm leading-relaxed outline-none transition-colors duration-500 placeholder:font-display placeholder:italic placeholder:text-atelier-subtle focus:border-atelier-accent"
                  placeholder="例：雨夜街角，主角停在霓虹倒影上，身后模糊人影逼近。"
                />
                <small className="text-xs text-atelier-subtle">{settings.seedText.length} / 1200</small>
              </label>

              <label className="mt-5 grid gap-2">
                <span className="text-[10px] uppercase tracking-editorial text-atelier-subtle">分镜图片（可选）</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleImageChange} className="text-xs text-atelier-subtle" />
                <small className="text-xs text-atelier-subtle">支持 JPG / PNG / WEBP，最大 8MB</small>
              </label>

              <figure className="group mt-4 border-t border-atelier-fg/10 pt-4">
                <img
                  src={imageState.dataUrl || PLACEHOLDER_IMAGE}
                  alt="分镜预览"
                  className="aspect-[4/5] w-full border border-atelier-fg/15 object-cover shadow-atelier-image shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] grayscale transition-all duration-[1800ms] ease-out group-hover:scale-[1.03] group-hover:grayscale-0"
                />
                <figcaption className="mt-2 text-xs text-atelier-subtle">{imageState.name ? `已附图：${imageState.name}` : "未上传图片，当前仅根据文本生成。"}</figcaption>
              </figure>
            </section>

            <section className="module-block">
              <p className="eyebrow-label">Settings</p>
              <h3 className="module-title mt-2">生成参数</h3>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <FieldLabel label="模式">
                  <EditorialSelect
                    value={settings.modeId}
                    onChange={(nextValue) => updateSettings({ modeId: nextValue })}
                    options={modeOptions}
                  />
                </FieldLabel>

                <FieldLabel label="风格">
                  <EditorialSelect
                    value={settings.styleBias}
                    onChange={(nextValue) => updateSettings({ styleBias: nextValue })}
                    options={styleOptions}
                  />
                </FieldLabel>

                <FieldLabel label="生成条数">
                  <EditorialSelect
                    value={String(settings.ideaCount)}
                    onChange={(nextValue) => updateSettings({ ideaCount: Number(nextValue) })}
                    options={countOptions}
                  />
                </FieldLabel>

                <FieldLabel label="模型">
                  <input
                    value={settings.model}
                    onChange={(event) => updateSettings({ model: event.target.value })}
                    className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
                  />
                </FieldLabel>

                <FieldLabel label="Temperature">
                  <RangeNumberField
                    value={settings.temperature}
                    min={0}
                    max={2}
                    step={0.1}
                    onChange={(next) => updateSettings({ temperature: Number(next) })}
                    formatValue={(next) => `温度 ${Number(next).toFixed(1)}`}
                  />
                </FieldLabel>

                <FieldLabel label="Top P">
                  <RangeNumberField
                    value={settings.topP}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(next) => updateSettings({ topP: Number(next) })}
                    formatValue={(next) => `采样 ${Number(next).toFixed(2)}`}
                  />
                </FieldLabel>
              </div>

              <details className="mt-4 border-t border-atelier-fg/10 pt-3" open>
                <summary className="details-summary group flex cursor-pointer list-none items-center justify-between text-[10px] uppercase tracking-editorial text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent">
                  <span>高级 Prompt 模板</span>
                  <span className="details-chevron transition-transform duration-500 group-hover:text-atelier-accent" aria-hidden="true">
                    <SummaryChevron />
                  </span>
                </summary>
                <textarea
                  value={settings.promptTemplate}
                  onChange={(event) => updateSettings({ promptTemplate: event.target.value })}
                  className="mt-3 min-h-44 w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm leading-relaxed outline-none transition-colors duration-500 placeholder:font-display placeholder:italic placeholder:text-atelier-subtle focus:border-atelier-accent"
                />
              </details>
            </section>

            <ModeLibrary modes={STORYBOARD_MODES} activeModeId={settings.modeId} onSelect={(modeId) => updateSettings({ modeId })} />

            <section className="module-block">
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <PrimaryButton type="submit" disabled={loading}>
                  {loading ? "生成中" : "拓展分镜"}
                </PrimaryButton>
                <button
                  type="button"
                  disabled={!loading && !batchRunning}
                  onClick={handleCancel}
                  className="min-h-12 border border-atelier-fg px-8 text-xs uppercase tracking-button transition-colors duration-500 hover:bg-atelier-fg hover:text-atelier-inverse disabled:opacity-50"
                >
                  取消任务
                </button>
              </div>
              <p className="mt-3 text-xs text-atelier-subtle">快捷键：Ctrl/Cmd + Enter 直接生成</p>
            </section>

            <BatchWorkflow
              batchText={batchText}
              setBatchText={setBatchText}
              batchCount={batchCount}
              onRun={handleBatchRun}
              running={batchRunning}
              batchResults={batchResults}
              onUseResult={useBatchResult}
              onCopySeed={copyBatchSeed}
              onCopyResult={copyBatchResult}
              onExportResult={exportBatchResult}
            />
          </form>
        </aside>

        <section className="workbench-panel motion-rise motion-rise-delay-2 relative">
          <p className="vertical-tag right-[-22px] top-5 hidden lg:block">Results / Edition</p>

          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-atelier-fg/15 pb-4">
            <div>
              <p className="flex items-center gap-3 text-[10px] uppercase tracking-editorial text-atelier-subtle">
                <span className="h-px w-10 bg-atelier-fg" />
                Output
              </p>
              <h2 className="mt-3 font-display text-5xl font-normal leading-[0.95]">拓展结果画布</h2>
            </div>
            <div className="status-console max-w-sm">
              <StatusBadge state={status.kind} text={status.badge} />
              <p className="mt-2 text-sm text-atelier-subtle">{status.text}</p>
            </div>
          </header>

          <section className="module-block mt-4">
            <div className="flex flex-wrap gap-2">
              <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">模式 · {activeMode.name}</span>
              <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">风格 · {activeStyleLabel}</span>
              <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">条数 · {settings.ideaCount}</span>
            </div>
          </section>

          <div className="toolbar-shelf mt-4 flex flex-wrap items-center gap-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">筛选</p>
            {FILTER_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setFilterMode(mode.id)}
                className={`border px-2 py-1 text-[10px] uppercase tracking-[0.18em] transition-colors duration-500 ${
                  filterMode === mode.id
                    ? "border-atelier-accent bg-atelier-accent text-atelier-inverse"
                    : "border-atelier-fg/20 text-atelier-subtle hover:border-atelier-accent hover:text-atelier-accent"
                }`}
              >
                {mode.label}
              </button>
            ))}
            <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
              可见 {visibleEntries.length}
            </span>
            <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
              已选 {selectedVisibleCount}
            </span>
          </div>

          <div className="toolbar-shelf mt-2 flex flex-wrap gap-4">
            <ToolbarButton onClick={copyAll} disabled={ideas.length === 0}>复制全部</ToolbarButton>
            <ToolbarButton onClick={exportMarkdown} disabled={ideas.length === 0}>导出 Markdown</ToolbarButton>
            <ToolbarButton onClick={exportJson} disabled={ideas.length === 0}>导出 JSON</ToolbarButton>
            <ToolbarButton onClick={clearResults} disabled={ideas.length === 0}>清空结果</ToolbarButton>
            <span className="mx-1 h-4 w-px bg-atelier-fg/20" aria-hidden="true" />
            <ToolbarButton onClick={selectAllVisible} disabled={visibleEntries.length === 0}>全选可见</ToolbarButton>
            <ToolbarButton onClick={clearSelection} disabled={selectedIdeaIndexes.length === 0}>清除选择</ToolbarButton>
            <ToolbarButton onClick={batchCopySelected} disabled={selectedIdeaIndexes.length === 0}>复制所选</ToolbarButton>
            <ToolbarButton onClick={() => batchFavoriteSelected(true)} disabled={selectedIdeaIndexes.length === 0}>收藏所选</ToolbarButton>
            <ToolbarButton onClick={() => batchFavoriteSelected(false)} disabled={selectedIdeaIndexes.length === 0}>取消收藏</ToolbarButton>
            <ToolbarButton onClick={batchDeleteSelected} disabled={selectedIdeaIndexes.length === 0}>删除所选</ToolbarButton>
          </div>

          {loading ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Array.from({ length: Number(settings.ideaCount) }).map((_, idx) => (
                <article key={idx} className="animate-pulseSoft border-t border-atelier-fg/10 pt-4">
                  <div className="h-3 w-16 bg-atelier-fg/10" />
                  <div className="mt-3 h-6 w-3/4 bg-atelier-fg/10" />
                  <div className="mt-2 h-3 w-full bg-atelier-fg/10" />
                  <div className="mt-2 h-3 w-2/3 bg-atelier-fg/10" />
                </article>
              ))}
            </div>
          ) : ideas.length === 0 ? (
            <section className="result-empty mt-6">
              <h3 className="font-display text-3xl font-normal">尚未生成</h3>
              <p className="mt-2 max-w-2xl text-sm text-atelier-subtle">从一个镜头起步，扩展成可拍摄、可重组、可继续写成完整分镜脚本的一组方向。</p>
            </section>
          ) : visibleEntries.length === 0 ? (
            <section className="result-empty mt-6">
              <h3 className="font-display text-3xl font-normal">当前筛选无结果</h3>
              <p className="mt-2 max-w-2xl text-sm text-atelier-subtle">可切回“全部”或调整收藏状态查看对应分镜。</p>
            </section>
          ) : (
            <section className="mt-6 grid gap-5 md:grid-cols-2">
              {visibleEntries.map(({ idea, index, favorite }) => {
                const key = makeIdeaKey(idea, index);
                return (
                  <IdeaCard
                    key={key}
                    idea={idea}
                    index={index}
                    onCopy={copySingle}
                    onRemix={remixOne}
                    onFavorite={toggleFavorite}
                    favorite={favorite}
                    selected={selectedIdeaIndexes.includes(index)}
                    onToggleSelect={(event) => toggleSelectIdea(index, event.shiftKey)}
                  />
                );
              })}
            </section>
          )}

          <TaskQueuePanel runs={taskRuns} onClear={clearTaskRuns} onRemove={removeTaskRun} />

          <HistoryPanel history={history} onRestore={restoreHistory} onRemove={removeHistory} onClear={clearHistory} />
        </section>
      </main>
    </div>
  );
}

function GridLines() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <span className="gridline-edge absolute bottom-0 left-[8%] top-0 w-px bg-atelier-fg/20" />
      <span className="absolute bottom-0 left-1/3 top-0 w-px bg-atelier-fg/20" />
      <span className="absolute bottom-0 left-2/3 top-0 w-px bg-atelier-fg/20" />
      <span className="gridline-edge absolute bottom-0 right-[8%] top-0 w-px bg-atelier-fg/20" />
    </div>
  );
}

function PaperGrain() {
  return <div className="paper-grain pointer-events-none fixed inset-0 z-50" />;
}

function FieldLabel({ label, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] uppercase tracking-editorial text-atelier-subtle">{label}</span>
      {children}
    </label>
  );
}

function ToolbarButton({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="underline-reveal text-[10px] uppercase tracking-[0.2em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function formatFileStamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const minute = String(d.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}`;
}

function makeFavoriteKey(idea) {
  return `${idea?.title || ""}__${idea?.scene || ""}`.slice(0, 260);
}

function makeIdeaKey(idea, index) {
  return `${makeFavoriteKey(idea)}__${index}`;
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName.toLowerCase();
  if (target.getAttribute("contenteditable") === "true") return true;
  return tag === "input" || tag === "textarea" || tag === "select";
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatTaskStageSummary(task) {
  const stageText = String(task?.stageText || "").trim();
  const progress = Number(task?.progress);
  const safeProgress = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
  if (stageText) {
    return `${stageText} · ${safeProgress}%`;
  }
  return `任务进度 ${safeProgress}%`;
}

function SummaryChevron() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none">
      <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}
