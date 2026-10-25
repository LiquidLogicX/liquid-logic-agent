/** Prints the Bazaar output example from the fixture (paste into lib/token-check/output-example.ts). */
import { buildTokenCheck, clearTokenCheckCache } from "../lib/token-check/core";
import { EXAMPLE_NOW, EXAMPLE_TOKEN, fixtureMarket, fixtureReader, noLocks } from "../lib/token-check/fixture";
(async () => {
  clearTokenCheckCache();
  const r = await buildTokenCheck(EXAMPLE_TOKEN, { reader: fixtureReader(), market: fixtureMarket(), lockReader: noLocks, now: EXAMPLE_NOW });
  console.log(JSON.stringify(r, null, 2));
})();
