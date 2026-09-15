import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
    {
      // 이 클라이언트는 브라우저뿐 아니라 서버(API 라우트) 쪽 데이터 조회에도 쓰인다.
      // Next.js가 supabase-js 내부 fetch 호출을 캐싱해서 오래된/빈 결과가 고정될 수
      // 있어서(src/lib/reviewAnalysis.ts와 동일한 문제), no-store로 강제한다.
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
      },
    },
  );