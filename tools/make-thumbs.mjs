// 묵상 사진(1536px PNG, 장당 약 2.5MB)으로 휴대폰용 가벼운 사진(960px JPG, 약 90KB)을 만듭니다.
// assets/devotion/generated/날짜-요일.png → assets/devotion/thumbs/날짜-요일.jpg
// 만들 수 없는 환경이면 조용히 넘어가고, 페이지는 원본 사진을 대신 씁니다. (자동화를 멈추지 않습니다)
import { existsSync } from "node:fs";
import { readdir, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function makeThumbs(root = process.cwd()) {
  const src = path.join(root, "assets", "devotion", "generated");
  const dst = path.join(root, "assets", "devotion", "thumbs");
  if (!existsSync(src)) return 0;
  await mkdir(dst, { recursive: true });
  const jobs = (await readdir(src))
    .filter((n) => n.endsWith(".png"))
    .map((n) => ({ in: path.join(src, n), out: path.join(dst, n.replace(/\.png$/, ".jpg")) }))
    .filter((j) => !existsSync(j.out));
  if (!jobs.length) return 0;

  // 1) sharp가 설치돼 있으면 사용
  try {
    const sharp = (await import("sharp")).default;
    for (const j of jobs) await sharp(j.in).resize({ width: 960 }).jpeg({ quality: 80, progressive: true, mozjpeg: true }).toFile(j.out);
    console.log(`가벼운 사진 ${jobs.length}장 생성 (sharp)`);
    return jobs.length;
  } catch { /* 다음 방법 */ }

  // 2) 윈도우 기본 기능(PowerShell)
  if (process.platform === "win32") {
    const script = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]80)
foreach ($j in ($env:THUMB_JOBS | ConvertFrom-Json)) {
  $img = [System.Drawing.Image]::FromFile($j.in)
  $w = 960; $h = [int]([math]::Round($img.Height * $w / $img.Width))
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $w, $h)
  $bmp.Save($j.out, $codec, $params)
  $g.Dispose(); $bmp.Dispose(); $img.Dispose()
}`;
    try {
      execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
        env: { ...process.env, THUMB_JOBS: JSON.stringify(jobs) },
        stdio: ["ignore", "ignore", "pipe"],
        timeout: 120000
      });
      const made = jobs.filter((j) => existsSync(j.out)).length;
      console.log(`가벼운 사진 ${made}장 생성 (Windows)`);
      return made;
    } catch (e) {
      console.log(`가벼운 사진을 만들지 못해 원본 사진을 사용합니다: ${String(e.stderr || e.message).slice(0, 200)}`);
      return 0;
    }
  }

  // 3) 맥/리눅스: sips 또는 python
  try {
    for (const j of jobs) execFileSync("python3", ["-c", "import sys;from PIL import Image;i=Image.open(sys.argv[1]).convert('RGB');i.thumbnail((960,960));i.save(sys.argv[2],'JPEG',quality=80,optimize=True,progressive=True)", j.in, j.out], { stdio: "ignore" });
    console.log(`가벼운 사진 ${jobs.length}장 생성 (python)`);
    return jobs.length;
  } catch {
    console.log("가벼운 사진을 만들 도구가 없어 원본 사진을 사용합니다.");
    return 0;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await makeThumbs();
