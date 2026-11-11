import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../identity/decorators/public.decorator';
import { AttendanceService, parseDeviceTime, type PunchInput } from './attendance.service';

/**
 * Endpoint protokol iClock/ADMS (ZKTeco & kompatibel) — mesin absensi
 * me-push log tap langsung ke server. Semua respons berupa teks polos
 * sesuai protokol; autentikasi mesin via nomor seri (SN) pada query.
 *
 * Konfigurasi di mesin: menu Comm/ADMS → Cloud Server:
 *   Server Address : <host API ini>
 *   Server Port    : <port API>
 *   (URL efektif)  : http://<host>/api/v1/iclock/cdata
 */
@Public()
// Mesin absensi me-push/poll secara berkala — rate-limit bisa memutus
// pengiriman log. Endpoint publik ini sudah divalidasi via SN mesin.
@SkipThrottle()
@Controller({ path: 'iclock', version: '1' })
export class IclockController {
  constructor(private readonly attendance: AttendanceService) {}

  /** Handshake — mesin menanyakan konfigurasi/jam server. */
  @Get('cdata')
  @Header('Content-Type', 'text/plain')
  async handshake(
    @Query('SN') sn: string | undefined,
    @Query('options') _o?: string,
  ) {
    if (sn) await this.attendance.touchDevice(sn);
    // Format respon konfigurasi standar iClock.
    return 'GET OPTION FROM: ' + (sn ?? '') + '\nStamp=9999\nOpStamp=9999\nErrorDelay=60\nDelay=30\nResLogDelay=0\nResLogDelCount=10000\nResLogCount=50000\nRealtime=1\nTransInterval=1\nTransFlag=1111000000\nTimeZone=7';
  }

  /**
   * Push data — `table=ATTLOG` berisi baris:
   * `PIN\tYYYY-MM-DD HH:mm:ss\tStatus\tVerify\tWorkcode\tReserved`
   */
  @Post('cdata')
  @Header('Content-Type', 'text/plain')
  async push(
    @Query('SN') sn: string | undefined,
    @Query('table') table: string | undefined,
    @Body() body: string,
  ) {
    if (!sn) throw new BadRequestException('SN wajib');
    const device = await this.attendance.touchDevice(sn);
    const t = (table ?? '').toUpperCase();
    if (t === 'ATTLOG' || t === 'OPERLOG') {
      const punches: PunchInput[] = [];
      for (const line of String(body ?? '').split(/\r?\n/)) {
        const cols = line.trim().split('\t');
        if (cols.length < 2) continue;
        const [pin, dt, status] = cols;
        const when = dt ? parseDeviceTime(dt) : null;
        if (pin && when) {
          punches.push({ pin, punchedAt: when, inOut: Number(status ?? 0) || 0 });
        }
      }
      const r = await this.attendance.ingestPunches(punches, {
        deviceKey: sn,
        deviceId: device?.id ?? null,
        source: 'DEVICE',
      });
      return `OK: ${r.inserted}`;
    }
    // Tabel lain (user info, foto) — terima tapi abaikan.
    return 'OK';
  }

  /** Registrasi awal mesin ke server. */
  @Get('registry')
  @Header('Content-Type', 'text/plain')
  async registry(@Query('SN') sn: string | undefined) {
    if (sn) await this.attendance.touchDevice(sn);
    return 'Registry from ' + (sn ?? '') + ' OK';
  }

  /** Mesin menanyakan perintah antre — tidak ada, jawab OK. */
  @Get('getrequest')
  @Header('Content-Type', 'text/plain')
  getRequest() {
    return 'OK';
  }

  /** Hasil eksekusi perintah oleh mesin. */
  @Post('devicecmd')
  @Header('Content-Type', 'text/plain')
  deviceCmd() {
    return 'OK';
  }
}
