import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BatchWorkflow } from "../components/BatchWorkflow";
import { HistoryPanel } from "../components/HistoryPanel";
import { IdeaCard } from "../components/IdeaCard";
import { ModeLibrary } from "../components/ModeLibrary";
import { PrimaryButton } from "../components/PrimaryButton";
import { StatusBadge } from "../components/StatusBadge";
import { buildIdeaCopyText, downloadText, formatTime, toIdeaMarkdown } from "../lib/formatters";
import { DEFAULT_PROMPT_TEMPLATE, getModeById, STORYBOARD_MODES, STYLE_BIASES } from "../lib/modes";
import { useLocalStorageState } from "../lib/storage";

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

export default function StudioPage() {
  const [settings, setSettings] = useLocalStorageState("atelier_settings_react", defaultSettings);
  const [history, setHistory] = useLocalStorageState("atelier_history_react", []);
  const [favorites, setFavorites] = useLocalStorageState("atelier_favorites_react", {});

  const [ideas, setIdeas] = useState([]);
  const [imageState, setImageState] = useState({ dataUrl: "", name: "" });
  const [status, setStatus] = useState({ kind: "idle", badge: "待命中", text: "输入分镜后点击“拓展分镜”。" });
  const [loading, setLoading] = useState(false);

  const [batchText, setBatchText] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState([]);

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

  const updateSettings = (patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  };

  const updateStatus = (kind, badge, text) => setStatus({ kind, badge, text });

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

    setLoading(true);
    updateStatus("loading", "生成中", "正在调用后端代理生成分镜，请稍候...");

    const controller = new AbortController();
    pendingRef.current = controller;

    try {
      const payload = await callExpandApi(
        {
          seedText: settings.seedText.trim(),
          imageDataUrl: imageState.dataUrl,
          styleBias: settings.styleBias,
          modeId: settings.modeId,
          ideaCount: Number(settings.ideaCount),
          temperature: Number(settings.temperature),
          topP: Number(settings.topP),
          promptTemplate: settings.promptTemplate,
          model: settings.model,
        },
        controller.signal
      );

      const nextIdeas = payload.expansions || [];
      setIdeas(nextIdeas);
      pushHistoryRecord(nextIdeas);
      updateStatus("success", "生成完成", `已生成 ${nextIdeas.length} 条分镜（${activeMode.name} / ${activeStyleLabel}）。`);
    } catch (error) {
      updateStatus("error", "生成失败", error.message || "生成失败，请稍后重试。");
    } finally {
      pendingRef.current = null;
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (pendingRef.current) {
      pendingRef.current.abort();
      updateStatus("error", "已取消", "请求已取消。可以继续修改参数后重试。");
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

    setLoading(true);
    updateStatus("loading", "再生成中", `正在重写第 ${index + 1} 条分镜...`);

    const remixSeed = `${settings.seedText}\n\n请围绕下列分镜生成一个“同主题但不同表达”的替代版本：${JSON.stringify(source)}`;
    const controller = new AbortController();
    pendingRef.current = controller;

    try {
      const payload = await callExpandApi(
        {
          seedText: remixSeed,
          imageDataUrl: imageState.dataUrl,
          styleBias: settings.styleBias,
          modeId: settings.modeId,
          ideaCount: 1,
          temperature: Number(settings.temperature),
          topP: Number(settings.topP),
          promptTemplate: settings.promptTemplate,
          model: settings.model,
        },
        controller.signal
      );

      const replacement = payload.expansions?.[0];
      if (!replacement) {
        throw new Error("再生成未返回有效结果，请重试。");
      }

      setIdeas((prev) => prev.map((item, idx) => (idx === index ? replacement : item)));
      updateStatus("success", "再生成完成", `第 ${index + 1} 条分镜已更新。`);
    } catch (error) {
      updateStatus("error", "再生成失败", error.message || "请求失败。");
    } finally {
      pendingRef.current = null;
      setLoading(false);
    }
  };

  const toggleFavorite = (index) => {
    const idea = ideas[index];
    if (!idea) {
      return;
    }

    const key = `${idea.title}__${idea.scene}`.slice(0, 260);
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
    updateStatus("idle", "已清空", "结果区已清空。");
  };

  const clearHistory = () => setHistory([]);

  const restoreHistory = (id) => {
    const item = history.find((entry) => entry.id === id);
    if (!item) {
      return;
    }

    setIdeas(item.ideas || []);
    updateSettings({
      seedText: item.seedText || "",
      modeId: item.modeId || settings.modeId,
      styleBias: item.styleBias || settings.styleBias,
    });

    updateStatus("success", "历史已恢复", `已恢复 ${formatTime(item.createdAt)} 的结果。`);
  };

  const removeHistory = (id) => setHistory((prev) => prev.filter((item) => item.id !== id));

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

    setBatchRunning(true);
    updateStatus("loading", "批量处理中", `正在处理 ${seeds.length} 条任务，请稍候...`);

    try {
      const response = await fetch("/api/batch-expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seeds,
          modeId: settings.modeId,
          styleBias: settings.styleBias,
          ideaCount: Number(settings.ideaCount),
          temperature: Number(settings.temperature),
          topP: Number(settings.topP),
          promptTemplate: settings.promptTemplate,
          model: settings.model,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "批量生成失败。");
      }

      const results = data.results || [];
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

      updateStatus("success", "批量完成", `共 ${seeds.length} 条，成功 ${successCount} 条。`);
    } catch (error) {
      updateStatus("error", "批量失败", error.message || "批量处理失败。");
    } finally {
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
                  <select
                    value={settings.modeId}
                    onChange={(event) => updateSettings({ modeId: event.target.value })}
                    className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
                  >
                    {STORYBOARD_MODES.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        {mode.name}
                      </option>
                    ))}
                  </select>
                </FieldLabel>

                <FieldLabel label="风格">
                  <select
                    value={settings.styleBias}
                    onChange={(event) => updateSettings({ styleBias: event.target.value })}
                    className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
                  >
                    {STYLE_BIASES.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </FieldLabel>

                <FieldLabel label="生成条数">
                  <select
                    value={settings.ideaCount}
                    onChange={(event) => updateSettings({ ideaCount: Number(event.target.value) })}
                    className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
                  >
                    <option value={6}>6 条</option>
                    <option value={8}>8 条</option>
                    <option value={10}>10 条</option>
                  </select>
                </FieldLabel>

                <FieldLabel label="模型">
                  <input
                    value={settings.model}
                    onChange={(event) => updateSettings({ model: event.target.value })}
                    className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
                  />
                </FieldLabel>

                <FieldLabel label="Temperature">
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={settings.temperature}
                    onChange={(event) => updateSettings({ temperature: Number(event.target.value) })}
                    className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
                  />
                </FieldLabel>

                <FieldLabel label="Top P">
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.topP}
                    onChange={(event) => updateSettings({ topP: Number(event.target.value) })}
                    className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
                  />
                </FieldLabel>
              </div>

              <details className="mt-4 border-t border-atelier-fg/10 pt-3" open>
                <summary className="cursor-pointer text-[10px] uppercase tracking-editorial text-atelier-subtle">高级 Prompt 模板</summary>
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
                  disabled={!loading}
                  onClick={handleCancel}
                  className="min-h-12 border border-atelier-fg px-8 text-xs uppercase tracking-button transition-colors duration-500 hover:bg-atelier-fg hover:text-atelier-inverse disabled:opacity-50"
                >
                  取消请求
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

          <div className="toolbar-shelf mt-4 flex flex-wrap gap-4">
            <ToolbarButton onClick={copyAll} disabled={ideas.length === 0}>复制全部</ToolbarButton>
            <ToolbarButton onClick={exportMarkdown} disabled={ideas.length === 0}>导出 Markdown</ToolbarButton>
            <ToolbarButton onClick={exportJson} disabled={ideas.length === 0}>导出 JSON</ToolbarButton>
            <ToolbarButton onClick={clearResults} disabled={ideas.length === 0}>清空结果</ToolbarButton>
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
          ) : (
            <section className="mt-6 grid gap-5 md:grid-cols-2">
              {ideas.map((idea, index) => {
                const key = `${idea.title}__${idea.scene}`.slice(0, 260);
                return (
                  <IdeaCard
                    key={`${key}-${index}`}
                    idea={idea}
                    index={index}
                    onCopy={copySingle}
                    onRemix={remixOne}
                    onFavorite={toggleFavorite}
                    favorite={Boolean(favorites[key])}
                  />
                );
              })}
            </section>
          )}

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

async function callExpandApi(body, signal) {
  const response = await fetch("/api/expand", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }

  return data;
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
