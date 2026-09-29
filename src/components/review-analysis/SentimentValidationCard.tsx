import type { SentimentValidationResult } from "@/lib/sentimentValidation";

const LABEL_KO: Record<string, string> = {
  positive: "긍정",
  neutral: "중립",
  negative: "부정",
};

export function SentimentValidationCard({ result }: { result: SentimentValidationResult }) {
  return (
    <div className="table-wrap">
      <p className="card-helper">
        리뷰 작성자가 남긴 별점(1~5점)을 근사 정답으로 삼아, 모델이 예측한 감성(positive/neutral/negative)이
        그 별점 구간과 얼마나 일치하는지 검증합니다. (4~5점=긍정, 3점=중립, 1~2점=부정 기준)
      </p>
      <div className="mini-summary">
        <span>전체 일치율 (표본 {result.totalReviews.toLocaleString()}건)</span>
        <strong>{result.overallAccuracy.toFixed(1)}%</strong>
      </div>
      <table className="skin-sentiment-table">
        <thead>
          <tr>
            <th>별점 구간</th>
            <th>근사 정답</th>
            <th>표본 수</th>
            <th>일치율</th>
            <th>모델 예측 분포</th>
          </tr>
        </thead>
        <tbody>
          {result.groups.map((group) => (
            <tr key={group.expected}>
              <td>{group.ratingRangeLabel}</td>
              <td>{LABEL_KO[group.expected]}</td>
              <td>{group.sampleSize.toLocaleString()}건</td>
              <td>{group.sampleSize ? `${group.matchRate.toFixed(1)}%` : "-"}</td>
              <td>
                {group.sampleSize
                  ? (["positive", "neutral", "negative"] as const)
                      .map((label) => `${LABEL_KO[label]} ${group.predictedBreakdown[label]}`)
                      .join(" · ")
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="card-helper">
        중립(3점) 구간은 표본이 적어({result.groups.find((g) => g.expected === "neutral")?.sampleSize ?? 0}건)
        일치율의 신뢰도가 상대적으로 낮습니다. 긍정/부정 표본이 늘어날수록 지표가 안정화됩니다.
      </p>
    </div>
  );
}
