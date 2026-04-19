.PHONY: install install-effect install-tray build-tray clean uninstall test

install: install-effect install-tray

install-effect:
	kpackagetool6 --type=KWin/Effect --upgrade kwin-effect-plasma-snap-assistant/ 2>/dev/null \
		|| kpackagetool6 --type=KWin/Effect --install kwin-effect-plasma-snap-assistant/
	kwriteconfig6 --file kwinrc --group Plugins --key plasma-snap-assistantEnabled true
	qdbus6 org.kde.KWin /KWin reconfigure

build-tray:
	mkdir -p plasma-snap-assistant-tray/build
	cmake -S plasma-snap-assistant-tray -B plasma-snap-assistant-tray/build
	cmake --build plasma-snap-assistant-tray/build

install-tray: build-tray
	@echo "Tray binary at: plasma-snap-assistant-tray/build/plasma-snap-assistant-tray"

test:
	node tests/zoneCalculator.test.js
	node tests/eligibilityFilter.test.js

clean:
	rm -rf plasma-snap-assistant-tray/build

uninstall:
	kpackagetool6 --type=KWin/Effect --remove plasma-snap-assistant 2>/dev/null || true
	kwriteconfig6 --file kwinrc --group Plugins --key plasma-snap-assistantEnabled false
	qdbus6 org.kde.KWin /KWin reconfigure
