import type { SkinTypeAnalysis } from "@/lib/reviewAnalysis";

export function SkinTypeSentimentTable({ rows }: { rows: SkinTypeAnalysis[] }) {
  return (
    <div className="table-wrap">
      <table className="skin-sentiment-table">
        <thead>
          <tr>
            <th>피부 타입</th>
            <th>긍정</th>
            <th>중립</th>
            <th>부정</th>
            <th>주요 이슈</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // 리뷰가 0건이면 비율이 0%로 계산돼 "이슈 없음"처럼 보이므로, 값 대신 "리뷰 없음"으로 표시한다.
            const hasReviews = row.reviewCount > 0;
            return (
              <tr key={row.skinType}>
                <td>{row.skinType} <span className="card-helper">(n={row.reviewCount})</span></td>
                <td>{hasReviews ? `${row.positive.toFixed(1)}%` : "-"}</td>
                <td>{hasReviews ? `${row.neutral.toFixed(1)}%` : "-"}</td>
                <td>{hasReviews ? `${row.negative.toFixed(1)}%` : "-"}</td>
                <td>{hasReviews ? row.issue : "리뷰 없음"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
