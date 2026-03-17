export function toIdeaMarkdown(payload) {
  const { generatedAt, modeName, styleName, seedText, imageName, ideas } = payload;

  return [
    "# Storyboard Expansions",
    "",
    `- 生成时间：${generatedAt}`,
    `- 模式：${modeName}`,
    `- 风格：${styleName}`,
    `- 文本输入：${seedText || "(无)"}`,
    `- 图片输入：${imageName || "(无)"}`,
    "",
    ...ideas.map((idea, idx) => {
      return [
        `## #${idx + 1} ${idea.title}`,
        "",
        `- 画面：${idea.scene || "-"}`,
        `- 镜头：${idea.camera || "-"}`,
        `- 情绪：${idea.mood || "-"}`,
        `- 转折：${idea.twist || "-"}`,
        `- 延展：${idea.seedIdea || "-"}`,
        "",
      ].join("\n");
    }),
  ].join("\n");
}

export function downloadText(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function formatTime(input) {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function buildIdeaCopyText(idea, index) {
  return [
    `#${index + 1} ${idea.title}`,
    `画面：${idea.scene || "-"}`,
    `镜头：${idea.camera || "-"}`,
    `情绪：${idea.mood || "-"}`,
    `转折：${idea.twist || "-"}`,
    `延展：${idea.seedIdea || "-"}`,
  ].join("\n");
}
