(function (Scratch) {
  'use strict';

  // Small helper: safe number pad
  function pad(n){ return n < 10 ? '0'+n : String(n); }

  // Try to map Windows NT numbers to a hint for humans.
  // Note: many browsers report "Windows NT 10.0" for both Win10 and Win11;
  // client-hints (platformVersion) can help distinguish when available.
  function mapNTVersionToHint(ntString) {
    if (!ntString) return 'Unknown';
    // ntString example: "Windows NT 10.0"
    const m = ntString.match(/Windows NT ([0-9.]+)/i);
    if (!m) return ntString;
    const nt = m[1];
    // Common mappings (best-effort). Use cautious language for NT 10.0.
    if (nt.startsWith('10.0')) return 'Windows NT 10.0 — (may be Windows 10 or Windows 11)';
    if (nt.startsWith('6.3')) return 'Windows 8.1 (NT 6.3)';
    if (nt.startsWith('6.2')) return 'Windows 8 (NT 6.2)';
    if (nt.startsWith('6.1')) return 'Windows 7 (NT 6.1)';
    return 'Windows NT ' + nt;
  }

  function parseBrowserFromUA(ua) {
    if (!ua) return 'Unknown';
    // Try a few common patterns (Chrome, Edg, Firefox, Safari)
    let m;
    // Edge/Edg
    m = ua.match(/\b(Edg|Edge)\/([0-9.]+)/i);
    if (m) return (m[1] === 'Edg' ? 'Edge' : m[1]) + ' ' + m[2];
    // Chrome (note: Edge and Opera also contain Chrome)
    m = ua.match(/\bChrome\/([0-9.]+)/i);
    if (m && !/OPR\//i.test(ua) && !/Edg\//i.test(ua)) return 'Chrome ' + m[1];
    // Opera
    m = ua.match(/\bOPR\/([0-9.]+)/i);
    if (m) return 'Opera ' + m[1];
    // Firefox
    m = ua.match(/\bFirefox\/([0-9.]+)/i);
    if (m) return 'Firefox ' + m[1];
    // Safari (WebKit) - Safari typically doesn't include "Chrome"
    m = ua.match(/\bVersion\/([0-9.]+).*Safari\//i);
    if (m) return 'Safari ' + m[1];
    return 'Unknown (' + ua.split(' ')[0] + ')';
  }

  class SysInfo {
    getInfo() {
      return {
        id: 'sysinfo',
        name: 'SysInfo',
        blocks: [
          { opcode: 'get_os_name', blockType: Scratch.BlockType.REPORTER, text: 'OS name' },
          { opcode: 'get_os_details', blockType: Scratch.BlockType.REPORTER, text: 'OS details' },
          { opcode: 'get_browser', blockType: Scratch.BlockType.REPORTER, text: 'browser (name + version)' },
          { opcode: 'get_user_agent', blockType: Scratch.BlockType.REPORTER, text: 'user agent string' },
          { opcode: 'get_datetime', blockType: Scratch.BlockType.REPORTER, text: 'date & time (local)' },
          { opcode: 'get_time', blockType: Scratch.BlockType.REPORTER, text: 'time (local)' },
          { opcode: 'supports_client_hints', blockType: Scratch.BlockType.BOOLEAN, text: 'supports UA client hints?' }
        ],
        menus: {}
      };
    }

    // OS name: use userAgentData.platform where available, fallback to parsing.
    get_os_name() {
      try {
        if (navigator.userAgentData && navigator.userAgentData.platform) {
          return navigator.userAgentData.platform; // often "Windows", "macOS", "Linux"
        }
        const ua = navigator.userAgent || '';
        if (/Windows NT/i.test(ua)) return 'Windows';
        if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS';
        if (/Android/i.test(ua)) return 'Android';
        if (/Linux/i.test(ua)) return 'Linux';
        return 'Unknown';
      } catch (e) {
        return 'Unknown';
      }
    }

    // OS details (async because client hints use a Promise)
    async get_os_details() {
      try {
        // If User-Agent Client Hints are available, ask for platformVersion
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
          try {
            const hint = await navigator.userAgentData.getHighEntropyValues(['platform', 'platformVersion']);
            // For Windows, Chromium-based browsers expose platformVersion in a format like "13.0.0"
            if (hint.platform && hint.platform.toLowerCase() === 'windows' && hint.platformVersion) {
              // Microsoft guidance: platformVersion values of 13.0.0 and above correlate to Windows 11;
              // lower values correlate to Windows 10 (client-hints mapping). We'll be explicit but cautious.
              const major = Number(hint.platformVersion.split('.')[0] || 0);
              if (!isNaN(major) && major >= 13) {
                return 'Windows (client-hint indicates Windows 11) — platformVersion ' + hint.platformVersion;
              } else {
                return 'Windows (client-hint indicates Windows 10) — platformVersion ' + hint.platformVersion;
              }
            }
            // If platform exists but not windows, simply return hint.platform + hint.platformVersion
            if (hint.platform) {
              return hint.platform + (hint.platformVersion ? (' — ' + hint.platformVersion) : '');
            }
          } catch (e) {
            // fallback to UA parsing on any error
          }
        }

        // Fallback: parse navigator.userAgent
        const ua = navigator.userAgent || '';
        // Extract "Windows NT x.y"
        const ntMatch = ua.match(/Windows NT [0-9.]+/i);
        if (ntMatch) return mapNTVersionToHint(ntMatch[0]);

        // Other OSs: try to return the UA chunk
        if (/Android/i.test(ua)) {
          const m = ua.match(/Android [0-9.]+/i);
          return m ? m[0] : 'Android';
        }
        if (/Mac OS X/i.test(ua)) {
          const m = ua.match(/Mac OS X [0-9_\.]+/i);
          return m ? ('macOS ' + m[0].replace('Mac OS X','').replace(/_/g,'.').trim()) : 'macOS';
        }
        if (/Linux/i.test(ua)) return 'Linux (details from UA)';
        return 'Unknown (user agent: ' + ua.slice(0,60) + '...)';
      } catch (e) {
        return 'Unknown';
      }
    }

    // Browser name + version. Use userAgentData.brands where possible.
    async get_browser() {
      try {
        if (navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)) {
          // brands is an array like [{brand: "Chromium", version: "118"}, {brand: "Google Chrome", version: "118"}]
          const brands = navigator.userAgentData.brands;
          // Prefer a brand that includes "Chrome" or "Chromium" or "Firefox" or "Safari" or "Edge".
          const preferred = brands.find(b => /chrome|chromium|google chrome/i.test(b.brand))
                         || brands.find(b => /edg|edge/i.test(b.brand))
                         || brands.find(b => /firefox/i.test(b.brand))
                         || brands[0];
          if (preferred) return preferred.brand + ' ' + preferred.version;
        }
        // fallback to parsing navigator.userAgent
        return parseBrowserFromUA(navigator.userAgent || navigator.appVersion || '');
      } catch (e) {
        return 'Unknown';
      }
    }

    get_user_agent() {
      try {
        return navigator.userAgent || 'Unavailable';
      } catch (e) {
        return 'Unavailable';
      }
    }

    get_datetime() {
      try {
        const d = new Date();
        // Use locale string for clarity; this respects user's system timezone.
        return d.toLocaleString();
      } catch (e) {
        return 'Unavailable';
      }
    }

    get_time() {
      try {
        const d = new Date();
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      } catch (e) {
        return 'Unavailable';
      }
    }

    supports_client_hints() {
      try {
        return !!(navigator.userAgentData && navigator.userAgentData.getHighEntropyValues);
      } catch (e) {
        return false;
      }
    }
  }

  Scratch.extensions.register(new SysInfo());
})(Scratch);
