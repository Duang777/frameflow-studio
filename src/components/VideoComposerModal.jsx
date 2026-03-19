import { formatTime } from "../lib/formatters";
import { EditorialSelect } from "./EditorialSelect";

const ASPECT_RATIO_OPTIONS = [
  { value: "16:9", label: "16:9 横屏" },
  { value: "9:16", label: "9:16 竖屏" },
  { value: "1:1", label: "1:1 方屏" },
  { value: "4:3", label: "4:3 经典" },
  { value: "3:4", label: "3:4 竖构图" },
];

const TRANSITION_OPTIONS = [
  { value: "match-cut", label: "Match Cut 连续切" },
  { value: "camera-follow", label: "Camera Follow 跟镜" },
  { value: "whip-pan", label: "Whip Pan 甩镜" },
  { value: "dissolve", label: "Dissolve 溶解" },
  { value: "hard-cut", label: "Hard Cut 硬切" },
];

const REFERENCE_POLICY_OPTIONS = [
  { value: "all", label: "全部镜头图参" },
  { value: "keyframes", label: "关键帧图参" },
  { value: "first_last", label: "首尾图参" },
  { value: "text_only", label: "仅文本" },
];

export function VideoComposerModal({
  open,
  running,
  selectedShots,
  config,
  currentResult,
  history,
  referenceStats,
  onClose,
  onConfigChange,
  onResetFromSelection,
  onRestoreOriginalOrder,
  onClearSelection,
  onRemoveShot,
  onMoveShot,
  onGenerate,
  onDownloadCurrent,
  onUseHistory,
  onRetryHistory,
  onDownloadHistory,
  onDeleteHistory,
}) {
  if (!open) {
    return null;
  }

  const shotCount = Array.isArray(selectedShots) ? selectedShots.length : 0;
  const historyItems = Array.isArray(history) ? history : [];
  const safeStats = referenceStats && typeof referenceStats === "object" ? referenceStats : {};
  const usedImageCount = Number(safeStats.usedImageCount || 0);
  const availableImageCount = Number(safeStats.availableImageCount || 0);

  return (
    <div className="composer-modal fixed inset-0 z-[82] flex items-center justify-center px-0 py-0 md:px-8 md:py-8">
      <button
        type="button"
        className="composer-modal-backdrop absolute inset-0"
        onClick={onClose}
        aria-label="关闭串联视频弹窗"
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="分镜串联成片"
        className="composer-modal-panel motion-rise relative z-10 flex h-screen w-full flex-col md:h-[calc(100vh-4.5rem)] md:max-w-6xl"
      >
        <header className="composer-modal-header">
          <div>
            <p className="eyebrow-label">Video Composer</p>
            <h3 className="module-title mt-2">分镜串联成片</h3>
            <p className="mt-2 text-sm text-atelier-subtle">
              将多条分镜按顺序串联为一条连续视频。当前链路共 {shotCount} 条镜头。
            </p>
          </div>
          <button type="button" onClick={onClose} className="workspace-modal-close">
            关闭
          </button>
        </header>

        <div className="composer-modal-body grid gap-5 lg:grid-cols-[1.06fr_1fr]">
          <section className="workspace-modal-block">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-atelier-fg/10 pb-3">
              <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">镜头链路</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="workspace-action-button" onClick={onResetFromSelection}>
                  同步所选
                </button>
                <button type="button" className="workspace-action-button" onClick={onRestoreOriginalOrder}>
                  恢复原顺序
                </button>
                <button type="button" className="workspace-action-button" onClick={onClearSelection}>
                  清空链路
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                可用图参 {availableImageCount}
              </span>
              <span className="border border-atelier-fg/15 bg-white/40 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                实际参与 {usedImageCount}
              </span>
            </div>

            {shotCount === 0 ? (
              <p className="mt-3 text-sm text-atelier-subtle">
                请先在主画布勾选多条分镜，然后点击“串联成片”。
              </p>
            ) : (
              <>
                {shotCount < 2 ? (
                  <p className="mt-2 text-xs text-amber-800">至少保留 2 条分镜，才能生成串联视频。</p>
                ) : null}
                <ul className="mt-3 grid gap-2">
                  {selectedShots.map((item, idx) => {
                    const previewUrl = getShotReferencePreviewUrl(item);
                    const hasReference = Boolean(previewUrl);
                    return (
                      <li key={`${item.ideaIndex}-${idx}`} className="card-luxe p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            {previewUrl ? (
                              <img
                                src={previewUrl}
                                alt={`镜头 ${idx + 1} 参考图`}
                                className="h-14 w-14 shrink-0 border border-atelier-fg/15 object-cover grayscale transition-all duration-[1500ms] hover:grayscale-0"
                              />
                            ) : (
                              <div className="h-14 w-14 shrink-0 border border-atelier-fg/12 bg-atelier-muted/20" />
                            )}
                            <div className="min-w-0">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">
                                镜头 {idx + 1} · 分镜 #{Number(item.ideaIndex) + 1}
                              </p>
                              <p className="mt-1 truncate text-sm text-atelier-fg">{item.title || "未命名分镜"}</p>
                              <p className="mt-1 line-clamp-2 text-xs text-atelier-subtle">{item.scene || "无画面描述"}</p>
                              {hasReference ? (
                                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-atelier-accent">Ref Ready</p>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <button
                              type="button"
                              className="workspace-action-button min-h-7 px-2 py-0 text-[9px]"
                              onClick={() => onMoveShot(idx, -1)}
                              disabled={idx === 0}
                            >
                              上移
                            </button>
                            <button
                              type="button"
                              className="workspace-action-button min-h-7 px-2 py-0 text-[9px]"
                              onClick={() => onMoveShot(idx, 1)}
                              disabled={idx === shotCount - 1}
                            >
                              下移
                            </button>
                            <button
                              type="button"
                              className="workspace-action-button workspace-action-button-danger min-h-7 px-2 py-0 text-[9px]"
                              onClick={() => onRemoveShot(idx)}
                            >
                              移除
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </section>

          <section className="workspace-modal-block">
            <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">参数与模板</p>
            <div className="mt-3 grid gap-3">
              <label className="workspace-inline-field mt-0">
                <span className="workspace-inline-label">视频标题（用于历史）</span>
                <input
                  value={String(config?.title || "")}
                  onChange={(event) => onConfigChange?.({ title: event.target.value })}
                  className="workspace-text-input"
                  placeholder="例如：第一章 · 追逐段落"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="workspace-inline-field mt-0">
                  <span className="workspace-inline-label">画幅比例</span>
                  <EditorialSelect
                    value={String(config?.aspectRatio || "16:9")}
                    onChange={(nextValue) => onConfigChange?.({ aspectRatio: nextValue })}
                    options={ASPECT_RATIO_OPTIONS}
                  />
                </label>

                <label className="workspace-inline-field mt-0">
                  <span className="workspace-inline-label">过渡风格</span>
                  <EditorialSelect
                    value={String(config?.transitionStyle || "match-cut")}
                    onChange={(nextValue) => onConfigChange?.({ transitionStyle: nextValue })}
                    options={TRANSITION_OPTIONS}
                  />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="workspace-inline-field mt-0">
                  <span className="workspace-inline-label">目标时长（秒）</span>
                  <input
                    type="number"
                    min={2}
                    max={12}
                    step={1}
                    value={String(config?.durationSeconds ?? 6)}
                    onChange={(event) => onConfigChange?.({ durationSeconds: Number(event.target.value) })}
                    className="workspace-text-input"
                  />
                </label>

                <label className="workspace-inline-field mt-0">
                  <span className="workspace-inline-label">图像参与策略</span>
                  <EditorialSelect
                    value={String(config?.referenceImagePolicy || "all")}
                    onChange={(nextValue) => onConfigChange?.({ referenceImagePolicy: nextValue })}
                    options={REFERENCE_POLICY_OPTIONS}
                  />
                </label>
              </div>

              <label className="workspace-inline-field mt-0">
                <span className="workspace-inline-label">连续性说明</span>
                <textarea
                  value={String(config?.continuityNote || "")}
                  onChange={(event) => onConfigChange?.({ continuityNote: event.target.value })}
                  className="workspace-textarea-input min-h-20"
                  placeholder="例如：主角服装与受伤状态保持一致，场景时间应连续推进。"
                />
              </label>

              <label className="workspace-inline-field mt-0">
                <span className="workspace-inline-label">Negative Prompt</span>
                <textarea
                  value={String(config?.negativePrompt || "")}
                  onChange={(event) => onConfigChange?.({ negativePrompt: event.target.value })}
                  className="workspace-textarea-input min-h-16"
                  placeholder="例如：no subtitle, no watermark, no logo, no text overlay"
                />
              </label>

              <details className="workspace-disclosure border-t border-atelier-fg/10 pt-2">
                <summary className="workspace-disclosure-summary details-summary group list-none text-[10px] uppercase tracking-editorial text-atelier-subtle transition-colors duration-500 hover:text-atelier-accent">
                  <span>串联提示词模板（可选）</span>
                  <span className="details-chevron transition-transform duration-500 group-hover:text-atelier-accent">
                    <SummaryChevron />
                  </span>
                </summary>
                <textarea
                  value={String(config?.promptTemplate || "")}
                  onChange={(event) => onConfigChange?.({ promptTemplate: event.target.value })}
                  className="workspace-textarea-input mt-3 min-h-32"
                  placeholder="支持 {{shots}} {{durationSeconds}} {{aspectRatio}} {{transitionStyle}} {{continuityNote}} {{referencePolicy}}"
                />
              </details>
            </div>

            <div className="workspace-action-row">
              <button
                type="button"
                onClick={onGenerate}
                disabled={running || shotCount < 2}
                className="workspace-open-button"
              >
                {running ? "生成中" : "生成串联视频"}
              </button>
              <button type="button" onClick={onClose} className="workspace-action-button">
                稍后再说
              </button>
            </div>
          </section>
        </div>

        <div className="composer-modal-history border-t border-atelier-fg/10 px-5 py-4 md:px-8 md:py-5">
          {currentResult ? (
            <article className="workspace-modal-block">
              <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">当前结果</p>
              <div className="mt-2 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
                <video
                  src={currentResult?.generatedVideo?.url || ""}
                  controls
                  preload="metadata"
                  playsInline
                  className="aspect-video w-full border border-atelier-fg/15 object-cover shadow-[0_6px_20px_rgba(0,0,0,0.08)] grayscale transition-all duration-[1700ms] ease-out hover:grayscale-0"
                />
                <div className="space-y-2">
                  <p className="text-sm text-atelier-fg">{currentResult.title || "未命名串联视频"}</p>
                  <p className="text-xs text-atelier-subtle">
                    {currentResult.shotIndexes?.length || 0} 条分镜 · 图参 {Number(currentResult.referenceImageCount || 0)} 张 ·{" "}
                    {formatTime(currentResult.createdAt)}
                  </p>
                  <p className="text-xs text-atelier-subtle">{buildConfigSummary(currentResult)}</p>
                  <div className="flex flex-wrap gap-2 border-t border-atelier-fg/10 pt-2">
                    <button type="button" className="workspace-action-button" onClick={onDownloadCurrent}>
                      下载视频
                    </button>
                    <button type="button" className="workspace-action-button" onClick={() => onRetryHistory?.(currentResult.id)}>
                      重试同配置
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ) : null}

          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">视频历史</p>
            {historyItems.length === 0 ? (
              <p className="mt-2 text-sm text-atelier-subtle">还没有串联视频记录。</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {historyItems.slice(0, 12).map((item) => (
                  <li key={item.id} className="card-luxe p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-atelier-fg">{item.title || "未命名串联视频"}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-atelier-subtle">
                          {item.shotIndexes?.length || 0} 条分镜 · 图参 {Number(item.referenceImageCount || 0)} 张 · {formatTime(item.createdAt)}
                        </p>
                        <p className="mt-1 text-xs text-atelier-subtle">{buildConfigSummary(item)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="workspace-action-button" onClick={() => onUseHistory?.(item.id)}>
                          套用到编排器
                        </button>
                        <button type="button" className="workspace-action-button" onClick={() => onRetryHistory?.(item.id)}>
                          重试
                        </button>
                        <button type="button" className="workspace-action-button" onClick={() => onDownloadHistory?.(item.id)}>
                          下载
                        </button>
                        <button
                          type="button"
                          className="workspace-action-button workspace-action-button-danger"
                          onClick={() => onDeleteHistory?.(item.id)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function getShotReferencePreviewUrl(shot) {
  const inlineRef = String(shot?.referenceImageDataUrl || "").trim();
  if (inlineRef.startsWith("data:image/")) {
    return inlineRef;
  }
  const remoteRef = String(shot?.referenceImageUrl || "").trim();
  if (remoteRef.startsWith("http://") || remoteRef.startsWith("https://")) {
    return remoteRef;
  }
  const generated = String(shot?.generatedImage?.url || "").trim();
  if (generated.startsWith("data:image/") || generated.startsWith("http://") || generated.startsWith("https://")) {
    return generated;
  }
  return "";
}

function buildConfigSummary(record) {
  const config = record?.config && typeof record.config === "object" ? record.config : {};
  const policy = formatPolicyLabel(config.referenceImagePolicy);
  const duration = Number(config.durationSeconds) > 0 ? `${Number(config.durationSeconds)}s` : "-";
  const transition = formatTransitionLabel(config.transitionStyle);
  const aspectRatio = String(config.aspectRatio || "-").trim() || "-";
  return `策略 ${policy} · 时长 ${duration} · 过渡 ${transition} · 画幅 ${aspectRatio}`;
}

function formatPolicyLabel(value) {
  const safe = String(value || "")
    .trim()
    .toLowerCase();
  if (safe === "all") return "全部图参";
  if (safe === "keyframes") return "关键帧";
  if (safe === "first_last") return "首尾帧";
  return "仅文本";
}

function formatTransitionLabel(value) {
  const safe = String(value || "")
    .trim()
    .toLowerCase();
  const found = TRANSITION_OPTIONS.find((item) => item.value === safe);
  return found ? found.label.split(" ")[0] : safe || "自动";
}

function SummaryChevron() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
    </svg>
  );
}
