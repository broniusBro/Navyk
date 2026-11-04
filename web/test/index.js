// Entry for `node --test web/test/`: Node 22 resolves a directory argument to its index.js,
// so this file loads every *.test.js next to it. `node --test web/test/*.test.js` works too.
import { readdirSync } from "node:fs";

const dir = new URL("./", import.meta.url);
for (const f of readdirSync(dir).filter((n) => n.endsWith(".test.js")).sort()) {
  await import(new URL(f, dir).href);
}
