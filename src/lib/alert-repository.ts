import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AlertItem } from "@/lib/types";
import type { DailyMetricSnapshot } from "@/lib/alerts";
import { sortAlerts } from "@/lib/alerts";

export type AlertsRepository = {
  getDailyMetricSnapshot: (snapshotDate: string) => Promise<DailyMetricSnapshot | null>;
  saveDailyMetricSnapshot: (snapshot: DailyMetricSnapshot) => Promise<void>;
  listAlertsByDate: (alertDate: string) => Promise<AlertItem[]>;
  replaceDailyAlerts: (alertDate: string, alerts: AlertItem[]) => Promise<void>;
  markAlertsSent: (alertIds: string[], channel: string) => Promise<void>;
};

type DailyMetricSnapshotRow = {
  snapshot_date?: string;
  ingredient_matrix?: unknown;
  review_issue_summary?: unknown;
  created_at?: string;
};

export class SupabaseAlertsRepository implements AlertsRepository {
  private supabase: SupabaseClient;

  constructor(supabase = createServerSupabaseClient()) {
    this.supabase = supabase;
  }

  async getDailyMetricSnapshot(snapshotDate: string) {
    const { data, error } = await this.supabase
      .from("daily_metric_snapshot")
      .select("snapshot_date, ingredient_matrix, review_issue_summary, created_at")
      .eq("snapshot_date", snapshotDate)
      .maybeSingle();

    if (error) throw new Error(`daily_metric_snapshot 조회 실패: ${error.message}`);
    if (!data) return null;

    return snapshotFromRow(data as DailyMetricSnapshotRow);
  }

  async saveDailyMetricSnapshot(snapshot: DailyMetricSnapshot) {
    const { error } = await this.supabase
      .from("daily_metric_snapshot")
      .upsert({
        snapshot_date: snapshot.snapshotDate,
        ingredient_matrix: snapshot.ingredientMatrix,
        review_issue_summary: snapshot.reviewIssueSummary,
        created_at: snapshot.createdAt,
      }, { onConflict: "snapshot_date" });

    if (error) throw new Error(`daily_metric_snapshot 저장 실패: ${error.message}`);
  }

  async listAlertsByDate(alertDate: string) {
    const { data, error } = await this.supabase
      .from("alerts")
      .select("*")
      .eq("alert_date", alertDate);

    if (error) throw new Error(`alerts 조회 실패: ${error.message}`);
    return sortAlerts(((data || []) as unknown[]).map(alertFromRow));
  }

  async replaceDailyAlerts(alertDate: string, alerts: AlertItem[]) {
    const rows = alerts.map((alert) => ({
      id: alert.id,
      alert_date: alert.alert_date,
      alert_type: alert.alert_type,
      severity: alert.severity,
      title: alert.title,
      summary: alert.summary,
      ingredient_name: alert.ingredient_name,
      product_name: alert.product_name || null,
      detected_metric_name: alert.detected_metric_name,
      detected_metric_value: alert.detected_metric_value,
      baseline_metric_value: alert.baseline_metric_value ?? null,
      reason_json: alert.reason_json,
      action_items_json: alert.action_items_json,
      is_sent: alert.is_sent,
      sent_channel: alert.sent_channel || null,
      created_at: alert.created_at,
    }));

    if (rows.length) {
      const { error: upsertError } = await this.supabase
        .from("alerts")
        .upsert(rows, { onConflict: "id" });
      if (upsertError) throw new Error(`alerts 저장 실패: ${upsertError.message}`);
    }

    const newIds = new Set(alerts.map((a) => a.id));
    const { data: existing } = await this.supabase
      .from("alerts")
      .select("id")
      .eq("alert_date", alertDate);
    const toDelete = ((existing || []) as { id: string }[])
      .map((r) => r.id)
      .filter((id) => !newIds.has(id));

    if (toDelete.length) {
      await this.supabase.from("alerts").delete().in("id", toDelete);
    }
  }

  async markAlertsSent(alertIds: string[], channel: string) {
    if (!alertIds.length) return;

    const { error } = await this.supabase
      .from("alerts")
      .update({ is_sent: true, sent_channel: channel })
      .in("id", alertIds);

    if (error) throw new Error(`alerts 발송 상태 업데이트 실패: ${error.message}`);
  }
}

export function createServerSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  // 이 함수는 서버 전용 코드(API 라우트)에서만 호출된다.
  // alerts/daily_metric_snapshot에 RLS가 걸려있어 쓰기(insert/update/delete)는
  // service_role 키로만 가능하다. 브라우저에 노출되는 anon 키로는 읽기만 가능.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) throw new Error("Supabase 환경변수가 필요합니다.");
  return createClient(url, key, { auth: { persistSession: false } });
}

function snapshotFromRow(row: DailyMetricSnapshotRow): DailyMetricSnapshot {
  return {
    snapshotDate: String(row.snapshot_date || ""),
    ingredientMatrix: Array.isArray(row.ingredient_matrix) ? row.ingredient_matrix as DailyMetricSnapshot["ingredientMatrix"] : [],
    reviewIssueSummary: Array.isArray(row.review_issue_summary) ? row.review_issue_summary as DailyMetricSnapshot["reviewIssueSummary"] : [],
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

function alertFromRow(row: unknown): AlertItem {
  const value = row as Partial<AlertItem>;

  return {
    id: String(value.id || ""),
    alert_date: String(value.alert_date || ""),
    alert_type: value.alert_type || "review_issue",
    severity: value.severity || "medium",
    title: String(value.title || ""),
    summary: String(value.summary || ""),
    ingredient_name: String(value.ingredient_name || ""),
    product_name: value.product_name || null,
    detected_metric_name: String(value.detected_metric_name || ""),
    detected_metric_value: value.detected_metric_value ?? "",
    baseline_metric_value: value.baseline_metric_value ?? null,
    reason_json: isRecord(value.reason_json) ? value.reason_json : {},
    action_items_json: Array.isArray(value.action_items_json) ? value.action_items_json.map(String) : [],
    is_sent: Boolean(value.is_sent),
    sent_channel: value.sent_channel || null,
    created_at: String(value.created_at || ""),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
