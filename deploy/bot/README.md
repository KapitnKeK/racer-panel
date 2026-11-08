# Zuschauer-Bot: RaceRoom auf einer GPU ohne Monitor (experimentell)

Ziel: Ein RaceRoom-Client tritt dem eigenen Server im **Zuschauer-Modus** bei (`-broadcastUrl=…`, kein Fahrerplatz,
keine Inhalte nötig), liefert über die offizielle Overlay-Schnittstelle Daten aller Fahrer und lässt sich als
„Regie" fernsteuern (Kamera/Fahrer). Das Bild wird per NVENC gestreamt. Siehe
[sector3studios/r3e-spectator-overlay](https://github.com/sector3studios/r3e-spectator-overlay).

**Stand:** Steam läuft headless auf einer Tesla P100 in einem Proxmox-LXC (Debian 13). Ob RaceRoom selbst unter
Proton auf dieser Karte läuft, ist noch nicht getestet.

## Was funktioniert hat
| Baustein | Ergebnis |
|---|---|
| Xorg ohne Monitor auf Tesla P100 (`UseDisplayDevice None`, `xorg.conf`) | OpenGL 4.6 mit direktem Rendering, Vulkan 1.4 |
| NVENC (`ffmpeg -c:v h264_nvenc`, `x11grab`) | funktioniert |
| Steam-Oberfläche | erst mit `SDL_VIDEO_X11_XRANDR=0` (siehe `steam-wrapper.sh`) |
| Xvfb + NVIDIA-Vulkan | **geht nicht** (Absturz beim Präsentieren) |

## Einrichtung (Kurzfassung)
1. **Host (Proxmox):** NVIDIA-Treiber mit Kernelmodul; zusätzlich `modprobe nvidia-modeset && nvidia-modprobe -m`
   und dauerhaft machen (`/etc/modules-load.d/`, Gerätknoten bei jedem Boot anlegen).
2. **LXC:** unprivilegiert, `features: nesting=1,keyctl=1`, Geräte `/dev/nvidia0, nvidiactl, nvidia-uvm,
   nvidia-uvm-tools, nvidia-modeset, nvidia-caps/*` durchreichen. ~150 GB Platz (RaceRoom ist ~92 GB).
3. **Im LXC:** `contrib non-free` + `i386`-Architektur; Pakete `xserver-xorg-core x11vnc novnc websockify openbox
   xterm ffmpeg libvulkan1(:i386) libgl1:i386 libegl1:i386 steam-installer`. NVIDIA-Userspace in **exakt** der
   Host-Version: `NVIDIA-Linux-x86_64-<ver>.run -s --no-kernel-modules --install-compat32-libs --no-nvidia-modprobe`.
   Falls die EGL-Warnung kommt: `/usr/share/glvnd/egl_vendor.d/10_nvidia.json` anlegen.
4. Benutzer `bot`, `/run/user/<uid>` per tmpfiles anlegen (sonst „g_mkdtemp: Keine Berechtigung"),
   `xorg.conf`, `systemd/*.service`, `steam-wrapper.sh` → `/usr/local/bin/steam`.
5. Über noVNC (`http://<ip>:6080/vnc.html`) bei Steam anmelden, Proton aktivieren, RaceRoom installieren.
