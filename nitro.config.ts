// Nitro config: HTML TANPA cache supaya bundle JS/CSS baru selalu terpakai
// (bug lama: HP user masih load bundle lama — subtitle/b-roll/wm fix gak kelihatan).
export default defineNitroConfig({
  routeRules: {
    "/**": { headers: { "cache-control": "no-cache" } },
  },
});
