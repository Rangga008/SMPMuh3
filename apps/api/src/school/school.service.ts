import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../core/prisma/prisma.service';
import { StorageService } from '../core/storage/storage.service';

const LOGO_KEY = 'school/logo';

export interface UpdateSchoolInput {
  name?: string;
  code?: string | null;
  tagline?: string | null;
  address?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
}

@Injectable()
export class SchoolService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Profil sekolah — baris pertama (platform single-school). */
  async get() {
    const school = await this.prisma.school.findFirst({
      orderBy: { createdAt: 'asc' },
    });
    if (!school) throw new NotFoundException('Profil sekolah belum diatur');
    return school;
  }

  /** Profil publik — hanya field aman untuk situs SPMB. */
  async getPublic() {
    const s = await this.get();
    return {
      name: s.name,
      tagline: s.tagline,
      address: s.address,
      phone: s.phone,
      whatsapp: s.whatsapp,
      email: s.email,
      hasLogo: !!s.logoUrl,
    };
  }

  async update(input: UpdateSchoolInput) {
    const school = await this.get();
    return this.prisma.school.update({
      where: { id: school.id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
      },
    });
  }

  async uploadLogo(file: Express.Multer.File) {
    const ext = file.mimetype === 'image/png' ? 'png' : file.mimetype === 'image/jpeg' ? 'jpg' : 'png';
    const key = `${LOGO_KEY}.${ext}`;
    await this.storage.putObject(key, file.buffer, file.mimetype);
    const school = await this.get();
    // logoUrl menunjuk ke endpoint publik /school/logo — bukan key S3,
    // supaya situs publik bisa menampilkannya tanpa signed URL.
    return this.prisma.school.update({
      where: { id: school.id },
      data: { logoUrl: key },
    });
  }

  async getLogo() {
    const school = await this.get();
    if (!school.logoUrl) throw new NotFoundException('Logo belum diunggah');
    const ext = school.logoUrl.split('.').pop() ?? 'png';
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    // Object storage bisa hilang/reset di lingkungan dev — 404, bukan 500,
    // supaya proxy /logo.png di frontend jatuh ke fallback dengan rapi.
    try {
      const buf = await this.storage.getObjectBuffer(school.logoUrl);
      return { buf, mime };
    } catch {
      throw new NotFoundException('Berkas logo tidak ditemukan di storage');
    }
  }
}
