import { XMLParser } from 'fast-xml-parser';

const RSS = [
  { url: 'https://www.cms.gov/newsroom/rss-feeds/all-press-releases-and-fact-sheets/feed', source: 'CMS Newsroom', category: 'CMS' },
  { url: 'https://www.medicaid.gov/about-us/news-and-blog/index.rss', source: 'Medicaid.gov', category: 'Medicaid' },
  { url: 'https://www.hhs.gov/about/news/rss/news.xml', source: 'HHS News', category: 'CMS' },
];

async function fr() {
  const since = new Date(Date.now() - 14*864e5).toISOString().slice(0,10);
  const u = `https://www.federalregister.gov/api/v1/documents.json?conditions[publication_date][gte]=${since}&conditions[term]=medicaid+OR+medicare&per_page=40&order=newest`;
  const r = await fetch(u, { headers: { accept: 'application/json' } });
  if (!r.ok) { console.error('FR fail', r.status); return []; }
  const j = await r.json();
  return (j.results ?? []).map(d => ({
    title: String(d.title ?? '').slice(0,500),
    summary: typeof d.abstract === 'string' ? d.abstract.slice(0,2000) : null,
    source: 'Federal Register',
    url: typeof d.html_url === 'string' ? d.html_url : null,
    type: String(d.type ?? 'Rule'),
    category: /medicaid/i.test(String(d.title ?? '')) ? 'Medicaid' : 'Medicare',
    published_at: typeof d.publication_date === 'string' ? `${d.publication_date}T00:00:00Z` : null,
  }));
}

async function rss(f) {
  try {
    const r = await fetch(f.url, { headers: { accept: 'application/rss+xml,application/xml,text/xml' } });
    if (!r.ok) { console.error('RSS fail', f.source, r.status); return []; }
    const xml = await r.text();
    const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const d = p.parse(xml);
    const items = d?.rss?.channel?.item ?? d?.feed?.entry ?? [];
    const arr = Array.isArray(items) ? items : [items];
    return arr.slice(0,25).map(i => {
      const link = typeof i.link === 'string' ? i.link : (i.link?.['@_href'] ?? null);
      const desc = typeof i.description === 'string' ? i.description : (typeof i.summary === 'string' ? i.summary : null);
      const pub = i.pubDate ?? i.published ?? i.updated;
      return {
        title: String(i.title?.['#text'] ?? i.title ?? '').slice(0,500),
        summary: desc ? desc.replace(/<[^>]+>/g,'').slice(0,2000) : null,
        source: f.source,
        url: link,
        type: 'news',
        category: f.category,
        published_at: pub ? new Date(pub).toISOString() : null,
      };
    }).filter(x => x.title);
  } catch (e) { console.error('rss err', f.source, e.message); return []; }
}

const all = (await Promise.all([fr(), ...RSS.map(rss)])).flat();
const seen = new Set();
const uniq = all.filter(r => { const k = (r.url ?? r.title).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
console.log(JSON.stringify(uniq));
console.error(`Fetched ${all.length} → unique ${uniq.length}`);
