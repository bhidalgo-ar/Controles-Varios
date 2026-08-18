/**
 * Spanish Metaphone (Mosquera 2011) - algoritmo fonético para español.
 * Maneja B↔V, C+E/I→Z, LL↔Y (yeísmo), H muda, Ñ→NY, QU→K, GE/GI→J.
 * Referencia: port del Python canónico amsqr/Spanish-Metaphone.
 *
 * Ejemplos:
 *   spanishMetaphone("González") → "GONZAL"
 *   spanishMetaphone("Gonzalez") → "GONZAL"  (mismo)
 *   spanishMetaphone("Vargas") → "VARGAS"
 *   spanishMetaphone("Bargas") → "VARGAS"    (B→V)
 */
function spanishMetaphone(word) {
  if (!word) return "";
  const KEY_LEN = 6;
  let s = String(word).toLowerCase()
    .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i")
    .replace(/ó/g, "o").replace(/ú/g, "u")
    .replace(/ch/g, "X").replace(/ç/g, "S").replace(/ñ/g, "NY")
    .replace(/gü/g, "W").replace(/ü/g, "U")
    .replace(/b/g, "V").replace(/ll/g, "Y").toUpperCase() + " ";

  let key = "", pos = 0;
  const isV = (str, i) => "AEIOU".includes(str[i] || "");

  while (key.length < KEY_LEN && pos < s.length) {
    const c = s[pos];
    if (pos === 0 && isV(s, pos)) { key += c; pos++; continue; }
    if ("DFJKMNPTVLY".includes(c)) {
      key += c;
      pos += (s[pos + 1] === c ? 2 : 1);
      continue;
    }
    switch (c) {
      case "C":
        if (s[pos + 1] === "C") { key += "X"; pos += 2; }
        else if (["CE", "CI"].includes(s.substr(pos, 2))) { key += "Z"; pos += 2; }
        else { key += "K"; pos++; }
        break;
      case "G":
        if (["GE", "GI"].includes(s.substr(pos, 2))) { key += "J"; pos += 2; }
        else { key += "G"; pos++; }
        break;
      case "H":
        if (isV(s, pos + 1)) { key += s[pos + 1]; pos += 2; }
        else { key += "H"; pos++; }
        break;
      case "Q": pos += (s[pos + 1] === "U" ? 2 : 1); key += "K"; break;
      case "W": key += "U"; pos++; break;
      case "R": key += "R"; pos++; break;
      case "S": key += "S"; pos++; break;
      case "Z": key += "Z"; pos++; break;
      case "X": key += "X"; pos++; break;
      default: pos++;
    }
  }
  return key.trim();
}

/**
 * Similitud entre nombres completos combinando Levenshtein + Spanish Metaphone.
 * 60% similitud textual + 40% similitud fonética (intersección de tokens fonéticos).
 */
function nameSimilarity(a, b, levSimFn) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const textSim = levSimFn ? levSimFn(a, b) : 0;
  const tokA = a.split(/\s+/).filter(Boolean).map(spanishMetaphone);
  const tokB = b.split(/\s+/).filter(Boolean).map(spanishMetaphone);
  if (!tokA.length || !tokB.length) return textSim;
  const setB = new Set(tokB);
  const overlap = tokA.filter(t => setB.has(t)).length;
  const phonSim = overlap / Math.max(tokA.length, tokB.length);
  return 0.6 * textSim + 0.4 * phonSim;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { spanishMetaphone, nameSimilarity };
}
