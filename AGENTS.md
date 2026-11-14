# SMPMuh3 — Catatan Operasional Server (VPS 103.253.212.21)

## Prosedur "redeploy" (permintaan tetap dari user)

Setiap kali user minta redeploy, jalankan SEMUA langkah ini:

1. `git fetch origin` → cek commit baru (`git log --oneline HEAD..origin/master`)
2. Periksa file migrasi baru/diubah (waspada: enum `ADD VALUE` + `UPDATE` dalam satu file migrasi akan GAGAL di Postgres — pisahkan jadi 2 migrasi; migrasi teraplikasi yang diubah upstream → update checksum `_prisma_migrations` + terapkan delta manual)
3. `git pull` (rebase bila perlu)
4. Hapus build cache: `docker builder prune -af`
5. `docker compose --env-file .env -f infrastructure/docker-compose.prod.yml build --no-cache <service>` — hanya service yang berubah (api/operational/spmb)
6. `docker compose --env-file .env -f infrastructure/docker-compose.prod.yml up -d <service>`
7. Sinkronkan data: `docker exec -w /app/apps/api smpmuh3-api ./node_modules/.bin/prisma migrate deploy` + `docker exec -w /app/apps/api smpmuh3-api ./node_modules/.bin/tsx prisma/seed.ts`
8. Verifikasi: `docker compose ... ps` (semua healthy) + curl keempat domain (harus 200)
9. Laporkan ringkasan isi commit dalam Bahasa Indonesia

## Fakta infrastruktur

- Compose: `infrastructure/docker-compose.prod.yml` (+ `--env-file .env`), Caddyfile di `infrastructure/Caddyfile`
- Domain: apex→WordPress, spmb.→portal SPMB(:3001), op.→panel(:3002), api.→NestJS(:4000)
- Git remote pakai SSH deploy key (`~/.ssh/id_smpmuh3`, host alias `github.com-smpmuh3`) — bisa push
- Migrate/seed dijalankan di dalam container api (prisma + tsx tersedia)
- Throttle: global 300/menit/IP, login 20/menit, iClock dikecualikan — `trust proxy` aktif
- Akun inti: admin@smpm3bdg.sch.id + akun bidang *@smpmuh3.sch.id (password di `.env`)
- SELALU jawab dalam Bahasa Indonesia.

## Catatan tambahan

- **e-Rapor** (`smpmuh3-erapor`): source app di `/root/erapor` — SENGAJA tidak masuk git (lisensi Kemdikbud). Data di volume `erapor-pgdata`, app di `erapor-app`. ionCube wajib ada; password postgres internal `secrets_deveraporsd2025*#rsp` di-hardcode app.
- **Cleanup mingguan**: `/etc/cron.d/docker-weekly-cleanup` — Minggu 03:30, builder prune + image dangling prune + journald vacuum + apt clean.
- **daemon.json**: log json-file 10m×3 untuk semua container, live-restore aktif (container tetap hidup saat daemon restart), nofile 65536.
