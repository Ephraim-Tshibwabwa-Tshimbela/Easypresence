import os from 'node:os';

// Regex identifying virtual, loopback, or non-routable interface names
const VIRTUAL_ADAPTER_REGEX = /vmware|vmnet|virtualbox|vbox|vethernet|hyper-v|wsl|docker|loopback|teredo|isatap|pseudo|bluetooth|tap|tun|vpn/i;

/**
 * Retrieves all local network IPv4 addresses of this machine,
 * distinguishing real physical LAN/Wi-Fi adapters from virtual adapters.
 */
export function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    const isVirtualName = VIRTUAL_ADAPTER_REGEX.test(name);

    for (const iface of interfaces[name]) {
      // IPv4 and not loopback 127.x.x.x
      if (iface.family === 'IPv4' && !iface.internal) {
        const isApipa = iface.address.startsWith('169.254.');
        const isVirtual = isVirtualName || isApipa;

        let type = 'other';
        if (isVirtualName) type = 'virtual';
        else if (isApipa) type = 'link-local';
        else if (/wi-fi|wifi|wlan|wireless/i.test(name)) type = 'wifi';
        else if (/ethernet|lan|eth|reseau local|réseau local/i.test(name)) type = 'ethernet';

        addresses.push({
          interface: name,
          ip: iface.address,
          netmask: iface.netmask,
          isVirtual,
          type
        });
      }
    }
  }

  // Sort: real physical adapters first (Wi-Fi, then Ethernet), virtual adapters last
  addresses.sort((a, b) => {
    if (a.isVirtual !== b.isVirtual) return a.isVirtual ? 1 : -1;
    if (a.type === 'wifi' && b.type !== 'wifi') return -1;
    if (b.type === 'wifi' && a.type !== 'wifi') return 1;
    if (a.type === 'ethernet' && b.type !== 'ethernet') return -1;
    if (b.type === 'ethernet' && a.type !== 'ethernet') return 1;
    return 0;
  });

  return addresses;
}

/**
 * Returns the primary reachable LAN IP of the host PC.
 * Strictly ignores virtual adapters (VMware, VirtualBox, Hyper-V, WSL)
 * and selects the active physical Wi-Fi or Ethernet adapter.
 */
export function getPrimaryLanIp() {
  const list = getLocalIpAddresses();
  const physical = list.filter(item => !item.isVirtual);

  if (physical.length > 0) {
    // Return first active physical adapter (Wi-Fi or Ethernet)
    return physical[0].ip;
  }

  // Fallback if no physical network adapter found
  return list.length > 0 ? list[0].ip : '127.0.0.1';
}
