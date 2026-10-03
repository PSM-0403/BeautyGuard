import type { SentimentValidationResult } from "@/lib/sentimentValidation";

const LABEL_KO: Record<string, string> = {
  positive: "긍정",
  neutral: "중립",
  negative: "부정",
};

export function SentimentValidationCard({ result }: { result: SentimentValidationResult }) {
  // 리뷰가 긍정에 크게 쏠려 있어서, 가장 많은 구간 하나로만 찍어도 나오는 일치율을 함께 보여준다.
  // 전체 일치율이 이 값보다 낮으면 전체 일치율만으로는 모델을 평가할 수 없다는 뜻이다.
  const majorityGroup = result.groups.reduce((max, group) => (group.sampleSize > max.sampleSize ? group : max), result.groups[0]);
  const majorityBaseline = result.totalReviews && majorityGroup
    ? Math.round((majorityGroup.sampleSize / result.totalReviews) * 1000) / 10
    : 0;

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
      {majorityGroup ? (
        <div className="mini-summary">
          <span>비교 기준: 모든 리뷰를 {LABEL_KO[majorityGroup.expected]}으로 예측했을 때</span>
          <strong>{majorityBaseline.toFixed(1)}%</strong>
        </div>
      ) : null}
      <p className="card-helper">
        리뷰가 {LABEL_KO[majorityGroup?.expected ?? "positive"]}에 쏠려 있어 전체 일치율보다 구간별 일치율로 보는 것이 정확합니다.
        특히 부정(1~2점) 리뷰를 얼마나 찾아내는지가 MD에게 가장 중요한 지표입니다.
      </p>
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
