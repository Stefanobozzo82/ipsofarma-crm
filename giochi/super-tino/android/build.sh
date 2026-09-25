set -e
cd "$(dirname "$0")"
BT=$PWD/sdk/build-tools/34.0.0; AJ=$PWD/sdk/platforms/android-34/android.jar
rm -rf out && mkdir -p out/classes out/dex
$BT/aapt2 compile --dir proj/res -o out/res.zip
$BT/aapt2 link -o out/base.apk -I $AJ --manifest proj/AndroidManifest.xml -A proj/assets --java out/gen out/res.zip --min-sdk-version 24 --target-sdk-version 34 --version-code 5 --version-name 1.4 -0 html
javac -source 8 -target 8 -bootclasspath $AJ -classpath $AJ -d out/classes out/gen/it/supertino/game/R.java proj/src/it/supertino/game/MainActivity.java 2>&1 | grep -v "warning\|^Note\|Picked up" || true
$BT/d8 --release --min-api 24 --lib $AJ --output out/dex $(find out/classes -name '*.class')
cp out/base.apk out/unsigned.apk
(cd out/dex && zip -q ../unsigned.apk classes.dex)
$BT/zipalign -f -p 4 out/unsigned.apk out/aligned.apk
[ -f supertino.keystore ] || keytool -genkeypair -keystore supertino.keystore -alias supertino -keyalg RSA -keysize 2048 -validity 10000 -storepass supertino -keypass supertino -dname "CN=Super Tino, O=Super Tino, C=IT" 2>&1 | grep -v "Picked up"
$BT/apksigner sign --ks supertino.keystore --ks-pass pass:supertino --ks-key-alias supertino --out super-tino.apk out/aligned.apk
$BT/apksigner verify --print-certs super-tino.apk | head -2
ls -la super-tino.apk
