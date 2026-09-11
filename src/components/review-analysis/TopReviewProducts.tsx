import type { ReviewTopProduct } from "@/lib/reviewAnalysis";

export function TopReviewProducts({ products }: { products: ReviewTopProduct[] }) {
  if (!products.length) {
    return <div className="empty-state api-state">표시할 리뷰 후보 제품이 없습니다.</div>;
  }

  return (
    <div className="product-list">
      {products.map((item, index) => (
        <div className="product-row review-product-row" key={item.goodsNo}>
          <div className="product-rank">{index + 1}</div>
          <div>
            <span>{item.platform}</span>
            <strong className="review-product-name" title={item.productName}>{item.productName}</strong>
            {item.reason ? <p>{item.reason}</p> : null}
          </div>
          <div className="product-stat">
            <span>리뷰 수</span>
            <strong>{item.reviewCount.toLocaleString("ko-KR")}</strong>
          </div>
          <div className="product-stat">
            <span>평점</span>
            <strong>{item.reviewRating.toFixed(1)}</strong>
          </div>
          <div className="product-stat">
            <span>긍정</span>
            <strong>{item.positiveRatio.toFixed(1)}%</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
