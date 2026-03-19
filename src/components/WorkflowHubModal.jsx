import { BatchWorkflow } from "./BatchWorkflow";
import { HistoryPanel } from "./HistoryPanel";
import { TaskQueuePanel } from "./TaskQueuePanel";

const HUB_TABS = [
  { id: "batch", label: "批量工作流" },
  { id: "queue", label: "任务队列" },
  { id: "history", label: "历史记录" },
  { id: "advanced", label: "高级参数" },
];

export function WorkflowHubModal({
  open,
  activeTab = "batch",
  onChangeTab,
  onClose,
  batchProps,
  queueProps,
  historyProps,
  advancedConfig,
  onAdvancedConfigChange,
  promptTemplate,
  onPromptTemplateChange,
  onOpenWorkspaceManager,
}) {
  if (!open) {
    return null;
  }

  const safeTab = HUB_TABS.some((tab) => tab.id === activeTab) ? activeTab : "batch";
  const safeAdvanced = advancedConfig && typeof advancedConfig === "object" ? advancedConfig : {};

  return (
    <div className="workflow-hub-modal fixed inset-0 z-[74] flex items-center justify-center px-3 py-4 md:px-8 md:py-8">
      <button
        type="button"
        className="workflow-hub-backdrop absolute inset-0"
        onClick={onClose}
        aria-label="关闭工作流中心"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="工作流中心"
        className="workflow-hub-panel motion-rise relative z-10 flex h-[calc(100vh-2rem)] w-full max-w-[1280px] flex-col md:h-[calc(100vh-4.5rem)]"
      >
        <header className="workflow-hub-header">
          <div>
            <p className="eyebrow-label">Workflow Hub</p>
            <h2 className="mt-2 font-display text-4xl leading-[0.9] md:text-5xl">工作流中心</h2>
            <p className="mt-2 text-sm text-atelier-subtle">批量、任务、历史与高级参数统一在这里管理。</p>
          </div>
          <button type="button" onClick={onClose} className="workspace-modal-close">
            关闭
          </button>
        </header>

        <div className="workflow-hub-tabs">
          {HUB_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChangeTab?.(tab.id)}
              className={`workspace-tab-button ${safeTab === tab.id ? "workspace-tab-button-active" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="workflow-hub-body">
          {safeTab === "batch" ? (
            <BatchWorkflow
              batchText={batchProps?.batchText || ""}
              setBatchText={batchProps?.setBatchText}
              batchCount={Number(batchProps?.batchCount || 0)}
              onRun={batchProps?.onRun}
              running={Boolean(batchProps?.running)}
              batchResults={Array.isArray(batchProps?.batchResults) ? batchProps.batchResults : []}
              onUseResult={batchProps?.onUseResult}
              onCopySeed={batchProps?.onCopySeed}
              onCopyResult={batchProps?.onCopyResult}
              onExportResult={batchProps?.onExportResult}
            />
          ) : null}

          {safeTab === "queue" ? (
            <TaskQueuePanel
              runs={Array.isArray(queueProps?.runs) ? queueProps.runs : []}
              onClear={queueProps?.onClear}
              onRemove={queueProps?.onRemove}
              onOpen={queueProps?.onOpen}
              onRetry={queueProps?.onRetry}
              filterMode={queueProps?.filterMode}
              onFilterChange={queueProps?.onFilterChange}
            />
          ) : null}

          {safeTab === "history" ? (
            <HistoryPanel
              history={Array.isArray(historyProps?.history) ? historyProps.history : []}
              onRestore={historyProps?.onRestore}
              onRemove={historyProps?.onRemove}
              onClear={historyProps?.onClear}
            />
          ) : null}

          {safeTab === "advanced" ? (
            <section className="module-block mt-0">
              <p className="eyebrow-label">Advanced</p>
              <h3 className="module-title mt-2">高级参数与模板</h3>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="workspace-inline-field mt-0">
                  <span className="workspace-inline-label">Sequence Prompt 模板</span>
                  <textarea
                    value={String(safeAdvanced.sequencePromptTemplate || "")}
                    onChange={(event) =>
                      onAdvancedConfigChange?.({
                        sequencePromptTemplate: event.target.value,
                      })
                    }
                    className="min-h-32 border-b border-atelier-fg/20 bg-transparent py-2 text-sm leading-relaxed outline-none transition-colors duration-500 placeholder:font-display placeholder:italic placeholder:text-atelier-subtle focus:border-atelier-accent"
                    placeholder="串联视频模板，支持 shots/duration/aspectRatio 等占位符。"
                  />
                </label>

                <label className="workspace-inline-field mt-0">
                  <span className="workspace-inline-label">串联默认连贯性备注</span>
                  <textarea
                    value={String(safeAdvanced.sequenceContinuityNote || "")}
                    onChange={(event) =>
                      onAdvancedConfigChange?.({
                        sequenceContinuityNote: event.target.value,
                      })
                    }
                    className="min-h-32 border-b border-atelier-fg/20 bg-transparent py-2 text-sm leading-relaxed outline-none transition-colors duration-500 placeholder:font-display placeholder:italic placeholder:text-atelier-subtle focus:border-atelier-accent"
                    placeholder="例如：主角服装和受伤状态保持一致，时间线持续推进。"
                  />
                </label>
              </div>

              <label className="workspace-inline-field mt-4">
                <span className="workspace-inline-label">分镜拓展 Prompt 模板</span>
                <textarea
                  value={String(promptTemplate || "")}
                  onChange={(event) => onPromptTemplateChange?.(event.target.value)}
                  className="min-h-48 w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm leading-relaxed outline-none transition-colors duration-500 placeholder:font-display placeholder:italic placeholder:text-atelier-subtle focus:border-atelier-accent"
                  placeholder="编辑用于分镜拓展的主模板。"
                />
              </label>

              <div className="workspace-action-row">
                <button type="button" className="workspace-action-button" onClick={onOpenWorkspaceManager}>
                  项目 / 章节管理
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </div>
  );
}
