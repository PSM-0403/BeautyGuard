import type { ReviewAnalysisResult } from "@/lib/reviewAnalysis";

export function SentimentDonutChart({ sentiment }: { sentiment: ReviewAnalysisResult["sentiment"] }) {
  const positiveEnd = sentiment.positiveRatio;
  const neutralEnd = sentiment.positiveRatio + sentiment.neutralRatio;
  const background = `conic-gradient(#2BB7A9 0 ${positiveEnd}%, #94A3B8 ${positiveEnd}% ${neutralEnd}%, #F28B82 ${neutralEnd}% 100%)`;

  return (
    <div className="plot-shell compact sentiment-plot">
      <div className="donut-chart" style={{ background }}>
        <div>
          <span>긍정</span>
          <strong>{sentiment.positiveRatio.toFixed(1)}%</strong>
        </div>
      </div>
      <div className="sentiment-legend">
        <span><i style={{ background: "#2BB7A9" }} />긍정 {sentiment.positive}개</span>
        <span><i style={{ background: "#94A3B8" }} />중립 {sentiment.neutral}개</span>
        <span><i style={{ background: "#F28B82" }} />부정 {sentiment.negative}개</span>
      </div>
    </div>
  );
}
