import { readdir, readFile } from 'node:fs/promises';

export async function readMemoryMetrics(profileDir) {
  const meminfo = parseMeminfo(await readFile('/proc/meminfo', 'utf8'));
  const browserRssKb = await sumBrowserRssKb(profileDir);
  const totalMb = kbToMb(meminfo.MemTotal ?? 0);
  const availableMb = kbToMb(meminfo.MemAvailable ?? meminfo.MemFree ?? 0);
  const swapTotalMb = kbToMb(meminfo.SwapTotal ?? 0);
  const swapFreeMb = kbToMb(meminfo.SwapFree ?? 0);
  return {
    totalMb,
    availableMb,
    usedMb: Math.max(totalMb - availableMb, 0),
    swapTotalMb,
    swapUsedMb: Math.max(swapTotalMb - swapFreeMb, 0),
    browserRssMb: kbToMb(browserRssKb),
    sampledAt: new Date().toISOString(),
  };
}

export function parseMeminfo(raw) {
  const result = {};
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Za-z_()]+):\s+(\d+)\s+kB$/);
    if (match) result[match[1]] = Number(match[2]);
  }
  return result;
}

async function sumBrowserRssKb(profileDir) {
  let entries;
  try {
    entries = await readdir('/proc', { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  await Promise.all(entries.flatMap((entry) => {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) return [];
    return [readProcessRss(entry.name, profileDir).then((value) => { total += value; })];
  }));
  return total;
}

async function readProcessRss(pid, profileDir) {
  try {
    const [cmdline, status] = await Promise.all([
      readFile(`/proc/${pid}/cmdline`),
      readFile(`/proc/${pid}/status`, 'utf8'),
    ]);
    const command = cmdline.toString('utf8').replaceAll('\0', ' ');
    if (!command.includes(profileDir)) return 0;
    const match = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return match ? Number(match[1]) : 0;
  } catch {
    return 0;
  }
}

function kbToMb(kb) {
  return Math.round((kb / 1024) * 10) / 10;
}
