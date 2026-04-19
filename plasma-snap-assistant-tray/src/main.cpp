// SPDX-FileCopyrightText: 2026 Plasma Snap Assistant Contributors
// SPDX-License-Identifier: GPL-2.0-or-later

#include <QApplication>
#include <QDBusAbstractAdaptor>
#include <QDBusConnection>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDBusReply>
#include <QDebug>
#include <QMenu>
#include <QMessageBox>

#include <KAboutData>
#include <KConfig>
#include <KConfigGroup>
#include <KNotification>
#include <KStatusNotifierItem>

// ---------------------------------------------------------------------------
// DBus adaptor – published at org.kde.plasma_snap_assistant /Tray
// Inherits QDBusAbstractAdaptor so QDBusConnection::registerObject with the
// default ExportAdaptors flag actually exposes activate/isEffectAvailable.
// quit() is intentionally NOT exposed: exiting the tray is a local action
// invoked via the context menu, not something any same-session process
// should be able to do.
// ---------------------------------------------------------------------------
class TrayAdaptor : public QDBusAbstractAdaptor
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.kde.plasma_snap_assistant.Tray")

public:
    explicit TrayAdaptor(QObject *parent)
        : QDBusAbstractAdaptor(parent)
    {
    }

public Q_SLOTS:
    void activate()
    {
        qDebug() << "[PlasmaSnap] DBus activate() called";
        static_cast<void>(QMetaObject::invokeMethod(parent(), "triggerEffect"));
    }

    // Intentionally synchronous: this is a D-Bus method the tray *exposes*,
    // and D-Bus callers expect a bool return value. It is NOT on the user
    // click path (that goes through TrayApp::triggerEffect, which uses async
    // D-Bus). The risk is bounded: it only runs when an external process
    // queries isEffectAvailable, it talks to the already-running KWin on the
    // same session bus, and a KWin hang here would just block the caller,
    // not the tray's UI thread.
    bool isEffectAvailable()
    {
        QDBusInterface kwin(QStringLiteral("org.kde.KWin"),
                            QStringLiteral("/Effects"),
                            QStringLiteral("org.kde.kwin.Effects"));
        QDBusReply<bool> reply = kwin.call(QStringLiteral("isEffectLoaded"),
                                           QStringLiteral("plasma-snap-assistant"));
        if (reply.isValid()) {
            return reply.value();
        }
        qDebug() << "[PlasmaSnap] Could not query effect status:" << reply.error().message();
        return false;
    }
};

// ---------------------------------------------------------------------------
// TrayApp – owns the KStatusNotifierItem and context menu
// ---------------------------------------------------------------------------
class TrayApp : public QObject
{
    Q_OBJECT

public:
    explicit TrayApp(QObject *parent = nullptr)
        : QObject(parent)
    {
        // --- KStatusNotifierItem (Wayland-safe tray icon) ---
        m_tray = new KStatusNotifierItem(QStringLiteral("plasma-snap-assistant"), this);
        // The icon name is intentionally distinct from the SNI id above.
        // The XDG Icon Theme Spec's dash-fallback means any icon whose name
        // starts with "plasma-" resolves to breeze's generic "plasma" logo
        // before the per-theme lookup ever reaches hicolor. Using a name
        // that has no dash-prefix match in the active theme (breeze/breeze-dark)
        // ensures our real icon at hicolor/scalable/apps/plasmasnap-grid.svg
        // is the one that's actually rendered in the tray.
        m_tray->setIconByName(QStringLiteral("plasmasnap-grid"));
        m_tray->setToolTipIconByName(QStringLiteral("plasmasnap-grid"));
        m_tray->setToolTipTitle(QStringLiteral("Plasma Snap Assistant"));
        m_tray->setToolTipSubTitle(QStringLiteral("Click to snap a window"));
        m_tray->setCategory(KStatusNotifierItem::ApplicationStatus);
        m_tray->setStatus(KStatusNotifierItem::Active);

        // Left-click → toggle effect
        connect(m_tray, &KStatusNotifierItem::activateRequested, this, &TrayApp::triggerEffect);

        // --- Context menu ---
        auto *menu = new QMenu();

        auto *snapAction = menu->addAction(QStringLiteral("Snap Window"));
        connect(snapAction, &QAction::triggered, this, &TrayApp::triggerEffect);

        auto *settingsAction = menu->addAction(QStringLiteral("Settings"));
        connect(settingsAction, &QAction::triggered, this, &TrayApp::showSettingsPlaceholder);

        menu->addSeparator();

        auto *aboutAction = menu->addAction(QStringLiteral("About"));
        connect(aboutAction, &QAction::triggered, this, &TrayApp::showAbout);

        auto *quitAction = menu->addAction(QStringLiteral("Quit"));
        connect(quitAction, &QAction::triggered, QApplication::instance(), &QApplication::quit);

        m_tray->setContextMenu(menu);

        // --- DBus adaptor ---
        auto *adaptor = new TrayAdaptor(this);
        Q_UNUSED(adaptor);

        qDebug() << "[PlasmaSnap] Tray app initialised";
    }

    // Registers the service/object on the session bus. Returns false when
    // either step fails so main() can exit with a non-zero status instead of
    // leaving a half-functional tray (DBus activate() unreachable, yet the
    // icon still visible).
    bool registerDBus()
    {
        QDBusConnection sessionBus = QDBusConnection::sessionBus();
        if (!sessionBus.registerService(QStringLiteral("org.kde.plasma_snap_assistant"))) {
            qWarning() << "[PlasmaSnap] Could not register DBus service"
                       << "org.kde.plasma_snap_assistant – another instance running?"
                       << sessionBus.lastError().message();
            return false;
        }
        if (!sessionBus.registerObject(QStringLiteral("/Tray"), this)) {
            qWarning() << "[PlasmaSnap] Could not register DBus object /Tray:"
                       << sessionBus.lastError().message();
            sessionBus.unregisterService(QStringLiteral("org.kde.plasma_snap_assistant"));
            return false;
        }
        return true;
    }

public Q_SLOTS:
    // Non-blocking activation flow. Runs two asyncCalls in sequence:
    //   (1) org.kde.KWin.Effects.isEffectLoaded("plasma-snap-assistant")
    //   (2) org.kde.kglobalaccel.Component.invokeShortcut("PlasmaSnapAssistant")
    //
    // Each step's reply is delivered via QDBusPendingCallWatcher::finished on
    // the Qt event loop, so the tray UI stays responsive even if KWin or the
    // session bus is slow. The three failure branches match the previous
    // synchronous implementation:
    //   * isEffectLoaded errored      → "Could not reach KWin…"
    //   * isEffectLoaded returned false → "effect not available"
    //   * invokeShortcut errored      → "Could not trigger the shortcut…"
    void triggerEffect()
    {
        qDebug() << "[PlasmaSnap] Triggering effect via KGlobalAccel (async)";

        QDBusMessage probe = QDBusMessage::createMethodCall(
            QStringLiteral("org.kde.KWin"),
            QStringLiteral("/Effects"),
            QStringLiteral("org.kde.kwin.Effects"),
            QStringLiteral("isEffectLoaded"));
        probe << QStringLiteral("plasma-snap-assistant");
        QDBusPendingCall pending = QDBusConnection::sessionBus().asyncCall(probe);
        auto *watcher = new QDBusPendingCallWatcher(pending, this);
        connect(watcher, &QDBusPendingCallWatcher::finished, this,
                [this](QDBusPendingCallWatcher *w) {
                    w->deleteLater();
                    QDBusPendingReply<bool> reply = *w;
                    // Branch 1: transport/service error — KWin unreachable.
                    if (reply.isError()) {
                        qWarning() << "[PlasmaSnap] isEffectLoaded D-Bus call failed:"
                                   << reply.error().message();
                        notifyFailure(QStringLiteral(
                            "Could not reach KWin to check effect status. "
                            "Is KWin running and the D-Bus session available?"));
                        return;
                    }
                    // Branch 2: reply valid but effect not loaded.
                    if (!reply.value()) {
                        qDebug() << "[PlasmaSnap] Effect is not loaded, showing notification";
                        notifyFailure(QStringLiteral(
                            "Plasma Snap Assistant effect not available. "
                            "Enable it in System Settings → Desktop Effects."));
                        return;
                    }
                    // Branch 3: effect loaded — chain the shortcut invocation.
                    invokeActivationShortcut();
                });
    }

private:
    void invokeActivationShortcut()
    {
        QDBusMessage invoke = QDBusMessage::createMethodCall(
            QStringLiteral("org.kde.kglobalaccel"),
            QStringLiteral("/component/kwin"),
            QStringLiteral("org.kde.kglobalaccel.Component"),
            QStringLiteral("invokeShortcut"));
        invoke << QStringLiteral("PlasmaSnapAssistant");
        QDBusPendingCall pending = QDBusConnection::sessionBus().asyncCall(invoke);
        auto *watcher = new QDBusPendingCallWatcher(pending, this);
        connect(watcher, &QDBusPendingCallWatcher::finished, this,
                [this](QDBusPendingCallWatcher *w) {
                    w->deleteLater();
                    QDBusPendingReply<> reply = *w;
                    if (reply.isError()) {
                        qWarning() << "[PlasmaSnap] invokeShortcut failed:"
                                   << reply.error().message();
                        notifyFailure(QStringLiteral(
                            "Could not trigger the Plasma Snap Assistant shortcut. "
                            "Check that the effect is enabled and the PlasmaSnapAssistant "
                            "shortcut is registered (System Settings → Shortcuts)."));
                    }
                });
    }

    void notifyFailure(const QString &text)
    {
        auto *notif = new KNotification(QStringLiteral("effectNotAvailable"));
        notif->setTitle(QStringLiteral("Plasma Snap Assistant"));
        notif->setText(text);
        notif->setIconName(QStringLiteral("dialog-warning"));
        notif->sendEvent();
    }

private Q_SLOTS:
    void showSettingsPlaceholder()
    {
        qDebug() << "[PlasmaSnap] Settings placeholder shown";
        QMessageBox::information(
            nullptr,
            QStringLiteral("Plasma Snap Assistant - Settings"),
            QStringLiteral("Settings available via kwriteconfig6. KCM coming in v0.3"));
    }

    void showAbout()
    {
        qDebug() << "[PlasmaSnap] About dialog shown";
        QMessageBox::about(
            nullptr,
            QStringLiteral("About Plasma Snap Assistant"),
            QStringLiteral(
                "<h3>Plasma Snap Assistant v0.1.0</h3>"
                "<p>A KWin Effect that provides a visual window snapping overlay "
                "for KDE Plasma 6.</p>"
                "<p>License: GPL-2.0-or-later</p>"));
    }

private:
    KStatusNotifierItem *m_tray = nullptr;
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
int main(int argc, char *argv[])
{
    QApplication app(argc, argv);

    // --- KAboutData ---
    KAboutData aboutData(
        QStringLiteral("plasma-snap-assistant-tray"),        // component name
        QStringLiteral("Plasma Snap Assistant Tray"),        // display name
        QStringLiteral("0.1.0"),                             // version
        QStringLiteral("System tray companion for the Plasma Snap Assistant KWin effect"),
        KAboutLicense::GPL_V2,                               // license
        QStringLiteral("© 2026 Plasma Snap Assistant Contributors"));
    aboutData.setDesktopFileName(QStringLiteral("plasma-snap-assistant-tray"));
    KAboutData::setApplicationData(aboutData);

    // --- Check trayIconEnabled in config ---
    KConfig config(QStringLiteral("plasma-snap-assistantrc"));
    KConfigGroup generalGroup = config.group(QStringLiteral("General"));
    bool trayEnabled = generalGroup.readEntry(QStringLiteral("trayIconEnabled"), true);

    if (!trayEnabled) {
        qDebug() << "[PlasmaSnap] Tray icon disabled in config, exiting";
        return 0;
    }

    qDebug() << "[PlasmaSnap] Starting tray companion app v0.1.0";

    TrayApp trayApp;
    if (!trayApp.registerDBus()) {
        qCritical() << "[PlasmaSnap] D-Bus registration failed; refusing to start "
                       "a half-functional tray. Exit code 1.";
        return 1;
    }

    return app.exec();
}

#include "main.moc"
