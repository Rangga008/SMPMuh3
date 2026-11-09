-- Dedup tap mentah ikut membedakan arah (masuk/pulang):
-- tap masuk & pulang di detik yang sama adalah dua kejadian berbeda.
DROP INDEX IF EXISTS "attendance_logs_device_key_pin_punched_at_key";
CREATE UNIQUE INDEX "attendance_logs_device_key_pin_punched_at_in_out_key"
  ON "attendance_logs" ("device_key", "pin", "punched_at", "in_out");
