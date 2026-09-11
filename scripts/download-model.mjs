import path from "path";
import { fileURLToPath } from "url";
import { env, pipeline } from "@huggingface/transformers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, "..", ".model-cache");

env.allowRemoteModels = true;
env.allowLocalModels = true;
env.cacheDir = cacheDir;

console.log("모델 다운로드 시작...");
console.log("저장 경로:", cacheDir);

try {
  await pipeline(
    "sentiment-analysis",
    "Xenova/nlptown-bert-base-multilingual-uncased-sentiment",
  );
  console.log("모델 다운로드 완료.");
} catch (error) {
  console.error("다운로드 실패:", error.message);
  process.exit(1);
}
