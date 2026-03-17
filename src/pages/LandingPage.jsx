import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden font-body text-atelier-fg">
      <div className="paper-grain paper-grain-soft pointer-events-none fixed inset-0 z-50" />
      <HeroGridLines />

      <main className="mx-auto w-[min(1600px,calc(100vw-2rem))] py-10 md:w-[min(1600px,calc(100vw-4rem))] md:py-16">
        <section className="motion-rise border border-atelier-fg/15 bg-white/55 p-6 shadow-[0_8px_26px_rgba(0,0,0,0.05)] md:p-10">
          <p className="flex items-center gap-3 text-[10px] uppercase tracking-editorial text-atelier-subtle">
            <span className="h-px w-10 bg-atelier-fg" />
            Storyboard Atelier / Main Entrance
          </p>

          <div className="mt-6 grid gap-8 lg:grid-cols-[7fr_5fr] lg:items-end">
            <div>
              <h1 className="font-display text-5xl leading-[0.9] md:text-8xl">
                Build <em className="text-atelier-accent">Cinematic</em>
                <br />
                Storyboards Faster
              </h1>
              <p className="dropcap mt-5 max-w-2xl text-base text-atelier-subtle md:text-lg">
                一个入口页不只是“多一层页面”，而是先给出定位、价值和工作流，再进入工作台执行。你可以从这里选择模式，再进入分镜生产流程。
              </p>

              <div className="mt-8 flex flex-wrap gap-4 motion-rise motion-rise-delay-1">
                <Link
                  to="/studio"
                  className="group relative inline-flex min-h-12 min-w-[220px] items-center justify-center overflow-hidden border border-atelier-fg bg-atelier-fg px-8 text-xs uppercase tracking-button text-atelier-inverse shadow-atelier-button transition-[box-shadow] duration-500 ease-luxury hover:shadow-atelier-button-hover"
                >
                  <span className="absolute inset-0 -translate-x-full bg-atelier-accent transition-transform duration-500 ease-luxury group-hover:translate-x-0" aria-hidden="true" />
                  <span className="relative z-10">进入分镜工作台</span>
                </Link>

                <a href="#workflow" className="inline-flex min-h-12 items-center border border-atelier-fg px-8 text-xs uppercase tracking-button transition-colors duration-500 hover:bg-atelier-fg hover:text-atelier-inverse">
                  查看流程
                </a>
              </div>
            </div>

            <aside className="card-luxe motion-rise motion-rise-delay-2 p-5">
              <p className="text-[10px] uppercase tracking-editorial text-atelier-subtle">What You Get</p>
              <ul className="mt-4 grid gap-3 text-sm leading-relaxed text-atelier-fg">
                <li className="border-t border-atelier-fg/10 pt-3">单镜头输入，一键拓展多条可拍分镜</li>
                <li className="border-t border-atelier-fg/10 pt-3">广告片 / 剧情片 / 短视频 / B-roll 模式库</li>
                <li className="border-t border-atelier-fg/10 pt-3">批量工作流、导出、历史恢复与再生成</li>
                <li className="border-t border-atelier-fg/10 pt-3">后端代理保护 API Key，支持多人使用</li>
              </ul>
            </aside>
          </div>
        </section>

        <section id="workflow" className="motion-rise motion-rise-delay-3 mt-6 border border-atelier-fg/15 bg-white/45 p-6 md:p-8">
          <p className="text-[10px] uppercase tracking-editorial text-atelier-subtle">Workflow</p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StepCard index="01" title="选择模式" text="先确定用途：广告片、剧情片、短视频或 B-roll。" delayClass="motion-rise-delay-1" />
            <StepCard index="02" title="输入种子" text="填一句文本或上传一张图，设定风格与参数。" delayClass="motion-rise-delay-2" />
            <StepCard index="03" title="迭代输出" text="筛选结果、再生成单条、批量生产并导出。" delayClass="motion-rise-delay-3" />
          </div>
        </section>
      </main>
    </div>
  );
}

function StepCard({ index, title, text, delayClass }) {
  return (
    <article className={`card-luxe motion-rise p-4 ${delayClass || ""}`}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-atelier-subtle">{index}</p>
      <h2 className="mt-2 font-display text-3xl font-normal leading-tight">{title}</h2>
      <p className="mt-2 text-sm text-atelier-subtle">{text}</p>
    </article>
  );
}

function HeroGridLines() {
  return (
    <div className="pointer-events-none fixed inset-0 z-10">
      <span className="gridline-edge absolute bottom-0 left-[8%] top-0 w-px bg-atelier-fg/20" />
      <span className="absolute bottom-0 left-1/3 top-0 w-px bg-atelier-fg/20" />
      <span className="absolute bottom-0 left-2/3 top-0 w-px bg-atelier-fg/20" />
      <span className="gridline-edge absolute bottom-0 right-[8%] top-0 w-px bg-atelier-fg/20" />
    </div>
  );
}
