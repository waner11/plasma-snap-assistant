# Minimum viable placeholder CMakeLists for tray package
cmake_minimum_required(VERSION 3.20)
project(plasma-snap-assistant-tray VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

include(GNUInstallDirs)

find_package(Qt6 REQUIRED COMPONENTS Core DBus Widgets)

# KF6 frameworks ship per-component CMake configs (e.g. KF6NotificationsConfig.cmake).
# Using per-component find_package calls works on every distro; the KF6-umbrella
# form only works where a meta KF6Config.cmake is installed.
find_package(KF6Notifications REQUIRED)
find_package(KF6Config REQUIRED)
find_package(KF6CoreAddons REQUIRED)
find_package(KF6StatusNotifierItem REQUIRED)

add_executable(plasma-snap-assistant-tray
    src/main.cpp
)

target_link_libraries(plasma-snap-assistant-tray PRIVATE
    Qt6::Core
    Qt6::DBus
    Qt6::Widgets
    KF6::Notifications
    KF6::ConfigCore
    KF6::CoreAddons
    KF6::StatusNotifierItem
)

install(TARGETS plasma-snap-assistant-tray DESTINATION ${CMAKE_INSTALL_BINDIR})
install(FILES resources/plasma-snap-assistant-tray.desktop DESTINATION ${CMAKE_INSTALL_SYSCONFDIR}/xdg/autostart)
install(FILES resources/plasma-snap-assistant.svg DESTINATION ${CMAKE_INSTALL_DATAROOTDIR}/icons/hicolor/scalable/apps)
