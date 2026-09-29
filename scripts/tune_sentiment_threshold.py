"""
scripts/sentiment_scores.json에 모인 원본 확률 점수로, positive/negative 임계값을
여러 조합으로 테스트해서 전체 정확도와 클래스별 재현율(recall)을 비교합니다.
네트워크 호출 없이 로컬에서만 계산합니다 (일회성 분석용, 배포되지 않음).
"""

from __future__ import annotations

import json
from pathlib import Path

DATA_PATH = Path(__file__).resolve().parent / "sentiment_scores.json"


def expected_label(rating: float) -> str:
    if rating >= 4:
        return "positive"
    if rating <= 2:
        return "negative"
    return "neutral"


def predict_label(positive_score: float, negative_score: float, pos_th: float, neg_th: float) -> str:
    if positive_score >= pos_th:
        return "positive"
    if negative_score >= neg_th:
        return "negative"
    return "neutral"


def evaluate(rows: list[dict], pos_th: float, neg_th: float) -> dict:
    counts = {"positive": 0, "neutral": 0, "negative": 0}
    correct = {"positive": 0, "neutral": 0, "negative": 0}
    total_correct = 0

    for row in rows:
        expected = expected_label(row["review_rating"])
        predicted = predict_label(row["positive_score"], row["negative_score"], pos_th, neg_th)
        counts[expected] += 1
        if predicted == expected:
            correct[expected] += 1
            total_correct += 1

    recall = {label: (correct[label] / counts[label] * 100 if counts[label] else 0) for label in counts}
    overall_accuracy = total_correct / len(rows) * 100
    return {"pos_th": pos_th, "neg_th": neg_th, "overall": overall_accuracy, "recall": recall, "counts": counts}


def main() -> None:
    rows = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    print(f"전체 표본: {len(rows)}건\n")

    print("=== 기존 임계값 (0.65 / 0.65) ===")
    baseline = evaluate(rows, 0.65, 0.65)
    print(f"전체 정확도: {baseline['overall']:.1f}%")
    for label in ("positive", "neutral", "negative"):
        print(f"  {label}: recall {baseline['recall'][label]:.1f}% (n={baseline['counts'][label]})")

    print("\n=== negative 임계값 스윕 (positive는 0.65 고정) ===")
    candidates = []
    for neg_th in [0.65, 0.60, 0.55, 0.50, 0.45, 0.40, 0.35, 0.30, 0.25, 0.20]:
        result = evaluate(rows, 0.65, neg_th)
        candidates.append(result)
        print(
            f"neg_th={neg_th:.2f} | 전체 {result['overall']:.1f}% | "
            f"positive recall {result['recall']['positive']:.1f}% | "
            f"neutral recall {result['recall']['neutral']:.1f}% | "
            f"negative recall {result['recall']['negative']:.1f}%"
        )

    print("\n=== positive 임계값도 같이 낮춰본 조합 (참고용) ===")
    for pos_th in [0.60, 0.55, 0.50]:
        for neg_th in [0.45, 0.40, 0.35]:
            result = evaluate(rows, pos_th, neg_th)
            print(
                f"pos_th={pos_th:.2f} neg_th={neg_th:.2f} | 전체 {result['overall']:.1f}% | "
                f"positive recall {result['recall']['positive']:.1f}% | "
                f"neutral recall {result['recall']['neutral']:.1f}% | "
                f"negative recall {result['recall']['negative']:.1f}%"
            )


if __name__ == "__main__":
    main()
