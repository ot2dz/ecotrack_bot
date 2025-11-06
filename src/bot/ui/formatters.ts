export function formatLatestMaj(tracking: string, maj: { station?: string; driver?: string; note?: string; date?: string }): string {
  const lines: string[] = [];
  lines.push(`📦 رقم التتبع: ${tracking}`);
  if (maj.station) lines.push(`🏬 المحطة: ${maj.station}`);
  if (maj.driver) lines.push(`🚚 السائق: ${maj.driver}`);
  if (maj.note) lines.push(`💬 ملاحظات: ${maj.note}`);
  if (maj.date) lines.push(`🕓 التاريخ: ${maj.date}`);
  return lines.join('\n');
}

export function formatTrackingInfo(info: { tracking: string; currentStatus?: string; lastUpdate?: string; history?: Array<{ status: string; at: string }> }): string {
  const lines: string[] = [];
  lines.push(`📦 ${info.tracking}`);
  if (info.currentStatus) lines.push(`🧾 الحالة الحالية: ${info.currentStatus}`);
  if (info.lastUpdate) lines.push(`🕓 آخر تحديث: ${info.lastUpdate}`);

  if (info.history && info.history.length) {
    lines.push('\n🔄 سجل الحالات:');
    for (const item of info.history) {
      const s = item.status?.toLowerCase() || '';
      const icon = s.includes('livr') ? '🧍' : s.includes('hub') ? '🏢' : s.includes('recup') ? '🚚' : s.includes('enreg') ? '✅' : '•';
      lines.push(`${icon} ${item.status} - ${item.at}`);
    }
  } else {
    lines.push('\nℹ️ لا يوجد سجل حالات متوفر.');
  }

  return lines.join('\n');
}

export function formatOrderList(items: Array<{ tracking: string; status?: string; commune?: string; lastActivity?: string }>): string[] {
  const chunks: string[][] = [[]];
  for (const it of items) {
    const line = [
      `📦 ${it.tracking} — ${it.status || '—'}`,
      it.commune ? `🏙️ Commune: ${it.commune}` : undefined,
      it.lastActivity ? `🕓 Dernière activité: ${it.lastActivity}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    if ((chunks[chunks.length - 1].join('\n\n') + line).length > 3500) {
      chunks.push([line]);
    } else {
      chunks[chunks.length - 1].push(line);
    }
  }

  return chunks.map((group) => group.join('\n\n'));
}
