#!/bin/sh
# /usr/local/bin/steam - Steam auf dem unsichtbaren NVIDIA-Bildschirm.
# Ohne RandR-Ausgang findet Steam sonst keinen "Monitor" ("CreateOutputWindow: Could not find display info").
export DISPLAY="${DISPLAY:-:0}" XDG_RUNTIME_DIR="/run/user/$(id -u)" SDL_VIDEO_X11_XRANDR=0 LANG="${LANG:-de_DE.UTF-8}"
exec /usr/games/steam "$@"
