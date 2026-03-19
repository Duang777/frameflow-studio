import { EditorialSelect } from "../EditorialSelect";
import { ModeLibrary } from "../ModeLibrary";
import { PrimaryButton } from "../PrimaryButton";
import { RangeNumberField } from "../RangeNumberField";

export function InputPanel({
  formRef,
  settings,
  imageState,
  placeholderImage,
  modeOptions,
  styleOptions,
  countOptions,
  storyboardModes,
  textModelValue,
  imageModelValue,
  videoModelValue,
  loading,
  batchRunning,
  onSubmit,
  onImageChange,
  onUpdateSettings,
  onCancel,
}) {
  return (
    <aside className="workbench-panel motion-rise motion-rise-delay-1 relative lg:sticky lg:top-6">
      <p className="vertical-tag right-[-22px] top-5 hidden lg:block">Control / Atelier</p>

      <form ref={formRef} className="grid gap-5 md:gap-6" onSubmit={onSubmit}>
        <section className="module-block">
          <p className="eyebrow-label">Input</p>
          <h2 className="module-title mt-2">创作输入</h2>

          <label className="mt-4 grid gap-2">
            <span className="text-[10px] uppercase tracking-editorial text-atelier-subtle">分镜文本输入</span>
            <textarea
              value={settings.seedText}
              onChange={(event) => onUpdateSettings({ seedText: event.target.value })}
              maxLength={1200}
              className="min-h-28 border-b border-atelier-fg/20 bg-transparent py-2 text-sm leading-relaxed outline-none transition-colors duration-500 placeholder:font-display placeholder:italic placeholder:text-atelier-subtle focus:border-atelier-accent"
              placeholder="例：雨夜街角，主角停在霓虹倒影上，身后模糊人影逼近。"
            />
            <small className="text-xs text-atelier-subtle">{settings.seedText.length} / 1200</small>
          </label>

          <label className="mt-5 grid gap-2">
            <span className="text-[10px] uppercase tracking-editorial text-atelier-subtle">分镜图片（可选）</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onImageChange} className="text-xs text-atelier-subtle" />
            <small className="text-xs text-atelier-subtle">支持 JPG / PNG / WEBP，最大 8MB</small>
          </label>

          <figure className="group mt-4 border-t border-atelier-fg/10 pt-4">
            <img
              src={imageState.dataUrl || placeholderImage}
              alt="分镜预览"
              className="aspect-[4/5] w-full border border-atelier-fg/15 object-cover shadow-atelier-image shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] grayscale transition-all duration-[1800ms] ease-out group-hover:scale-[1.03] group-hover:grayscale-0"
            />
            <figcaption className="mt-2 text-xs text-atelier-subtle">
              {imageState.name ? `已附图：${imageState.name}` : "未上传图片，当前仅根据文本生成。"}
            </figcaption>
          </figure>
        </section>

        <section className="module-block">
          <p className="eyebrow-label">Settings</p>
          <h3 className="module-title mt-2">生成参数</h3>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <FieldLabel label="模式">
              <EditorialSelect value={settings.modeId} onChange={(nextValue) => onUpdateSettings({ modeId: nextValue })} options={modeOptions} />
            </FieldLabel>

            <FieldLabel label="风格">
              <EditorialSelect value={settings.styleBias} onChange={(nextValue) => onUpdateSettings({ styleBias: nextValue })} options={styleOptions} />
            </FieldLabel>

            <FieldLabel label="生成条数">
              <EditorialSelect
                value={String(settings.ideaCount)}
                onChange={(nextValue) => onUpdateSettings({ ideaCount: Number(nextValue) })}
                options={countOptions}
              />
            </FieldLabel>

            <FieldLabel label="文本模型">
              <input
                value={textModelValue}
                onChange={(event) => onUpdateSettings({ textModel: event.target.value })}
                className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
              />
            </FieldLabel>

            <FieldLabel label="出图模型">
              <input
                value={imageModelValue}
                onChange={(event) => onUpdateSettings({ imageModel: event.target.value })}
                className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
              />
            </FieldLabel>

            <FieldLabel label="视频模型">
              <input
                value={videoModelValue}
                onChange={(event) => onUpdateSettings({ videoModel: event.target.value })}
                className="w-full border-b border-atelier-fg/20 bg-transparent py-2 text-sm outline-none transition-colors duration-500 focus:border-atelier-accent"
              />
            </FieldLabel>

            <FieldLabel label="Temperature">
              <RangeNumberField
                value={settings.temperature}
                min={0}
                max={2}
                step={0.1}
                onChange={(next) => onUpdateSettings({ temperature: Number(next) })}
                formatValue={(next) => `温度 ${Number(next).toFixed(1)}`}
              />
            </FieldLabel>

            <FieldLabel label="Top P">
              <RangeNumberField
                value={settings.topP}
                min={0}
                max={1}
                step={0.05}
                onChange={(next) => onUpdateSettings({ topP: Number(next) })}
                formatValue={(next) => `采样 ${Number(next).toFixed(2)}`}
              />
            </FieldLabel>
          </div>

          <p className="mt-4 border-t border-atelier-fg/10 pt-3 text-xs text-atelier-subtle">
            高级 Prompt 模板、批量工作流、任务队列与历史记录已整合到“工作流中心”。
          </p>
        </section>

        <ModeLibrary modes={storyboardModes} activeModeId={settings.modeId} onSelect={(modeId) => onUpdateSettings({ modeId })} />

        <section className="module-block">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? "生成中" : "拓展分镜"}
            </PrimaryButton>
            <button
              type="button"
              disabled={!loading && !batchRunning}
              onClick={onCancel}
              className="min-h-12 border border-atelier-fg px-8 text-xs uppercase tracking-button transition-colors duration-500 hover:bg-atelier-fg hover:text-atelier-inverse disabled:opacity-50"
            >
              取消任务
            </button>
          </div>
          <p className="mt-3 text-xs text-atelier-subtle">快捷键：Ctrl/Cmd + Enter 直接生成</p>
        </section>
      </form>
    </aside>
  );
}

function FieldLabel({ label, children }) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] uppercase tracking-editorial text-atelier-subtle">{label}</span>
      {children}
    </label>
  );
}
