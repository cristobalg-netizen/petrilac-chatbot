// Minimal BM25-style keyword search over the bundled Petrilac corpus.
// No external dependencies, no embedding API — runs fine in a Cloudflare Worker.

const STOPWORDS = new Set([
  "el","la","los","las","un","una","unos","unas","de","del","al","a","en","y","o",
  "que","para","por","con","sin","es","son","se","su","sus","lo","como","mas","pero",
  "si","no","este","esta","estos","estas","ese","esa","esos","esas","mi","tu","le",
  "les","yo","tu","el","ella","nosotros","ustedes","cual","cuales","donde","cuando",
  "porque","cual","cómo","qué","cuál","dónde","cuándo","puedo","puede","tengo","tiene"
]);

function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents
}

// Very light stemming so "motor"/"motores", "limpiar"/"limpieza" style
// singular-plural mismatches still overlap in a small keyword index.
function stem(word) {
  if (word.length > 5 && word.endsWith("ando")) return word.slice(0, -4);
  if (word.length > 5 && word.endsWith("iendo")) return word.slice(0, -5);
  if (word.length > 4 && word.endsWith("ores")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("es")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function tokenize(text) {
  return normalize(text)
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

export class SearchIndex {
  constructor(docs) {
    // docs: [{url, title, text}]
    this.docs = docs.map((d, i) => ({ ...d, id: i }));
    this.docTokens = this.docs.map((d) => tokenize(`${d.title} ${d.title} ${d.text}`));
    this.docLengths = this.docTokens.map((t) => t.length);
    this.avgLen = this.docLengths.reduce((a, b) => a + b, 0) / (this.docLengths.length || 1);

    this.df = new Map(); // term -> number of docs containing it
    this.tf = this.docTokens.map((tokens) => {
      const counts = new Map();
      for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
      for (const t of counts.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
      return counts;
    });

    this.N = this.docs.length;
  }

  idf(term) {
    const df = this.df.get(term) || 0;
    return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
  }

  // returns top-k docs {url, title, text, score}
  search(query, k = 5) {
    const qTokens = [...new Set(tokenize(query))];
    if (qTokens.length === 0) return [];

    const k1 = 1.5;
    const b = 0.75;

    const scores = this.docs.map((doc, i) => {
      let score = 0;
      const tf = this.tf[i];
      const len = this.docLengths[i];
      for (const term of qTokens) {
        const f = tf.get(term) || 0;
        if (f === 0) continue;
        const idf = this.idf(term);
        const denom = f + k1 * (1 - b + (b * len) / this.avgLen);
        score += idf * ((f * (k1 + 1)) / denom);
      }
      return { doc, score };
    });

    scores.sort((a, b2) => b2.score - a.score);
    return scores
      .filter((s) => s.score > 0)
      .slice(0, k)
      .map((s) => ({ ...s.doc, score: s.score }));
  }
}
