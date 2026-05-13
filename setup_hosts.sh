#!/bin/bash
# Local DNS entries for the Radware lab environment
# Run with: sudo bash setup_hosts.sh

ENTRIES=(
    \ 10.100.0.9 controller.radware.lab\
)

for entry in \\\; do
    host=\
    if grep -q \\System.Management.Automation.Internal.Host.InternalHost\ /etc/hosts; then
        echo \Already present: \\
    else
        echo \\\ >> /etc/hosts
        echo \Added: \\
    fi
done
