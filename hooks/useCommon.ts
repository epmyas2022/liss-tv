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
    const userAgent = navigator.userAgent.toLowerCase();

    const noTouch =
      !("ontouchstart" in window) && navigator.maxTouchPoints === 0;

    const screenW = window.screen.width;
    const screenH = window.screen.height;
    const isBigLandscape = screenW >= 1280 && screenW / screenH > 1.4;
    const isAndroidUA = /android/i.test(userAgent);

    const isAgent =
      /smart-tv|smarttv|appletv|googletv|android tv|hbbtv|netcast|viera tv|nettv|roku|tizen|web0s|webos|aft(b|s|mm|t)|firetv|fire tv|crkey/i.test(
        userAgent,
      );

    if (isAgent) return true;

    return isAndroidUA && noTouch && isBigLandscape;
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
