export const STYLE_HINTS = {
  cinematic: "偏电影感：强调景别变化、调度与光影层次。",
  suspense: "偏悬疑推进：加强线索埋设、信息差与不确定性。",
  poetic: "偏诗意氛围：使用意象与留白构建情绪流。",
  comedic: "偏反差喜剧：加入意外节奏和反差笑点。",
  wild: "偏超现实：允许大胆跳跃但保留叙事可读性。",
};

export const STORYBOARD_MODES = [
  {
    id: "ad-film",
    name: "广告片",
    promptAddon:
      "以品牌传播为目标，保证每条分镜在3-6秒内形成记忆点，并自然导向品牌信息或CTA动作。",
  },
  {
    id: "drama",
    name: "剧情片",
    promptAddon:
      "以角色冲突推进为核心，强调人物动机、关系变化和叙事因果，不做无意义炫技镜头。",
  },
  {
    id: "short-video",
    name: "短视频",
    promptAddon:
      "面向短视频平台，优先前3秒钩子、信息密度和节奏切换，每条分镜都要有停留理由。",
  },
  {
    id: "b-roll",
    name: "B-roll",
    promptAddon:
      "以可拼接素材镜头为主，强调机位变化、运动轨迹、转场兼容性和剪辑可复用性。",
  },
];

export function getModeById(modeId) {
  return STORYBOARD_MODES.find((mode) => mode.id === modeId) ?? STORYBOARD_MODES[0];
}
