// Прописывает постоянный ключ подписи в android/app/build.gradle,
// чтобы каждая новая сборка APK ставилась поверх предыдущей.
import { readFile, writeFile } from 'node:fs/promises';

const file = 'android/app/build.gradle';
let gradle = await readFile(file, 'utf8');
if (!gradle.includes('qolSigning')) {
  gradle = gradle.replace(/android \{\n/, `android {
    signingConfigs {
        // qolSigning: ключ из android-signing/
        debug {
            storeFile file('../../android-signing/debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
`);
  if (!gradle.includes('qolSigning')) throw new Error('Не удалось вставить signingConfigs');
  await writeFile(file, gradle);
}
console.log('Signing config set');
