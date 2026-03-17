export const STYLE_BIASES = [
  { id: "cinematic", label: "电影感叙事", hint: "强调景别变化、调度与光影层次" },
  { id: "suspense", label: "悬疑推进", hint: "强化线索埋设、信息差与不确定性" },
  { id: "poetic", label: "诗意氛围", hint: "突出意象、留白与情绪流" },
  { id: "comedic", label: "反差喜剧", hint: "通过节奏突变制造戏剧反差" },
  { id: "wild", label: "超现实脑洞", hint: "允许大胆跳跃但保持可读性" },
];

export const STORYBOARD_MODES = [
  {
    id: "ad-film",
    name: "广告片",
    subtitle: "品牌记忆点优先",
    promptAddon:
      "以品牌传播为目标，确保每条分镜在3-6秒内建立视觉记忆点，并给出可用于 CTA 的镜头动机。",
  },
  {
    id: "drama",
    name: "剧情片",
    subtitle: "人物关系与冲突优先",
    promptAddon:
      "以角色关系推进为核心，强化动作动机、情绪递进和叙事因果，避免空洞画面。",
  },
  {
    id: "short-video",
    name: "短视频",
    subtitle: "前3秒抓人优先",
    promptAddon:
      "面向短视频平台，强调首屏钩子、节奏密度和可复用模板感，每条分镜都要有明确停留理由。",
  },
  {
    id: "b-roll",
    name: "B-roll",
    subtitle: "质感镜头与转场优先",
    promptAddon:
      "以素材型镜头为主，突出机位变化、运动轨迹与转场可能性，保证剪辑可拼接性。",
  },
];

export const DEFAULT_PROMPT_TEMPLATE = `你是资深分镜导演与镜头设计顾问。

目标：基于用户输入输出 {{count}} 条分镜拓展方向。
输出语言：简体中文。

必须返回 JSON（禁止 Markdown）：
{
  "expansions": [
    {
      "title": "分镜标题",
      "scene": "2-3句画面描述，具体到动作、构图、场景元素",
      "camera": "镜头运动与机位建议",
      "mood": "氛围与情绪",
      "twist": "亮点转折或冲突信息",
      "seedIdea": "下一步可继续扩写的方向"
    }
  ]
}

约束：
1) expansions 数量必须等于 {{count}}。
2) 每条都与输入主题相关但不重复。
3) 每条至少在时间、空间、视角、冲突、叙事节奏中有两项变化。
4) 兼顾可拍摄性与创意新鲜度。`;

export function getModeById(modeId) {
  return STORYBOARD_MODES.find((mode) => mode.id === modeId) ?? STORYBOARD_MODES[0];
}
