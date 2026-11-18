// Builds assets/stats.svg from the public contribution calendar.
// The calendar includes private contributions (the profile shows them),
// so the card matches the graph on the profile instead of public-only counts.
// Run: GITHUB_TOKEN=... node scripts/stats.mjs [login]

import { mkdir, writeFile } from "node:fs/promises";

const login = process.argv[2] || process.env.STATS_LOGIN || "MaxLinWEB";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!token) throw new Error("GITHUB_TOKEN is required");

const query = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

const res = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query, variables: { login } }),
});
const json = await res.json();
if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors || json));

const cal = json.data.user.contributionsCollection.contributionCalendar;
const weeks = cal.weeks.map((w) => w.contributionDays);
const days = weeks.flat();

let longest = 0;
let run = 0;
for (const d of days) {
  run = d.contributionCount > 0 ? run + 1 : 0;
  longest = Math.max(longest, run);
}
const last90 = days.slice(-90).reduce((s, d) => s + d.contributionCount, 0);
const best = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a));
const weekly = weeks.map((w) => w.reduce((s, d) => s + d.contributionCount, 0));
const bestWeek = Math.max(...weekly);

const fmt = (n) => n.toLocaleString("en-US");
const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const plural = (n, word) => `${fmt(n)} ${word}${n === 1 ? "" : "s"}`;

// Dracula, to sit next to the other cards in the README.
const c = { bg: "#282a36", line: "#44475a", fg: "#f8f8f2", dim: "#6272a4", pink: "#ff6e96", cyan: "#79dafa", green: "#50fa7b" };
const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

const W = 495;
const H = 210;
const pad = 25;

const rows = [
  ["Last 90 days", fmt(last90)],
  ["Longest streak", plural(longest, "day")],
  ["Best day", `${fmt(best.contributionCount)} · ${fmtDate(best.date)}`],
  ["Best week", fmt(bestWeek)],
];

// Weekly bars along the bottom: the shape of the year at a glance.
const chartTop = 140;
const chartH = 38;
const gap = 2;
const barW = (W - pad * 2 - gap * (weekly.length - 1)) / weekly.length;
const bars = weekly
  .map((v, i) => {
    const h = v === 0 ? 2 : Math.max(3, (v / bestWeek) * chartH);
    const x = pad + i * (barW + gap);
    const fill = v === 0 ? c.line : c.green;
    const op = v === 0 ? 1 : (0.45 + 0.55 * (v / bestWeek)).toFixed(2);
    return `<rect x="${x.toFixed(2)}" y="${(chartTop + chartH - h).toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="1" fill="${fill}" fill-opacity="${op}"/>`;
  })
  .join("");

const first = days[0].date;
const last = days[days.length - 1].date;
const monthYear = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const summary = `${fmt(cal.totalContributions)} contributions in the last year, ${fmt(last90)} in the last 90 days. Longest ${plural(longest, "day")}, best day ${fmt(best.contributionCount)}.`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="t d">
<title id="t">${esc(login)}'s GitHub activity</title>
<desc id="d">${esc(summary)}</desc>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4.5" fill="${c.bg}" stroke="#e4e2e2" stroke-opacity="0.2"/>
<g font-family="${font}">
  <text x="${pad}" y="35" fill="${c.pink}" font-size="18" font-weight="600">${esc(login)}'s GitHub Activity</text>
  <text x="${pad}" y="88" fill="${c.fg}" font-size="40" font-weight="700" letter-spacing="-1">${fmt(cal.totalContributions)}</text>
  <text x="${pad}" y="110" fill="${c.cyan}" font-size="13" font-weight="600">contributions in the last year</text>
  ${rows
    .map(
      ([k, v], i) =>
        `<text x="235" y="${62 + i * 20}" fill="${c.dim}" font-size="13">${esc(k)}</text><text x="${W - pad}" y="${62 + i * 20}" fill="${c.fg}" font-size="13" font-weight="600" text-anchor="end">${esc(v)}</text>`,
    )
    .join("\n  ")}
  ${bars}
  <text x="${pad}" y="${H - 14}" fill="${c.dim}" font-size="11">${monthYear(first)}</text>
  <text x="${W / 2}" y="${H - 14}" fill="${c.dim}" font-size="11" text-anchor="middle">contributions per week · updated ${fmtDate(last)}</text>
  <text x="${W - pad}" y="${H - 14}" fill="${c.dim}" font-size="11" text-anchor="end">${monthYear(last)}</text>
</g>
</svg>
`;

await mkdir("assets", { recursive: true });
await writeFile("assets/stats.svg", svg);
console.log(summary);
