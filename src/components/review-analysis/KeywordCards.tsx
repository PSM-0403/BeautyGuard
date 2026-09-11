import type { ReviewKeyword } from "@/lib/reviewAnalysis";

export function KeywordCards({
  positive,
  negative,
}: {
  positive: ReviewKeyword[];
  negative: ReviewKeyword[];
}) {
  return (
    <div className="keyword-cloud">
      <KeywordPanel title="긍정 키워드 TOP 5" keywords={positive} tone="positive" />
      <KeywordPanel title="부정 키워드 TOP 5" keywords={negative} tone="negative" />
    </div>
  );
}

function KeywordPanel({
  title,
  keywords,
  tone,
}: {
  title: string;
  keywords: ReviewKeyword[];
  tone: "positive" | "negative";
}) {
  return (
    <div className={`keyword-panel ${tone}`}>
      <div className="keyword-panel-title">{title}</div>
      {keywords.length ? keywords.map((keyword) => (
        <div className="keyword-row" key={keyword.keyword}>
          <span>{keyword.keyword}</span>
          <strong>{keyword.count}회 · {keyword.percentage.toFixed(1)}%</strong>
        </div>
      )) : <div className="empty-state">키워드 매칭 없음</div>}
    </div>
  );
}
