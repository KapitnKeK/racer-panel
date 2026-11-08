#!/bin/bash
# Steam-Startoption:  /usr/local/bin/r3e-launch %command% -nothreadaffinity
# Bildet die Windows-CPUs auf die tatsaechlich erlaubten (evtl. lueckenhaften) Container-Kerne ab.
list=$(awk '/Cpus_allowed_list/{print $2}' /proc/self/status)
cpus=()
IFS=',' read -ra parts <<< "$list"
for p in "${parts[@]}"; do
  if [[ $p == *-* ]]; then for ((i=${p%-*}; i<=${p#*-}; i++)); do cpus+=("$i"); done; else cpus+=("$p"); fi
done
export WINE_CPU_TOPOLOGY="${#cpus[@]}:$(IFS=,; echo "${cpus[*]}")"
echo "$(date '+%F %T') WINE_CPU_TOPOLOGY=$WINE_CPU_TOPOLOGY" >> /tmp/r3e-launch.log
export PROTON_LOG=1 PROTON_LOG_DIR=/home/bot/proton-logs
mkdir -p /home/bot/proton-logs
exec "$@"
