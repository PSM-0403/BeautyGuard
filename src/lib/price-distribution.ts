import { createClient } from "@/utils/supabase/client";
import type { PriceDistributionItem, PriceDistributionPoint } from "@/lib/types";

type PriceIngredientTarget = {
  key: string;
  label: string;
  aliases: string[];
};

type ProductIngredientRow = {
  goods_no: string | number | null;
  ingredient_name: string | null;
};

type ProductSnapshotRow = {
  id: number | null;
  goods_no: string | number | null;
  collected_date: string | null;
  regular_price: string | number | null;
  sales_price: string | number | null;
  discount: string | number | null;
  updated_at: string | null;
  product_name?: string | null;
  goods_name?: string | null;
  name?: string | null;
  title?: string | null;
};

type ProductRow = {
  goods_no: string | number | null;
  volume_ml: string | number | null;
  brand?: string | null;
  product_name?: string | null;
  product_name_clean?: string | null;
  goods_name?: string | null;
  name?: string | null;
  title?: string | null;
};

type NormalizedSnapshot = {
  id: number;
  goodsNo: string;
  regularPrice: number | null;
  salesPrice: number;
  discount: number | null;
  collectedDate: string;
  updatedAt: string;
  productName: string;
};

type ProductInfo = {
  volumeMl: number | null;
  productName: string;
  brand: string;
};

const PAGE_SIZE = 1000;
const SNAPSHOT_CHUNK_SIZE = 180;
const INGREDIENT_NAME_COLUMN = "ingredient_name";
const SNAPSHOT_SELECT_CANDIDATES = [
  "id, goods_no, collected_date, regular_price, sales_price, discount, updated_at, product_name, goods_name, name, title",
  "id, goods_no, collected_date, regular_price, sales_price, discount, updated_at",
] as const;
const PRODUCT_SELECT_CANDIDATES = [
  "goods_no, volume_ml, brand, product_name, product_name_clean",
  "goods_no, volume_ml, brand, product_name",
  "goods_no, volume_ml, product_name",
  "goods_no, volume_ml",
] as const;

import { MAIN_INGREDIENT_LIST } from "@/lib/main-ingredients";

export const PRICE_INGREDIENT_TARGETS: PriceIngredientTarget[] = MAIN_INGREDIENT_LIST.map(({ key, label, aliases }) => ({ key, label, aliases }));

export function getEmptyPriceDistribution(): PriceDistributionItem[] {
  return PRICE_INGREDIENT_TARGETS.map((target) => ({
    ingredient: target.label,
    salePrices: [],
    listPrices: [],
    prices: [],
  }));
}

export async function fetchPriceDistributionFromSupabase(): Promise<PriceDistributionItem[]> {
  const supabase = createClient();
  const ingredientRows = await fetchIngredientRows(supabase);
  const goodsIngredientLabels = getGoodsIngredientLabels(ingredientRows);
  const goodsNos = Array.from(goodsIngredientLabels.keys());

  if (!goodsNos.length) return getEmptyPriceDistribution();

  const [snapshotRows, productRows] = await Promise.all([
    fetchSnapshotRows(supabase, goodsNos),
    fetchProductRows(supabase, goodsNos),
  ]);
  const latestSnapshots = getLatestSnapshotsByGoodsNo(snapshotRows);
  const goodsProductInfo = getGoodsProductInfo(productRows);
  const buckets = new Map<string, {
    salePricePoints: PriceDistributionPoint[];
    listPricePoints: PriceDistributionPoint[];
  }>();

  PRICE_INGREDIENT_TARGETS.forEach((target) => {
    buckets.set(target.label, { salePricePoints: [], listPricePoints: [] });
  });

  latestSnapshots.forEach((snapshot) => {
    const ingredientLabels = goodsIngredientLabels.get(snapshot.goodsNo);
    const productInfo = goodsProductInfo.get(snapshot.goodsNo);
    const volumeMl = productInfo?.volumeMl || null;
    if (!ingredientLabels) return;
    if (!volumeMl) return;

    ingredientLabels.forEach((label) => {
      const bucket = buckets.get(label);
      if (!bucket) return;

      bucket.salePricePoints.push(
        buildPricePoint({
          ingredient: label,
          snapshot,
          productInfo,
          volumeMl,
          priceType: "sale",
          basisPrice: snapshot.salesPrice,
        }),
      );

      if (snapshot.regularPrice !== null) {
        bucket.listPricePoints.push(
          buildPricePoint({
            ingredient: label,
            snapshot,
            productInfo,
            volumeMl,
            priceType: "list",
            basisPrice: snapshot.regularPrice,
          }),
        );
      }
    });
  });

  return PRICE_INGREDIENT_TARGETS.map((target) => {
    const bucket = buckets.get(target.label) || { salePricePoints: [], listPricePoints: [] };
    const salePricePoints = sortPricePoints(bucket.salePricePoints);
    const listPricePoints = sortPricePoints(bucket.listPricePoints);
    const salePrices = salePricePoints.map((point) => point.value);
    const listPrices = listPricePoints.map((point) => point.value);

    return {
      ingredient: target.label,
      salePrices,
      listPrices,
      prices: salePrices,
      salePricePoints,
      listPricePoints,
    };
  });
}

async function fetchIngredientRows(supabase: ReturnType<typeof createClient>) {
  const rows: ProductIngredientRow[] = [];
  const ingredientFilter = buildIngredientFilter();

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("product_main_ingredients")
      .select(`goods_no, ${INGREDIENT_NAME_COLUMN}`)
      .or(ingredientFilter)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`product_main_ingredients 조회 실패: ${error.message}`);

    const page = (data || []) as ProductIngredientRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

async function fetchSnapshotRows(supabase: ReturnType<typeof createClient>, goodsNos: string[]) {
  const rows: ProductSnapshotRow[] = [];

  for (const goodsNoChunk of chunk(goodsNos, SNAPSHOT_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await selectWithFallback<ProductSnapshotRow>(
        supabase,
        "product_snapshots",
        SNAPSHOT_SELECT_CANDIDATES,
        (query) => query.in("goods_no", goodsNoChunk).range(from, from + PAGE_SIZE - 1),
      );

      if (error) throw new Error(`product_snapshots 조회 실패: ${error.message}`);

      const page = (data || []) as ProductSnapshotRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }

  return rows;
}

async function fetchProductRows(supabase: ReturnType<typeof createClient>, goodsNos: string[]) {
  const rows: ProductRow[] = [];

  for (const goodsNoChunk of chunk(goodsNos, SNAPSHOT_CHUNK_SIZE)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await selectWithFallback<ProductRow>(
        supabase,
        "products",
        PRODUCT_SELECT_CANDIDATES,
        (query) => query.in("goods_no", goodsNoChunk).range(from, from + PAGE_SIZE - 1),
      );

      if (error) throw new Error(`products 조회 실패: ${error.message}`);

      const page = (data || []) as ProductRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }

  return rows;
}

function buildIngredientFilter() {
  const aliases = Array.from(new Set(PRICE_INGREDIENT_TARGETS.flatMap((target) => target.aliases)));
  return aliases.map((alias) => `${INGREDIENT_NAME_COLUMN}.ilike.%${alias}%`).join(",");
}

function getGoodsIngredientLabels(rows: ProductIngredientRow[]) {
  const goodsIngredientLabels = new Map<string, Set<string>>();

  rows.forEach((row) => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    if (!goodsNo) return;

    const labelMatches = getIngredientLabelMatches(row.ingredient_name);
    if (!labelMatches.length) return;

    const currentLabels = goodsIngredientLabels.get(goodsNo) || new Set<string>();
    labelMatches.forEach((label) => currentLabels.add(label));
    goodsIngredientLabels.set(goodsNo, currentLabels);
  });

  return goodsIngredientLabels;
}

function getGoodsProductInfo(rows: ProductRow[]) {
  const goodsProductInfo = new Map<string, ProductInfo>();

  rows.forEach((row) => {
    const goodsNo = normalizeGoodsNo(row.goods_no);
    const volumeMl = parseVolumeMl(row.volume_ml);
    if (!goodsNo) return;
    goodsProductInfo.set(goodsNo, {
      volumeMl,
      productName: getProductName(row),
      brand: String(row.brand || "").trim(),
    });
  });

  return goodsProductInfo;
}

function getIngredientLabelMatches(ingredientName: string | null) {
  const normalizedName = normalizeSearchText(ingredientName);
  if (!normalizedName) return [];

  return PRICE_INGREDIENT_TARGETS.filter((target) =>
    target.aliases.some((alias) => {
      const normalizedAlias = normalizeSearchText(alias);
      return normalizedName === normalizedAlias || normalizedName.includes(normalizedAlias);
    }),
  ).map((target) => target.label);
}

function normalizeSnapshot(row: ProductSnapshotRow): NormalizedSnapshot | null {
  const goodsNo = normalizeGoodsNo(row.goods_no);
  const salesPrice = parseNumber(row.sales_price);
  if (!goodsNo || salesPrice === null) return null;

  let regularPrice = parseNumber(row.regular_price);
  let discount = parseDiscount(row.discount);

  if (regularPrice === null && isMissing(row.discount)) {
    regularPrice = salesPrice;
    discount = 0;
  }

  regularPrice = normalizeRegularPrice(regularPrice, salesPrice, discount);

  return {
    id: Number(row.id || 0),
    goodsNo,
    regularPrice,
    salesPrice,
    discount,
    collectedDate: row.collected_date || "",
    updatedAt: row.updated_at || "",
    productName: getProductName(row),
  };
}

function buildPricePoint({
  ingredient,
  snapshot,
  productInfo,
  volumeMl,
  priceType,
  basisPrice,
}: {
  ingredient: string;
  snapshot: NormalizedSnapshot;
  productInfo: ProductInfo | undefined;
  volumeMl: number;
  priceType: "sale" | "list";
  basisPrice: number;
}): PriceDistributionPoint {
  const productName = snapshot.productName || productInfo?.productName || snapshot.goodsNo;

  return {
    value: toPricePer10ml(basisPrice, volumeMl),
    ingredient,
    productName,
    goodsNo: snapshot.goodsNo,
    basisPrice,
    regularPrice: snapshot.regularPrice,
    salesPrice: snapshot.salesPrice,
    volumeMl,
    priceType,
  };
}

function getLatestSnapshotsByGoodsNo(rows: ProductSnapshotRow[]) {
  const latestSnapshots = new Map<string, NormalizedSnapshot>();

  rows.forEach((row) => {
    const snapshot = normalizeSnapshot(row);
    if (!snapshot) return;

    const current = latestSnapshots.get(snapshot.goodsNo);
    if (!current || isSnapshotNewer(snapshot, current)) {
      latestSnapshots.set(snapshot.goodsNo, snapshot);
    }
  });

  return latestSnapshots;
}

function isSnapshotNewer(candidate: NormalizedSnapshot, current: NormalizedSnapshot) {
  const candidateTime = Date.parse(candidate.collectedDate || candidate.updatedAt || "");
  const currentTime = Date.parse(current.collectedDate || current.updatedAt || "");

  if (Number.isFinite(candidateTime) && Number.isFinite(currentTime) && candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }

  const candidateUpdatedAt = Date.parse(candidate.updatedAt || "");
  const currentUpdatedAt = Date.parse(current.updatedAt || "");

  if (Number.isFinite(candidateUpdatedAt) && Number.isFinite(currentUpdatedAt) && candidateUpdatedAt !== currentUpdatedAt) {
    return candidateUpdatedAt > currentUpdatedAt;
  }

  return candidate.id > current.id;
}

function parseNumber(value: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isMissing(value)) return null;

  const number = Number(String(value).replace(/,/g, "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function parseVolumeMl(value: string | number | null) {
  if (typeof value === "number") return value > 0 && Number.isFinite(value) ? value : null;
  if (isMissing(value)) return null;

  const text = String(value).toLocaleLowerCase("ko-KR");
  const volumeMatches = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(?:ml|g)/g));
  if (volumeMatches.length) {
    const totalVolume = volumeMatches.reduce((sum, match) => sum + Number(match[1]), 0);
    return totalVolume > 0 && Number.isFinite(totalVolume) ? totalVolume : null;
  }

  if (/[a-z가-힣]/i.test(text)) return null;

  const volumeMl = parseNumber(value);
  return volumeMl !== null && volumeMl > 0 ? volumeMl : null;
}

function normalizeRegularPrice(regularPrice: number | null, salesPrice: number, discount: number | null) {
  if (regularPrice === null) return null;
  if (discount === null || discount <= 0 || discount >= 100) return regularPrice;

  const expectedRegularPrice = salesPrice / (1 - discount / 100);
  const regularPriceDividedBy10 = regularPrice / 10;

  if (isClosePrice(regularPriceDividedBy10, expectedRegularPrice) && !isClosePrice(regularPrice, expectedRegularPrice)) {
    return Math.round(regularPriceDividedBy10);
  }

  return regularPrice;
}

function isClosePrice(value: number, target: number) {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return false;
  return Math.abs(value - target) / target <= 0.08;
}

function toPricePer10ml(price: number, volumeMl: number) {
  return Math.round((price / volumeMl) * 10);
}

function parseDiscount(value: string | number | null) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (isMissing(value)) return null;

  const number = Number(String(value).replace("%", "").trim());
  return Number.isFinite(number) ? number : null;
}

function isMissing(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function normalizeGoodsNo(value: string | number | null) {
  if (isMissing(value)) return "";
  return String(value).trim();
}

function getProductName(row: ProductSnapshotRow | ProductRow) {
  return String(
    row.product_name ||
    ("product_name_clean" in row ? row.product_name_clean : "") ||
    row.goods_name ||
    row.name ||
    row.title ||
    "",
  ).trim();
}

function normalizeSearchText(value: string | null) {
  return String(value || "").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}

function sortPrices(values: number[]) {
  return values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

function sortPricePoints(values: PriceDistributionPoint[]) {
  return values
    .filter((point) => Number.isFinite(point.value))
    .sort((a, b) => a.value - b.value);
}

async function selectWithFallback<T>(
  supabase: ReturnType<typeof createClient>,
  tableName: string,
  selectCandidates: readonly string[],
  applyQuery: (query: ReturnType<ReturnType<typeof supabase.from>["select"]>) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
) {
  let lastError: { message: string } | null = null;

  for (const selectColumns of selectCandidates) {
    const result = await applyQuery(supabase.from(tableName).select(selectColumns));
    if (!result.error) return { data: result.data as T[] | null, error: null };
    lastError = result.error;
    console.error(`${tableName} select 후보 실패`, { selectColumns, error: result.error.message });
  }

  return { data: null, error: lastError };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
