export function useCommon() {
  const isMobile = () => {
    if (typeof navigator === "undefined") return false;

    if (isSmartTV()) return false;

    const userAgent = navigator.userAgent.toLowerCase();
    return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
      userAgent,
    );
  };

  const isSmartTV = () => {
    if (typeof navigator === "undefined") return false;
    const userAgent = navigator.userAgent;
    return /smart-tv|smarttv|appletv|googletv|hbbtv|pov_tv|netcast.tv|viera|nettv|roku|tizen|webos|philips|sony|panasonic|sharp|toshiba|hisense|aftb|afts|firetv|fire_tv|xiaomi|mibox|mitv|total_tv|linux armv|crkey|x86_64|android_tv|sdk_gphone/i.test(
      userAgent,
    );
  };

  const isDesktop = () => {
    return !isMobile() && !isSmartTV();
  };

  return {
    isMobile,
    isSmartTV,
    isDesktop,
  };
}
