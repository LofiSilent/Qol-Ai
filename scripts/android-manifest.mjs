// Права Android-приложения, которых нет в шаблоне Capacitor: камера (распознавание жестов).
// Ориентацию не фиксируем: трейлер удобнее смотреть в ландшафте. Скрипт можно запускать повторно.
import { readFile, writeFile } from 'node:fs/promises';

const file = 'android/app/src/main/AndroidManifest.xml';
let xml = await readFile(file, 'utf8');

if (!xml.includes('android.permission.CAMERA')) {
  xml = xml.replace(/<uses-permission android:name="android.permission.INTERNET"\s*\/>/, match =>
    `${match}\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n    <uses-feature android:name="android.hardware.camera.front" android:required="false" />`);
  if (!xml.includes('android.permission.CAMERA')) throw new Error('Не удалось добавить разрешение на камеру');
}
await writeFile(file, xml);
console.log('Android manifest updated');
