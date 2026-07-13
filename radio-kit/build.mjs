// radio-kit/build.mjs
// 毎朝 GitHub Actions から実行。番組RSSの最新エピソードを取得し radio-kit/latest.json に書き出す。
// 依存パッケージなし（Node 20+ の組み込み fetch を使用）。
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "latest.json");

// 番組トップ（シェアのフォールバック先）。エピソード個別URLがRSSに無い場合はここへ誘導。
const SHOW_URL = "https://open.spotify.com/show/033Nx6hE7l69wFzdDq6xWj";

const FEED_URL = process.env.PODCAST_RSS_URL?.trim();

function stripCdata(s = "") {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}
function decodeEntities(s = "") {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
function pick(tag, xml) {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(stripCdata(m[1])) : "";
}
// タイトル末尾の 【...】（例:【ラジオ・グンマサイタマ 2026/07/12】）を落として「話題」だけ取り出す
function topicFromTitle(title) {
  return title.replace(/[【\[][^】\]]*[】\]]\s*$/u, "").replace(/\s+$/, "").trim() || title;
}

async function main() {
  if (!FEED_URL) {
    console.error(
      "PODCAST_RSS_URL が未設定です。GitHub の Settings > Secrets and variables > Actions > Variables に " +
      "PODCAST_RSS_URL（番組のRSSフィードURL）を追加してください。"
    );
    process.exit(1);
  }

  const res = await fetch(FEED_URL, { headers: { "user-agent": "radio-kit/1.0" } });
  if (!res.ok) throw new Error(`RSS取得に失敗: ${res.status} ${res.statusText}`);
  const xml = await res.text();

  const itemMatch = xml.match(/<item[\s\S]*?<\/item>/i);
  if (!itemMatch) throw new Error("RSSに<item>が見つかりません");
  const item = itemMatch[0];

  const title = pick("title", item);
  if (!title) throw new Error("最新エピソードのタイトルが取得できません");

  const rawLink = pick("link", item);
  const pub = pick("pubDate", item);
  const d = pub ? new Date(pub) : new Date();
  const date = isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);

  const data = {
    title,
    topic: topicFromTitle(title),
    date,
    link: rawLink || SHOW_URL, // 配信元のエピソードページ（無ければ番組トップ）
    showUrl: SHOW_URL,
    updatedAt: new Date().toISOString(),
  };

  // 変化が無ければ書き込まない（無駄なコミットを避ける）
  let prev = "";
  try { prev = await readFile(OUT, "utf8"); } catch {}
  const next = JSON.stringify(data, null, 2) + "\n";
  if (prev.trim() === next.trim()) {
    console.log("変更なし:", data.title);
    return;
  }
  await writeFile(OUT, next, "utf8");
  console.log("更新:", data.title);
}

main().catch((e) => { console.error(e); process.exit(1); });
