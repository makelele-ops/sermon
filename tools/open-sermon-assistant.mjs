import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const url = 'http://127.0.0.1:8765/';
async function ready() {
  try { const r = await fetch(url + '_assistant-preview-health', {signal:AbortSignal.timeout(1000)}); return r.ok && await r.text() === 'sermon-assistant-preview'; } catch { return false; }
}
if (!await ready()) {
  const server = spawn(process.execPath, [fileURLToPath(new URL('./preview-sermon-assistant.mjs', import.meta.url))], { detached:true, windowsHide:true, stdio:'ignore' });
  server.on('error', () => {}); server.unref();
}
let running = false;
for (let i=0;i<30;i++) {
  if (await ready()) { running = true; break; }
  await new Promise(resolve => setTimeout(resolve, 300));
}
if (!running) {
  console.error('미리보기 서버를 시작하지 못했습니다. 8765 포트 사용 여부를 확인해 주세요.');
  process.exitCode = 1;
} else {
  console.log(`미리보기 준비 완료: ${url}`);
  console.log('화면 오른쪽 아래의 [말씀 도우미]를 눌러 주세요. 창을 닫아도 미리보기는 계속 켜져 있습니다.');
  const browser = spawn('powershell.exe', ['-NoProfile', '-Command', "Start-Process -FilePath 'http://127.0.0.1:8765/'"], { windowsHide:true, stdio:'ignore' });
  browser.on('error', () => console.log('브라우저 주소창에 위 주소를 입력해 주세요.'));
}
