/**
 * Web 端全量数据备份 / 恢复
 *
 * 用户数据分散在 localStorage 三个键中：
 *  - fitcoach_web_import   手机端导入的训练记录（主数据）
 *  - fitcoach_checkin_v1   Web 端训练打卡记录
 *  - fitcoach_model_tier_v1 模型档位偏好（属于偏好，一并备份）
 * 备份为单个 JSON 文件，可跨电脑/浏览器迁移，答辩换电脑不丢数据。
 */

const BACKUP_KEYS = ['fitcoach_web_import', 'fitcoach_checkin_v1', 'fitcoach_model_tier_v1'] as const;
type BackupKey = (typeof BACKUP_KEYS)[number];

export interface WebBackup {
  __type: 'fitcoach-web-backup';
  __version: 1;
  exportAt: string;
  data: Partial<Record<BackupKey, string>>;
}

export function exportWebBackup(): WebBackup | null {
  if (typeof window === 'undefined') return null;
  const data: WebBackup['data'] = {};
  for (const k of BACKUP_KEYS) {
    try {
      const raw = window.localStorage.getItem(k);
      if (raw != null) data[k] = raw;
    } catch {}
  }
  return {
    __type: 'fitcoach-web-backup',
    __version: 1,
    exportAt: new Date().toISOString(),
    data,
  };
}

/** 统计备份内各部分的条数，用于恢复前确认提示 */
export function describeBackup(b: WebBackup): { sessions: number; checkinDays: number; hasPref: boolean } {
  let sessions = 0;
  let checkinDays = 0;
  try {
    if (b.data.fitcoach_web_import) {
      sessions = (JSON.parse(b.data.fitcoach_web_import) as { sessions?: unknown[] }).sessions?.length ?? 0;
    }
    if (b.data.fitcoach_checkin_v1) {
      checkinDays = Object.keys(JSON.parse(b.data.fitcoach_checkin_v1) as Record<string, unknown>).length;
    }
  } catch {}
  return { sessions, checkinDays, hasPref: !!b.data.fitcoach_model_tier_v1 };
}

export function parseWebBackup(text: string): WebBackup {
  const parsed = JSON.parse(text) as WebBackup;
  if (parsed.__type !== 'fitcoach-web-backup') {
    throw new Error('文件格式不对，需要由本系统「备份数据」导出的 fitcoach-web-backup 文件');
  }
  return parsed;
}

/** 恢复：整体覆盖写入（调用方应先让用户确认），返回写入的键数量 */
export function restoreWebBackup(b: WebBackup): number {
  if (typeof window === 'undefined') return 0;
  let n = 0;
  for (const k of BACKUP_KEYS) {
    const raw = b.data[k];
    try {
      if (raw != null) {
        window.localStorage.setItem(k, raw);
        n++;
      }
    } catch {}
  }
  return n;
}

/** 触发浏览器下载备份文件 */
export function downloadBackup() {
  const backup = exportWebBackup();
  if (!backup) return;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fitcoach-web-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
