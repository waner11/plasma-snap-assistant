# Maintainer: Plasma Snap Assistant contributors
pkgname=plasma-snap-assistant
pkgver=0.1.0
pkgrel=1
pkgdesc="Visual window snapping overlay for KDE Plasma 6"
arch=('x86_64')
url="https://github.com/user/plasma-snap-assistant"
license=('GPL-2.0-or-later')
depends=('kwin' 'qt6-base' 'knotifications' 'kconfig' 'kcoreaddons' 'kstatusnotifieritem')
makedepends=('cmake' 'extra-cmake-modules' 'qt6-tools')
source=("$pkgname-$pkgver.tar.gz")
sha256sums=('SKIP')

build() {
    cd "$srcdir/$pkgname-$pkgver"

    # Build tray companion
    cmake -S plasma-snap-assistant-tray -B build-tray \
        -DCMAKE_INSTALL_PREFIX=/usr \
        -DCMAKE_BUILD_TYPE=Release
    cmake --build build-tray
}

package() {
    cd "$srcdir/$pkgname-$pkgver"

    # Install KWin Effect (filesystem copy, not kpackagetool6)
    install -dm755 "$pkgdir/usr/share/kwin/effects/plasma-snap-assistant"
    cp -r kwin-effect-plasma-snap-assistant/* "$pkgdir/usr/share/kwin/effects/plasma-snap-assistant/"

    # Install tray companion binary
    DESTDIR="$pkgdir" cmake --install build-tray

    # Install autostart desktop file
    install -Dm644 plasma-snap-assistant-tray/resources/plasma-snap-assistant-tray.desktop \
        "$pkgdir/etc/xdg/autostart/plasma-snap-assistant-tray.desktop"

    # Install icon
    install -Dm644 plasma-snap-assistant-tray/resources/plasma-snap-assistant.svg \
        "$pkgdir/usr/share/icons/hicolor/scalable/apps/plasma-snap-assistant.svg"
}
