// SPDX-FileCopyrightText: 2026 Plasma Snap Assistant Contributors
// SPDX-License-Identifier: GPL-2.0-or-later

#include <QApplication>
#include <QDBusConnection>
#include <QDBusInterface>
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
// ---------------------------------------------------------------------------
class TrayAdaptor : public QObject
{
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.kde.plasma_snap_assistant.Tray")

public:
    explicit TrayAdaptor(QObject *parent = nullptr)
        : QObject(parent)
    {
    }

public Q_SLOTS:
    void activate()
    {
        qDebug() << "[PlasmaSnap] DBus activate() called";
        static_cast<void>(QMetaObject::invokeMethod(parent(), "triggerEffect"));
    }

    void quit()
    {
        qDebug() << "[PlasmaSnap] DBus quit() called";
        QApplication::quit();
    }

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
        m_tray->setIconByName(QStringLiteral("plasma-snap-assistant"));
        m_tray->setToolTipIconByName(QStringLiteral("plasma-snap-assistant"));
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

        QDBusConnection sessionBus = QDBusConnection::sessionBus();
        if (!sessionBus.registerService(QStringLiteral("org.kde.plasma_snap_assistant"))) {
            qDebug() << "[PlasmaSnap] Could not register DBus service – another instance running?";
        }
        if (!sessionBus.registerObject(QStringLiteral("/Tray"), this)) {
            qDebug() << "[PlasmaSnap] Could not register DBus object /Tray";
        }

        qDebug() << "[PlasmaSnap] Tray app initialised";
    }

public Q_SLOTS:
    void triggerEffect()
    {
        qDebug() << "[PlasmaSnap] Triggering effect via KGlobalAccel";

        // First check whether the effect is even loaded
        QDBusInterface kwin(QStringLiteral("org.kde.KWin"),
                            QStringLiteral("/Effects"),
                            QStringLiteral("org.kde.kwin.Effects"));
        QDBusReply<bool> loaded = kwin.call(QStringLiteral("isEffectLoaded"),
                                            QStringLiteral("plasma-snap-assistant"));
        if (loaded.isValid() && !loaded.value()) {
            qDebug() << "[PlasmaSnap] Effect is not loaded, showing notification";
            auto *notif = new KNotification(QStringLiteral("effectNotAvailable"));
            notif->setTitle(QStringLiteral("Plasma Snap Assistant"));
            notif->setText(QStringLiteral(
                "Plasma Snap Assistant effect not available. "
                "Enable it in System Settings → Desktop Effects."));
            notif->setIconName(QStringLiteral("dialog-warning"));
            notif->sendEvent();
            return;
        }

        // Invoke the shortcut through KGlobalAccel
        QDBusInterface kglobalaccel(QStringLiteral("org.kde.kglobalaccel"),
                                    QStringLiteral("/component/kwin"),
                                    QStringLiteral("org.kde.kglobalaccel.Component"));
        QDBusReply<void> reply = kglobalaccel.call(QStringLiteral("invokeShortcut"),
                                                   QStringLiteral("PlasmaSnapAssistant"));
        if (!reply.isValid()) {
            qDebug() << "[PlasmaSnap] invokeShortcut failed:" << reply.error().message();
        }
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

    return app.exec();
}

#include "main.moc"
