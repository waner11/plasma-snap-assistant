.PHONY: install install-effect install-tray build-tray clean uninstall uninstall-tray test test-js test-validate

install: install-effect install-tray

install-effect:
	kpackagetool6 --type=KWin/Effect --upgrade kwin-effect-plasma-snap-assistant/ 2>/dev/null \
		|| kpackagetool6 --type=KWin/Effect --install kwin-effect-plasma-snap-assistant/
	kwriteconfig6 --file kwinrc --group Plugins --key plasma-snap-assistantEnabled true
	qdbus6 org.kde.KWin /KWin reconfigure

build-tray:
	mkdir -p plasma-snap-assistant-tray/build
	cmake -S plasma-snap-assistant-tray -B plasma-snap-assistant-tray/build \
		-DCMAKE_INSTALL_PREFIX=/usr \
		-DCMAKE_BUILD_TYPE=Release
	cmake --build plasma-snap-assistant-tray/build

# Installs /usr/bin/plasma-snap-assistant-tray, the hicolor icon,
# and /etc/xdg/autostart/plasma-snap-assistant-tray.desktop (needs sudo).
# The tray will start automatically on next Plasma login.
install-tray: build-tray
	sudo cmake --install plasma-snap-assistant-tray/build
	@echo ""
	@echo "Tray installed. It will autostart on next Plasma login."
	@echo "To launch it now in the current session:"
	@echo "    plasma-snap-assistant-tray &"

test: test-js test-validate

test-js:
	node tests/zoneCalculator.test.js
	node tests/eligibilityFilter.test.js

# Lightweight static validation for sources and shipped metadata/config.
# No Qt/KWin toolchain required — just node — so it runs in any CI environment.
test-validate:
	node tests/validateMetadata.js
	node tests/validateSources.js

clean:
	rm -rf plasma-snap-assistant-tray/build

uninstall: uninstall-tray
	kpackagetool6 --type=KWin/Effect --remove plasma-snap-assistant 2>/dev/null || true
	kwriteconfig6 --file kwinrc --group Plugins --key plasma-snap-assistantEnabled false
	qdbus6 org.kde.KWin /KWin reconfigure

uninstall-tray:
	@if [ -f plasma-snap-assistant-tray/build/install_manifest.txt ]; then \
		echo "Removing tray files listed in install_manifest.txt (sudo)..."; \
		sudo xargs rm -f < plasma-snap-assistant-tray/build/install_manifest.txt; \
	else \
		echo "No install_manifest.txt found; tray was not installed via 'make install-tray'."; \
	fi
	@pkill -x plasma-snap-assistant-tray 2>/dev/null || true
