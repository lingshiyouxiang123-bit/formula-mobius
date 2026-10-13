export function normalizeChineseInput(input: string): string {
  return input
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[，。！？、；：“”‘’（）【】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

