import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { VideoComposerModal } from "../components/VideoComposerModal";
import { WorkflowHubModal } from "../components/WorkflowHubModal";
import { InputPanel } from "../components/studio/InputPanel";
import { ResultCanvas } from "../components/studio/ResultCanvas";
import { StudioHeader } from "../components/studio/StudioHeader";
import { useTaskQueueState } from "../hooks/useTaskQueueState";
import { buildIdeaCopyText, downloadText, formatTime, toIdeaMarkdown } from "../lib/formatters";
import { DEFAULT_PROMPT_TEMPLATE, getModeById, STORYBOARD_MODES, STYLE_BIASES } from "../lib/modes";
import { useLocalStorageState } from "../lib/storage";
import {
  applyReferencePolicyToSequenceIdeas,
  countSequenceReferenceImages,
  formatReferenceImagePolicyLabel,
  formatTaskStageSummary,
  isIdeaImageReady,
  isIdeaVideoReady,
  normalizeIdeaMediaFilter,
  normalizeQueueFilter,
  normalizeReferenceImagePolicyValue,
  normalizeWorkflowHubTab,
  splitImageReference,
} from "../lib/studioState";
import {
  cancelTaskById,
  clearHistoryEntries,
  createBatchExpandTask,
  createChapter,
  deleteChapterSequenceVideo,
  createProject,
  createExpandTask,
  createImageTask,
  createVideoTask,
  deleteChapter,
  deleteProject,
  getChapterShots,
  getChapterSequenceVideos,
  getChapters,
  getHistory,
  getHistoryEntry,
  getProjects,
  getTaskStatus,
  getWorkspaceBootstrap,
  removeHistoryEntry,
  replaceChapterShots,
  saveChapterSequenceVideo,
  saveHistoryEntry,
  updateChapter,
  updateChapterShotImage,
  updateChapterShotVideo,
  updateProject,
  updateHistoryEntryIdeaImage,
  updateHistoryEntryIdeaVideo,
  updateHistoryEntryIdeas,
} from "../services/studioApi";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='900' height='1125' viewBox='0 0 900 1125'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%23ebe5de'/%3E%3Cstop offset='1' stop-color='%23d7cfc3'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect fill='url(%23g)' width='900' height='1125'/%3E%3Cg fill='none' stroke='%231a1a1a' stroke-opacity='.25'%3E%3Cpath d='M100 250h700M100 500h700M100 750h700'/%3E%3Cpath d='M200 150v820M450 150v820M700 150v820'/%3E%3C/g%3E%3Ctext x='86' y='940' font-family='serif' font-size='62' fill='%231a1a1a' fill-opacity='.8'%3EStoryboard / Input Canvas%3C/text%3E%3C/svg%3E";

const defaultSettings = {
  seedText: "",
  model: "gemini-2.5-flash-image",
  textModel: "gemini-2.5-flash-image",
  imageModel: "gemini-2.5-flash-image",
  videoModel: "gemini-2.5-flash-image",
  styleBias: "cinematic",
  modeId: "ad-film",
  ideaCount: 8,
  temperature: 1,
  topP: 0.9,
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
};

const DEFAULT_SEQUENCE_PROMPT_TEMPLATE = `你是一名电影导演与剪辑师，请将以下分镜串联为一条连续视频。
要求：
1) 镜头之间环环相扣，时空和角色状态连续
2) 镜头衔接自然，过渡方式优先使用 {{transitionStyle}}
3) 输出一条完整视频，不要字幕、水印、Logo

画幅：{{aspectRatio}}
时长：约 {{durationSeconds}} 秒
连贯性：{{continuityNote}}
图像参与策略：{{referencePolicy}}
分镜链路：
{{shots}}
`;

const defaultVideoComposerSettings = {
  title: "",
  aspectRatio: "16:9",
  durationSeconds: 6,
  transitionStyle: "match-cut",
  referenceImagePolicy: "all",
  continuityNote: "主角形象、服装、方位和时间线保持一致。",
  negativePrompt: "no subtitle, no watermark, no logo, no text overlay",
  promptTemplate: DEFAULT_SEQUENCE_PROMPT_TEMPLATE,
};

const FILTER_MODES = [
  { id: "all", label: "全部" },
  { id: "favorites", label: "仅收藏" },
  { id: "unstarred", label: "未收藏" },
];
const IDEA_MEDIA_FILTERS = [
  { id: "all", label: "全部媒体" },
  { id: "with_image", label: "有图片" },
  { id: "with_video", label: "有视频" },
  { id: "no_media", label: "无媒体" },
];

const FINAL_TASK_STATUSES = ["success", "error", "cancelled"];
const QUEUE_FILTER_QUERY_KEY = "queue";
const WORKFLOW_HUB_TAB_QUERY_KEY = "hub";

export default function StudioPage() {
  const navigate = useNavigate();
  const { projectId: routeProjectId = "", chapterId: routeChapterId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useLocalStorageState("atelier_settings_react", defaultSettings);
  const [history, setHistory] = useState([]);
  const [favorites, setFavorites] = useLocalStorageState("atelier_favorites_react", {});
  const { taskRuns, startTaskRun, finishTaskRun, patchTaskRun, removeTaskRun, clearTaskRuns } = useTaskQueueState();

  const [ideas, setIdeas] = useState([]);
  const [imageState, setImageState] = useState({ dataUrl: "", name: "" });
  const [status, setStatus] = useState({ kind: "idle", badge: "待命中", text: "输入分镜后点击“拓展分镜”。" });
  const [loading, setLoading] = useState(false);

  const [batchText, setBatchText] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState([]);
  const [batchImageRunning, setBatchImageRunning] = useState(false);
  const [videoComposerOpen, setVideoComposerOpen] = useState(false);
  const [videoComposerShotIndexes, setVideoComposerShotIndexes] = useState([]);
  const [sequenceVideoRunning, setSequenceVideoRunning] = useState(false);
  const [videoComposerResult, setVideoComposerResult] = useState(null);
  const [videoComposerSettings, setVideoComposerSettings] = useLocalStorageState(
    "atelier_video_composer_settings_react",
    defaultVideoComposerSettings
  );
  const [sequenceVideoHistory, setSequenceVideoHistory] = useState([]);
  const [filterMode, setFilterMode] = useState("all");
  const [ideaSearchText, setIdeaSearchText] = useState("");
  const [ideaMediaFilter, setIdeaMediaFilter] = useState("all");
  const [activeHistoryId, setActiveHistoryId] = useState(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [projectItems, setProjectItems] = useState([]);
  const [chapterItems, setChapterItems] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [activeChapter, setActiveChapter] = useState(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [renameProjectName, setRenameProjectName] = useState("");
  const [renameProjectDescription, setRenameProjectDescription] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [renameChapterTitle, setRenameChapterTitle] = useState("");
  const [pendingProjectDelete, setPendingProjectDelete] = useState(false);
  const [pendingChapterDelete, setPendingChapterDelete] = useState(false);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [workspaceModalTab, setWorkspaceModalTab] = useState("project");
  const [workflowHubOpen, setWorkflowHubOpen] = useState(false);
  const [queueFilterMode, setQueueFilterMode] = useState(() =>
    normalizeQueueFilter(searchParams.get(QUEUE_FILTER_QUERY_KEY))
  );
  const [workflowHubTab, setWorkflowHubTab] = useState(() =>
    normalizeWorkflowHubTab(searchParams.get(WORKFLOW_HUB_TAB_QUERY_KEY))
  );
  const [selectedIdeaIndexes, setSelectedIdeaIndexes] = useState([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null);

  const pendingRef = useRef(null);
  const formRef = useRef(null);
  const resultsAnchorRef = useRef(null);
  const activeHistoryIdRef = useRef(null);
  const chapterShotLoadedRef = useRef(false);

  const activeMode = useMemo(() => getModeById(settings.modeId), [settings.modeId]);
  const activeStyleLabel = useMemo(
    () => STYLE_BIASES.find((item) => item.id === settings.styleBias)?.label || settings.styleBias,
    [settings.styleBias]
  );
  const textModelValue = settings.textModel || settings.model || defaultSettings.textModel;
  const imageModelValue = settings.imageModel || settings.textModel || settings.model || defaultSettings.imageModel;
  const videoModelValue =
    settings.videoModel || settings.imageModel || settings.textModel || settings.model || defaultSettings.videoModel;
  const currentProjectId = String(routeProjectId || "").trim();
  const currentChapterId = String(routeChapterId || "").trim();

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
    const keyword = String(ideaSearchText || "")
      .trim()
      .toLowerCase();
    const mediaFilter = normalizeIdeaMediaFilter(ideaMediaFilter);
    return ideaEntries.filter((entry) => {
      if (filterMode === "favorites") return entry.favorite;
      if (filterMode === "unstarred") return !entry.favorite;

      const idea = entry.idea && typeof entry.idea === "object" ? entry.idea : {};
      if (keyword) {
        const target = [
          idea.title,
          idea.scene,
          idea.camera,
          idea.mood,
          idea.twist,
          idea.seedIdea,
        ]
          .map((item) => String(item || ""))
          .join(" ")
          .toLowerCase();
        if (!target.includes(keyword)) {
          return false;
        }
      }

      const hasImage = isIdeaImageReady(idea);
      const hasVideo = isIdeaVideoReady(idea);
      if (mediaFilter === "with_image" && !hasImage) return false;
      if (mediaFilter === "with_video" && !hasVideo) return false;
      if (mediaFilter === "no_media" && (hasImage || hasVideo)) return false;

      return true;
    });
  }, [ideaEntries, filterMode, ideaMediaFilter, ideaSearchText]);

  const visibleIndexes = useMemo(() => visibleEntries.map((entry) => entry.index), [visibleEntries]);
  const selectedVisibleCount = useMemo(
    () => selectedIdeaIndexes.filter((index) => visibleIndexes.includes(index)).length,
    [selectedIdeaIndexes, visibleIndexes]
  );
  const anyImageLoading = useMemo(
    () => ideas.some((idea) => idea?.generatedImage?.status === "loading"),
    [ideas]
  );
  const anyVideoLoading = useMemo(
    () => ideas.some((idea) => idea?.generatedVideo?.status === "loading"),
    [ideas]
  );
  const composerSelectedShots = useMemo(
    () =>
      videoComposerShotIndexes
        .map((ideaIndex) => {
          const idea = ideas[ideaIndex];
          if (!idea || typeof idea !== "object") {
            return null;
          }
          return {
            ideaIndex,
            ...idea,
          };
        })
        .filter(Boolean),
    [ideas, videoComposerShotIndexes]
  );
  const composerReferenceStats = useMemo(() => {
    const policy = normalizeReferenceImagePolicyValue(videoComposerSettings?.referenceImagePolicy);
    const policyApplied = applyReferencePolicyToSequenceIdeas(composerSelectedShots, policy);
    return {
      policy,
      totalShots: composerSelectedShots.length,
      availableImageCount: countSequenceReferenceImages(composerSelectedShots),
      usedImageCount: countSequenceReferenceImages(policyApplied),
    };
  }, [composerSelectedShots, videoComposerSettings?.referenceImagePolicy]);

  useEffect(() => {
    chapterShotLoadedRef.current = false;
  }, [currentProjectId, currentChapterId]);

  useEffect(() => {
    if (!currentProjectId || !currentChapterId) {
      return;
    }
    // Prevent stale ideas from previous chapter while current chapter is loading.
    setIdeas([]);
    setSelectedIdeaIndexes([]);
    setLastSelectedIndex(null);
    setVideoComposerShotIndexes([]);
    setVideoComposerResult(null);
    setSequenceVideoHistory([]);
    setVideoComposerOpen(false);
    setFilterMode("all");
  }, [currentChapterId, currentProjectId]);

  useEffect(() => {
    setPendingProjectDelete(false);
    setPendingChapterDelete(false);
  }, [currentProjectId, currentChapterId]);

  useEffect(() => {
    if (!workspaceModalOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeWorkspaceModal();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [workspaceModalOpen]);

  useEffect(() => {
    if (!workflowHubOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setWorkflowHubOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [workflowHubOpen]);

  useEffect(() => {
    if (!videoComposerOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setVideoComposerOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [videoComposerOpen]);

  useEffect(() => {
    let cancelled = false;

    const syncWorkspace = async () => {
      try {
        if (!currentProjectId || !currentChapterId) {
          const bootstrap = await getWorkspaceBootstrap();
          if (cancelled) return;
          const nextProjectId = String(bootstrap?.project?.id || "").trim();
          const nextChapterId = String(bootstrap?.chapter?.id || "").trim();
          if (nextProjectId && nextChapterId) {
            setProjectItems(Array.isArray(bootstrap?.projects) ? bootstrap.projects : []);
            setChapterItems(Array.isArray(bootstrap?.chapters) ? bootstrap.chapters : []);
            setActiveProject(bootstrap?.project || null);
            setActiveChapter(bootstrap?.chapter || null);
            navigate(buildStudioPath(nextProjectId, nextChapterId), { replace: true });
            return;
          }
        }

        if (!currentProjectId || !currentChapterId) {
          setWorkspaceLoading(false);
          return;
        }

        const [projectsData, chaptersData] = await Promise.all([
          getProjects(100),
          getChapters(currentProjectId, 200),
        ]);
        if (cancelled) return;

        const projects = Array.isArray(projectsData?.items) ? projectsData.items : [];
        const chapters = Array.isArray(chaptersData?.items) ? chaptersData.items : [];
        setProjectItems(projects);
        setChapterItems(chapters);

        const projectHit = projects.find((item) => item.id === currentProjectId) || null;
        setActiveProject(projectHit);

        let chapterHit = chapters.find((item) => item.id === currentChapterId) || null;
        if (!chapterHit && chapters[0]) {
          navigate(buildStudioPath(currentProjectId, chapters[0].id), { replace: true });
          return;
        }

        if (!chapterHit && chapters.length === 0) {
          const createData = await createChapter(currentProjectId, { title: "第 1 章" });
          if (cancelled) return;
          chapterHit = createData?.item || null;
          if (chapterHit?.id) {
            navigate(buildStudioPath(currentProjectId, chapterHit.id), { replace: true });
            return;
          }
        }

        setActiveChapter(chapterHit);
      } catch {
        // Keep studio usable even if workspace metadata request fails.
      } finally {
        if (!cancelled) {
          setWorkspaceLoading(false);
        }
      }
    };

    setWorkspaceLoading(true);
    syncWorkspace();
    return () => {
      cancelled = true;
    };
  }, [currentChapterId, currentProjectId, navigate]);

  useEffect(() => {
    let cancelled = false;

    const loadChapterIdeas = async () => {
      if (!currentProjectId || !currentChapterId || chapterShotLoadedRef.current) {
        return;
      }

      try {
        const data = await getChapterShots(currentProjectId, currentChapterId);
        if (cancelled) return;
        chapterShotLoadedRef.current = true;
        const chapterIdeas = Array.isArray(data?.ideas) ? data.ideas : [];
        setIdeas(chapterIdeas);
        setFilterMode("all");
        setSelectedIdeaIndexes([]);
        setLastSelectedIndex(null);
        if (chapterIdeas.length > 0) {
          updateStatus("success", "章节已加载", `已加载本章节 ${chapterIdeas.length} 条分镜。`);
        } else {
          updateStatus("idle", "章节为空", "当前章节暂无分镜，可以开始生成。");
        }
      } catch {
        chapterShotLoadedRef.current = true;
      }
    };

    loadChapterIdeas();
    return () => {
      cancelled = true;
    };
  }, [currentChapterId, currentProjectId]);

  useEffect(() => {
    let cancelled = false;

    const loadSequenceHistory = async () => {
      if (!currentProjectId || !currentChapterId) {
        if (!cancelled) {
          setSequenceVideoHistory([]);
          setVideoComposerResult(null);
        }
        return;
      }

      try {
        const data = await getChapterSequenceVideos(currentProjectId, currentChapterId, 80);
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setSequenceVideoHistory(items);
        setVideoComposerResult((prev) => {
          if (!prev?.id) {
            return prev;
          }
          return items.find((item) => item.id === prev.id) || null;
        });
      } catch {
        if (!cancelled) {
          setSequenceVideoHistory([]);
          setVideoComposerResult(null);
        }
      }
    };

    loadSequenceHistory();
    return () => {
      cancelled = true;
    };
  }, [currentChapterId, currentProjectId]);

  useEffect(() => {
    setRenameProjectName(String(activeProject?.name || ""));
    setRenameProjectDescription(String(activeProject?.description || ""));
  }, [activeProject?.id, activeProject?.name, activeProject?.description]);

  useEffect(() => {
    setRenameChapterTitle(String(activeChapter?.title || ""));
  }, [activeChapter?.id, activeChapter?.title]);

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
    setVideoComposerShotIndexes((prev) => prev.filter((index) => index >= 0 && index < max));
  }, [ideas.length]);

  useEffect(() => {
    const nextQueueMode = normalizeQueueFilter(searchParams.get(QUEUE_FILTER_QUERY_KEY));
    const nextHubTab = normalizeWorkflowHubTab(searchParams.get(WORKFLOW_HUB_TAB_QUERY_KEY));
    setQueueFilterMode((prev) => (prev === nextQueueMode ? prev : nextQueueMode));
    setWorkflowHubTab((prev) => (prev === nextHubTab ? prev : nextHubTab));
  }, [searchParams]);

  useEffect(() => {
    const currentMode = normalizeQueueFilter(searchParams.get(QUEUE_FILTER_QUERY_KEY));
    const currentHubTab = normalizeWorkflowHubTab(searchParams.get(WORKFLOW_HUB_TAB_QUERY_KEY));
    if (currentMode === queueFilterMode && currentHubTab === workflowHubTab) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    if (queueFilterMode === "all") {
      nextParams.delete(QUEUE_FILTER_QUERY_KEY);
    } else {
      nextParams.set(QUEUE_FILTER_QUERY_KEY, queueFilterMode);
    }

    if (workflowHubTab === "batch") {
      nextParams.delete(WORKFLOW_HUB_TAB_QUERY_KEY);
    } else {
      nextParams.set(WORKFLOW_HUB_TAB_QUERY_KEY, workflowHubTab);
    }

    setSearchParams(nextParams, { replace: true });
  }, [queueFilterMode, searchParams, setSearchParams, workflowHubTab]);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      try {
        const data = await getHistory(30);
        if (!cancelled) {
          setHistory(Array.isArray(data?.items) ? data.items : []);
        }
      } catch {
        if (!cancelled) {
          setHistory([]);
        }
      }
    };

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    activeHistoryIdRef.current = activeHistoryId;
  }, [activeHistoryId]);

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
        setIdeas((prev) => {
          const nextIdeas = prev.filter((_, index) => !selectedIdeaIndexes.includes(index));
          persistChapterIdeas(nextIdeas).catch(() => {
            // non-blocking: keep UI responsive when persistence fails transiently
          });
          return nextIdeas;
        });
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
  const closeWorkspaceModal = () => {
    setWorkspaceModalOpen(false);
    setPendingProjectDelete(false);
    setPendingChapterDelete(false);
  };

  const persistChapterIdeas = async (nextIdeas) => {
    if (!currentProjectId || !currentChapterId) {
      return false;
    }
    const safeIdeas = Array.isArray(nextIdeas) ? nextIdeas : [];
    try {
      await replaceChapterShots(currentProjectId, currentChapterId, safeIdeas);
      setChapterItems((prev) =>
        prev.map((item) => (item.id === currentChapterId ? { ...item, shotCount: safeIdeas.length } : item))
      );
      setActiveChapter((prev) =>
        prev?.id === currentChapterId ? { ...prev, shotCount: safeIdeas.length } : prev
      );
      return true;
    } catch {
      return false;
    }
  };

  const persistChapterIdeaImage = async (ideaIndex, generatedImage) => {
    if (!currentProjectId || !currentChapterId) {
      return false;
    }
    const safeIdeaIndex = Number(ideaIndex);
    if (!Number.isInteger(safeIdeaIndex) || safeIdeaIndex < 0) {
      return false;
    }
    try {
      await updateChapterShotImage(currentProjectId, currentChapterId, safeIdeaIndex, generatedImage);
      return true;
    } catch {
      return false;
    }
  };

  const persistChapterIdeaVideo = async (ideaIndex, generatedVideo) => {
    if (!currentProjectId || !currentChapterId) {
      return false;
    }
    const safeIdeaIndex = Number(ideaIndex);
    if (!Number.isInteger(safeIdeaIndex) || safeIdeaIndex < 0) {
      return false;
    }
    try {
      await updateChapterShotVideo(currentProjectId, currentChapterId, safeIdeaIndex, generatedVideo);
      return true;
    } catch {
      return false;
    }
  };

  const handleSwitchProject = async (nextProjectId) => {
    const safeProjectId = String(nextProjectId || "").trim();
    if (!safeProjectId || safeProjectId === currentProjectId || workspaceBusy) {
      return;
    }

    try {
      setWorkspaceBusy(true);
      const data = await getChapters(safeProjectId, 200);
      const chapters = Array.isArray(data?.items) ? data.items : [];
      let nextChapterId = String(chapters[0]?.id || "").trim();

      if (!nextChapterId) {
        const created = await createChapter(safeProjectId, { title: "第 1 章" });
        nextChapterId = String(created?.item?.id || "").trim();
      }

      if (!nextChapterId) {
        updateStatus("error", "切换项目失败", "未找到可进入的章节。");
        return;
      }

      setPendingProjectDelete(false);
      setPendingChapterDelete(false);
      navigate(buildStudioPath(safeProjectId, nextChapterId));
    } catch {
      updateStatus("error", "切换项目失败", "读取项目章节失败，请稍后重试。");
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleSwitchChapter = (nextChapterId) => {
    const safeChapterId = String(nextChapterId || "").trim();
    if (!currentProjectId || !safeChapterId || safeChapterId === currentChapterId || workspaceBusy) {
      return;
    }
    setPendingChapterDelete(false);
    navigate(buildStudioPath(currentProjectId, safeChapterId));
  };

  const handleCreateProject = async () => {
    if (workspaceBusy) {
      return;
    }

    try {
      setWorkspaceBusy(true);
      const defaultName = `项目 ${projectItems.length + 1}`;
      const nextName = String(newProjectName || "").trim() || defaultName;
      const nextDescription = String(newProjectDescription || "").trim();

      const projectData = await createProject({
        name: nextName,
        description: nextDescription,
      });
      const nextProjectId = String(projectData?.item?.id || "").trim();
      if (!nextProjectId) {
        throw new Error("项目创建失败");
      }

      const chapterData = await createChapter(nextProjectId, { title: "第 1 章" });
      const nextChapterId = String(chapterData?.item?.id || "").trim();
      if (!nextChapterId) {
        throw new Error("章节创建失败");
      }

      navigate(buildStudioPath(nextProjectId, nextChapterId));
      setNewProjectName("");
      setNewProjectDescription("");
      setPendingProjectDelete(false);
      updateStatus("success", "项目已创建", "已创建新项目并进入第 1 章。");
    } catch {
      updateStatus("error", "创建项目失败", "请稍后重试。");
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleCreateChapter = async () => {
    if (workspaceBusy) {
      return;
    }

    if (!currentProjectId) {
      updateStatus("error", "创建章节失败", "当前项目无效。");
      return;
    }

    try {
      setWorkspaceBusy(true);
      const defaultTitle = `第 ${chapterItems.length + 1} 章`;
      const nextTitle = String(newChapterTitle || "").trim() || defaultTitle;
      const chapterData = await createChapter(currentProjectId, {
        title: nextTitle,
      });
      const nextChapterId = String(chapterData?.item?.id || "").trim();
      if (!nextChapterId) {
        throw new Error("章节创建失败");
      }
      navigate(buildStudioPath(currentProjectId, nextChapterId));
      setNewChapterTitle("");
      setPendingChapterDelete(false);
      updateStatus("success", "章节已创建", "已创建新章节并切换。");
    } catch {
      updateStatus("error", "创建章节失败", "请稍后重试。");
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleRenameProject = async () => {
    if (!currentProjectId || workspaceBusy) {
      return;
    }

    const nextName = String(renameProjectName || "").trim();
    if (!nextName) {
      updateStatus("error", "项目重命名失败", "项目名称不能为空。");
      return;
    }

    try {
      setWorkspaceBusy(true);
      const data = await updateProject(currentProjectId, {
        name: nextName,
        description: String(renameProjectDescription || "").trim(),
      });
      const updated = data?.item;
      if (!updated?.id) {
        throw new Error("项目更新失败");
      }

      setProjectItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setActiveProject((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
      setPendingProjectDelete(false);
      updateStatus("success", "项目已更新", "项目名称和简介已保存。");
    } catch (error) {
      updateStatus("error", "项目重命名失败", error?.message || "请稍后重试。");
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleRenameChapter = async () => {
    if (!currentProjectId || !currentChapterId || workspaceBusy) {
      return;
    }

    const nextTitle = String(renameChapterTitle || "").trim();
    if (!nextTitle) {
      updateStatus("error", "章节重命名失败", "章节名称不能为空。");
      return;
    }

    try {
      setWorkspaceBusy(true);
      const data = await updateChapter(currentProjectId, currentChapterId, {
        title: nextTitle,
      });
      const updated = data?.item;
      if (!updated?.id) {
        throw new Error("章节更新失败");
      }

      setChapterItems((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setActiveChapter((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
      setPendingChapterDelete(false);
      updateStatus("success", "章节已更新", "章节名称已保存。");
    } catch (error) {
      updateStatus("error", "章节重命名失败", error?.message || "请稍后重试。");
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProjectId || workspaceBusy) {
      return;
    }

    if (!pendingProjectDelete) {
      setPendingProjectDelete(true);
      updateStatus("idle", "删除确认", "请再次点击“确认删除项目”以执行删除。");
      return;
    }

    try {
      setWorkspaceBusy(true);
      const result = await deleteProject(currentProjectId);
      const nextProjectId = String(result?.nextProject?.id || "").trim();
      const nextChapterId = String(result?.nextChapter?.id || "").trim();
      if (nextProjectId && nextChapterId) {
        navigate(buildStudioPath(nextProjectId, nextChapterId), { replace: true });
      } else {
        navigate("/studio", { replace: true });
      }
      setPendingProjectDelete(false);
      updateStatus("success", "项目已删除", "已切换到下一个可用项目。");
    } catch (error) {
      setPendingProjectDelete(false);
      updateStatus("error", "删除项目失败", error?.message || "请稍后重试。");
    } finally {
      setWorkspaceBusy(false);
    }
  };

  const handleDeleteChapter = async () => {
    if (!currentProjectId || !currentChapterId || workspaceBusy) {
      return;
    }

    if (!pendingChapterDelete) {
      setPendingChapterDelete(true);
      updateStatus("idle", "删除确认", "请再次点击“确认删除章节”以执行删除。");
      return;
    }

    try {
      setWorkspaceBusy(true);
      const result = await deleteChapter(currentProjectId, currentChapterId);
      const nextChapterId = String(result?.nextChapter?.id || "").trim();
      if (nextChapterId) {
        navigate(buildStudioPath(currentProjectId, nextChapterId), { replace: true });
      } else {
        navigate("/studio", { replace: true });
      }
      setPendingChapterDelete(false);
      updateStatus("success", "章节已删除", "已切换到下一个可用章节。");
    } catch (error) {
      setPendingChapterDelete(false);
      updateStatus("error", "删除章节失败", error?.message || "请稍后重试。");
    } finally {
      setWorkspaceBusy(false);
    }
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

  const retryTaskRunFromQueue = async (id) => {
    const safeId = String(id || "").trim();
    if (!safeId) {
      return;
    }

    const run = taskRuns.find((item) => item.id === safeId);
    if (!run?.retryPayload) {
      updateStatus("error", "无法重试", "该任务没有可重试参数。");
      return;
    }

    if (run.retryPayload.kind === "video-sequence") {
      await runSequenceVideoTask({
        shotIndexes: Array.isArray(run.retryPayload.shotIndexes) ? run.retryPayload.shotIndexes : [],
        configOverride: run.retryPayload.config,
        baseRecordId: String(run.retryPayload.baseRecordId || "").trim(),
      });
      return;
    }

    if (run.retryPayload.kind === "idea-image") {
      const ideaIndex = Number(run.retryPayload.ideaIndex);
      if (!Number.isInteger(ideaIndex) || ideaIndex < 0 || ideaIndex >= ideas.length) {
        updateStatus("error", "无法重试", "目标分镜不存在或已被删除。");
        return;
      }
      await generateIdeaImage(ideaIndex);
      return;
    }

    if (run.retryPayload.kind === "idea-video") {
      const ideaIndex = Number(run.retryPayload.ideaIndex);
      if (!Number.isInteger(ideaIndex) || ideaIndex < 0 || ideaIndex >= ideas.length) {
        updateStatus("error", "无法重试", "目标分镜不存在或已被删除。");
        return;
      }
      await generateIdeaVideo(ideaIndex);
      return;
    }

    updateStatus("error", "暂不支持", "当前仅支持串联视频任务重试。");
  };

  const resolveSourceMeta = (historyIdCandidate) => {
    const historyId = String(historyIdCandidate || activeHistoryIdRef.current || "").trim();
    const sourceRun = taskRuns.find(
      (item) =>
        item.type === "expand" &&
        item.status === "success" &&
        item?.resultPayload?.kind === "ideas" &&
        String(item?.resultPayload?.historyId || "") === historyId
    );

    const sourceHistory = history.find((item) => item.id === historyId);
    const sourceLabel = sourceRun
      ? `${sourceRun.title} · ${formatTime(sourceRun.startedAt)}`
      : sourceHistory
      ? `${sourceHistory.modeName || "分镜"} · ${formatTime(sourceHistory.createdAt)}`
      : `当前画布 · ${activeMode.name}`;

    return {
      historyId: historyId || null,
      sourceLabel,
      sourceRunId: sourceRun?.id || null,
    };
  };

  const scrollToResults = () => {
    if (typeof window === "undefined") {
      return;
    }
    window.requestAnimationFrame(() => {
      resultsAnchorRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const scrollToIdeaCard = (ideaIndex) => {
    if (typeof document === "undefined") {
      return;
    }
    const safeIdeaIndex = Number(ideaIndex);
    if (!Number.isInteger(safeIdeaIndex) || safeIdeaIndex < 0) {
      return;
    }
    window.setTimeout(() => {
      const element = document.querySelector(`[data-idea-card-index="${safeIdeaIndex}"]`);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 90);
  };

  const focusIdeaCard = (ideaIndex) => {
    const safeIdeaIndex = Number(ideaIndex);
    if (!Number.isInteger(safeIdeaIndex) || safeIdeaIndex < 0) {
      return;
    }
    setFilterMode("all");
    setSelectedIdeaIndexes([safeIdeaIndex]);
    setLastSelectedIndex(safeIdeaIndex);
    scrollToIdeaCard(safeIdeaIndex);
  };

  const resolveHistoryEntry = async (historyId) => {
    const safeId = String(historyId || "").trim();
    if (!safeId) {
      return null;
    }

    const localHit = history.find((item) => item.id === safeId);
    if (localHit) {
      return localHit;
    }

    try {
      const data = await getHistoryEntry(safeId);
      const remoteItem = data?.item;
      if (!remoteItem?.id) {
        return null;
      }
      setHistory((prev) => {
        const next = prev.filter((item) => item.id !== remoteItem.id);
        return [remoteItem, ...next].slice(0, 30);
      });
      return remoteItem;
    } catch {
      return null;
    }
  };

  const openTaskResult = async (id) => {
    const run = taskRuns.find((item) => item.id === id);
    if (!run) {
      updateStatus("error", "任务不存在", "找不到对应任务记录。");
      return;
    }

    const payload = run.resultPayload;
    if (!payload) {
      updateStatus("error", "无可打开结果", "该任务没有可恢复的结果。");
      return;
    }

    if (payload.kind === "ideas") {
      if (payload.historyId) {
        const hit = await resolveHistoryEntry(payload.historyId);
        if (hit) {
          restoreHistory(hit, {
            badge: "任务结果已打开",
            text: "已恢复该任务的分镜结果。",
          });
          return;
        }
      }

      const nextIdeas = Array.isArray(payload.ideas) ? payload.ideas : [];
      if (nextIdeas.length === 0) {
        updateStatus("error", "无可打开结果", "该任务未保存可恢复分镜。");
        return;
      }

      setIdeas(nextIdeas);
      setSelectedIdeaIndexes([]);
      setLastSelectedIndex(null);
      setFilterMode("all");
      setActiveHistoryId(payload.historyId || null);
      activeHistoryIdRef.current = payload.historyId || null;
      persistChapterIdeas(nextIdeas).catch(() => {
        // non-blocking: keep UI responsive when persistence fails transiently
      });
      updateSettings({
        seedText: String(payload.seedText || settings.seedText || ""),
        modeId: String(payload.modeId || settings.modeId),
        styleBias: String(payload.styleBias || settings.styleBias),
      });
      scrollToResults();
      updateStatus("success", "任务结果已打开", "已恢复该任务的分镜结果。");
      return;
    }

    if (payload.kind === "batch") {
      const results = Array.isArray(payload.results) ? payload.results : [];
      if (results.length === 0) {
        updateStatus("error", "无可打开结果", "该批量任务未保存可恢复结果。");
        return;
      }
      setBatchResults(results);
      scrollToResults();
      updateStatus("success", "任务结果已打开", `已恢复批量结果，共 ${results.length} 条。`);
      return;
    }

    if (payload.kind === "image") {
      const ideaIndex = Number(payload.ideaIndex);
      if (payload.historyId) {
        const hit = await resolveHistoryEntry(payload.historyId);
        if (hit) {
          restoreHistory(hit, {
            focusIdeaIndex: Number.isInteger(ideaIndex) ? ideaIndex : null,
            badge: "任务结果已打开",
            text: `已恢复分镜图任务：${payload.title || "分镜图"}`,
          });
          return;
        }
      }

      if (Number.isInteger(ideaIndex) && ideaIndex >= 0) {
        const image = ideas[ideaIndex]?.generatedImage;
        if (image?.status === "success" && String(image?.url || "").trim()) {
          focusIdeaCard(ideaIndex);
          scrollToResults();
          updateStatus("success", "任务结果已打开", `已定位到分镜图 #${ideaIndex + 1}。`);
          return;
        }
      }

      updateStatus("error", "无可打开结果", "该分镜图已不在当前画布，建议从“最近记录”恢复。");
      return;
    }

    if (payload.kind === "video") {
      const ideaIndex = Number(payload.ideaIndex);
      if (payload.historyId) {
        const hit = await resolveHistoryEntry(payload.historyId);
        if (hit) {
          restoreHistory(hit, {
            focusIdeaIndex: Number.isInteger(ideaIndex) ? ideaIndex : null,
            badge: "任务结果已打开",
            text: `已恢复分镜视频任务：${payload.title || "分镜视频"}`,
          });
          return;
        }
      }

      if (Number.isInteger(ideaIndex) && ideaIndex >= 0) {
        const video = ideas[ideaIndex]?.generatedVideo;
        if (video?.status === "success" && String(video?.url || "").trim()) {
          focusIdeaCard(ideaIndex);
          scrollToResults();
          updateStatus("success", "任务结果已打开", `已定位到分镜视频 #${ideaIndex + 1}。`);
          return;
        }
      }

      updateStatus("error", "无可打开结果", "该分镜视频已不在当前画布，建议从“最近记录”恢复。");
      return;
    }

    if (payload.kind === "video-sequence") {
      const sequenceId = String(payload.sequenceHistoryId || "").trim();
      let historyItem = sequenceVideoHistory.find((item) => item.id === sequenceId);

      if (!historyItem && sequenceId && currentProjectId && currentChapterId) {
        try {
          const remote = await getChapterSequenceVideos(currentProjectId, currentChapterId, 80);
          const remoteItems = Array.isArray(remote?.items) ? remote.items : [];
          if (remoteItems.length > 0) {
            setSequenceVideoHistory(remoteItems);
            historyItem = remoteItems.find((item) => item.id === sequenceId) || null;
          }
        } catch {
          // keep fallback path for url-only task payload
        }
      }

      if (historyItem) {
        setVideoComposerShotIndexes(
          Array.isArray(historyItem.shotIndexes)
            ? historyItem.shotIndexes.filter((value) => Number.isInteger(value) && value >= 0 && value < ideas.length)
            : []
        );
        setVideoComposerSettings((prev) => ({
          ...prev,
          ...(historyItem.config && typeof historyItem.config === "object" ? historyItem.config : {}),
          referenceImagePolicy: normalizeReferenceImagePolicyValue(
            historyItem?.config?.referenceImagePolicy || prev.referenceImagePolicy
          ),
        }));
        setVideoComposerResult(historyItem);
        setVideoComposerOpen(true);
        updateStatus("success", "任务结果已打开", `已打开串联视频：${historyItem.title || "未命名视频"}`);
        return;
      }

      const videoUrl = String(payload.videoUrl || "").trim();
      if (videoUrl) {
        const fallbackShotIndexes = Array.isArray(payload.shotIndexes)
          ? payload.shotIndexes.filter((value) => Number.isInteger(value) && value >= 0 && value < ideas.length)
          : [];
        const fallbackItem = {
          id: sequenceId || `seq-${Date.now()}`,
          title: payload.title || "串联视频",
          createdAt: Date.now(),
          shotIndexes: fallbackShotIndexes,
          generatedVideo: {
            status: "success",
            url: videoUrl,
            error: "",
            model: String(payload.model || videoModelValue),
            mimeType: String(payload.mimeType || "video/mp4"),
            prompt: String(payload.prompt || ""),
            durationSeconds: Number(payload.durationSeconds) || 0,
          },
          config: { ...videoComposerSettings },
        };
        setVideoComposerShotIndexes(fallbackShotIndexes);
        setVideoComposerResult(fallbackItem);
        setVideoComposerOpen(true);
        updateStatus("success", "任务结果已打开", "已打开串联视频结果。");
        return;
      }
    }

    updateStatus("error", "无可打开结果", "当前任务类型暂不支持打开。");
  };

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
      summary: `文本模型 ${textModelValue} / 目标 ${settings.ideaCount} 条`,
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
        model: textModelValue,
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "expand" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = String(task?.summary || formatTaskStageSummary(task));
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
      persistChapterIdeas(nextIdeas).catch(() => {
        // non-blocking: keep UI responsive when persistence fails transiently
      });
      const historyId = pushHistoryRecord(nextIdeas);
      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `生成完成，共 ${nextIdeas.length} 条。`,
        resultPayload: {
          kind: "ideas",
          historyId,
          modeId: settings.modeId,
          styleBias: settings.styleBias,
          seedText: settings.seedText,
        },
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
    } else if (current.kind === "video-sequence") {
      setSequenceVideoRunning(false);
    } else {
      setLoading(false);
    }
  };

  const syncActiveHistoryIdeas = (nextIdeas, options = {}) => {
    const historyId = String(options?.historyId || activeHistoryIdRef.current || "").trim();
    if (!historyId) {
      return;
    }

    setHistory((prev) =>
      prev.map((item) =>
        item.id === historyId
          ? {
              ...item,
              ideas: nextIdeas,
              count: Array.isArray(nextIdeas) ? nextIdeas.length : item.count,
              updatedAt: Date.now(),
            }
          : item
      )
    );

    updateHistoryEntryIdeas(historyId, nextIdeas).catch(() => {
      // ignore transient persistence errors; local state remains usable
    });
  };

  const syncActiveHistoryIdeaImage = (historyId, index, generatedImage) => {
    const safeHistoryId = String(historyId || "").trim();
    const safeIdeaIndex = Number(index);
    if (!safeHistoryId || !Number.isInteger(safeIdeaIndex) || safeIdeaIndex < 0) {
      return;
    }

    setHistory((prev) =>
      prev.map((item) => {
        if (item.id !== safeHistoryId) return item;
        const nextIdeas = Array.isArray(item.ideas)
          ? item.ideas.map((entry, entryIndex) =>
              entryIndex === safeIdeaIndex
                ? {
                    ...(entry && typeof entry === "object" ? entry : {}),
                    generatedImage,
                  }
                : entry
            )
          : item.ideas;
        return {
          ...item,
          ideas: nextIdeas,
          updatedAt: Date.now(),
        };
      })
    );

    updateHistoryEntryIdeaImage(safeHistoryId, safeIdeaIndex, generatedImage).catch(() => {
      // ignore transient persistence errors; local state remains usable
    });
  };

  const syncActiveHistoryIdeaVideo = (historyId, index, generatedVideo) => {
    const safeHistoryId = String(historyId || "").trim();
    const safeIdeaIndex = Number(index);
    if (!safeHistoryId || !Number.isInteger(safeIdeaIndex) || safeIdeaIndex < 0) {
      return;
    }

    setHistory((prev) =>
      prev.map((item) => {
        if (item.id !== safeHistoryId) return item;
        const nextIdeas = Array.isArray(item.ideas)
          ? item.ideas.map((entry, entryIndex) =>
              entryIndex === safeIdeaIndex
                ? {
                    ...(entry && typeof entry === "object" ? entry : {}),
                    generatedVideo,
                  }
                : entry
            )
          : item.ideas;
        return {
          ...item,
          ideas: nextIdeas,
          updatedAt: Date.now(),
        };
      })
    );

    updateHistoryEntryIdeaVideo(safeHistoryId, safeIdeaIndex, generatedVideo).catch(() => {
      // ignore transient persistence errors; local state remains usable
    });
  };

  const pushHistoryRecord = (nextIdeas) => {
    const safeIdeas = Array.isArray(nextIdeas) ? nextIdeas : [];
    if (safeIdeas.length === 0) {
      return null;
    }
    const item = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createdAt: Date.now(),
      seedText: settings.seedText,
      imageName: imageState.name,
      modeId: settings.modeId,
      modeName: activeMode.name,
      styleBias: settings.styleBias,
      styleName: activeStyleLabel,
      count: safeIdeas.length,
      ideas: safeIdeas,
    };

    setHistory((prev) => [item, ...prev].slice(0, 30));
    setActiveHistoryId(item.id);
    activeHistoryIdRef.current = item.id;
    saveHistoryEntry(item).catch(() => {
      // ignore transient persistence errors; local state remains usable
    });
    return item.id;
  };

  const ensureActiveHistoryRecord = (ideasSnapshot = ideas) => {
    if (activeHistoryIdRef.current) {
      return activeHistoryIdRef.current;
    }
    const safeIdeas = Array.isArray(ideasSnapshot) ? ideasSnapshot : [];
    if (safeIdeas.length === 0) {
      return null;
    }
    return pushHistoryRecord(safeIdeas);
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

  const patchIdeaImageState = (index, patch, options = {}) => {
    const shouldPersist = Boolean(options?.persistHistory);
    const historyId = String(options?.historyId || activeHistoryIdRef.current || "").trim();
    let nextIdeas = [];
    setIdeas((prev) => {
      nextIdeas = prev.map((idea, idx) => {
        if (idx !== index) return idea;
        const prevImage = idea?.generatedImage || { status: "idle", url: "", error: "", model: "" };
        return {
          ...idea,
          generatedImage: {
            ...prevImage,
            ...patch,
          },
        };
      });
      return nextIdeas;
    });

    if (shouldPersist && nextIdeas.length > 0 && historyId) {
      syncActiveHistoryIdeas(nextIdeas, { historyId });
    }
    return nextIdeas;
  };

  const patchIdeaVideoState = (index, patch, options = {}) => {
    const shouldPersist = Boolean(options?.persistHistory);
    const historyId = String(options?.historyId || activeHistoryIdRef.current || "").trim();
    let nextIdeas = [];
    setIdeas((prev) => {
      nextIdeas = prev.map((idea, idx) => {
        if (idx !== index) return idea;
        const prevVideo = idea?.generatedVideo || {
          status: "idle",
          url: "",
          error: "",
          model: "",
          mimeType: "",
          prompt: "",
          durationSeconds: 0,
        };
        return {
          ...idea,
          generatedVideo: {
            ...prevVideo,
            ...patch,
          },
        };
      });
      return nextIdeas;
    });

    if (shouldPersist && nextIdeas.length > 0 && historyId) {
      syncActiveHistoryIdeas(nextIdeas, { historyId });
    }
    return nextIdeas;
  };

  const generateIdeaImage = async (index) => {
    const idea = ideas[index];
    if (!idea) {
      return false;
    }

    if (idea?.generatedImage?.status === "loading") {
      return false;
    }

    const persistedHistoryId = ensureActiveHistoryRecord(ideas);
    const sourceMeta = resolveSourceMeta(persistedHistoryId);

    const taskId = startTaskRun({
      type: "image",
      title: `分镜图 #${index + 1}`,
      summary: `${idea.title || "分镜出图"} · ${imageModelValue}`,
      sourceKey: sourceMeta.historyId ? `history:${sourceMeta.historyId}` : `canvas:${settings.modeId}`,
      sourceLabel: sourceMeta.sourceLabel,
      sourceRunId: sourceMeta.sourceRunId,
      retryPayload: {
        kind: "idea-image",
        ideaIndex: index,
      },
    });

    patchIdeaImageState(index, {
      status: "loading",
      error: "",
    });
    updateStatus("loading", "出图中", `正在生成第 ${index + 1} 条分镜图...`);
    let backendTaskId = "";

    try {
      const ideaPayload = {
        title: idea.title,
        scene: idea.scene,
        camera: idea.camera,
        mood: idea.mood,
        twist: idea.twist,
        seedIdea: idea.seedIdea,
      };

      const createResult = await createImageTask({
        idea: ideaPayload,
        seedText: settings.seedText,
        modeId: settings.modeId,
        styleBias: settings.styleBias,
        imageModel: imageModelValue,
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "image" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = String(task?.summary || formatTaskStageSummary(task));
          patchTaskRun(taskId, {
            status: task.status,
            progress: Number(task.progress) || 0,
            stageText: String(task.stageText || ""),
            summary: stageSummary,
          });
          updateStatus("loading", "出图中", stageSummary);
        }
      });

      if (finalTask.status === "cancelled") {
        finishTaskRun(taskId, {
          status: "cancelled",
          progress: Number(finalTask.progress) || 0,
          stageText: String(finalTask.stageText || "已取消"),
          summary: "请求已取消。",
        });
        patchIdeaImageState(index, {
          status: "idle",
          error: "",
        });
        updateStatus("idle", "已取消", "出图任务已取消。");
        return false;
      }

      if (finalTask.status !== "success") {
        throw new Error(finalTask.error || "出图失败，请稍后重试。");
      }

      const imageDataUrl = String(finalTask?.result?.imageDataUrl || "");
      if (!imageDataUrl) {
        throw new Error("模型未返回图片，请切换支持出图的模型后重试。");
      }

      const generatedImage = {
        status: "success",
        url: imageDataUrl,
        error: "",
        model: String(finalTask?.result?.model || imageModelValue),
      };

      patchIdeaImageState(index, generatedImage);
      if (persistedHistoryId) {
        syncActiveHistoryIdeaImage(persistedHistoryId, index, generatedImage);
      }
      persistChapterIdeaImage(index, generatedImage).catch(() => {
        // non-blocking: keep UI responsive when persistence fails transiently
      });

      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `第 ${index + 1} 条分镜图已生成。`,
        resultPayload: {
          kind: "image",
          historyId: persistedHistoryId || activeHistoryIdRef.current || null,
          ideaIndex: index,
          ideaKey: makeFavoriteKey(ideaPayload),
          title: ideaPayload.title || `#${index + 1}`,
        },
      });
      updateStatus("success", "出图完成", `第 ${index + 1} 条分镜图已生成。`);
      return true;
    } catch (error) {
      const message = error?.message || "出图失败，请稍后重试。";
      patchIdeaImageState(index, {
        status: "error",
        error: message,
      });
      finishTaskRun(taskId, {
        status: "error",
        stageText: "失败",
        summary: message,
      });
      updateStatus("error", "出图失败", message);
      return false;
    } finally {
      if (pendingRef.current?.taskId === backendTaskId) {
        pendingRef.current = null;
      }
    }
  };

  const downloadIdeaImage = (index) => {
    const idea = ideas[index];
    const imageUrl = String(idea?.generatedImage?.url || "");
    if (!imageUrl.startsWith("data:image/")) {
      updateStatus("error", "无可下载图片", "请先生成分镜图。");
      return;
    }

    const stamp = formatFileStamp(new Date());
    const safeTitle = String(idea?.title || `frame-${index + 1}`)
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 40);
    const filename = `${safeTitle || `frame-${index + 1}`}-${stamp}.png`;
    triggerDownloadFromDataUrl(filename, imageUrl);
    updateStatus("success", "图片已导出", `第 ${index + 1} 条分镜图已下载。`);
  };

  const batchGenerateSelectedImages = async () => {
    if (selectedIdeaIndexes.length === 0) {
      updateStatus("error", "未选中分镜", "请先选择要出图的分镜卡片。");
      return;
    }

    if (batchImageRunning) {
      return;
    }

    const targets = [...selectedIdeaIndexes]
      .filter((index) => index >= 0 && index < ideas.length)
      .sort((a, b) => a - b);

    if (targets.length === 0) {
      updateStatus("error", "未选中分镜", "当前没有可出图的分镜。");
      return;
    }

    setBatchImageRunning(true);
    updateStatus("loading", "批量出图中", `正在批量生成 ${targets.length} 条分镜图...`);

    let successCount = 0;
    for (const index of targets) {
      const success = await generateIdeaImage(index);
      if (success) {
        successCount += 1;
      }
    }

    setBatchImageRunning(false);
    updateStatus("success", "批量出图完成", `已处理 ${targets.length} 条，成功 ${successCount} 条。`);
  };

  const generateIdeaVideo = async (index) => {
    const idea = ideas[index];
    if (!idea) {
      return false;
    }

    if (idea?.generatedVideo?.status === "loading") {
      return false;
    }

    const persistedHistoryId = ensureActiveHistoryRecord(ideas);
    const sourceMeta = resolveSourceMeta(persistedHistoryId);

    const taskId = startTaskRun({
      type: "video",
      title: `分镜视频 #${index + 1}`,
      summary: `${idea.title || "分镜视频"} · ${videoModelValue}`,
      sourceKey: sourceMeta.historyId ? `history:${sourceMeta.historyId}` : `canvas:${settings.modeId}`,
      sourceLabel: sourceMeta.sourceLabel,
      sourceRunId: sourceMeta.sourceRunId,
      retryPayload: {
        kind: "idea-video",
        ideaIndex: index,
      },
    });

    patchIdeaVideoState(index, {
      status: "loading",
      error: "",
    });
    updateStatus("loading", "视频生成中", `正在生成第 ${index + 1} 条分镜视频...`);
    let backendTaskId = "";

    try {
      const ideaPayload = {
        title: idea.title,
        scene: idea.scene,
        camera: idea.camera,
        mood: idea.mood,
        twist: idea.twist,
        seedIdea: idea.seedIdea,
      };

      const createResult = await createVideoTask({
        idea: ideaPayload,
        seedText: settings.seedText,
        modeId: settings.modeId,
        styleBias: settings.styleBias,
        videoModel: videoModelValue,
        imageDataUrl: String(idea?.generatedImage?.url || ""),
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "video" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = String(task?.summary || formatTaskStageSummary(task));
          patchTaskRun(taskId, {
            status: task.status,
            progress: Number(task.progress) || 0,
            stageText: String(task.stageText || ""),
            summary: stageSummary,
          });
          updateStatus("loading", "视频生成中", stageSummary);
        }
      });

      if (finalTask.status === "cancelled") {
        finishTaskRun(taskId, {
          status: "cancelled",
          progress: Number(finalTask.progress) || 0,
          stageText: String(finalTask.stageText || "已取消"),
          summary: "请求已取消。",
        });
        patchIdeaVideoState(index, {
          status: "idle",
          error: "",
        });
        updateStatus("idle", "已取消", "视频任务已取消。");
        return false;
      }

      if (finalTask.status !== "success") {
        throw new Error(finalTask.error || "视频生成失败，请稍后重试。");
      }

      const videoUrl = String(finalTask?.result?.videoUrl || "");
      if (!videoUrl) {
        throw new Error("模型未返回视频，请切换支持视频生成的模型后重试。");
      }

      const generatedVideo = {
        status: "success",
        url: videoUrl,
        error: "",
        model: String(finalTask?.result?.model || videoModelValue),
        mimeType: String(finalTask?.result?.mimeType || "video/mp4"),
        prompt: String(finalTask?.result?.prompt || ""),
        durationSeconds: Number(finalTask?.result?.durationSeconds) || 0,
      };

      patchIdeaVideoState(index, generatedVideo);
      if (persistedHistoryId) {
        syncActiveHistoryIdeaVideo(persistedHistoryId, index, generatedVideo);
      }
      persistChapterIdeaVideo(index, generatedVideo).catch(() => {
        // non-blocking: keep UI responsive when persistence fails transiently
      });

      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `第 ${index + 1} 条分镜视频已生成。`,
        resultPayload: {
          kind: "video",
          historyId: persistedHistoryId || activeHistoryIdRef.current || null,
          ideaIndex: index,
          ideaKey: makeFavoriteKey(ideaPayload),
          title: ideaPayload.title || `#${index + 1}`,
        },
      });
      updateStatus("success", "视频生成完成", `第 ${index + 1} 条分镜视频已生成。`);
      return true;
    } catch (error) {
      const message = error?.message || "视频生成失败，请稍后重试。";
      patchIdeaVideoState(index, {
        status: "error",
        error: message,
      });
      finishTaskRun(taskId, {
        status: "error",
        stageText: "失败",
        summary: message,
      });
      updateStatus("error", "视频生成失败", message);
      return false;
    } finally {
      if (pendingRef.current?.taskId === backendTaskId) {
        pendingRef.current = null;
      }
    }
  };

  const downloadIdeaVideo = async (index) => {
    const idea = ideas[index];
    const videoUrl = String(idea?.generatedVideo?.url || "");
    if (!isRenderableVideoUrl(videoUrl)) {
      updateStatus("error", "无可下载视频", "请先生成分镜视频。");
      return;
    }

    const stamp = formatFileStamp(new Date());
    const safeTitle = String(idea?.title || `motion-${index + 1}`)
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 40);
    const extension = inferVideoExtension(idea?.generatedVideo?.mimeType, videoUrl);
    const filename = `${safeTitle || `motion-${index + 1}`}-${stamp}.${extension}`;
    try {
      await triggerDownloadFromUrl(filename, videoUrl);
      updateStatus("success", "视频已导出", `第 ${index + 1} 条分镜视频已下载。`);
    } catch {
      updateStatus("error", "下载失败", "视频下载失败，请稍后重试。");
    }
  };

  const syncComposerShotsFromSelection = () => {
    const next = [...selectedIdeaIndexes]
      .filter((index) => index >= 0 && index < ideas.length)
      .sort((a, b) => a - b);
    setVideoComposerShotIndexes(next);
    return next;
  };

  const openVideoComposer = () => {
    const next = syncComposerShotsFromSelection();
    if (next.length < 2) {
      updateStatus("error", "未选中分镜", "请先在画布中选择至少 2 条分镜，再打开串联成片。");
      return;
    }
    setVideoComposerOpen(true);
  };

  const clearComposerSelection = () => {
    setVideoComposerShotIndexes([]);
  };

  const removeComposerShot = (position) => {
    setVideoComposerShotIndexes((prev) => prev.filter((_, idx) => idx !== position));
  };

  const moveComposerShot = (position, direction) => {
    const step = Number(direction);
    if (!Number.isInteger(position) || !Number.isInteger(step) || step === 0) {
      return;
    }
    setVideoComposerShotIndexes((prev) => {
      const from = position;
      const to = position + step;
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const temp = next[from];
      next[from] = next[to];
      next[to] = temp;
      return next;
    });
  };

  const restoreComposerOriginalOrder = () => {
    setVideoComposerShotIndexes((prev) => [...prev].sort((a, b) => a - b));
  };

  const updateVideoComposerConfig = (patch) => {
    setVideoComposerSettings((prev) => {
      const merged = {
        ...prev,
        ...(patch && typeof patch === "object" ? patch : {}),
      };
      const nextDuration = Number(merged.durationSeconds);
      merged.durationSeconds = Number.isFinite(nextDuration)
        ? Math.max(2, Math.min(12, Math.round(nextDuration)))
        : defaultVideoComposerSettings.durationSeconds;
      merged.referenceImagePolicy = normalizeReferenceImagePolicyValue(merged.referenceImagePolicy);
      return merged;
    });
  };

  const runSequenceVideoTask = async ({ shotIndexes, configOverride = null, baseRecordId = "" }) => {
    const normalizedIndexes = Array.isArray(shotIndexes)
      ? shotIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < ideas.length)
      : [];
    if (normalizedIndexes.length < 2) {
      updateStatus("error", "镜头数量不足", "至少需要 2 条分镜才能生成串联视频。");
      return false;
    }

    if (sequenceVideoRunning) {
      return false;
    }

    const usedConfig = {
      ...videoComposerSettings,
      ...(configOverride && typeof configOverride === "object" ? configOverride : {}),
    };
    const durationSeconds = Math.max(2, Math.min(12, Number(usedConfig.durationSeconds) || 6));
    const continuityNote = String(usedConfig.continuityNote || "").trim();
    const transitionStyle = String(usedConfig.transitionStyle || "match-cut").trim() || "match-cut";
    const referenceImagePolicy = normalizeReferenceImagePolicyValue(usedConfig.referenceImagePolicy);
    const promptTemplate = String(usedConfig.promptTemplate || "").trim();
    const title = String(usedConfig.title || "").trim() || `串联视频 · ${normalizedIndexes.length} 镜`;

    const rawSequenceIdeas = normalizedIndexes
      .map((ideaIndex) => {
        const idea = ideas[ideaIndex];
        if (!idea) return null;
        const imageRef = splitImageReference(idea?.generatedImage?.url);
        return {
          ideaIndex,
          title: idea.title,
          scene: idea.scene,
          camera: idea.camera,
          mood: idea.mood,
          twist: idea.twist,
          seedIdea: idea.seedIdea,
          referenceImageDataUrl: imageRef.dataUrl,
          referenceImageUrl: imageRef.url,
        };
      })
      .filter(Boolean);

    if (rawSequenceIdeas.length < 2) {
      updateStatus("error", "镜头数量不足", "请确认所选分镜都存在后重试。");
      return false;
    }

    const sequenceIdeas = applyReferencePolicyToSequenceIdeas(rawSequenceIdeas, referenceImagePolicy);
    const usedReferenceImageCount = countSequenceReferenceImages(sequenceIdeas);

    const sequenceMetaText = `镜头 ${sequenceIdeas.length} · 图参 ${usedReferenceImageCount} · 策略 ${formatReferenceImagePolicyLabel(
      referenceImagePolicy
    )}`;
    const retryPayload = {
      kind: "video-sequence",
      shotIndexes: normalizedIndexes,
      config: {
        ...usedConfig,
        title,
        durationSeconds,
        transitionStyle,
        referenceImagePolicy,
        continuityNote,
        negativePrompt: String(usedConfig.negativePrompt || "").trim(),
        promptTemplate,
      },
      baseRecordId: baseRecordId || "",
    };

    const taskId = startTaskRun({
      type: "video-sequence",
      title,
      summary: `${videoModelValue} · ${usedConfig.aspectRatio || "16:9"} · ${durationSeconds}s`,
      sourceLabel: `串联 ${sequenceIdeas.length} 镜`,
      sequenceMetaText,
      retryPayload,
    });

    setSequenceVideoRunning(true);
    updateStatus(
      "loading",
      "串联视频生成中",
      `正在将 ${sequenceIdeas.length} 条分镜串联为单条视频（图参 ${usedReferenceImageCount} 张）...`
    );
    let backendTaskId = "";

    try {
      const firstReferenceDataUrl =
        sequenceIdeas.find((shot) => String(shot.referenceImageDataUrl || "").trim())?.referenceImageDataUrl || "";
      const firstReferenceUrl =
        sequenceIdeas.find((shot) => String(shot.referenceImageUrl || "").trim())?.referenceImageUrl || "";

      const createResult = await createVideoTask({
        storyboardSequence: sequenceIdeas.map((shot) => ({
          title: shot.title,
          scene: shot.scene,
          camera: shot.camera,
          mood: shot.mood,
          twist: shot.twist,
          seedIdea: shot.seedIdea,
          referenceImageDataUrl: shot.referenceImageDataUrl,
          referenceImageUrl: shot.referenceImageUrl,
        })),
        seedText: settings.seedText,
        modeId: settings.modeId,
        styleBias: settings.styleBias,
        videoModel: videoModelValue,
        aspectRatio: String(usedConfig.aspectRatio || "16:9"),
        durationSeconds,
        transitionStyle,
        referenceImagePolicy,
        continuityNote,
        negativePrompt: String(usedConfig.negativePrompt || "").trim(),
        sequencePromptTemplate: promptTemplate,
        imageDataUrl: firstReferenceDataUrl,
        imageUrl: firstReferenceUrl,
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "video-sequence" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = String(task?.summary || formatTaskStageSummary(task));
          patchTaskRun(taskId, {
            status: task.status,
            progress: Number(task.progress) || 0,
            stageText: String(task.stageText || ""),
            summary: stageSummary,
          });
          updateStatus("loading", "串联视频生成中", stageSummary);
        }
      });

      if (finalTask.status === "cancelled") {
        finishTaskRun(taskId, {
          status: "cancelled",
          progress: Number(finalTask.progress) || 0,
          stageText: String(finalTask.stageText || "已取消"),
          summary: "请求已取消。",
        });
        updateStatus("idle", "已取消", "串联视频任务已取消。");
        return false;
      }

      if (finalTask.status !== "success") {
        throw new Error(finalTask.error || "串联视频生成失败，请稍后重试。");
      }

      const videoUrl = String(finalTask?.result?.videoUrl || "").trim();
      if (!videoUrl) {
        throw new Error("模型未返回视频地址，请切换模型或调整模板后重试。");
      }

      const now = Date.now();
      const historyId = baseRecordId || `seq-${now}-${Math.random().toString(16).slice(2, 8)}`;
      const record = {
        id: historyId,
        createdAt: now,
        title,
        shotIndexes: normalizedIndexes,
        shots: sequenceIdeas.map((shot) => ({
          ideaIndex: shot.ideaIndex,
          title: shot.title,
          scene: shot.scene,
          hasImageRef: Boolean(String(shot.referenceImageDataUrl || "").trim() || String(shot.referenceImageUrl || "").trim()),
        })),
        referenceImageCount: usedReferenceImageCount,
        config: {
          ...usedConfig,
          durationSeconds,
          transitionStyle,
          referenceImagePolicy,
        },
        generatedVideo: {
          status: "success",
          url: videoUrl,
          error: "",
          model: String(finalTask?.result?.model || videoModelValue),
          mimeType: String(finalTask?.result?.mimeType || "video/mp4"),
          prompt: String(finalTask?.result?.prompt || ""),
          durationSeconds: Number(finalTask?.result?.durationSeconds) || durationSeconds,
        },
      };

      let savedRecord = record;
      if (currentProjectId && currentChapterId) {
        try {
          const saveData = await saveChapterSequenceVideo(currentProjectId, currentChapterId, record);
          if (saveData?.item?.id) {
            savedRecord = saveData.item;
          }
        } catch {
          // Keep local successful record for immediate UX even if persistence fails transiently.
        }
      }

      setVideoComposerResult(savedRecord);
      setSequenceVideoHistory((prev) => [savedRecord, ...prev.filter((item) => item.id !== savedRecord.id)].slice(0, 80));

      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `串联视频已完成（${sequenceIdeas.length} 镜，图参 ${usedReferenceImageCount} 张）。`,
        sequenceMetaText,
        resultPayload: {
          kind: "video-sequence",
          sequenceHistoryId: savedRecord.id,
          title: savedRecord.title,
          shotIndexes: savedRecord.shotIndexes,
          videoUrl: savedRecord.generatedVideo.url,
          mimeType: savedRecord.generatedVideo.mimeType,
          model: savedRecord.generatedVideo.model,
          durationSeconds: savedRecord.generatedVideo.durationSeconds,
          prompt: savedRecord.generatedVideo.prompt,
          referenceImageCount: usedReferenceImageCount,
          referenceImagePolicy,
        },
      });
      updateStatus("success", "串联视频完成", `已生成连续视频：${savedRecord.title}（图参 ${usedReferenceImageCount} 张）`);
      return true;
    } catch (error) {
      const message = error?.message || "串联视频生成失败，请稍后重试。";
      finishTaskRun(taskId, {
        status: "error",
        stageText: "失败",
        summary: message,
      });
      updateStatus("error", "串联视频失败", message);
      return false;
    } finally {
      if (pendingRef.current?.taskId === backendTaskId) {
        pendingRef.current = null;
      }
      setSequenceVideoRunning(false);
    }
  };

  const generateSequenceVideo = async () => {
    await runSequenceVideoTask({
      shotIndexes: videoComposerShotIndexes,
    });
  };

  const downloadSequenceRecord = async (record) => {
    const videoUrl = String(record?.generatedVideo?.url || "").trim();
    if (!isRenderableVideoUrl(videoUrl)) {
      updateStatus("error", "无可下载视频", "该历史记录没有可用视频地址。");
      return;
    }
    const stamp = formatFileStamp(new Date());
    const safeTitle = String(record?.title || "sequence-video")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 50);
    const extension = inferVideoExtension(record?.generatedVideo?.mimeType, videoUrl);
    const filename = `${safeTitle || "sequence-video"}-${stamp}.${extension}`;
    try {
      await triggerDownloadFromUrl(filename, videoUrl);
      updateStatus("success", "视频已导出", "串联视频已下载。");
    } catch {
      updateStatus("error", "下载失败", "视频下载失败，请稍后重试。");
    }
  };

  const useSequenceHistory = (id) => {
    const safeId = String(id || "").trim();
    if (!safeId) return;
    const item = sequenceVideoHistory.find((entry) => entry.id === safeId);
    if (!item) return;
    setVideoComposerShotIndexes(
      Array.isArray(item.shotIndexes)
        ? item.shotIndexes.filter((index) => Number.isInteger(index) && index >= 0 && index < ideas.length)
        : []
    );
    setVideoComposerSettings((prev) => ({
      ...prev,
      ...(item.config && typeof item.config === "object" ? item.config : {}),
      referenceImagePolicy: normalizeReferenceImagePolicyValue(item?.config?.referenceImagePolicy || prev.referenceImagePolicy),
    }));
    setVideoComposerResult(item);
    setVideoComposerOpen(true);
    updateStatus("success", "已载入历史配置", `已载入：${item.title || "未命名串联视频"}`);
  };

  const retrySequenceHistory = async (id) => {
    const safeId = String(id || "").trim();
    if (!safeId) return;
    const item = sequenceVideoHistory.find((entry) => entry.id === safeId);
    if (!item) {
      updateStatus("error", "历史不存在", "未找到对应串联视频历史。");
      return;
    }
    await runSequenceVideoTask({
      shotIndexes: Array.isArray(item.shotIndexes) ? item.shotIndexes : [],
      configOverride: item.config,
      baseRecordId: item.id,
    });
  };

  const deleteSequenceHistory = async (id) => {
    const safeId = String(id || "").trim();
    if (!safeId) return;
    if (currentProjectId && currentChapterId) {
      try {
        await deleteChapterSequenceVideo(currentProjectId, currentChapterId, safeId);
      } catch {
        updateStatus("error", "删除失败", "服务端删除串联历史失败，请重试。");
        return;
      }
    }

    setSequenceVideoHistory((prev) => prev.filter((item) => item.id !== safeId));
    setVideoComposerResult((prev) => (prev?.id === safeId ? null : prev));
    updateStatus("success", "历史已删除", "该串联视频历史已移除。");
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
        model: textModelValue,
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "remix" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = String(task?.summary || formatTaskStageSummary(task));
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

      let nextIdeas = [];
      setIdeas((prev) => {
        nextIdeas = prev.map((item, idx) => (idx === index ? replacement : item));
        return nextIdeas;
      });
      persistChapterIdeas(nextIdeas).catch(() => {
        // non-blocking: keep UI responsive when persistence fails transiently
      });

      let currentHistoryId = activeHistoryId;
      if (nextIdeas.length > 0) {
        if (currentHistoryId) {
          syncActiveHistoryIdeas(nextIdeas);
        } else {
          currentHistoryId = pushHistoryRecord(nextIdeas);
        }
      }
      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `第 ${index + 1} 条已更新。`,
        resultPayload: {
          kind: "ideas",
          historyId: currentHistoryId || null,
          modeId: settings.modeId,
          styleBias: settings.styleBias,
          seedText: settings.seedText,
        },
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
    persistChapterIdeas([]).catch(() => {
      // non-blocking: keep UI responsive when persistence fails transiently
    });
    setSelectedIdeaIndexes([]);
    setLastSelectedIndex(null);
    setVideoComposerShotIndexes([]);
    setVideoComposerResult(null);
    setActiveHistoryId(null);
    activeHistoryIdRef.current = null;
    updateStatus("idle", "已清空", "结果区已清空。");
  };

  const clearHistory = async () => {
    setHistory([]);
    setActiveHistoryId(null);
    activeHistoryIdRef.current = null;
    try {
      await clearHistoryEntries();
    } catch {
      updateStatus("error", "清空历史失败", "数据库写入失败，请稍后重试。");
    }
  };

  const restoreHistory = (target, options = {}) => {
    const item =
      target && typeof target === "object"
        ? target
        : history.find((entry) => entry.id === String(target || ""));
    if (!item) {
      return;
    }

    const focusIdeaIndex = Number(options?.focusIdeaIndex);
    const hasFocusIdea =
      Number.isInteger(focusIdeaIndex) &&
      focusIdeaIndex >= 0 &&
      focusIdeaIndex < (Array.isArray(item.ideas) ? item.ideas.length : 0);

    setIdeas(item.ideas || []);
    persistChapterIdeas(item.ideas || []).catch(() => {
      // non-blocking: keep UI responsive when persistence fails transiently
    });
    setFilterMode("all");
    setVideoComposerShotIndexes([]);
    setVideoComposerResult(null);
    setSelectedIdeaIndexes(hasFocusIdea ? [focusIdeaIndex] : []);
    setLastSelectedIndex(hasFocusIdea ? focusIdeaIndex : null);
    setActiveHistoryId(item.id);
    activeHistoryIdRef.current = item.id;
    updateSettings({
      seedText: item.seedText || "",
      modeId: item.modeId || settings.modeId,
      styleBias: item.styleBias || settings.styleBias,
    });

    scrollToResults();
    if (hasFocusIdea) {
      scrollToIdeaCard(focusIdeaIndex);
    }

    const badge = String(options?.badge || "历史已恢复");
    const text = String(options?.text || `已恢复 ${formatTime(item.createdAt)} 的结果。`);
    updateStatus("success", badge, text);
  };

  const removeHistory = async (id) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (activeHistoryId === id) {
      setActiveHistoryId(null);
      activeHistoryIdRef.current = null;
    }

    try {
      await removeHistoryEntry(id);
    } catch {
      updateStatus("error", "删除历史失败", "数据库写入失败，请稍后重试。");
    }
  };

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
    setVideoComposerShotIndexes([]);
    setVideoComposerResult(null);
    setActiveHistoryId(null);
    activeHistoryIdRef.current = null;
    setFilterMode("all");
    persistChapterIdeas(expansions).catch(() => {
      // non-blocking: keep UI responsive when persistence fails transiently
    });
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
        model: textModelValue,
      });

      backendTaskId = createResult?.task?.id || "";
      if (!backendTaskId) {
        throw new Error("任务创建失败，请重试。");
      }

      pendingRef.current = { taskId: backendTaskId, kind: "batch" };

      const finalTask = await waitForTaskCompletion(backendTaskId, (task) => {
        if (task.status === "running" || task.status === "pending") {
          const stageSummary = String(task?.summary || formatTaskStageSummary(task));
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
        successHistory.forEach((item) => {
          saveHistoryEntry(item).catch(() => {
            // ignore transient persistence errors; local state remains usable
          });
        });
      }

      finishTaskRun(taskId, {
        status: "success",
        progress: 100,
        stageText: String(finalTask.stageText || "完成"),
        summary: `批量完成，共 ${seeds.length} 条，成功 ${successCount} 条。`,
        resultPayload: {
          kind: "batch",
          results,
          seedsCount: seeds.length,
        },
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

      <StudioHeader
        activeProject={activeProject}
        activeChapter={activeChapter}
        currentProjectId={currentProjectId}
        currentChapterId={currentChapterId}
        selectedIdeaIndexes={selectedIdeaIndexes}
        workspaceLoading={workspaceLoading}
        workspaceBusy={workspaceBusy}
        anyVideoLoading={anyVideoLoading}
        onOpenWorkspaceManager={() => {
          setWorkspaceModalTab("project");
          setWorkspaceModalOpen(true);
        }}
        onOpenWorkflowHub={() => setWorkflowHubOpen(true)}
        onOpenVideoComposer={openVideoComposer}
      />

      <VideoComposerModal
        open={videoComposerOpen}
        running={sequenceVideoRunning}
        selectedShots={composerSelectedShots}
        config={videoComposerSettings}
        currentResult={videoComposerResult}
        history={sequenceVideoHistory}
        referenceStats={composerReferenceStats}
        onClose={() => setVideoComposerOpen(false)}
        onConfigChange={updateVideoComposerConfig}
        onResetFromSelection={syncComposerShotsFromSelection}
        onRestoreOriginalOrder={restoreComposerOriginalOrder}
        onClearSelection={clearComposerSelection}
        onRemoveShot={removeComposerShot}
        onMoveShot={moveComposerShot}
        onGenerate={generateSequenceVideo}
        onDownloadCurrent={() => downloadSequenceRecord(videoComposerResult)}
        onUseHistory={useSequenceHistory}
        onRetryHistory={retrySequenceHistory}
        onDownloadHistory={(id) => {
          const item = sequenceVideoHistory.find((entry) => entry.id === String(id || "").trim());
          if (item) {
            downloadSequenceRecord(item);
          }
        }}
        onDeleteHistory={deleteSequenceHistory}
      />

      <WorkflowHubModal
        open={workflowHubOpen}
        activeTab={workflowHubTab}
        onChangeTab={setWorkflowHubTab}
        onClose={() => setWorkflowHubOpen(false)}
        batchProps={{
          batchText,
          setBatchText,
          batchCount,
          onRun: handleBatchRun,
          running: batchRunning,
          batchResults,
          onUseResult: useBatchResult,
          onCopySeed: copyBatchSeed,
          onCopyResult: copyBatchResult,
          onExportResult: exportBatchResult,
        }}
        queueProps={{
          runs: taskRuns,
          onClear: clearTaskRuns,
          onRemove: removeTaskRun,
          onOpen: openTaskResult,
          onRetry: retryTaskRunFromQueue,
          filterMode: queueFilterMode,
          onFilterChange: setQueueFilterMode,
        }}
        historyProps={{
          history,
          onRestore: restoreHistory,
          onRemove: removeHistory,
          onClear: clearHistory,
        }}
        advancedConfig={{
          sequencePromptTemplate: videoComposerSettings.promptTemplate,
          sequenceContinuityNote: videoComposerSettings.continuityNote,
        }}
        onAdvancedConfigChange={(patch) =>
          updateVideoComposerConfig({
            ...(patch?.sequencePromptTemplate !== undefined ? { promptTemplate: patch.sequencePromptTemplate } : {}),
            ...(patch?.sequenceContinuityNote !== undefined ? { continuityNote: patch.sequenceContinuityNote } : {}),
          })
        }
        promptTemplate={settings.promptTemplate}
        onPromptTemplateChange={(nextTemplate) => updateSettings({ promptTemplate: nextTemplate })}
        canvasActions={{
          canOperateResults: ideas.length > 0,
          onCopyAll: copyAll,
          onExportMarkdown: exportMarkdown,
          onExportJson: exportJson,
          onClearResults: clearResults,
        }}
        onOpenWorkspaceManager={() => {
          setWorkflowHubOpen(false);
          setWorkspaceModalTab("project");
          setWorkspaceModalOpen(true);
        }}
      />

      {workspaceModalOpen ? (
        <div className="workspace-modal fixed inset-0 z-[70] flex items-center justify-center px-4 py-6 md:px-8">
          <button
            type="button"
            className="workspace-modal-backdrop absolute inset-0"
            onClick={closeWorkspaceModal}
            aria-label="关闭工作区管理弹窗"
          />

          <section
            role="dialog"
            aria-modal="true"
            aria-label="工作区管理"
            className="workspace-modal-panel motion-rise relative z-10 w-full max-w-5xl"
          >
            <header className="workspace-modal-header">
              <div>
                <p className="eyebrow-label">Workspace / Settings</p>
                <h2 className="mt-2 font-display text-4xl leading-[0.9] md:text-5xl">工作区管理</h2>
              </div>
              <button
                type="button"
                onClick={closeWorkspaceModal}
                className="workspace-modal-close"
                aria-label="关闭"
              >
                关闭
              </button>
            </header>

            <div className="workspace-tab-row">
              <button
                type="button"
                className={`workspace-tab-button ${workspaceModalTab === "project" ? "workspace-tab-button-active" : ""}`}
                onClick={() => setWorkspaceModalTab("project")}
              >
                项目管理
              </button>
              <button
                type="button"
                className={`workspace-tab-button ${workspaceModalTab === "chapter" ? "workspace-tab-button-active" : ""}`}
                onClick={() => setWorkspaceModalTab("chapter")}
              >
                章节管理
              </button>
            </div>

            <div className="workspace-modal-body">
              {workspaceModalTab === "project" ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="workspace-modal-block">
                    <p className="eyebrow-label">All Projects</p>
                    <h3 className="mt-2 font-display text-2xl leading-none">全部项目</h3>
                    <p className="mt-2 text-xs text-atelier-subtle">点击列表可直接切换当前项目。</p>

                    <div className="workspace-entity-list mt-3">
                      {projectItems.length === 0 ? (
                        <p className="workspace-entity-empty">暂无项目</p>
                      ) : (
                        projectItems.map((item) => {
                          const active = item.id === currentProjectId;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSwitchProject(item.id)}
                              className={`workspace-entity-item ${active ? "workspace-entity-item-active" : ""}`}
                              disabled={workspaceLoading || workspaceBusy}
                            >
                              <span className="workspace-entity-title">{item.name || "未命名项目"}</span>
                              <span className="workspace-entity-meta">
                                {item.chapterCount || 0} 章 · {item.shotCount || 0} 条分镜
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 border-t border-atelier-fg/10 pt-3">
                      <p className="eyebrow-label">Create Project</p>
                      <label className="workspace-inline-field">
                        <span className="workspace-inline-label">项目名</span>
                        <input
                          type="text"
                          value={newProjectName}
                          onChange={(event) => setNewProjectName(event.target.value)}
                          maxLength={60}
                          className="workspace-text-input"
                          placeholder="例如：香氛广告 · 春季 Campaign"
                        />
                      </label>

                      <label className="workspace-inline-field">
                        <span className="workspace-inline-label">项目简介（可选）</span>
                        <input
                          type="text"
                          value={newProjectDescription}
                          onChange={(event) => setNewProjectDescription(event.target.value)}
                          maxLength={120}
                          className="workspace-text-input"
                          placeholder="一句话描述这个项目的目标和调性"
                        />
                      </label>

                      <div className="workspace-action-row">
                        <button
                          type="button"
                          onClick={handleCreateProject}
                          className="workspace-action-button"
                          disabled={workspaceLoading || workspaceBusy}
                        >
                          新建项目
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="workspace-modal-block">
                    <p className="eyebrow-label">Current Project</p>
                    <h3 className="mt-2 font-display text-2xl leading-none">{activeProject?.name || "未选择项目"}</h3>
                    <p className="mt-2 text-xs text-atelier-subtle">
                      {activeProject
                        ? `${activeProject.chapterCount || 0} 章 · ${activeProject.shotCount || 0} 条分镜`
                        : "请先选择项目"}
                    </p>

                    <label className="workspace-inline-field">
                      <span className="workspace-inline-label">重命名当前项目</span>
                      <input
                        type="text"
                        value={renameProjectName}
                        onChange={(event) => setRenameProjectName(event.target.value)}
                        maxLength={60}
                        className="workspace-text-input"
                        placeholder="当前项目名称"
                        disabled={!currentProjectId}
                      />
                    </label>

                    <label className="workspace-inline-field">
                      <span className="workspace-inline-label">更新当前简介</span>
                      <input
                        type="text"
                        value={renameProjectDescription}
                        onChange={(event) => setRenameProjectDescription(event.target.value)}
                        maxLength={120}
                        className="workspace-text-input"
                        placeholder="当前项目简介"
                        disabled={!currentProjectId}
                      />
                    </label>

                    <div className="workspace-action-row">
                      <button
                        type="button"
                        onClick={handleRenameProject}
                        className="workspace-action-button"
                        disabled={workspaceLoading || workspaceBusy || !currentProjectId}
                      >
                        保存项目
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteProject}
                        className="workspace-action-button workspace-action-button-danger"
                        disabled={workspaceLoading || workspaceBusy || !currentProjectId}
                      >
                        {pendingProjectDelete ? "确认删除项目" : "删除项目"}
                      </button>
                      {pendingProjectDelete ? (
                        <button
                          type="button"
                          onClick={() => setPendingProjectDelete(false)}
                          className="workspace-action-button"
                          disabled={workspaceLoading || workspaceBusy}
                        >
                          取消删除
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="workspace-modal-block">
                    <p className="eyebrow-label">All Chapters</p>
                    <h3 className="mt-2 font-display text-2xl leading-none">全部章节</h3>
                    <p className="mt-2 text-xs text-atelier-subtle">
                      {activeProject?.name
                        ? `项目：${activeProject.name}（点击列表可切换章节）`
                        : "请先选择项目"}
                    </p>

                    <div className="workspace-entity-list mt-3">
                      {chapterItems.length === 0 ? (
                        <p className="workspace-entity-empty">暂无章节</p>
                      ) : (
                        chapterItems.map((item) => {
                          const active = item.id === currentChapterId;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSwitchChapter(item.id)}
                              className={`workspace-entity-item ${active ? "workspace-entity-item-active" : ""}`}
                              disabled={workspaceLoading || workspaceBusy || !currentProjectId}
                            >
                              <span className="workspace-entity-title">{item.title || "未命名章节"}</span>
                              <span className="workspace-entity-meta">
                                序号 {item.sortOrder || 0} · {item.shotCount || 0} 条分镜
                              </span>
                            </button>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 border-t border-atelier-fg/10 pt-3">
                      <p className="eyebrow-label">Create Chapter</p>
                      <label className="workspace-inline-field">
                        <span className="workspace-inline-label">章节名</span>
                        <input
                          type="text"
                          value={newChapterTitle}
                          onChange={(event) => setNewChapterTitle(event.target.value)}
                          maxLength={60}
                          className="workspace-text-input"
                          placeholder="例如：第 3 章 · 危机夜行"
                          disabled={!currentProjectId}
                        />
                      </label>

                      <div className="workspace-action-row">
                        <button
                          type="button"
                          onClick={handleCreateChapter}
                          className="workspace-action-button"
                          disabled={workspaceLoading || workspaceBusy || !currentProjectId}
                        >
                          新建章节
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="workspace-modal-block">
                    <p className="eyebrow-label">Current Chapter</p>
                    <h3 className="mt-2 font-display text-2xl leading-none">{activeChapter?.title || "未选择章节"}</h3>
                    <p className="mt-2 text-xs text-atelier-subtle">
                      {activeChapter
                        ? `序号 ${activeChapter.sortOrder || 0} · ${activeChapter.shotCount || 0} 条分镜`
                        : "请先选择章节"}
                    </p>

                    <label className="workspace-inline-field">
                      <span className="workspace-inline-label">重命名当前章节</span>
                      <input
                        type="text"
                        value={renameChapterTitle}
                        onChange={(event) => setRenameChapterTitle(event.target.value)}
                        maxLength={60}
                        className="workspace-text-input"
                        placeholder="当前章节标题"
                        disabled={!currentProjectId || !currentChapterId}
                      />
                    </label>

                    <div className="workspace-action-row">
                      <button
                        type="button"
                        onClick={handleRenameChapter}
                        className="workspace-action-button"
                        disabled={workspaceLoading || workspaceBusy || !currentProjectId || !currentChapterId}
                      >
                        保存章节
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteChapter}
                        className="workspace-action-button workspace-action-button-danger"
                        disabled={workspaceLoading || workspaceBusy || !currentProjectId || !currentChapterId}
                      >
                        {pendingChapterDelete ? "确认删除章节" : "删除章节"}
                      </button>
                      {pendingChapterDelete ? (
                        <button
                          type="button"
                          onClick={() => setPendingChapterDelete(false)}
                          className="workspace-action-button"
                          disabled={workspaceLoading || workspaceBusy}
                        >
                          取消删除
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}

      <main className="mx-auto grid w-[min(1600px,calc(100vw-2rem))] items-start gap-8 py-10 md:w-[min(1600px,calc(100vw-4rem))] lg:grid-cols-[5fr_7fr] lg:gap-10">
        <InputPanel
          formRef={formRef}
          settings={settings}
          imageState={imageState}
          placeholderImage={PLACEHOLDER_IMAGE}
          modeOptions={modeOptions}
          styleOptions={styleOptions}
          countOptions={countOptions}
          storyboardModes={STORYBOARD_MODES}
          textModelValue={textModelValue}
          imageModelValue={imageModelValue}
          videoModelValue={videoModelValue}
          loading={loading}
          batchRunning={batchRunning}
          onSubmit={handleGenerate}
          onImageChange={handleImageChange}
          onUpdateSettings={updateSettings}
          onCancel={handleCancel}
        />

        <ResultCanvas
          resultsAnchorRef={resultsAnchorRef}
          status={status}
          activeMode={activeMode}
          activeStyleLabel={activeStyleLabel}
          settings={settings}
          textModelValue={textModelValue}
          imageModelValue={imageModelValue}
          videoModelValue={videoModelValue}
          filterModes={FILTER_MODES}
          filterMode={filterMode}
          onChangeFilterMode={setFilterMode}
          ideaMediaFilters={IDEA_MEDIA_FILTERS}
          ideaMediaFilter={ideaMediaFilter}
          onChangeIdeaMediaFilter={setIdeaMediaFilter}
          normalizeIdeaMediaFilter={normalizeIdeaMediaFilter}
          ideaSearchText={ideaSearchText}
          onChangeIdeaSearchText={setIdeaSearchText}
          visibleEntries={visibleEntries}
          selectedVisibleCount={selectedVisibleCount}
          loading={loading}
          ideas={ideas}
          selectedIdeaIndexes={selectedIdeaIndexes}
          onCopyAll={copyAll}
          onExportMarkdown={exportMarkdown}
          onExportJson={exportJson}
          onSelectAllVisible={selectAllVisible}
          onClearSelection={clearSelection}
          onBatchGenerateSelectedImages={batchGenerateSelectedImages}
          batchImageRunning={batchImageRunning}
          anyImageLoading={anyImageLoading}
          onOpenWorkflowHub={() => setWorkflowHubOpen(true)}
          onCopySingle={copySingle}
          onRemixOne={remixOne}
          onGenerateIdeaImage={generateIdeaImage}
          onDownloadIdeaImage={downloadIdeaImage}
          onGenerateIdeaVideo={generateIdeaVideo}
          onDownloadIdeaVideo={downloadIdeaVideo}
          onToggleFavorite={toggleFavorite}
          onToggleSelectIdea={toggleSelectIdea}
        />
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

function triggerDownloadFromDataUrl(filename, dataUrl) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function triggerDownloadFromUrl(filename, rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) {
    throw new Error("无效下载地址");
  }

  if (url.startsWith("data:")) {
    triggerDownloadFromDataUrl(filename, url);
    return;
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return;
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

function inferVideoExtension(mimeType, rawUrl) {
  const safeMimeType = String(mimeType || "")
    .trim()
    .toLowerCase();
  if (safeMimeType.includes("webm")) return "webm";
  if (safeMimeType.includes("quicktime")) return "mov";
  if (safeMimeType.includes("mp4")) return "mp4";

  const value = String(rawUrl || "").trim();
  if (value.startsWith("data:video/webm")) return "webm";
  if (value.startsWith("data:video/quicktime")) return "mov";

  try {
    const pathname = new URL(value).pathname.toLowerCase();
    if (pathname.endsWith(".webm")) return "webm";
    if (pathname.endsWith(".mov")) return "mov";
    if (pathname.endsWith(".mp4")) return "mp4";
  } catch {
    // noop
  }
  return "mp4";
}

function isRenderableVideoUrl(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  if (value.startsWith("data:video/")) {
    return value.includes(",") && value.length > 64;
  }
  return value.startsWith("http://") || value.startsWith("https://");
}

function buildStudioPath(projectId, chapterId) {
  return `/projects/${encodeURIComponent(String(projectId || ""))}/chapters/${encodeURIComponent(
    String(chapterId || "")
  )}/studio`;
}

