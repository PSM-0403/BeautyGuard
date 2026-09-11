export function OpportunityInsights({ insights }: { insights: string[] }) {
  return (
    <div className="insight-list">
      {insights.map((item) => (
        <div className="insight-item" key={item}>
          {item}
        </div>
      ))}
    </div>
  );
}
