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
          {rows.map((row) => (
            <tr key={row.skinType}>
              <td>{row.skinType}</td>
              <td>{row.positive.toFixed(1)}%</td>
              <td>{row.neutral.toFixed(1)}%</td>
              <td>{row.negative.toFixed(1)}%</td>
              <td>{row.issue}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
