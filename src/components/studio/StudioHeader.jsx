import { Link } from "react-router-dom";

export function StudioHeader({
  activeProject,
  activeChapter,
  currentProjectId,
  currentChapterId,
  selectedIdeaIndexes,
  workspaceLoading,
  workspaceBusy,
  anyVideoLoading,
  onOpenWorkspaceManager,
  onOpenWorkflowHub,
  onOpenVideoComposer,
}) {
  return (
    <header className="motion-rise mx-auto w-[min(1600px,calc(100vw-2rem))] border-b border-atelier-fg/20 pb-8 pt-16 md:w-[min(1600px,calc(100vw-4rem))] md:pt-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-3 text-xs uppercase tracking-editorial text-atelier-subtle">
          <span className="h-px w-12 bg-atelier-fg" />
          Storyboard Atelier / Studio
        </p>
        <Link
          to="/"
          className="underline-reveal text-[10px] uppercase tracking-[0.22em] text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent"
        >
          返回主页面
        </Link>
      </div>

      <section className="workspace-shell mt-5 border-t border-atelier-fg/10 pt-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">Workspace Snapshot</p>
            <div className="flex flex-wrap gap-2">
              <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                项目 · {activeProject?.name || "未选择"}
              </span>
              <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                章节 · {activeChapter?.title || "未选择"}
              </span>
              <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                分镜 · {activeChapter?.shotCount || 0} 条
              </span>
            </div>
            <p className="text-xs text-atelier-subtle">
              {activeProject
                ? `${activeProject.chapterCount || 0} 章 · ${activeProject.shotCount || 0} 条分镜 · 路径 /projects/${currentProjectId || "-"}/chapters/${currentChapterId || "-"}`
                : "请先在工作区中创建项目和章节。"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              type="button"
              onClick={onOpenWorkspaceManager}
              className="workspace-open-button"
              disabled={workspaceLoading || workspaceBusy}
            >
              工作区管理
            </button>
            <button
              type="button"
              onClick={onOpenWorkflowHub}
              className="workspace-open-button"
              disabled={workspaceLoading || workspaceBusy}
            >
              工作流中心
            </button>
            <button
              type="button"
              onClick={onOpenVideoComposer}
              className="workspace-open-button"
              disabled={workspaceLoading || workspaceBusy || selectedIdeaIndexes.length < 2 || anyVideoLoading}
            >
              串联成片
            </button>
          </div>
        </div>
      </section>

      <h1 className="mt-5 font-display text-5xl leading-[0.9] md:text-8xl">
        Curated <em className="text-atelier-accent">Storyboard</em>
        <br />
        Expansion Studio
      </h1>
      <p className="dropcap mt-4 max-w-3xl text-base text-atelier-subtle md:text-lg">
        这是一个可长期复用的分镜创意工作台。你给一个镜头种子，它输出一组可拍摄、可拼接、可继续写成脚本的分镜方向。
      </p>
    </header>
  );
}
