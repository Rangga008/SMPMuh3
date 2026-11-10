'use client';

import { useEffect, useState } from 'react';
import type { PermissionKey } from '@smpmuh3/types';
import { me } from '@/lib/api';

/** true bila user login punya permission `perm` — untuk menyembunyikan kontrol
 *  edit pada halaman yang bisa dilihat semua bidang tapi hanya dikelola role
 *  tertentu (backend tetap menolak tulis tanpa izin; ini hanya UX). */
export function usePermission(perm: PermissionKey): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    me()
      .then((u) => {
        if (live) setOk(u.permissions.includes(perm));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [perm]);
  return ok;
}
