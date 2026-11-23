# MODUL 2 — CBT (Computer Based Test)
## Panduan Guru: Membuat Ujian, Soal, Impor Word, Ujian & Nilai

**SMP Muhammadiyah 3 Kota Bandung — Sistem Informasi Sekolah Terpadu**

> Modul ini untuk Bapak/Ibu guru. Semua langkah dilakukan dari panel `op.smpm3bdg.sch.id`.
> Setiap bagian yang bertanda **[FOTO n]** adalah tempat menyisipkan tangkapan layar.

---

## Daftar Isi

1. [Alur Besar CBT](#1-alur-besar-cbt)
2. [Membuat Asesmen & Ujian](#2-membuat-asesmen--ujian)
3. [Menulis Soal Satu per Satu](#3-menulis-soal-satu-per-satu)
4. [Soal Bergambar](#4-soal-bergambar)
5. [Soal Berumus (Matematika/IPA)](#5-soal-berumus-matematikaipa)
6. [Bacaan / Stimulus](#6-bacaan--stimulus)
7. [Impor Soal dari Word](#7-impor-soal-dari-word)
8. [Pengaturan Ujian, Kode & Kredensial Siswa](#8-pengaturan-ujian-kode--kredensial-siswa)
9. [Menjalankan Ujian & Monitor Langsung](#9-menjalankan-ujian--monitor-langsung)
10. [Hasil, Analisis & Nilai](#10-hasil-analisis--nilai)
11. [Masalah Umum & Solusinya](#11-masalah-umum--solusinya)
12. [Pertanyaan yang Sering Diajukan](#12-pertanyaan-yang-sering-diajukan)

---

## 1. Alur Besar CBT

Satu halaman **Asesmen & Ujian** mencakup seluruh siklus. Alurnya (juga ditampilkan di atas daftar asesmen):

```
① Asesmen          ② Soal &             ③ Administrasi      ④ Siswa            ⑤ Hasil &
(mapel + jenjang) →  Pengaturan Ujian  →  Sumatif (kursi, →  Mengerjakan    →  Analisis
                                          kartu — oleh TU)    (aplikasi CBT)
```

- **Asesmen** = satu ujian untuk **satu mapel pada satu jenjang** (mis. "ASAS Matematika — Kelas 9").
- Soal, jadwal, kode akses, monitor, dan nilai semuanya dikelola **di dalam asesmen tersebut**.
- Siswa mengerjakan di **aplikasi CBT** (`cbt.smpm3bdg.sch.id`) memakai **NIS + kode ujian + password kartu**.

---

## 2. Membuat Asesmen & Ujian

1. Login → menu **👩‍🏫 Mengajar → Asesmen & Ujian**.
2. Tekan **+ Asesmen Baru** → isi:
   - **Nama** — mis. *"ASAS Matematika Kls 9"*.
   - **Jenis** — Sumatif (PTS/PAS/dll.).
   - **Mapel** & **jenjang kelas** — sasaran ujian.
   - **Kelas peserta** — rombel yang boleh ikut.
   - **Jadwal** — tanggal & jam mulai–selesai.
   - **Durasi** (menit), **acak soal** (urutan soal beda tiap siswa), **tampilkan nilai** ke siswa.
   - **Instruksi** — ditampilkan ke siswa sebelum mulai.
3. Simpan → asesmen muncul di daftar dengan status **Draf**. Klik untuk masuk editornya.

**[FOTO 1 — Daftar Asesmen & Ujian + alur 5 langkah]**
**[FOTO 2 — Form asesmen baru]**

> **Kode ujian** (mis. `X4K2-Q7MP`) dibuat otomatis — inilah yang dibagikan ke peserta bersama password kartu masing-masing.

---

## 3. Menulis Soal Satu per Satu

Di dalam asesmen, buka tab **Soal** → **+ Tambah Soal**. Isi:

- **Tipe soal**:
  | Tipe | Untuk | Kunci |
  |---|---|---|
  | **Pilihan Ganda** | 1 jawaban benar dari A–E | satu huruf |
  | **PG Kompleks** | beberapa jawaban benar | beberapa huruf — skor parsial per benar |
  | **Benar/Salah** | satu pernyataan | B atau S |
  | **B/S Kompleks** | deretan pernyataan dinilai B/S | B/S per pernyataan — skor parsial |
  | **Menjodohkan** | pasangan kiri–kanan | pemetaan tiap pasangan |
- **Bobot** — poin soal (boleh beda-beda).
- **Teks soal** — tulis bebas, boleh tebal/miring via tag sederhana.
- **Opsi jawaban** — isi tiap opsi sesuai tipe.
- **Kunci** — wajib, untuk penilaian otomatis.

**Pratinjau tampil langsung di bawah editor** — gambar dan rumus tampil persis seperti yang dilihat siswa. Simpan, lalu lanjut soal berikutnya.

**[FOTO 3 — Editor soal: tipe, bobot, teks, opsi, kunci]**
**[FOTO 4 — Pratinjau soal di bawah editor (gambar & rumus tampil)]**

---

## 4. Soal Bergambar

Dua cara — **keduanya tampil di pratinjau editor, bukan hanya di CBT siswa**:

### a) Unggah langsung di editor
1. Di kolom teks soal (atau opsi jawaban), tekan tombol **🖼 Gambar**.
2. Pilih file (JPG/PNG) → gambar terunggah dan **muncul di pratinjau**.
3. Thumbnail gambar juga tampil di daftar media soal — bisa **dihapus** dari sana.

**[FOTO 5 — Tombol gambar + thumbnail media pada soal]**
**[FOTO 6 — Soal bergambar tampil di pratinjau]**

### b) Gambar otomatis dari impor Word
Gambar yang disisipkan di sel tabel Word **ikut terunggah** dan menempel pada soalnya — lihat [Bab 7](#7-impor-soal-dari-word).

> Gambar tersimpan di server sekolah dan ditampilkan lewat sistem — **jangan** tempel tautan gambar dari internet.

---

## 5. Soal Berumus (Matematika/IPA)

Rumus ditulis di antara tanda **`$…$`** — ditampilkan rapi oleh sistem di editor maupun CBT.

| Yang diketik | Tampil |
|---|---|
| `$x^2 - 5x + 6 = 0$` | 𝑥² − 5𝑥 + 6 = 0 |
| `$\frac{a+b}{2}$` | pecahan (a+b)/2 |
| `$\sqrt{144}$` | √144 |
| `$37{,}2^\circ\text{C}$` | 37,2 °C |
| `$$\begin{pmatrix}5\\-3\end{pmatrix}$$` | matriks/vektor besar |

> Rumus dari **persamaan Word** (Insert → Equation) terkonversi otomatis saat impor — tidak perlu mengetik `$` untuk file Word.

**[FOTO 7 — Soal rumus di editor + hasil render KaTeX di pratinjau]**

---

## 6. Bacaan / Stimulus

Satu bacaan bisa dipakai beberapa soal (mis. teks berita untuk soal no. 3–4):

1. Tab **Bacaan** → **+ Bacaan Baru** → beri **kode** singkat (mis. `B1`) + isi teksnya (boleh bergambar).
2. Di setiap soal yang memakai, isi kolom **Bacaan: B1**.
3. Saat siswa mengerjakan, bacaan tampil menempel pada soal tersebut.

**[FOTO 8 — Tab Bacaan dengan kode dan isi teks]**

---

## 7. Impor Soal dari Word

Cara tercepat mengisi puluhan soal — **unduh template resmi dulu** agar formatnya pasti benar.

### 7.1 Siapkan file

1. Di halaman asesmen tab **Soal** → **⬇ Template Word** (tersedia juga `.xlsx`).
2. Buka di MS Word → **satu soal = satu tabel**. Salin blok tabel contoh seperlunya.
3. Format tiap tabel:

```
┌──────────┬────────────────────────────────────────┐
│ NO: 1    │ TIPE: PG │ BOBOT: 1 │ BACAAN: B1        │   ← baris meta
├──────────┼────────────────────────────────────────┤
│ SOAL     │ Berdasarkan bacaan B1, …               │
│ A        │ Bus kota                               │
│ B        │ Sepeda                                 │
│ C        │ Motor                                  │
│ D        │ Jalan kaki                             │
│ KUNCI    │ B                                      │
└──────────┴────────────────────────────────────────┘
```

- **TIPE**: `PG` (kunci 1 huruf) · `PGK` (kunci ≥1 huruf, mis. `A,C`) · `BS` (kunci `B`/`S`) · `BSK` (baris pernyataan `P1`–`P9`, kunci `B,S,B,…`)
- **BACAAN** di meta mengacu kode tabel bacaan — kosongkan/`-` bila tak pakai.
- **Bacaan** = tabel sendiri diawali sel `BACAAN: B1` — letakkan di atas soal yang memakainya.
- **Gambar**: sisipkan langsung di sel SOAL/opsi/bacaan → terunggah otomatis.
- **Rumus**: sisipkan **persamaan Word** (Insert → Equation / `Alt`+`=`) di sel — pangkat, pecahan, akar, Σ, matriks terkonversi otomatis. Alternatif: ketik `$x^2$` biasa.
- **Menjodohkan tidak bisa diimpor** — buat manual di editor.

### 7.2 Impor & periksa

1. Tab **Soal** → **⬆ Impor Word** → pilih `.docx`.
2. Sistem menampilkan **pratinjau**: jumlah soal per tipe + **daftar kesalahan** (kunci salah, tabel tak dikenali, dsb.) — perbaiki di Word lalu impor ulang.
3. Bila bersih → **Simpan** → semua soal masuk dan **gambar langsung tampil di daftar & pratinjau**.

**[FOTO 9 — Tombol template + impor]**
**[FOTO 10 — Pratinjau hasil impor: ringkasan tipe + validasi]**
**[FOTO 11 — Contoh tabel soal di Word]**

---

## 8. Pengaturan Ujian, Kode & Kredensial Siswa

Masih di halaman asesmen yang sama:

- **Kode ujian** — kode masuk unik per ujian, dibagikan ke peserta.
- **Jadwal** — siswa hanya bisa masuk dalam rentang mulai–selesai; sisa waktu masing-masing = durasi.
- **Status** — `Draf` → `Buka` saat ujian dimulai → `Tutup` saat selesai.
- **Kredensial** — password ujian tiap siswa (format `KPxxxx`) dibuat otomatis dan **tercetak di kartu ujian** (NIS + kode ujian + password). Tata Usaha mengatur **ruang & kursi** serta **mencetak kartu** di menu administrasi ujian.
- Password siswa boleh **dibikin ulang** bila hilang — oleh admin Kurikulum (bukan guru pengampu) demi keamanan.

**[FOTO 12 — Pengaturan ujian: kode, jadwal, durasi, status]**
**[FOTO 13 — Contoh kartu ujian siswa (NIS + kode + password)]**

---

## 9. Menjalankan Ujian & Monitor Langsung

### Hari-H
1. Pastikan status ujian **Buka (OPEN)** dan soal sudah lengkap.
2. Siswa di lab membuka **`cbt.smpm3bdg.sch.id`** → isi **NIS + kode ujian + password kartu** → tombol **Mulai**.
3. Sisa waktu tiap siswa berjalan sendiri dari saat ia mulai — jawaban **tersimpan otomatis** setiap diisi.

### Monitor langsung
Buka ujian → **Monitor**: tiap peserta tampil statusnya — `Belum` / `Mengerjakan` / `Selesai` — plus **bendera kecurigaan** otomatis:

| Bendera | Arti |
|---|---|
| ⚑ Keluar-masuk berkali-kali | Siswa login berulang — indikasi pindah perangkat/titipan |
| ⚑ Selesai terlalu cepat | Submit jauh lebih cepat dari durasi wajar |
| ⚑ Submit tanpa jawaban | Selesai dengan jawaban kosong |

**[FOTO 14 — Monitor live: status tiap peserta + bendera]**
**[FOTO 15 — Layar ujian di sisi siswa (soal bergambar + rumus)]**

> Layar monitor boleh dibiarkan terbuka di komputer pengawas — datanya menyegarkan otomatis.

---

## 10. Hasil, Analisis & Nilai

- Begitu siswa **Selesai** (atau waktu habis — sistem men-submit otomatis), skor langsung terhitung dari kunci: **parsial** untuk PG Kompleks, B/S Kompleks, dan Menjodohkan.
- Hasil per siswa tampil di ujian → **skala 0–100** sesuai bobot, dan **otomatis masuk Ledger** mapel — tidak perlu mengetik ulang nilai.
- Gunakan analisis per soal untuk melihat butir yang banyak salah.

**[FOTO 16 — Rekap hasil ujian per siswa]**
**[FOTO 17 — Analisis per soal / nilai di Ledger]**

---

## 11. Masalah Umum & Solusinya

| Gejala | Penyebab | Solusi |
|---|---|---|
| Gambar soal tidak muncul | File belum terunggah / impor gagal di tengah | Cek thumbnail media di editor; ulangi unggah/impor. Gambar yang sudah terunggah tampil di pratinjau — jika kosong di pratinjau, unggah ulang. |
| Rumus tampil mentah `$x^2$` | Salah tulis tanda `$` | Pastikan diawali & diakhiri `$` (atau `$$…$$` untuk rumus besar). |
| Impor menolak file | Format tabel tak dikenali | Selalu mulai dari **template resmi** — jangan mengetik tabel sendiri. |
| "kunci PG harus satu huruf" | Kunci PG diisi `A,B` | PG hanya satu jawaban benar; pakai TIPE `PGK` untuk multi-jawaban. |
| Siswa tak bisa masuk | Di luar jadwal / status belum Buka / salah kode | Periksa jadwal & status ujian, dan kode+password kartu siswa. |
| Siswa keluar di tengah | Sinyal putus / HP restart | Aman — jawaban tersimpan; siswa login ulang (tercatat di bendera monitor) dan sisa waktunya berlanjut. |

---

## 12. Pertanyaan yang Sering Diajukan

**Apakah siswa bisa membuka aplikasi lain saat ujian?**
Pengawas melihat lewat bendera **keluar-masuk** di monitor — itulah fungsinya monitor dibuka selama ujian.

**Bobot soal boleh beda-beda?**
Boleh — skor akhir dinormalisasi ke skala 100 otomatis.

**Bisakah saya mengedit soal setelah ujian dibuka?**
Bisa, tetapi hindari mengubah kunci/opsi setelah ada yang mengerjakan — jawaban yang sudah masuk dinilai dengan kunci saat disimpan.

**Password kartu siswa hilang?**
Minta admin Kurikulum menekan **Regenerasi** pada credential siswa — password baru tercetak/terlihat sekali saja.

**Impor Excel vs Word?**
Keduanya ada. Word lebih kuat: mendukung gambar, bacaan, dan rumus persamaan — pakai Word kecuali soal teks polos massal.

---

*Dokumen internal — SMP Muhammadiyah 3 Kota Bandung · Sistem Informasi Sekolah Terpadu*
