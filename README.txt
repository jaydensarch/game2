STRIKE ZONE - Cloudflare Pages + D1 + R2

Files (guns, maps, skins...) live in R2. Accounts, player IDs and admin settings (store prices etc.) live in D1.
Online multiplayer still uses Supabase Realtime (D1/R2 can't do live broadcast) - see step 7.

1. npm install
2. npx wrangler login
3. npx wrangler d1 create strike-zone       -> copy the database_id it prints into wrangler.toml
   npx wrangler r2 bucket create strike-zone
4. npm run db:init                          (creates the tables; they are also created automatically on first use)
5. npx wrangler pages project create strike-zone --production-branch main
   npx wrangler pages secret put ADMIN_PASSWORD --project-name strike-zone
   (optional) npx wrangler pages secret put SESSION_SECRET --project-name strike-zone
6. npm run deploy
   Open https://strike-zone.pages.dev/admin - the top line says if the password and storage are set up.
   Upload limit is 100 MB per file on the Pages free/Pro plans.
7. Online play: in the Pages project > Settings > Variables, add SUPABASE_URL and SUPABASE_ANON_KEY (public anon key), redeploy.

Moving your existing data from Supabase (optional):
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run migrate:pull
  sh migrate/out/upload-r2.sh
  npx wrangler d1 execute strike-zone --remote --file=migrate/out/import.sql
  Old accounts keep working (their passwords are re-hashed on next login). Keep SESSION_SECRET / ADMIN_PASSWORD the same as
  before and players stay logged in.

Local test: npm run dev   (admin password "test", local D1 + R2 are simulated)
Folders: guns (ak.glb m4.glb awp.glb mp9.glb gl.glb de.glb), maps (.glb, optional same-name .json with
{"t":[0,-26],"site":[0,20],"host":[0,20]}), characters (.glb), skins (.png/.jpg/.webp).
