export function fmtIdle(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  if (hours < 48) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`
  return `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`
}
